from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, PeriodoAcademico, AuditLog
from app.schemas.schemas import (
    PeriodoAcademicoCreate, PeriodoAcademicoUpdate, PeriodoAcademicoOut,
)

router = APIRouter(prefix="/periodos", tags=["Períodos Académicos"])


@router.get("/", response_model=list[PeriodoAcademicoOut])
async def list_periodos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin", "profesor", "estudiante")),
):
    result = await db.execute(
        select(PeriodoAcademico).order_by(PeriodoAcademico.numero)
    )
    return [PeriodoAcademicoOut.model_validate(p) for p in result.scalars().all()]


@router.post("/", response_model=PeriodoAcademicoOut, status_code=status.HTTP_201_CREATED)
async def create_periodo(
    data: PeriodoAcademicoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    # Check periodo number uniqueness
    existing = await db.execute(
        select(PeriodoAcademico).where(PeriodoAcademico.numero == data.numero)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Ya existe un período {data.numero}")

    if data.fecha_fin <= data.fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha fin debe ser posterior a fecha inicio")

    periodo = PeriodoAcademico(
        nombre=data.nombre,
        numero=data.numero,
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        porcentaje=data.porcentaje,
    )
    db.add(periodo)

    audit = AuditLog(
        user_id=current_user.id,
        accion="create_periodo",
        detalle={"periodo": data.nombre, "numero": data.numero},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(periodo)
    return PeriodoAcademicoOut.model_validate(periodo)


@router.put("/{periodo_id}", response_model=PeriodoAcademicoOut)
async def update_periodo(
    periodo_id: str,
    data: PeriodoAcademicoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id))
    periodo = result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    if data.nombre is not None:
        periodo.nombre = data.nombre
    if data.fecha_inicio is not None:
        periodo.fecha_inicio = data.fecha_inicio
    if data.fecha_fin is not None:
        periodo.fecha_fin = data.fecha_fin
    if data.porcentaje is not None:
        periodo.porcentaje = data.porcentaje
    if data.activo is not None:
        periodo.activo = data.activo

    periodo.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(periodo)
    return PeriodoAcademicoOut.model_validate(periodo)


@router.post("/bulk", response_model=list[PeriodoAcademicoOut])
async def save_all_periodos(
    periodos: list[PeriodoAcademicoCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create or update all 4 periods at once. Validates percentages sum to 100%."""
    if len(periodos) > 4:
        raise HTTPException(status_code=400, detail="Máximo 4 períodos")

    total_pct = sum(p.porcentaje for p in periodos)
    if abs(total_pct - 100.0) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Los porcentajes deben sumar 100%. Suma actual: {total_pct}%"
        )

    for p in periodos:
        if p.fecha_fin <= p.fecha_inicio:
            raise HTTPException(
                status_code=400,
                detail=f"Período {p.numero}: la fecha fin debe ser posterior a fecha inicio"
            )

    # Delete existing and recreate
    existing = await db.execute(select(PeriodoAcademico))
    for ex in existing.scalars().all():
        await db.delete(ex)
    await db.flush()

    created = []
    for p in periodos:
        periodo = PeriodoAcademico(
            nombre=p.nombre,
            numero=p.numero,
            fecha_inicio=p.fecha_inicio,
            fecha_fin=p.fecha_fin,
            porcentaje=p.porcentaje,
        )
        db.add(periodo)
        created.append(periodo)

    audit = AuditLog(
        user_id=current_user.id,
        accion="bulk_update_periodos",
        detalle={"count": len(periodos)},
    )
    db.add(audit)
    await db.commit()

    for p in created:
        await db.refresh(p)

    return [PeriodoAcademicoOut.model_validate(p) for p in created]


@router.delete("/{periodo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_periodo(
    periodo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id))
    periodo = result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")
    await db.delete(periodo)
    await db.commit()
