from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.core.database import get_db
from app.core.config import get_settings
from app.core.dependencies import require_role, get_client_ip
from app.models.models import (
    User, Materia, Matricula, Examen, Nota,
    PeriodoAcademico, ConfigPorcentaje, Boletin, Asistencia,
    NotaParticipacion, RespuestaOnline, ReporteGenerado, AuditLog,
)
from app.schemas.schemas import ConfigPorcentajeCreate, ConfigPorcentajeOut, BoletinOut
import uuid as _uuid
import os

router = APIRouter(prefix="/reportes", tags=["Reportes y Boletines"])
settings = get_settings()

ALLOWED_EXPOSICION_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/plain",
}

ALLOWED_EXPOSICION_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".pptx",
    ".ppt",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".txt",
}


def _normalize_extension(filename: str | None) -> str:
    return os.path.splitext(filename or "")[1].strip().lower()


async def _assert_materia_access(
    db: AsyncSession,
    materia_id: str,
    current_user: User,
) -> Materia:
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso para esta materia")

    return materia


async def _assert_examen_tipo(
    db: AsyncSession,
    examen_id: str,
    expected_tipo: str,
) -> Examen:
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen or examen.tipo != expected_tipo:
        raise HTTPException(status_code=404, detail="Exposición no encontrada")
    return examen


# ──────── CONFIG PORCENTAJES ────────

@router.get("/config/{materia_id}/{periodo_id}", response_model=list[ConfigPorcentajeOut])
async def get_config_porcentajes(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    await _assert_materia_access(db, materia_id, current_user)

    result = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == periodo_id,
        )
    )
    return [ConfigPorcentajeOut.model_validate(c) for c in result.scalars().all()]


@router.post("/config/{materia_id}", status_code=status.HTTP_201_CREATED)
async def save_config_porcentajes(
    materia_id: str,
    data: ConfigPorcentajeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Save per-activity percentage configuration for a materia+periodo. Must sum 100%."""
    await _assert_materia_access(db, materia_id, current_user)

    total = sum(a.get("porcentaje", 0) for a in data.actividades)
    if abs(total - 100.0) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Los porcentajes deben sumar 100%. Suma actual: {total}%"
        )

    # Delete existing for this materia+periodo
    existing = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == data.periodo_id,
        )
    )
    for ex in existing.scalars().all():
        await db.delete(ex)
    await db.flush()

    for act in data.actividades:
        cp = ConfigPorcentaje(
            materia_id=materia_id,
            periodo_id=data.periodo_id,
            examen_id=act.get("examen_id"),
            tipo_actividad=act.get("tipo_actividad"),
            porcentaje=act["porcentaje"],
        )
        db.add(cp)

    await db.commit()
    return {"detail": "Configuración guardada"}


@router.get("/actividades/{materia_id}/{periodo_id}")
async def get_actividades_periodo(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """List all exams/activities for a materia within a period's date range."""
    await _assert_materia_access(db, materia_id, current_user)

    periodo_result = await db.execute(
        select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id)
    )
    periodo = periodo_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    exams_result = await db.execute(
        select(Examen).where(
            Examen.materia_id == materia_id,
            Examen.created_at >= datetime.combine(periodo.fecha_inicio, datetime.min.time()).replace(tzinfo=timezone.utc),
            Examen.created_at <= datetime.combine(periodo.fecha_fin, datetime.max.time()).replace(tzinfo=timezone.utc),
        ).order_by(Examen.created_at)
    )
    exams = exams_result.scalars().all()
    return [
        {
            "examen_id": str(ex.id),
            "titulo": ex.titulo,
            "tipo": ex.tipo or "examen",
            "fecha": ex.created_at.isoformat(),
        }
        for ex in exams
    ]


# ──────── HELPER: attendance stats ────────

async def _get_attendance_stats(db, materia_id, estudiante_id, fecha_inicio, fecha_fin):
    """Get attendance counts for a student in a materia within date range."""
    rows = await db.execute(
        select(Asistencia.estado, func.count(Asistencia.id)).where(
            Asistencia.materia_id == materia_id,
            Asistencia.estudiante_id == estudiante_id,
            Asistencia.fecha >= fecha_inicio,
            Asistencia.fecha <= fecha_fin,
        ).group_by(Asistencia.estado)
    )
    counts = {r[0]: r[1] for r in rows.all()}
    return {
        "presente": counts.get("presente", 0),
        "ausente": counts.get("ausente", 0),
        "tardanza": counts.get("tardanza", 0),
        "justificado": counts.get("justificado", 0),
        "total": sum(counts.values()),
    }


def _empty_attendance_stats() -> dict[str, int]:
    return {
        "presente": 0,
        "ausente": 0,
        "tardanza": 0,
        "justificado": 0,
        "total": 0,
    }


async def _get_attendance_stats_map(
    db: AsyncSession,
    materia_id: str,
    student_ids: list,
    fecha_inicio,
    fecha_fin,
) -> dict[str, dict[str, int]]:
    """Get attendance counts for many students in one grouped query."""
    if not student_ids:
        return {}

    stats_map: dict[str, dict[str, int]] = {
        str(sid): _empty_attendance_stats() for sid in student_ids
    }

    rows = await db.execute(
        select(
            Asistencia.estudiante_id,
            Asistencia.estado,
            func.count(Asistencia.id),
        ).where(
            Asistencia.materia_id == materia_id,
            Asistencia.estudiante_id.in_(student_ids),
            Asistencia.fecha >= fecha_inicio,
            Asistencia.fecha <= fecha_fin,
        ).group_by(Asistencia.estudiante_id, Asistencia.estado)
    )

    for estudiante_id, estado, total in rows.all():
        sid_key = str(estudiante_id)
        if sid_key not in stats_map:
            stats_map[sid_key] = _empty_attendance_stats()

        count_val = int(total or 0)
        stats_map[sid_key]["total"] += count_val
        if estado in stats_map[sid_key]:
            stats_map[sid_key][estado] += count_val

    return stats_map


