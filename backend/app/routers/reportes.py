from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import (
    User, Materia, Matricula, Examen, Nota,
    PeriodoAcademico, ConfigPorcentaje, Boletin,
)
from app.schemas.schemas import ConfigPorcentajeCreate, ConfigPorcentajeOut, BoletinOut

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
    """Save activity percentage configuration for a materia+periodo. Must sum 100%."""
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
            tipo_actividad=act["tipo_actividad"],
            porcentaje=act["porcentaje"],
        )
        db.add(cp)

    await db.commit()
    return {"detail": "Configuración guardada"}


# ──────── REPORTES ────────

@router.get("/materia/{materia_id}/periodo/{periodo_id}")
async def get_reporte_notas(
    materia_id: str,
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get grades report for a materia in a period, broken down by activity type."""
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

    # Get percentage config
    config_result = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == periodo_id,
        )
    )
    config = {c.tipo_actividad: float(c.porcentaje) for c in config_result.scalars().all()}

    # Build report per student
    report = []
    for est in students:
        actividades = []
        for ex in exams:
            nota_result = await db.execute(
                select(Nota).where(
                    Nota.examen_id == ex.id,
                    Nota.estudiante_id == est.id,
                )
            )
            nota = nota_result.scalar_one_or_none()
            actividades.append({
                "examen_id": str(ex.id),
                "titulo": ex.titulo,
                "tipo": ex.tipo or "examen",
                "nota": float(nota.nota) if nota and nota.nota else None,
                "fecha": ex.created_at.isoformat(),
            })

        # Calculate weighted grade
        nota_final = _calculate_weighted_grade(actividades, config)

        report.append({
            "estudiante_id": str(est.id),
            "nombre": f"{est.nombre} {est.apellido}",
            "documento": est.documento,
            "actividades": actividades,
            "nota_final": nota_final,
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
        "config_porcentajes": config,
        "estudiantes": report,
    }


def _calculate_weighted_grade(actividades: list[dict], config: dict) -> float:
    """Calculate weighted grade based on activity config percentages."""
    if not config:
        # Simple average if no config
        notas = [a["nota"] for a in actividades if a["nota"] is not None]
        return round(sum(notas) / len(notas), 2) if notas else 0.0

    weighted_sum = 0.0
    weight_total = 0.0
    # Group activities by type
    by_type = {}
    for a in actividades:
        tipo = a["tipo"]
        if tipo not in by_type:
            by_type[tipo] = []
        if a["nota"] is not None:
            by_type[tipo].append(a["nota"])

    for tipo, pct in config.items():
        notas = by_type.get(tipo, [])
        if notas:
            avg = sum(notas) / len(notas)
            weighted_sum += avg * (pct / 100.0)
            weight_total += pct / 100.0

    if weight_total > 0:
        return round(weighted_sum / weight_total, 2)
    return 0.0


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

    # Get config
    config_result = await db.execute(
        select(ConfigPorcentaje).where(
            ConfigPorcentaje.materia_id == materia_id,
            ConfigPorcentaje.periodo_id == periodo_id,
        )
    )
    config = {c.tipo_actividad: float(c.porcentaje) for c in config_result.scalars().all()}

    count = 0
    for est in students:
        actividades = []
        for ex in exams:
            nota_result = await db.execute(
                select(Nota).where(Nota.examen_id == ex.id, Nota.estudiante_id == est.id)
            )
            nota = nota_result.scalar_one_or_none()
            actividades.append({
                "examen_id": str(ex.id),
                "titulo": ex.titulo,
                "tipo": ex.tipo or "examen",
                "nota": float(nota.nota) if nota and nota.nota else None,
            })

        nota_final = _calculate_weighted_grade(actividades, config)

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
            boletin.desglose_json = {"actividades": actividades, "config": config}
            boletin.publicado = True
            boletin.publicado_at = datetime.now(timezone.utc)
        else:
            boletin = Boletin(
                estudiante_id=est.id,
                materia_id=materia_id,
                periodo_id=periodo_id,
                nota_final=nota_final,
                desglose_json={"actividades": actividades, "config": config},
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
    out = []
    for b in boletines:
        d = BoletinOut.model_validate(b)
        est = await db.execute(select(User).where(User.id == b.estudiante_id))
        e = est.scalar_one_or_none()
        if e:
            d.estudiante_nombre = f"{e.nombre} {e.apellido}"
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
