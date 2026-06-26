import random
import string
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from app.core.database import get_db
from app.core.dependencies import require_role, get_current_user
from app.core.ai_provider_config import get_profesor_ai_config
from app.models.models import User, Materia, Matricula, MateriaEncuentro, MateriaCurriculoDocumento
from app.schemas.schemas import (
    MateriaCreate, MateriaOut,
    MateriaEncuentroOut, MateriaEncuentrosUpdate,
    MateriaCurriculoUpdate,
    MateriaCurriculoDocumentoOut,
    InscripcionRequest, UserOut,
)
from app.services.curriculum_service import chunk_text, extract_curriculum_text

router = APIRouter(prefix="/materias", tags=["Materias"])

DAY_ORDER = {
    "lunes": 0,
    "martes": 1,
    "miercoles": 2,
    "jueves": 3,
    "viernes": 4,
    "sabado": 5,
    "domingo": 6,
}


def generate_code(nombre: str) -> str:
    prefix = nombre[:3].upper()
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{suffix}"


def _sort_encuentros(encuentros: list[MateriaEncuentro]) -> list[MateriaEncuentro]:
    return sorted(encuentros, key=lambda e: (DAY_ORDER.get(e.dia_semana, 99), e.hora_inicio))


def _doc_to_out(doc: MateriaCurriculoDocumento) -> MateriaCurriculoDocumentoOut:
    chunks = doc.chunks_json if isinstance(doc.chunks_json, list) else []
    return MateriaCurriculoDocumentoOut(
        id=doc.id,
        materia_id=doc.materia_id,
        titulo=doc.titulo,
        fuente_tipo=doc.fuente_tipo,
        texto_preview=(doc.texto or "")[:320],
        chunks_count=len(chunks),
        created_at=doc.created_at,
    )


async def _get_materia_with_ownership_check(
    db: AsyncSession,
    materia_id: str,
    current_user: User,
) -> Materia:
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if materia.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")
    return materia


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
        dba_json=data.dba_json,
        plan_json=data.plan_json,
    )
    db.add(materia)
    await db.flush()

    for encuentro in data.encuentros:
        db.add(
            MateriaEncuentro(
                materia_id=materia.id,
                dia_semana=encuentro.dia_semana,
                hora_inicio=encuentro.hora_inicio,
                hora_fin=encuentro.hora_fin,
            )
        )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo crear la materia con el horario configurado",
        ) from exc

    await db.refresh(materia)
    return MateriaOut.model_validate(materia)


@router.put("/{materia_id}/curriculo", response_model=MateriaOut)
async def update_materia_curriculo(
    materia_id: str,
    data: MateriaCurriculoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    materia = await _get_materia_with_ownership_check(db, materia_id, current_user)
    materia.dba_json = data.dba_json
    materia.plan_json = data.plan_json
    await db.commit()
    await db.refresh(materia)
    return MateriaOut.model_validate(materia)


@router.post("/{materia_id}/curriculo/documentos", response_model=MateriaCurriculoDocumentoOut, status_code=status.HTTP_201_CREATED)
async def upload_curriculo_documento(
    materia_id: str,
    titulo: str = Form("Documento curricular"),
    texto: str = Form(""),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    materia = await _get_materia_with_ownership_check(db, materia_id, current_user)
    fuente_tipo = "texto"
    final_text = (texto or "").strip()

    if file is not None and file.filename:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Archivo curricular vacio")
        ai_config = await get_profesor_ai_config(db, str(current_user.id))
        final_text = await extract_curriculum_text(
            file_bytes=file_bytes,
            content_type=file.content_type or "",
            ai_config=ai_config,
        )
        fuente_tipo = (file.content_type or "archivo").split("/", 1)[0]

    if len(final_text) < 20:
        raise HTTPException(status_code=400, detail="El documento curricular no tiene texto suficiente")

    doc = MateriaCurriculoDocumento(
        materia_id=materia.id,
        profesor_id=current_user.id,
        titulo=(titulo or "Documento curricular").strip()[:300],
        fuente_tipo=fuente_tipo,
        texto=final_text,
        chunks_json=chunk_text(final_text),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _doc_to_out(doc)


@router.get("/{materia_id}/curriculo/documentos", response_model=list[MateriaCurriculoDocumentoOut])
async def list_curriculo_documentos(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    materia = await _get_materia_with_ownership_check(db, materia_id, current_user)
    result = await db.execute(
        select(MateriaCurriculoDocumento)
        .where(MateriaCurriculoDocumento.materia_id == materia.id)
        .order_by(MateriaCurriculoDocumento.created_at.desc())
    )
    return [_doc_to_out(doc) for doc in result.scalars().all()]


@router.delete("/{materia_id}/curriculo/documentos/{documento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculo_documento(
    materia_id: str,
    documento_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    materia = await _get_materia_with_ownership_check(db, materia_id, current_user)
    result = await db.execute(
        select(MateriaCurriculoDocumento).where(
            MateriaCurriculoDocumento.id == documento_id,
            MateriaCurriculoDocumento.materia_id == materia.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento curricular no encontrado")
    await db.delete(doc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        select(User)
        .join(Matricula)
        .where(Matricula.materia_id == materia_id)
        .distinct()
        .order_by(User.apellido.asc(), User.nombre.asc(), User.id.asc())
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


@router.get("/{materia_id}/encuentros", response_model=list[MateriaEncuentroOut])
async def get_materia_encuentros(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    await _get_materia_with_ownership_check(db, materia_id, current_user)
    result = await db.execute(select(MateriaEncuentro).where(MateriaEncuentro.materia_id == materia_id))
    encuentros = _sort_encuentros(result.scalars().all())
    return [MateriaEncuentroOut.model_validate(encuentro) for encuentro in encuentros]


@router.put("/{materia_id}/encuentros", response_model=list[MateriaEncuentroOut])
async def update_materia_encuentros(
    materia_id: str,
    data: MateriaEncuentrosUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    await _get_materia_with_ownership_check(db, materia_id, current_user)

    await db.execute(delete(MateriaEncuentro).where(MateriaEncuentro.materia_id == materia_id))
    for encuentro in data.encuentros:
        db.add(
            MateriaEncuentro(
                materia_id=materia_id,
                dia_semana=encuentro.dia_semana,
                hora_inicio=encuentro.hora_inicio,
                hora_fin=encuentro.hora_fin,
            )
        )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo actualizar el horario de la materia",
        ) from exc

    result = await db.execute(select(MateriaEncuentro).where(MateriaEncuentro.materia_id == materia_id))
    encuentros = _sort_encuentros(result.scalars().all())
    return [MateriaEncuentroOut.model_validate(encuentro) for encuentro in encuentros]


@router.get("/{materia_id}", response_model=MateriaOut)
async def get_materia(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validar que materia_id sea un UUID válido antes de hacer query
    try:
        UUID(materia_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    return MateriaOut.model_validate(materia)


@router.delete("/{materia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_materia(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol != "admin" and materia.profesor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin permiso para eliminar esta materia")

    await db.delete(materia)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudo eliminar la materia por dependencias asociadas",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