async def _get_participacion_map(
    db: AsyncSession,
    materia_id: str,
    periodo_id: str,
    student_ids: list,
) -> dict[str, NotaParticipacion]:
    """Get participation records for many students in one query."""
    if not student_ids:
        return {}

    part_result = await db.execute(
        select(NotaParticipacion).where(
            NotaParticipacion.materia_id == materia_id,
            NotaParticipacion.periodo_id == periodo_id,
            NotaParticipacion.estudiante_id.in_(student_ids),
        )
    )
    return {str(p.estudiante_id): p for p in part_result.scalars().all()}


def _calculate_attendance_grade(ausencias: int, total_registros: int) -> float:
    if total_registros <= 0:
        return 0.0
    return round(max(0, 5.0 - ausencias * 0.3), 2)


def _build_config_map(config_list: list[ConfigPorcentaje]) -> dict[str, float]:
    config_map: dict[str, float] = {}
    for c in config_list:
        if c.examen_id:
            config_map[str(c.examen_id)] = float(c.porcentaje)
        elif c.tipo_actividad:
            config_map[f"__{c.tipo_actividad}__"] = float(c.porcentaje)
    return config_map


def _require_config_map(config_map: dict[str, float]) -> None:
    if not config_map:
        raise HTTPException(
            status_code=400,
            detail="No hay configuración de porcentajes para este período. Debes configurarla antes de calcular reportes o boletines.",
        )

    total_pct = sum(config_map.values())
    if abs(total_pct - 100.0) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"La configuración de porcentajes es inválida ({round(total_pct, 2)}%). Debe sumar 100%.",
        )


def _period_end_dt(periodo: PeriodoAcademico) -> datetime:
    return datetime.combine(periodo.fecha_fin, datetime.max.time()).replace(tzinfo=timezone.utc)


def _activity_deadline(examen: Examen, periodo: PeriodoAcademico) -> datetime:
    """Return the effective deadline for an activity.

    If the exam has its own fecha_limite, that is used.
    Otherwise, the end of the academic period acts as deadline.
    """
    return examen.fecha_limite or _period_end_dt(periodo)


def _is_activity_overdue(examen: Examen, periodo: PeriodoAcademico, now_utc: datetime) -> bool:
    return now_utc > _activity_deadline(examen, periodo)


def _build_auto_default_detail(now_utc: datetime) -> dict:
    return {
        "auto_default_overdue": True,
        "nota_default": 1.0,
        "fecha_auto_asignacion": now_utc.isoformat(),
        "motivo": "Actividad vencida sin calificación registrada",
    }


def _assign_default_grade_one(
    nota_obj: Nota | None,
    estudiante_id,
    examen_id,
    now_utc: datetime,
) -> tuple[Nota, float, bool, bool]:
    """Assign default grade 1.0 for overdue activities without grade.

    Returns: (nota_obj, nota_val, changed, created_new)
    """
    if nota_obj and nota_obj.nota is not None:
        return nota_obj, float(nota_obj.nota), False, False

    auto_detail = _build_auto_default_detail(now_utc)
    auto_feedback = "Nota mínima (1.0) asignada automáticamente por vencimiento de la actividad."

    if nota_obj:
        nota_obj.nota = 1.0
        if not nota_obj.retroalimentacion:
            nota_obj.retroalimentacion = auto_feedback
        existing_detail = nota_obj.detalle_json if isinstance(nota_obj.detalle_json, dict) else {}
        nota_obj.detalle_json = {**existing_detail, **auto_detail}
        return nota_obj, 1.0, True, False

    nota_obj = Nota(
        estudiante_id=estudiante_id,
        examen_id=examen_id,
        nota=1.0,
        detalle_json=auto_detail,
        retroalimentacion=auto_feedback,
    )
    return nota_obj, 1.0, True, True


# ──────── REPORTES ────────

