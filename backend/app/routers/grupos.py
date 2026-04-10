from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role, get_current_user
from app.models.models import (
    User, Examen, Nota, Matricula,
    GrupoActividad, MiembroGrupo,
)
from app.schemas.schemas import GrupoCreate, InvitarMiembro, GrupoOut

router = APIRouter(prefix="/grupos", tags=["Modo Grupal"])


@router.post("/", response_model=GrupoOut, status_code=status.HTTP_201_CREATED)
async def create_grupo(
    data: GrupoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Create a group for a group-mode exam."""
    # Validate exam allows group mode
    ex = await db.execute(select(Examen).where(Examen.id == data.examen_id))
    examen = ex.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    if not examen.modo_grupal:
        raise HTTPException(status_code=400, detail="Este examen no permite modo grupal")

    # Check student is enrolled in the materia
    matr = await db.execute(
        select(Matricula).where(
            Matricula.materia_id == examen.materia_id,
            Matricula.estudiante_id == current_user.id,
        )
    )
    if not matr.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No estás matriculado en esta materia")

    # Check student doesn't already have a group for this exam
    existing = await db.execute(
        select(MiembroGrupo).join(GrupoActividad).where(
            GrupoActividad.examen_id == data.examen_id,
            MiembroGrupo.estudiante_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya tienes un grupo para este examen")

    grupo = GrupoActividad(
        examen_id=data.examen_id,
        nombre=data.nombre,
        creador_id=current_user.id,
    )
    db.add(grupo)
    await db.flush()

    # Add creator as first member
    miembro = MiembroGrupo(
        grupo_id=grupo.id,
        estudiante_id=current_user.id,
        aceptado=True,
    )
    db.add(miembro)
    await db.commit()
    await db.refresh(grupo)

    return await _build_grupo_out(db, grupo)


@router.get("/examen/{examen_id}", response_model=list[GrupoOut])
async def get_grupos_examen(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all groups for an exam."""
    result = await db.execute(
        select(GrupoActividad).where(GrupoActividad.examen_id == examen_id)
    )
    grupos = result.scalars().all()
    return [await _build_grupo_out(db, g) for g in grupos]


@router.get("/mi-grupo/{examen_id}", response_model=GrupoOut)
async def get_mi_grupo(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Get the current student's group for an exam."""
    result = await db.execute(
        select(GrupoActividad).join(MiembroGrupo).where(
            GrupoActividad.examen_id == examen_id,
            MiembroGrupo.estudiante_id == current_user.id,
            MiembroGrupo.aceptado == True,
        )
    )
    grupo = result.scalar_one_or_none()
    if not grupo:
        raise HTTPException(status_code=404, detail="No tienes grupo para este examen")
    return await _build_grupo_out(db, grupo)


@router.post("/{grupo_id}/invitar")
async def invitar_miembro(
    grupo_id: str,
    data: InvitarMiembro,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Invite a student to the group."""
    grupo_result = await db.execute(
        select(GrupoActividad).where(GrupoActividad.id == grupo_id)
    )
    grupo = grupo_result.scalar_one_or_none()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if str(grupo.creador_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo el creador puede invitar miembros")

    # Check max members
    examen_result = await db.execute(select(Examen).where(Examen.id == grupo.examen_id))
    examen = examen_result.scalar_one_or_none()
    max_int = examen.max_integrantes or 4

    members_result = await db.execute(
        select(MiembroGrupo).where(MiembroGrupo.grupo_id == grupo_id)
    )
    current_count = len(members_result.scalars().all())
    if current_count >= max_int:
        raise HTTPException(status_code=400, detail=f"El grupo ya tiene el máximo de {max_int} integrantes")

    # Check student exists and is enrolled
    est = await db.execute(select(User).where(User.id == data.estudiante_id))
    student = est.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")

    matr = await db.execute(
        select(Matricula).where(
            Matricula.materia_id == examen.materia_id,
            Matricula.estudiante_id == data.estudiante_id,
        )
    )
    if not matr.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El estudiante no está matriculado en esta materia")

    # Check not already in a group for this exam
    already = await db.execute(
        select(MiembroGrupo).join(GrupoActividad).where(
            GrupoActividad.examen_id == grupo.examen_id,
            MiembroGrupo.estudiante_id == data.estudiante_id,
        )
    )
    if already.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El estudiante ya pertenece a un grupo para este examen")

    miembro = MiembroGrupo(
        grupo_id=grupo_id,
        estudiante_id=data.estudiante_id,
        aceptado=True,
    )
    db.add(miembro)
    await db.commit()
    return {"detail": f"Miembro {student.nombre} {student.apellido} agregado al grupo"}


@router.delete("/{grupo_id}/miembro/{estudiante_id}")
async def remove_miembro(
    grupo_id: str,
    estudiante_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Remove a member from the group (only creator or self-remove)."""
    grupo_result = await db.execute(
        select(GrupoActividad).where(GrupoActividad.id == grupo_id)
    )
    grupo = grupo_result.scalar_one_or_none()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    is_creator = str(grupo.creador_id) == str(current_user.id)
    is_self = str(estudiante_id) == str(current_user.id)
    if not is_creator and not is_self:
        raise HTTPException(status_code=403, detail="No tienes permiso")

    member = await db.execute(
        select(MiembroGrupo).where(
            MiembroGrupo.grupo_id == grupo_id,
            MiembroGrupo.estudiante_id == estudiante_id,
        )
    )
    m = member.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")

    await db.delete(m)
    await db.commit()
    return {"detail": "Miembro removido"}


@router.post("/{grupo_id}/submit")
async def submit_grupo_response(
    grupo_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Submit group response - creates a Nota for each member with the same answers."""
    grupo_result = await db.execute(
        select(GrupoActividad).where(GrupoActividad.id == grupo_id)
    )
    grupo = grupo_result.scalar_one_or_none()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    # Verify submitter is a member
    member_check = await db.execute(
        select(MiembroGrupo).where(
            MiembroGrupo.grupo_id == grupo_id,
            MiembroGrupo.estudiante_id == current_user.id,
            MiembroGrupo.aceptado == True,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No eres miembro de este grupo")

    # Get all group members
    members_result = await db.execute(
        select(MiembroGrupo).where(
            MiembroGrupo.grupo_id == grupo_id,
            MiembroGrupo.aceptado == True,
        )
    )
    members = members_result.scalars().all()

    respuestas_json = data.get("respuestas", {})
    archivos_url = data.get("archivos_url")

    # Create a Nota for each group member
    created = 0
    for m in members:
        existing = await db.execute(
            select(Nota).where(
                Nota.examen_id == grupo.examen_id,
                Nota.estudiante_id == m.estudiante_id,
            )
        )
        nota = existing.scalar_one_or_none()
        if nota:
            nota.detalle_json = respuestas_json
            if archivos_url:
                nota.imagen_procesada_url = archivos_url
        else:
            nota = Nota(
                examen_id=grupo.examen_id,
                estudiante_id=m.estudiante_id,
                detalle_json=respuestas_json,
                imagen_procesada_url=archivos_url,
            )
            db.add(nota)
        created += 1

    await db.commit()
    return {"detail": f"Respuesta grupal registrada para {created} miembros"}


async def _build_grupo_out(db: AsyncSession, grupo: GrupoActividad) -> GrupoOut:
    """Build GrupoOut with member details."""
    members_result = await db.execute(
        select(MiembroGrupo).where(MiembroGrupo.grupo_id == grupo.id)
    )
    members = members_result.scalars().all()

    miembros = []
    for m in members:
        est = await db.execute(select(User).where(User.id == m.estudiante_id))
        e = est.scalar_one_or_none()
        miembros.append({
            "estudiante_id": str(m.estudiante_id),
            "nombre": f"{e.nombre} {e.apellido}" if e else "Desconocido",
            "aceptado": m.aceptado,
        })

    return GrupoOut(
        id=grupo.id,
        examen_id=grupo.examen_id,
        nombre=grupo.nombre,
        creador_id=grupo.creador_id,
        miembros=miembros,
        created_at=grupo.created_at,
    )
