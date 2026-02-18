import random
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import require_role, get_current_user
from app.models.models import User, Materia, Matricula
from app.schemas.schemas import (
    MateriaCreate, MateriaOut, MateriaWithStudents,
    InscripcionRequest, UserOut,
)

router = APIRouter(prefix="/materias", tags=["Materias"])


def generate_code(nombre: str) -> str:
    prefix = nombre[:3].upper()
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{suffix}"


# --- Profesor ---
@router.post("/", response_model=MateriaOut, status_code=status.HTTP_201_CREATED)
async def create_materia(
    data: MateriaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    codigo = generate_code(data.nombre)
    # Ensure unique
    while True:
        existing = await db.execute(select(Materia).where(Materia.codigo == codigo))
        if not existing.scalar_one_or_none():
            break
        codigo = generate_code(data.nombre)

    materia = Materia(
        nombre=data.nombre,
        codigo=codigo,
        profesor_id=current_user.id,
    )
    db.add(materia)
    await db.commit()
    await db.refresh(materia)
    return MateriaOut.model_validate(materia)


@router.get("/mis-materias", response_model=list[MateriaOut])
async def get_my_materias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(
        select(Materia).where(Materia.profesor_id == current_user.id).order_by(Materia.created_at.desc())
    )
    return [MateriaOut.model_validate(m) for m in result.scalars().all()]


@router.get("/{materia_id}/estudiantes", response_model=list[UserOut])
async def get_materia_students(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    # Verify ownership
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if materia.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")

    result = await db.execute(
        select(User).join(Matricula).where(Matricula.materia_id == materia_id)
    )
    return [UserOut.model_validate(u) for u in result.scalars().all()]


# --- Estudiante ---
@router.post("/inscribir", response_model=MateriaOut)
async def inscribir(
    data: InscripcionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    result = await db.execute(select(Materia).where(Materia.codigo == data.codigo.upper()))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Código de materia inválido")

    # Check duplicate
    existing = await db.execute(
        select(Matricula).where(
            Matricula.estudiante_id == current_user.id,
            Matricula.materia_id == materia.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya estás inscrito en esta materia")

    matricula = Matricula(
        estudiante_id=current_user.id,
        materia_id=materia.id,
    )
    db.add(matricula)
    await db.commit()
    return MateriaOut.model_validate(materia)


@router.get("/mis-inscripciones", response_model=list[MateriaOut])
async def get_my_inscripciones(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    result = await db.execute(
        select(Materia).join(Matricula).where(Matricula.estudiante_id == current_user.id)
    )
    return [MateriaOut.model_validate(m) for m in result.scalars().all()]


@router.get("/{materia_id}", response_model=MateriaOut)
async def get_materia(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    return MateriaOut.model_validate(materia)