@router.get("/materia/{materia_id}/periodo/{periodo_id}")
async def get_reporte_notas(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get grades report for a materia in a period, with per-activity percentages and attendance."""
    await _assert_materia_access(db, materia_id, current_user)

    # Get period dates
    periodo_result = await db.execute(
        select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id)
    )
    periodo = periodo_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    # Get students enrolled
    est_result = await db.execute(
        select(User).join(Matricula).where(Matricula.materia_id == materia_id).order_by(User.apellido)
    )
    students = est_result.scalars().all()

    # Get exams created in this period's date range
    exams_result = await db.execute(
        select(Examen).where(
            Examen.materia_id == materia_id,
            Examen.created_at >= datetime.combine(periodo.fecha_inicio, datetime.min.time()).replace(tzinfo=timezone.utc),
            Examen.created_at <= datetime.combine(periodo.fecha_fin, datetime.max.time()).replace(tzinfo=timezone.utc),
        ).order_by(Examen.created_at)
    )
    exams = exams_result.scalars().all()

    # Get percentage config (per-examen + special types)
    config_result = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == periodo_id,
        )
    )
    config_list = config_result.scalars().all()
    config_map = _build_config_map(config_list)
    config_total_pct = round(sum(config_map.values()), 2) if config_map else 0.0
    config_valida = bool(config_map) and abs(config_total_pct - 100.0) <= 0.01
    config_warning = None
    if not config_map:
        config_warning = (
            "No hay configuración de porcentajes para este período. "
            "La nota proyectada no puede calcularse aún."
        )
    elif not config_valida:
        config_warning = (
            f"La configuración de porcentajes suma {config_total_pct}% y debe sumar 100%. "
            "La nota proyectada no puede calcularse con esta configuración."
        )

    now_utc = datetime.now(timezone.utc)

    # Prefetch latest notes for enrolled students in selected exams.
    notas_map = {}
    exam_ids = [ex.id for ex in exams]
    student_ids = [s.id for s in students]
    if exam_ids and student_ids:
        notas_result = await db.execute(
            select(Nota).where(
                Nota.examen_id.in_(exam_ids),
                Nota.estudiante_id.in_(student_ids),
            ).order_by(Nota.created_at.desc())
        )
        for n in notas_result.scalars().all():
            key = (str(n.estudiante_id), str(n.examen_id))
            if key not in notas_map:
                notas_map[key] = n

    attendance_map = await _get_attendance_stats_map(
        db=db,
        materia_id=materia_id,
        student_ids=student_ids,
        fecha_inicio=periodo.fecha_inicio,
        fecha_fin=periodo.fecha_fin,
    )
    participacion_map = await _get_participacion_map(
        db=db,
        materia_id=materia_id,
        periodo_id=periodo_id,
        student_ids=student_ids,
    )

    report = []

    # Build report per student
    for est in students:
        actividades = []
        all_items = []  # for grade calculation: includes exams + special items

        for ex in exams:
            nota_key = (str(est.id), str(ex.id))
            nota_obj = notas_map.get(nota_key)
            nota_val = float(nota_obj.nota) if nota_obj and nota_obj.nota is not None else None
            overdue = _is_activity_overdue(ex, periodo, now_utc)
            auto_asignada = False

            if nota_val is None and overdue:
                # In report preview mode we apply the overdue default virtually, without mutating DB.
                nota_val = 1.0
                auto_asignada = True

            pct = config_map.get(str(ex.id), 0)
            act_item = {
                "examen_id": str(ex.id),
                "titulo": ex.titulo,
                "tipo": ex.tipo or "examen",
                "nota": nota_val if nota_val is not None else 0.0,
                "fecha": ex.created_at.isoformat(),
                "fecha_limite": ex.fecha_limite.isoformat() if ex.fecha_limite else None,
                "porcentaje": pct,
                "auto_asignada": auto_asignada,
            }
            actividades.append(act_item)

            # Only graded (or auto-assigned overdue) activities affect weighted grade.
            if nota_val is not None:
                all_items.append({
                    "examen_id": str(ex.id),
                    "titulo": ex.titulo,
                    "tipo": ex.tipo or "examen",
                    "nota": nota_val,
                    "fecha": ex.created_at.isoformat(),
                    "porcentaje": pct,
                })

        # Attendance stats + nota
        asistencia = dict(attendance_map.get(str(est.id), _empty_attendance_stats()))
        # Attendance grade: 5.0 - (ausencias × 0.3), min 0
        nota_asistencia = _calculate_attendance_grade(
            asistencia["ausente"],
            asistencia.get("total", 0),
        )
        asistencia["nota"] = nota_asistencia
        if "__asistencia__" in config_map:
            all_items.append({
                "config_key": "__asistencia__",
                "nota": nota_asistencia,
            })

        # Participation grade
        part = participacion_map.get(str(est.id))
        nota_participacion = float(part.nota) if part and part.nota is not None else 0.0
        if "__participacion__" in config_map:
            all_items.append({
                "config_key": "__participacion__",
                "nota": nota_participacion,
            })

        # Calculate grade
        nota_final = _calculate_weighted_grade(all_items, config_map)

        report.append({
            "estudiante_id": str(est.id),
            "nombre": f"{est.nombre} {est.apellido}",
            "documento": est.documento,
            "actividades": actividades,
            "nota_final": nota_final,
            "asistencia": asistencia,
            "nota_participacion": nota_participacion,
        })

    return {
        "materia_id": materia_id,
        "periodo": {
            "id": str(periodo.id),
            "nombre": periodo.nombre,
            "numero": periodo.numero,
            "fecha_inicio": str(periodo.fecha_inicio),
            "fecha_fin": str(periodo.fecha_fin),
        },
        "config_porcentajes": config_map,
        "actividades_disponibles": [
            {"examen_id": str(ex.id), "titulo": ex.titulo, "tipo": ex.tipo or "examen"}
            for ex in exams
        ],
        "estudiantes": report,
    }


@router.get("/generados/{materia_id}")
async def list_reportes_generados(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    await _assert_materia_access(db, materia_id, current_user)
    result = await db.execute(
        select(ReporteGenerado)
        .where(ReporteGenerado.materia_id == materia_id)
        .order_by(ReporteGenerado.created_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "materia_id": str(item.materia_id),
            "periodo_id": str(item.periodo_id),
            "titulo": item.titulo,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


@router.post("/generados/{materia_id}/{periodo_id}", status_code=status.HTTP_201_CREATED)
async def save_reporte_generado(
    materia_id: str,
    periodo_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    await _assert_materia_access(db, materia_id, current_user)
    contenido = await get_reporte_notas(materia_id, periodo_id, db, current_user)
    created_at = datetime.now(timezone.utc)
    titulo = f"Reporte generado el {created_at.strftime('%d/%m/%Y')}"
    reporte = ReporteGenerado(
        materia_id=materia_id,
        periodo_id=periodo_id,
        profesor_id=current_user.id,
        titulo=titulo,
        contenido_json=contenido,
        created_at=created_at,
    )
    db.add(reporte)
    db.add(AuditLog(
        user_id=current_user.id,
        accion="save_generated_report",
        detalle={"materia_id": materia_id, "periodo_id": periodo_id, "titulo": titulo},
        ip=get_client_ip(request),
    ))
    await db.commit()
    await db.refresh(reporte)
    return {
        "id": str(reporte.id),
        "materia_id": str(reporte.materia_id),
        "periodo_id": str(reporte.periodo_id),
        "titulo": reporte.titulo,
        "contenido_json": reporte.contenido_json,
        "created_at": reporte.created_at.isoformat() if reporte.created_at else None,
    }


@router.get("/generados/item/{reporte_id}")
async def get_reporte_generado_item(
    reporte_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(ReporteGenerado).where(ReporteGenerado.id == reporte_id))
    reporte = result.scalar_one_or_none()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte guardado no encontrado")
    await _assert_materia_access(db, str(reporte.materia_id), current_user)
    db.add(AuditLog(
        user_id=current_user.id,
        accion="view_generated_report",
        detalle={"reporte_id": reporte_id, "materia_id": str(reporte.materia_id)},
        ip=get_client_ip(request),
    ))
    await db.commit()
    return {
        "id": str(reporte.id),
        "materia_id": str(reporte.materia_id),
        "periodo_id": str(reporte.periodo_id),
        "titulo": reporte.titulo,
        "contenido_json": reporte.contenido_json,
        "created_at": reporte.created_at.isoformat() if reporte.created_at else None,
    }


@router.delete("/generados/item/{reporte_id}")
async def delete_reporte_generado_item(
    reporte_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(ReporteGenerado).where(ReporteGenerado.id == reporte_id))
    reporte = result.scalar_one_or_none()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte guardado no encontrado")
    await _assert_materia_access(db, str(reporte.materia_id), current_user)
    materia_id = str(reporte.materia_id)
    await db.delete(reporte)
    db.add(AuditLog(
        user_id=current_user.id,
        accion="delete_generated_report",
        detalle={"reporte_id": reporte_id, "materia_id": materia_id},
        ip=get_client_ip(request),
    ))
    await db.commit()
    return {"detail": "Reporte eliminado"}


@router.get("/estudiante/{materia_id}/{periodo_id}/{estudiante_id}")
async def get_estudiante_detalle_periodo(
    materia_id: str,
    periodo_id: str,
    estudiante_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Consolidated student profile for professor drilldown in a materia/periodo."""
    materia_result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = materia_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso para esta materia")

    periodo_result = await db.execute(
        select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id)
    )
    periodo = periodo_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    est_result = await db.execute(select(User).where(User.id == estudiante_id))
    estudiante = est_result.scalar_one_or_none()
    if not estudiante:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")

    mat_result = await db.execute(
        select(Matricula.id).where(
            Matricula.materia_id == materia_id,
            Matricula.estudiante_id == estudiante_id,
        )
    )
    if not mat_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="El estudiante no está inscrito en esta materia")

    start_dt = datetime.combine(periodo.fecha_inicio, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(periodo.fecha_fin, datetime.max.time()).replace(tzinfo=timezone.utc)

    exams_result = await db.execute(
        select(Examen).where(
            Examen.materia_id == materia_id,
            Examen.created_at >= start_dt,
            Examen.created_at <= end_dt,
        ).order_by(Examen.created_at.desc())
    )
    exams = exams_result.scalars().all()

    exam_ids = [ex.id for ex in exams]
    notas_by_examen = {}
    respuestas_by_examen = {}
    if exam_ids:
        notas_result = await db.execute(
            select(Nota).where(
                Nota.estudiante_id == estudiante_id,
                Nota.examen_id.in_(exam_ids),
            ).order_by(Nota.created_at.desc())
        )
        for n in notas_result.scalars().all():
            exam_key = str(n.examen_id)
            if exam_key not in notas_by_examen:
                notas_by_examen[exam_key] = n

        respuestas_result = await db.execute(
            select(RespuestaOnline).where(
                RespuestaOnline.estudiante_id == estudiante_id,
                RespuestaOnline.examen_id.in_(exam_ids),
            )
        )
        respuestas_by_examen = {str(r.examen_id): r for r in respuestas_result.scalars().all()}

    config_result = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == periodo_id,
        )
    )
    config_list = config_result.scalars().all()
    config_map = _build_config_map(config_list)
    config_total_pct = round(sum(config_map.values()), 2) if config_map else 0.0
    config_valida = bool(config_map) and abs(config_total_pct - 100.0) <= 0.01
    config_warning = None
    if not config_map:
        config_warning = (
            "No hay configuración de porcentajes para este período. "
            "La nota proyectada no puede calcularse aún."
        )
    elif not config_valida:
        config_warning = (
            f"La configuración de porcentajes suma {config_total_pct}% y debe sumar 100%. "
            "La nota proyectada no puede calcularse con esta configuración."
        )

    actividades = []
    all_items = []
    calificados = 0
    notas_actividades = []
    now_utc = datetime.now(timezone.utc)
    for ex in exams:
        nota_obj = notas_by_examen.get(str(ex.id))
        respuesta_obj = respuestas_by_examen.get(str(ex.id))
        nota_val = float(nota_obj.nota) if nota_obj and nota_obj.nota is not None else None
        overdue = _is_activity_overdue(ex, periodo, now_utc)
        auto_asignada = False
        auto_detail = None
        auto_feedback = None

        if nota_val is None and overdue:
            # For detail preview, represent overdue defaults without writing changes.
            nota_val = 1.0
            auto_asignada = True
            auto_detail = _build_auto_default_detail(now_utc)
            auto_feedback = "Nota mínima (1.0) aplicada por vencimiento (vista previa, sin persistencia)."

        if nota_val is not None:
            calificados += 1
            notas_actividades.append(nota_val)

        preguntas_examen = []
        if isinstance(ex.contenido_json, dict):
            raw_preguntas = ex.contenido_json.get("preguntas")
            if isinstance(raw_preguntas, list):
                for p in raw_preguntas:
                    if not isinstance(p, dict):
                        continue
                    preguntas_examen.append({
                        "numero": p.get("numero"),
                        "enunciado": p.get("pregunta") or p.get("enunciado") or p.get("texto") or p.get("statement"),
                    })

        pct = config_map.get(str(ex.id), 0.0)
        estado = "calificado" if nota_val is not None else ("vencido" if overdue else "pendiente")
        actividades.append({
            "examen_id": str(ex.id),
            "titulo": ex.titulo,
            "tipo": ex.tipo or "examen",
            "fecha": ex.created_at.isoformat(),
            "fecha_limite": ex.fecha_limite.isoformat() if ex.fecha_limite else None,
            "nota": nota_val,
            "porcentaje": pct,
            "estado": estado,
            "auto_asignada": auto_asignada,
            "nota_id": str(nota_obj.id) if nota_obj else None,
            "retroalimentacion": nota_obj.retroalimentacion if nota_obj else auto_feedback,
            "detalle_json": nota_obj.detalle_json if nota_obj else auto_detail,
            "preguntas_examen": preguntas_examen,
            "respuesta_online_id": str(respuesta_obj.id) if respuesta_obj else None,
            "respuestas_json": respuesta_obj.respuestas_json if respuesta_obj else None,
            "enviado_at": respuesta_obj.enviado_at.isoformat() if respuesta_obj and respuesta_obj.enviado_at else None,
        })

        if nota_val is not None:
            all_items.append({
                "examen_id": str(ex.id),
                "nota": nota_val,
            })

    asistencia_result = await db.execute(
        select(Asistencia).where(
            Asistencia.materia_id == materia_id,
            Asistencia.estudiante_id == estudiante_id,
            Asistencia.fecha >= periodo.fecha_inicio,
            Asistencia.fecha <= periodo.fecha_fin,
        ).order_by(Asistencia.fecha.desc())
    )
    asistencia_rows = asistencia_result.scalars().all()
    asistencia_counts = {
        "presente": 0,
        "ausente": 0,
        "tardanza": 0,
        "justificado": 0,
    }
    for row in asistencia_rows:
        if row.estado in asistencia_counts:
            asistencia_counts[row.estado] += 1

    total_asistencia = len(asistencia_rows)
    nota_asistencia = _calculate_attendance_grade(asistencia_counts["ausente"], total_asistencia)
    porcentaje_asistencia = round(
        ((asistencia_counts["presente"] + asistencia_counts["justificado"]) / total_asistencia) * 100,
        1,
    ) if total_asistencia > 0 else 0.0

    if "__asistencia__" in config_map:
        all_items.append({"config_key": "__asistencia__", "nota": nota_asistencia})

    part_result = await db.execute(
        select(NotaParticipacion).where(
            NotaParticipacion.materia_id == materia_id,
            NotaParticipacion.periodo_id == periodo_id,
            NotaParticipacion.estudiante_id == estudiante_id,
        )
    )
    part = part_result.scalar_one_or_none()
    nota_participacion = float(part.nota) if part and part.nota is not None else 0.0

    if "__participacion__" in config_map:
        all_items.append({"config_key": "__participacion__", "nota": nota_participacion})

    boletin_result = await db.execute(
        select(Boletin).where(
            Boletin.estudiante_id == estudiante_id,
            Boletin.materia_id == materia_id,
            Boletin.periodo_id == periodo_id,
        )
    )
    boletin = boletin_result.scalar_one_or_none()

    promedio_actividades = (
        round(sum(notas_actividades) / len(notas_actividades), 2)
        if notas_actividades else None
    )
    nota_proyectada = _calculate_weighted_grade(all_items, config_map) if (all_items and config_valida) else None

    return {
        "materia": {
            "id": str(materia.id),
            "nombre": materia.nombre,
            "codigo": materia.codigo,
        },
        "periodo": {
            "id": str(periodo.id),
            "nombre": periodo.nombre,
            "numero": periodo.numero,
            "fecha_inicio": str(periodo.fecha_inicio),
            "fecha_fin": str(periodo.fecha_fin),
        },
        "estudiante": {
            "id": str(estudiante.id),
            "nombre": estudiante.nombre,
            "apellido": estudiante.apellido,
            "correo": estudiante.correo,
            "documento": estudiante.documento,
            "celular": estudiante.celular,
        },
        "resumen": {
            "actividades_total": len(actividades),
            "actividades_calificadas": calificados,
            "promedio_actividades": promedio_actividades,
            "nota_proyectada": nota_proyectada,
            "nota_participacion": nota_participacion,
            "nota_asistencia": nota_asistencia,
            "asistencia_porcentaje": porcentaje_asistencia,
            "boletin_publicado": bool(boletin and boletin.publicado),
            "nota_boletin": float(boletin.nota_final) if boletin and boletin.nota_final is not None else None,
        },
        "actividades": actividades,
        "asistencia": {
            "total": total_asistencia,
            "presente": asistencia_counts["presente"],
            "ausente": asistencia_counts["ausente"],
            "tardanza": asistencia_counts["tardanza"],
            "justificado": asistencia_counts["justificado"],
            "porcentaje_asistencia": porcentaje_asistencia,
            "registros": [
                {
                    "id": str(row.id),
                    "fecha": str(row.fecha),
                    "estado": row.estado,
                    "observacion": row.observacion,
                }
                for row in asistencia_rows
            ],
        },
        "participacion": {
            "nota": nota_participacion,
            "observacion": part.observacion if part else None,
        },
        "boletin": {
            "id": str(boletin.id),
            "nota_final": float(boletin.nota_final) if boletin.nota_final is not None else None,
            "publicado": boletin.publicado,
            "publicado_at": boletin.publicado_at.isoformat() if boletin.publicado_at else None,
            "desglose_json": boletin.desglose_json,
        } if boletin else None,
        "config_porcentajes": config_map,
        "config_valida": config_valida,
        "config_total_porcentaje": config_total_pct,
        "config_warning": config_warning,
    }


