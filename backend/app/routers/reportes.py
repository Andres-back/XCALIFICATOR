from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import (
    User, Materia, Matricula, Examen, Nota,
    PeriodoAcademico, ConfigPorcentaje, Boletin, Asistencia,
    NotaParticipacion, RespuestaOnline,
)
from app.schemas.schemas import ConfigPorcentajeCreate, ConfigPorcentajeOut, BoletinOut
import uuid as _uuid
import os
import shutil

router = APIRouter(prefix="/reportes", tags=["Reportes y Boletines"])


# ──────── CONFIG PORCENTAJES ────────

@router.get("/config/{materia_id}/{periodo_id}", response_model=list[ConfigPorcentajeOut])
async def get_config_porcentajes(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
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


# ──────── REPORTES ────────

@router.get("/materia/{materia_id}/periodo/{periodo_id}")
async def get_reporte_notas(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get grades report for a materia in a period, with per-activity percentages and attendance."""
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
    # Build unified config map: key → porcentaje
    config_map = {}
    for c in config_list:
        if c.examen_id:
            config_map[str(c.examen_id)] = float(c.porcentaje)
        elif c.tipo_actividad:
            config_map[f"__{c.tipo_actividad}__"] = float(c.porcentaje)

    # Build report per student
    report = []
    for est in students:
        actividades = []
        all_items = []  # for grade calculation: includes exams + special items

        for ex in exams:
            nota_result = await db.execute(
                select(Nota).where(
                    Nota.examen_id == ex.id,
                    Nota.estudiante_id == est.id,
                )
            )
            nota_obj = nota_result.scalar_one_or_none()
            nota_val = float(nota_obj.nota) if nota_obj and nota_obj.nota else 0.0
            pct = config_map.get(str(ex.id), 0)
            act_item = {
                "examen_id": str(ex.id),
                "titulo": ex.titulo,
                "tipo": ex.tipo or "examen",
                "nota": nota_val,
                "fecha": ex.created_at.isoformat(),
                "porcentaje": pct,
            }
            actividades.append(act_item)
            all_items.append(act_item)

        # Attendance stats + nota
        asistencia = await _get_attendance_stats(
            db, materia_id, est.id, periodo.fecha_inicio, periodo.fecha_fin
        )
        # Attendance grade: 5.0 - (ausencias × 0.3), min 0
        nota_asistencia = round(max(0, 5.0 - asistencia["ausente"] * 0.3), 2)
        asistencia["nota"] = nota_asistencia
        if "__asistencia__" in config_map:
            all_items.append({
                "config_key": "__asistencia__",
                "nota": nota_asistencia,
            })

        # Participation grade
        part_result = await db.execute(
            select(NotaParticipacion).where(
                NotaParticipacion.materia_id == materia_id,
                NotaParticipacion.periodo_id == periodo_id,
                NotaParticipacion.estudiante_id == est.id,
            )
        )
        part = part_result.scalar_one_or_none()
        nota_participacion = float(part.nota) if part else 0.0
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


def _calculate_weighted_grade(all_items: list[dict], config_map: dict) -> float:
    """
    Calculate weighted grade based on config percentages.
    config_map keys can be examen_id UUIDs, or special strings: '__asistencia__', '__participacion__'.
    nota_final = sum of (nota × porcentaje / 100), capped at 5.0.
    If student didn't submit, nota = 0.
    """
    if not config_map:
        notas = [a.get("nota") or 0 for a in all_items]
        return round(sum(notas) / len(notas), 2) if notas else 0.0

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
    config_map = {}
    for c in config_list:
        if c.examen_id:
            config_map[str(c.examen_id)] = float(c.porcentaje)
        elif c.tipo_actividad:
            config_map[f"__{c.tipo_actividad}__"] = float(c.porcentaje)

    count = 0
    for est in students:
        actividades = []
        all_items = []

        for ex in exams:
            nota_result = await db.execute(
                select(Nota).where(Nota.examen_id == ex.id, Nota.estudiante_id == est.id)
            )
            nota_obj = nota_result.scalar_one_or_none()
            nota_val = float(nota_obj.nota) if nota_obj and nota_obj.nota else 0.0
            pct = config_map.get(str(ex.id), 0)
            act_item = {
                "examen_id": str(ex.id),
                "titulo": ex.titulo,
                "tipo": ex.tipo or "examen",
                "nota": nota_val,
                "porcentaje": pct,
            }
            actividades.append(act_item)
            all_items.append(act_item)

        # Attendance
        asistencia = await _get_attendance_stats(
            db, materia_id, est.id, periodo.fecha_inicio, periodo.fecha_fin
        )
        nota_asistencia = round(max(0, 5.0 - asistencia["ausente"] * 0.3), 2)
        asistencia["nota"] = nota_asistencia
        if "__asistencia__" in config_map:
            all_items.append({"config_key": "__asistencia__", "nota": nota_asistencia})

        # Participation
        part_result = await db.execute(
            select(NotaParticipacion).where(
                NotaParticipacion.materia_id == materia_id,
                NotaParticipacion.periodo_id == periodo_id,
                NotaParticipacion.estudiante_id == est.id,
            )
        )
        part = part_result.scalar_one_or_none()
        nota_participacion = float(part.nota) if part else 0.0
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
        existing = await db.execute(
            select(Boletin).where(
                Boletin.estudiante_id == est.id,
                Boletin.materia_id == materia_id,
                Boletin.periodo_id == periodo_id,
            )
        )
        boletin = existing.scalar_one_or_none()
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

    out = []
    for b in boletines:
        d = BoletinOut.model_validate(b)
        est = await db.execute(select(User).where(User.id == b.estudiante_id))
        e = est.scalar_one_or_none()
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

    out = []
    for b in boletines:
        d = BoletinOut.model_validate(b)
        mat = await db.execute(select(Materia).where(Materia.id == b.materia_id))
        m = mat.scalar_one_or_none()
        if m:
            d.materia_nombre = m.nombre
        per = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id == b.periodo_id))
        p = per.scalar_one_or_none()
        if p:
            d.periodo_nombre = p.nombre
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
    notas_data = data.get("notas", [])
    for item in notas_data:
        eid = item.get("estudiante_id")
        nota_val = item.get("nota", 0)
        obs = item.get("observacion")

        existing = await db.execute(
            select(NotaParticipacion).where(
                NotaParticipacion.materia_id == materia_id,
                NotaParticipacion.periodo_id == periodo_id,
                NotaParticipacion.estudiante_id == eid,
            )
        )
        part = existing.scalar_one_or_none()
        if part:
            part.nota = nota_val
            part.observacion = obs
            part.updated_at = datetime.now(timezone.utc)
        else:
            db.add(NotaParticipacion(
                materia_id=materia_id,
                periodo_id=periodo_id,
                estudiante_id=eid,
                nota=nota_val,
                observacion=obs,
            ))

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
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

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
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen or examen.tipo != "exposicion":
        raise HTTPException(status_code=404, detail="Exposición no encontrada")

    # Save files
    upload_path = os.path.join(UPLOAD_DIR, str(examen_id), str(current_user.id))
    os.makedirs(upload_path, exist_ok=True)

    saved_files = []
    for f in files:
        ext = os.path.splitext(f.filename)[1]
        filename = f"{_uuid.uuid4().hex[:8]}{ext}"
        filepath = os.path.join(upload_path, filename)
        with open(filepath, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved_files.append({"nombre": f.filename, "ruta": f"/uploads/exposiciones/{examen_id}/{current_user.id}/{filename}"})

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
    result = await db.execute(
        select(RespuestaOnline).where(RespuestaOnline.examen_id == examen_id)
    )
    respuestas = result.scalars().all()

    out = []
    for r in respuestas:
        est = await db.execute(select(User).where(User.id == r.estudiante_id))
        e = est.scalar_one_or_none()
        archivos = r.respuestas_json.get("archivos", []) if r.respuestas_json else []
        out.append({
            "estudiante_id": str(r.estudiante_id),
            "nombre": f"{e.nombre} {e.apellido}" if e else "N/A",
            "archivos": archivos,
            "enviado_at": r.enviado_at.isoformat() if r.enviado_at else None,
        })
    return out
