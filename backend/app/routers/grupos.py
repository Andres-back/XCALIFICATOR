from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.dependencies import require_role, get_current_user
from app.models.models import (
    User, Examen, Nota, Matricula,
    GrupoActividad, MiembroGrupo,
)
from app.schemas.schemas import GrupoCreate, InvitarMiembro, GrupoOut

router = APIRouter(prefix="/grupos", tags=["Modo Grupal"])


async def _create_grupo_internal(
    examen_id: str,
    nombre: str | None,
    db: AsyncSession,
    current_user: User,
) -> GrupoOut:
    """Create a group for a group-mode exam using a normalized input contract."""
    ex = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = ex.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    if not examen.modo_grupal:
        raise HTTPException(status_code=400, detail="Este examen no permite modo grupal")

    matr = await db.execute(
        select(Matricula).where(
            Matricula.materia_id == examen.materia_id,
            Matricula.estudiante_id == current_user.id,
        )
    )
    if not matr.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No estás matriculado en esta materia")

    existing = await db.execute(
        select(MiembroGrupo).join(GrupoActividad).where(
            GrupoActividad.examen_id == examen_id,
            MiembroGrupo.estudiante_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya tienes un grupo para este examen")

    grupo = GrupoActividad(
        examen_id=examen_id,
        nombre=nombre or f"Grupo {current_user.nombre}",
        creador_id=current_user.id,
    )
    db.add(grupo)
    await db.flush()

    miembro = MiembroGrupo(
        grupo_id=grupo.id,
        estudiante_id=current_user.id,
        aceptado=True,
    )
    db.add(miembro)
    await db.commit()
    await db.refresh(grupo)

    return await _build_grupo_out(db, grupo, str(current_user.id))


@router.post("/", response_model=GrupoOut, status_code=status.HTTP_201_CREATED)
async def create_grupo(
    data: GrupoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    return await _create_grupo_internal(str(data.examen_id), data.nombre, db, current_user)


@router.post("/{examen_id}", response_model=GrupoOut, status_code=status.HTTP_201_CREATED)
async def create_grupo_by_exam_path(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Compatibility endpoint used by frontend: create group by exam id in path."""
    return await _create_grupo_internal(examen_id, None, db, current_user)


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
    return [await _build_grupo_out(db, g, str(current_user.id)) for g in grupos]


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
    return await _build_grupo_out(db, grupo, str(current_user.id))


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

    target_student_id = data.estudiante_id
    if not target_student_id and data.email:
        est_by_email = await db.execute(
            select(User).where(func.lower(User.correo) == data.email.strip().lower())
        )
        student_by_email = est_by_email.scalar_one_or_none()
        if not student_by_email:
            raise HTTPException(status_code=404, detail="No existe un estudiante con ese email")
        target_student_id = student_by_email.id

    # Check student exists and is enrolled
    est = await db.execute(select(User).where(User.id == target_student_id))
    student = est.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")

    matr = await db.execute(
        select(Matricula).where(
            Matricula.materia_id == examen.materia_id,
            Matricula.estudiante_id == target_student_id,
        )
    )
    if not matr.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El estudiante no está matriculado en esta materia")

    # Check not already in a group for this exam
    already = await db.execute(
        select(MiembroGrupo).join(GrupoActividad).where(
            GrupoActividad.examen_id == grupo.examen_id,
            MiembroGrupo.estudiante_id == target_student_id,
        )
    )
    if already.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="El estudiante ya pertenece a un grupo para este examen")

    miembro = MiembroGrupo(
        grupo_id=grupo_id,
        estudiante_id=target_student_id,
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
    from app.routers.examenes import auto_grade_objective

    grupo_result = await db.execute(
        select(GrupoActividad).where(GrupoActividad.id == grupo_id)
    )
    grupo = grupo_result.scalar_one_or_none()
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    examen_result = await db.execute(select(Examen).where(Examen.id == grupo.examen_id))
    examen = examen_result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

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

    respuestas_input = data.get("respuestas_json", data.get("respuestas"))
    if isinstance(respuestas_input, list):
        respuestas_json = {"preguntas": respuestas_input}
    elif isinstance(respuestas_input, dict):
        respuestas_json = respuestas_input
    else:
        raise HTTPException(status_code=400, detail="Formato de respuestas inválido")

    grading_result = auto_grade_objective(examen, respuestas_json)
    nota_val = grading_result.get("nota_total") if grading_result else None
    detalle_json = grading_result if grading_result else respuestas_json
    retro = None
    if grading_result:
        retro = "\n".join(
            f"P{p.get('numero')}: {p.get('retroalimentacion', '')}"
            for p in grading_result.get("preguntas", [])
        )

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
            if nota_val is not None:
                nota.nota = nota_val
            nota.detalle_json = detalle_json
            if retro is not None:
                nota.retroalimentacion = retro
            if archivos_url:
                nota.imagen_procesada_url = archivos_url
        else:
            nota = Nota(
                examen_id=grupo.examen_id,
                estudiante_id=m.estudiante_id,
                nota=nota_val,
                detalle_json=detalle_json,
                retroalimentacion=retro,
                imagen_procesada_url=archivos_url,
            )
            db.add(nota)
        created += 1

    await db.commit()
    return {
        "detail": f"Respuesta grupal registrada para {created} miembros",
        "nota": {
            "nota": nota_val,
            "tiene_preguntas_abiertas": grading_result.get("tiene_preguntas_abiertas", False) if grading_result else True,
        } if grading_result else None,
    }


async def _build_grupo_out(
    db: AsyncSession,
    grupo: GrupoActividad,
    current_user_id: str | None = None,
) -> GrupoOut:
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
            "id": str(m.estudiante_id),
            "estudiante_id": str(m.estudiante_id),
            "nombre": f"{e.nombre} {e.apellido}" if e else "Desconocido",
            "email": e.correo if e else None,
            "aceptado": m.aceptado,
            "es_lider": str(grupo.creador_id) == str(m.estudiante_id),
        })

    return GrupoOut(
        id=grupo.id,
        examen_id=grupo.examen_id,
        nombre=grupo.nombre,
        creador_id=grupo.creador_id,
        es_lider=str(grupo.creador_id) == str(current_user_id) if current_user_id else False,
        miembros=miembros,
        created_at=grupo.created_at,
    )