def _calculate_weighted_grade(all_items: list[dict], config_map: dict) -> float:
    """
    Calculate weighted grade based on config percentages.
    config_map keys can be examen_id UUIDs, or special strings: '__asistencia__', '__participacion__'.
    nota_final = sum of (nota × porcentaje / 100), capped at 5.0.
    This helper expects only grade-ready items:
    - manually/automatically graded activities
    - overdue activities auto-assigned with default 1.0
    Not-yet-due ungraded activities should be excluded by the caller.
    """
    if not config_map:
        raise ValueError("Se requiere configuración de porcentajes para calcular la nota ponderada")

    weighted_sum = 0.0
    for item in all_items:
        key = item.get("config_key") or item.get("examen_id")
        pct = config_map.get(key, 0)
        nota = item.get("nota") if item.get("nota") is not None else 0.0
        if pct > 0:
            weighted_sum += nota * (pct / 100.0)

    return round(min(weighted_sum, 5.0), 2)


# ──────── BOLETINES ────────

@router.post("/boletin/{materia_id}/{periodo_id}")
async def generate_boletines(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Generate report cards for all students in a materia for a period."""
    await _assert_materia_access(db, materia_id, current_user)

    # Get report data
    periodo_result = await db.execute(
        select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id)
    )
    periodo = periodo_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    est_result = await db.execute(
        select(User).join(Matricula).where(Matricula.materia_id == materia_id)
    )
    students = est_result.scalars().all()

    # Get exams in period
    exams_result = await db.execute(
        select(Examen).where(
            Examen.materia_id == materia_id,
            Examen.created_at >= datetime.combine(periodo.fecha_inicio, datetime.min.time()).replace(tzinfo=timezone.utc),
            Examen.created_at <= datetime.combine(periodo.fecha_fin, datetime.max.time()).replace(tzinfo=timezone.utc),
        )
    )
    exams = exams_result.scalars().all()

    # Get config (per-examen + special types)
    config_result = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == periodo_id,
        )
    )
    config_list = config_result.scalars().all()
    config_map = _build_config_map(config_list)
    _require_config_map(config_map)

    now_utc = datetime.now(timezone.utc)

    # Prefetch latest notes for boletin generation.
    notas_map = {}
    exam_ids = [ex.id for ex in exams]
    student_ids = [s.id for s in students]
    if exam_ids and student_ids:
        notas_result = await db.execute(
            select(Nota).where(
                Nota.examen_id.in_(exam_ids),
                Nota.estudiante_id.in_(student_ids),
            ).order_by(Nota.created_at.desc())
        )
        for n in notas_result.scalars().all():
            key = (str(n.estudiante_id), str(n.examen_id))
            if key not in notas_map:
                notas_map[key] = n

    attendance_map = await _get_attendance_stats_map(
        db=db,
        materia_id=materia_id,
        student_ids=student_ids,
        fecha_inicio=periodo.fecha_inicio,
        fecha_fin=periodo.fecha_fin,
    )
    participacion_map = await _get_participacion_map(
        db=db,
        materia_id=materia_id,
        periodo_id=periodo_id,
        student_ids=student_ids,
    )

    boletines_map = {}
    if student_ids:
        existing_boletines_result = await db.execute(
            select(Boletin).where(
                Boletin.materia_id == materia_id,
                Boletin.periodo_id == periodo_id,
                Boletin.estudiante_id.in_(student_ids),
            )
        )
        boletines_map = {
            str(b.estudiante_id): b for b in existing_boletines_result.scalars().all()
        }

    count = 0
    for est in students:
        actividades = []
        all_items = []

        for ex in exams:
            nota_key = (str(est.id), str(ex.id))
            nota_obj = notas_map.get(nota_key)
            nota_val = float(nota_obj.nota) if nota_obj and nota_obj.nota is not None else None
            overdue = _is_activity_overdue(ex, periodo, now_utc)
            auto_asignada = False

            if nota_val is None and overdue:
                nota_obj, nota_val, changed, created_new = _assign_default_grade_one(
                    nota_obj=nota_obj,
                    estudiante_id=est.id,
                    examen_id=ex.id,
                    now_utc=now_utc,
                )
                auto_asignada = changed
                if created_new:
                    db.add(nota_obj)
                    notas_map[nota_key] = nota_obj

            pct = config_map.get(str(ex.id), 0)
            act_item = {
                "examen_id": str(ex.id),
                "titulo": ex.titulo,
                "tipo": ex.tipo or "examen",
                "nota": nota_val if nota_val is not None else 0.0,
                "porcentaje": pct,
                "auto_asignada": auto_asignada,
            }
            actividades.append(act_item)
            if nota_val is not None:
                all_items.append({
                    "examen_id": str(ex.id),
                    "titulo": ex.titulo,
                    "tipo": ex.tipo or "examen",
                    "nota": nota_val,
                    "porcentaje": pct,
                })

        # Attendance
        asistencia = dict(attendance_map.get(str(est.id), _empty_attendance_stats()))
        nota_asistencia = _calculate_attendance_grade(
            asistencia["ausente"],
            asistencia.get("total", 0),
        )
        asistencia["nota"] = nota_asistencia
        if "__asistencia__" in config_map:
            all_items.append({"config_key": "__asistencia__", "nota": nota_asistencia})

        # Participation
        part = participacion_map.get(str(est.id))
        nota_participacion = float(part.nota) if part and part.nota is not None else 0.0
        if "__participacion__" in config_map:
            all_items.append({"config_key": "__participacion__", "nota": nota_participacion})

        nota_final = _calculate_weighted_grade(all_items, config_map)

        desglose = {
            "actividades": actividades,
            "config": config_map,
            "asistencia": asistencia,
            "nota_participacion": nota_participacion,
        }

        # Upsert boletin
        boletin = boletines_map.get(str(est.id))
        if boletin:
            boletin.nota_final = nota_final
            boletin.desglose_json = desglose
            boletin.publicado = True
            boletin.publicado_at = datetime.now(timezone.utc)
        else:
            boletin = Boletin(
                estudiante_id=est.id,
                materia_id=materia_id,
                periodo_id=periodo_id,
                nota_final=nota_final,
                desglose_json=desglose,
                publicado=True,
                publicado_at=datetime.now(timezone.utc),
                created_by=current_user.id,
            )
            db.add(boletin)
            boletines_map[str(est.id)] = boletin
        count += 1

    await db.commit()
    return {"detail": f"Boletines generados para {count} estudiantes"}


@router.get("/boletines/materia/{materia_id}/{periodo_id}", response_model=list[BoletinOut])
async def get_boletines_materia(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    await _assert_materia_access(db, materia_id, current_user)

    result = await db.execute(
        select(Boletin).where(
            Boletin.materia_id == materia_id,
            Boletin.periodo_id == periodo_id,
        )
    )
    boletines = result.scalars().all()

    # Fetch materia and periodo info once
    mat_res = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = mat_res.scalar_one_or_none()
    per_res = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id))
    periodo = per_res.scalar_one_or_none()

    student_map = {}
    student_ids = [b.estudiante_id for b in boletines]
    if student_ids:
        students_res = await db.execute(select(User).where(User.id.in_(student_ids)))
        student_map = {str(s.id): s for s in students_res.scalars().all()}

    out = []
    for b in boletines:
        d = BoletinOut.model_validate(b)
        e = student_map.get(str(b.estudiante_id))
        if e:
            d.estudiante_nombre = f"{e.nombre} {e.apellido}"
        if materia:
            d.materia_nombre = materia.nombre
        if periodo:
            d.periodo_nombre = periodo.nombre
        out.append(d)
    return out


@router.get("/mis-boletines", response_model=list[BoletinOut])
async def get_my_boletines(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Get all published report cards for the current student."""
    result = await db.execute(
        select(Boletin).where(
            Boletin.estudiante_id == current_user.id,
            Boletin.publicado == True,
        ).order_by(Boletin.created_at.desc())
    )
    boletines = result.scalars().all()

    materia_map = {}
    periodo_map = {}
    materia_ids = list({b.materia_id for b in boletines})
    periodo_ids = list({b.periodo_id for b in boletines})
    if materia_ids:
        materias_result = await db.execute(select(Materia).where(Materia.id.in_(materia_ids)))
        materia_map = {str(m.id): m for m in materias_result.scalars().all()}
    if periodo_ids:
        periodos_result = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id.in_(periodo_ids)))
        periodo_map = {str(p.id): p for p in periodos_result.scalars().all()}

    materia_grade_map: dict[str, dict[str, float]] = {}
    materia_fallback_avg_map: dict[str, dict[str, float]] = {}
    for b in boletines:
        materia_key = str(b.materia_id)
        nota_periodo = float(b.nota_final) if b.nota_final is not None else None
        periodo = periodo_map.get(str(b.periodo_id))
        periodo_pct = float(periodo.porcentaje) if periodo and periodo.porcentaje is not None else 0.0

        if nota_periodo is not None:
            if materia_key not in materia_fallback_avg_map:
                materia_fallback_avg_map[materia_key] = {"sum": 0.0, "count": 0.0}
            materia_fallback_avg_map[materia_key]["sum"] += nota_periodo
            materia_fallback_avg_map[materia_key]["count"] += 1.0

            if materia_key not in materia_grade_map:
                materia_grade_map[materia_key] = {"weighted_sum": 0.0, "porcentaje_sum": 0.0}
            materia_grade_map[materia_key]["weighted_sum"] += nota_periodo * (periodo_pct / 100.0)
            materia_grade_map[materia_key]["porcentaje_sum"] += periodo_pct

    out = []
    for b in boletines:
        d = BoletinOut.model_validate(b)
        materia_key = str(b.materia_id)
        m = materia_map.get(str(b.materia_id))
        if m:
            d.materia_nombre = m.nombre
        p = periodo_map.get(str(b.periodo_id))
        if p:
            d.periodo_nombre = p.nombre
            d.periodo_porcentaje = float(p.porcentaje) if p.porcentaje is not None else None

        agg = materia_grade_map.get(materia_key)
        fallback_avg = materia_fallback_avg_map.get(materia_key)
        if agg and agg.get("porcentaje_sum", 0.0) > 0:
            d.nota_materia = round(min(agg["weighted_sum"], 5.0), 2)
            d.porcentaje_materia_acumulado = round(agg["porcentaje_sum"], 2)
        elif fallback_avg and fallback_avg.get("count", 0.0) > 0:
            d.nota_materia = round(fallback_avg["sum"] / fallback_avg["count"], 2)
            d.porcentaje_materia_acumulado = 0.0

        out.append(d)
    return out


