from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, Herramienta, Examen, Materia
from app.schemas.schemas import (
    HerramientaCreate, HerramientaUpdate, HerramientaAssign, HerramientaOut,
    HerramientaGenerate,
)
from app.services.groq_service import (
    generate_exam, generate_sopa_letras, generate_crucigrama,
    generate_emparejar, generate_cuento, get_pollinations_image_url,
)
from app.routers.generation import _fix_crucigrama, _fix_sopa_letras

router = APIRouter(prefix="/herramientas", tags=["Herramientas"])


@router.get("/", response_model=list[HerramientaOut])
async def list_herramientas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """List all tools created by the current professor."""
    result = await db.execute(
        select(Herramienta)
        .where(Herramienta.profesor_id == current_user.id)
        .order_by(Herramienta.created_at.desc())
    )
    return [HerramientaOut.model_validate(h) for h in result.scalars().all()]


@router.get("/{herramienta_id}", response_model=HerramientaOut)
async def get_herramienta(
    herramienta_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Herramienta).where(Herramienta.id == herramienta_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    if h.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")
    return HerramientaOut.model_validate(h)


@router.post("/", response_model=HerramientaOut, status_code=status.HTTP_201_CREATED)
async def create_herramienta(
    data: HerramientaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Create a tool (exam, crossword, word search) independently."""
    h = Herramienta(
        profesor_id=current_user.id,
        tipo=data.tipo,
        titulo=data.titulo,
        contenido_json=data.contenido_json,
        clave_respuestas=data.clave_respuestas,
        config_json=data.config_json,
        estado="borrador",
    )
    db.add(h)
    await db.commit()
    await db.refresh(h)
    return HerramientaOut.model_validate(h)


@router.post("/generate", response_model=HerramientaOut)
async def generate_herramienta(
    data: HerramientaGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Generate a tool using AI without assigning to a materia."""
    tipo = data.tipo
    tema = data.tema
    nivel = data.nivel
    grado = data.grado or ""
    titulo = data.titulo or ""
    contenido_base = data.contenido_base or ""

    try:
        if tipo == "sopa_letras":
            raw = await generate_sopa_letras(
                tema=tema,
                nivel=nivel,
                num_palabras=data.num_palabras or 8,
                palabras_obligatorias=data.palabras_obligatorias,
                contenido_base=contenido_base,
                grado=grado,
            )
            sopa = _fix_sopa_letras(raw.get("sopa_letras", {}))
            contenido = {
                "titulo": raw.get("titulo", titulo or tema),
                "preguntas": [],
                "sopa_letras": sopa,
            }
            clave = {"preguntas": [], "sopa_palabras": sopa.get("palabras", [])}

        elif tipo == "crucigrama":
            raw = await generate_crucigrama(
                tema=tema,
                nivel=nivel,
                num_horizontales=data.num_horizontales or 5,
                num_verticales=data.num_verticales or 5,
                palabras_obligatorias=data.palabras_obligatorias,
                contenido_base=contenido_base,
                grado=grado,
            )
            cruc = _fix_crucigrama(raw.get("crucigrama", {}))
            contenido = {
                "titulo": raw.get("titulo", titulo or tema),
                "preguntas": [],
                "crucigrama": cruc,
            }
            # Build answer key from crossword clues
            respuestas_cruc = []
            for p in cruc.get("pistas_horizontal", []):
                if isinstance(p, dict):
                    respuestas_cruc.append({"numero": p.get("numero"), "respuesta": p.get("respuesta", ""), "direccion": "horizontal"})
            for p in cruc.get("pistas_vertical", []):
                if isinstance(p, dict):
                    respuestas_cruc.append({"numero": p.get("numero"), "respuesta": p.get("respuesta", ""), "direccion": "vertical"})
            clave = {"preguntas": [], "crucigrama_respuestas": respuestas_cruc}

        elif tipo == "emparejar":
            raw = await generate_emparejar(
                tema=tema,
                nivel=nivel,
                num_pares=data.num_pares or 6,
                contenido_base=contenido_base,
                grado=grado,
            )
            emparejar_data = raw.get("emparejar", {})
            contenido = {
                "titulo": raw.get("titulo", titulo or tema),
                "preguntas": [],
                "emparejar": emparejar_data,
            }
            # Answer key: correct pairing
            pares = emparejar_data.get("pares", [])
            clave = {
                "preguntas": [],
                "emparejar_respuestas": [
                    {"id": p.get("id"), "izquierda": p.get("izquierda"), "derecha": p.get("derecha")}
                    for p in pares
                ],
            }

        elif tipo == "cuento":
            raw = await generate_cuento(
                tema=tema,
                nivel=nivel,
                contenido_base=contenido_base,
                grado=grado,
                moraleja_tema=data.moraleja_tema or "",
            )
            cuento_data = raw.get("cuento", {})
            # Generate illustration using Pollinations
            image_prompt = cuento_data.get("image_prompt", "")
            imagen_url = ""
            if image_prompt:
                imagen_url = get_pollinations_image_url(
                    image_prompt + ", children's book illustration, coloring page, black and white line art, detailed, kid-friendly"
                )
            cuento_data["imagen_url"] = imagen_url
            contenido = {
                "titulo": raw.get("titulo", titulo or tema),
                "preguntas": [],
                "cuento": cuento_data,
            }
            clave = {"preguntas": [], "cuento_moraleja": cuento_data.get("moraleja", "")}

        else:
            # Examen type
            distribucion = data.distribucion
            if not distribucion:
                distribucion = {"seleccion_multiple": 5, "verdadero_falso": 3, "respuesta_corta": 2}

            exam_data = await generate_exam(
                tema=tema,
                nivel=nivel,
                distribucion=distribucion,
                contenido_base=contenido_base,
                grado=grado,
            )

            preguntas_sin_respuesta = []
            clave_respuestas = []
            for p in exam_data.get("preguntas", []):
                pregunta_limpia = {k: v for k, v in p.items() if k != "respuesta_correcta"}
                preguntas_sin_respuesta.append(pregunta_limpia)
                clave_respuestas.append({
                    "numero": p.get("numero"),
                    "respuesta_correcta": p.get("respuesta_correcta", ""),
                    "puntos": p.get("puntos", 1.0),
                })

            contenido = {
                "titulo": exam_data.get("titulo", titulo or tema),
                "preguntas": preguntas_sin_respuesta,
            }
            clave = {"preguntas": clave_respuestas}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando: {str(e)}")

    h = Herramienta(
        profesor_id=current_user.id,
        tipo=tipo,
        titulo=titulo or contenido.get("titulo", tema),
        contenido_json=contenido,
        clave_respuestas=clave,
        config_json={"tema": tema, "nivel": nivel, "grado": grado},
        estado="listo",
    )
    db.add(h)
    await db.commit()
    await db.refresh(h)
    return HerramientaOut.model_validate(h)


@router.put("/{herramienta_id}", response_model=HerramientaOut)
async def update_herramienta(
    herramienta_id: str,
    data: HerramientaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Herramienta).where(Herramienta.id == herramienta_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    if h.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")
    if h.estado == "asignado":
        raise HTTPException(status_code=400, detail="No se puede editar una herramienta asignada")

    if data.titulo is not None:
        h.titulo = data.titulo
    if data.contenido_json is not None:
        h.contenido_json = data.contenido_json
    if data.clave_respuestas is not None:
        h.clave_respuestas = data.clave_respuestas
    if data.config_json is not None:
        h.config_json = data.config_json
    if data.estado is not None and data.estado in ("borrador", "listo"):
        h.estado = data.estado

    h.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(h)
    return HerramientaOut.model_validate(h)


@router.post("/{herramienta_id}/assign", response_model=HerramientaOut)
async def assign_herramienta(
    herramienta_id: str,
    data: HerramientaAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Assign a tool to a materia, creating an Examen record."""
    result = await db.execute(select(Herramienta).where(Herramienta.id == herramienta_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    if h.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")
    if h.estado == "asignado":
        raise HTTPException(status_code=400, detail="Ya está asignada")
    if not h.contenido_json:
        raise HTTPException(status_code=400, detail="La herramienta no tiene contenido")

    # Verify materia
    mat_result = await db.execute(select(Materia).where(Materia.id == data.materia_id))
    materia = mat_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if materia.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso sobre esta materia")

    # Create exam from tool
    examen = Examen(
        materia_id=data.materia_id,
        titulo=h.titulo,
        tipo=h.tipo,
        contenido_json=h.contenido_json,
        clave_respuestas=h.clave_respuestas,
        activo_online=data.activo_online,
        fecha_limite=data.fecha_limite,
    )
    db.add(examen)
    await db.flush()

    h.estado = "asignado"
    h.materia_id = data.materia_id
    h.examen_id = examen.id
    h.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(h)
    return HerramientaOut.model_validate(h)


@router.delete("/{herramienta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_herramienta(
    herramienta_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Herramienta).where(Herramienta.id == herramienta_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    if h.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")
    await db.delete(h)
    await db.commit()