# ──────── PARTICIPACIÓN ────────

@router.get("/participacion/{materia_id}/{periodo_id}")
async def get_participacion(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get participation grades for all enrolled students."""
    await _assert_materia_access(db, materia_id, current_user)

    # Get enrolled students
    est_result = await db.execute(
        select(User).join(Matricula).where(Matricula.materia_id == materia_id).order_by(User.apellido)
    )
    students = est_result.scalars().all()

    # Get existing participation grades
    part_result = await db.execute(
        select(NotaParticipacion).where(
            NotaParticipacion.materia_id == materia_id,
            NotaParticipacion.periodo_id == periodo_id,
        )
    )
    parts = {str(p.estudiante_id): p for p in part_result.scalars().all()}

    return [
        {
            "estudiante_id": str(s.id),
            "nombre": f"{s.nombre} {s.apellido}",
            "nota": float(parts[str(s.id)].nota) if str(s.id) in parts else 0.0,
            "observacion": parts[str(s.id)].observacion if str(s.id) in parts else None,
        }
        for s in students
    ]


@router.post("/participacion/{materia_id}/{periodo_id}")
async def save_participacion(
    materia_id: str,
    periodo_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Save participation grades. Body: { notas: [{estudiante_id, nota, observacion?}] }"""
    await _assert_materia_access(db, materia_id, current_user)

    notas_data = data.get("notas", [])

    incoming_student_ids = [item.get("estudiante_id") for item in notas_data if item.get("estudiante_id")]
    existing_parts_map = {}
    if incoming_student_ids:
        existing_parts = await db.execute(
            select(NotaParticipacion).where(
                NotaParticipacion.materia_id == materia_id,
                NotaParticipacion.periodo_id == periodo_id,
                NotaParticipacion.estudiante_id.in_(incoming_student_ids),
            )
        )
        existing_parts_map = {
            str(p.estudiante_id): p for p in existing_parts.scalars().all()
        }

    for item in notas_data:
        eid = item.get("estudiante_id")
        nota_val = item.get("nota", 0)
        obs = item.get("observacion")

        part = existing_parts_map.get(str(eid))
        if part:
            part.nota = nota_val
            part.observacion = obs
            part.updated_at = datetime.now(timezone.utc)
        else:
            part = NotaParticipacion(
                materia_id=materia_id,
                periodo_id=periodo_id,
                estudiante_id=eid,
                nota=nota_val,
                observacion=obs,
            )
            db.add(part)
            existing_parts_map[str(eid)] = part

    await db.commit()
    return {"detail": f"Participación guardada para {len(notas_data)} estudiantes"}


# ──────── EXPOSICIONES ────────

UPLOAD_DIR = "/app/uploads/exposiciones"

@router.post("/exposicion/{materia_id}")
async def create_exposicion(
    materia_id: str,
    titulo: str = Form(...),
    descripcion: str = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Create an exposition activity for a materia."""
    await _assert_materia_access(db, materia_id, current_user)

    examen = Examen(
        materia_id=materia_id,
        titulo=titulo,
        tipo="exposicion",
        contenido_json={"descripcion": descripcion or "", "tipo_entrega": "archivo"},
        activo_online=True,
    )
    db.add(examen)
    await db.commit()
    await db.refresh(examen)
    return {
        "id": str(examen.id),
        "titulo": examen.titulo,
        "tipo": "exposicion",
        "created_at": examen.created_at.isoformat(),
    }


@router.post("/exposicion/{examen_id}/upload")
async def upload_exposicion(
    examen_id: str,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Student uploads files for an exposition."""
    examen = await _assert_examen_tipo(db, examen_id, "exposicion")

    matricula_result = await db.execute(
        select(Matricula.id).where(
            Matricula.materia_id == examen.materia_id,
            Matricula.estudiante_id == current_user.id,
        )
    )
    if not matricula_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No estás inscrito en la materia de esta exposición")

    # Save files
    upload_path = os.path.join(UPLOAD_DIR, str(examen_id), str(current_user.id))
    os.makedirs(upload_path, exist_ok=True)

    saved_files = []
    for f in files:
        content_type = (f.content_type or "").lower()
        if content_type not in ALLOWED_EXPOSICION_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {content_type or 'desconocido'}")

        ext = _normalize_extension(f.filename)
        if ext not in ALLOWED_EXPOSICION_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Extensión no permitida: {ext or 'sin extensión'}")

        original_name = f.filename or "archivo"
        filename = f"{_uuid.uuid4().hex[:8]}{ext}"
        filepath = os.path.join(upload_path, filename)

        total_size = 0
        with open(filepath, "wb") as out:
            while True:
                chunk = f.file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > settings.MAX_UPLOAD_SIZE:
                    out.close()
                    os.remove(filepath)
                    raise HTTPException(status_code=400, detail="Archivo muy grande (máx 10MB)")
                out.write(chunk)

        saved_files.append({"nombre": original_name, "ruta": f"/uploads/exposiciones/{examen_id}/{current_user.id}/{filename}"})

    # Save/update online response
    existing = await db.execute(
        select(RespuestaOnline).where(
            RespuestaOnline.examen_id == examen_id,
            RespuestaOnline.estudiante_id == current_user.id,
        )
    )
    resp = existing.scalar_one_or_none()
    if resp:
        old_files = resp.respuestas_json.get("archivos", []) if resp.respuestas_json else []
        resp.respuestas_json = {"archivos": old_files + saved_files}
    else:
        db.add(RespuestaOnline(
            estudiante_id=current_user.id,
            examen_id=examen_id,
            respuestas_json={"archivos": saved_files},
        ))

    await db.commit()
    return {"detail": f"{len(saved_files)} archivo(s) subido(s)", "archivos": saved_files}


@router.get("/exposicion/{examen_id}/archivos")
async def get_exposicion_archivos(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin", "estudiante")),
):
    """Get uploaded files for an exposition."""
    examen = await _assert_examen_tipo(db, examen_id, "exposicion")

    if current_user.rol == "profesor":
        await _assert_materia_access(db, str(examen.materia_id), current_user)

    where_clause = [RespuestaOnline.examen_id == examen_id]
    if current_user.rol == "estudiante":
        where_clause.append(RespuestaOnline.estudiante_id == current_user.id)

    result = await db.execute(
        select(RespuestaOnline).where(and_(*where_clause))
    )
    respuestas = result.scalars().all()

    user_map = {}
    user_ids = [r.estudiante_id for r in respuestas]
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        user_map = {str(u.id): u for u in users_result.scalars().all()}

    out = []
    for r in respuestas:
        e = user_map.get(str(r.estudiante_id))
        archivos = r.respuestas_json.get("archivos", []) if r.respuestas_json else []
        out.append({
            "estudiante_id": str(r.estudiante_id),
            "nombre": f"{e.nombre} {e.apellido}" if e else "N/A",
            "archivos": archivos,
            "enviado_at": r.enviado_at.isoformat() if r.enviado_at else None,
        })
    return out
