from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.tool_flags import get_tool_label, is_tool_enabled, list_tool_flags
from app.core.latex_utils import normalize_latex_payload
from app.core.math_exam_validator import infer_correct_option_for_math_question
from app.models.models import User, Herramienta, Examen, Materia
from app.schemas.schemas import (
    HerramientaCreate, HerramientaUpdate, HerramientaAssign, HerramientaOut,
    HerramientaGenerate, HerramientaFlagOut,
)
from app.services.groq_service import (
    generate_exam, generate_sopa_letras, generate_crucigrama,
    generate_emparejar, generate_cuento, get_pollinations_image_url,
    generate_coloring_prompt,
)
from app.routers.generation import _fix_crucigrama, _fix_sopa_letras

router = APIRouter(prefix="/herramientas", tags=["Herramientas"])


def _is_letter_activity(text: str) -> bool:
    """Detect requests that intentionally require letters/text (vowels, alphabet, syllables)."""
    normalized = (text or "").strip().lower()
    if not normalized:
        return False
    keywords = (
        "vocal",
        "vocales",
        "abecedario",
        "alfabeto",
        "letra",
        "letras",
        "silaba",
        "silabas",
        "trazo",
        "trazar",
        "caligrafia",
    )
    return any(k in normalized for k in keywords)


def _letter_layout_hint(text: str) -> str:
    """Return deterministic layout hints for educational letter worksheets."""
    normalized = (text or "").strip().lower()
    if "vocal" in normalized:
        return (
            "include exactly five large uppercase tracing letters A E I O U, "
            "each one clearly separated in its own row with dotted tracing guides, "
            "and one simple kid-friendly drawing near each vowel"
        )
    return (
        "include large uppercase tracing letters requested by the user, clearly separated, "
        "with dotted tracing guides and simple kid-friendly drawings"
    )


def _build_ocr_config(data: HerramientaGenerate) -> dict:
    """Build OCR config shared by printable tools and grading pipeline."""
    return {
        "enabled": bool(data.ocr_friendly),
        "prefijo": (data.ocr_prefijo or "R").strip().upper()[:4] or "R",
        "hoja_respuestas": bool(data.ocr_hoja_respuestas),
        "lineas_abiertas": int(data.ocr_lineas_abiertas or 3),
    }


def _normalize_exam_question(raw: dict, index: int, ocr_config: dict) -> tuple[dict, dict]:
    """Return normalized question for content and its answer-key record."""
    q = normalize_latex_payload(dict(raw or {}))
    numero = q.get("numero") or index
    enunciado = (
        q.get("enunciado")
        or q.get("pregunta")
        or q.get("texto")
        or f"Pregunta {numero}"
    )
    tipo = q.get("tipo", "")

    q["numero"] = numero
    q["enunciado"] = enunciado
    q["pregunta"] = enunciado

    inferred_correct = infer_correct_option_for_math_question(q)
    if inferred_correct:
        q["respuesta_correcta"] = inferred_correct

    if ocr_config.get("enabled"):
        prefijo = ocr_config.get("prefijo", "R")
        if tipo in ("seleccion_multiple", "verdadero_falso"):
            q["instruccion_respuesta_ocr"] = f"{prefijo}{numero}: escribe una opcion (A/B/C/D o V/F)"
        elif tipo in ("respuesta_corta", "desarrollo"):
            q["instruccion_respuesta_ocr"] = f"{prefijo}{numero}: responde en texto claro"

    clave_item = {
        "numero": numero,
        "respuesta_correcta": q.get("respuesta_correcta", ""),
        "puntos": q.get("puntos", 1.0),
    }
    pregunta_limpia = {k: v for k, v in q.items() if k != "respuesta_correcta"}
    return pregunta_limpia, clave_item


async def _assert_tool_enabled(db: AsyncSession, tipo: str) -> None:
    enabled = await is_tool_enabled(db, tipo)
    if enabled:
        return

    label = get_tool_label(tipo)
    raise HTTPException(
        status_code=403,
        detail=f"La herramienta '{label}' está deshabilitada por administración",
    )


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


@router.get("/config/flags", response_model=list[HerramientaFlagOut])
async def get_herramientas_flags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    return await list_tool_flags(db)


@router.post("/", response_model=HerramientaOut, status_code=status.HTTP_201_CREATED)
async def create_herramienta(
    data: HerramientaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Create a tool (exam, crossword, word search) independently."""
    await _assert_tool_enabled(db, data.tipo)

    h = Herramienta(
        profesor_id=current_user.id,
        tipo=data.tipo,
        titulo=data.titulo,
        contenido_json=normalize_latex_payload(data.contenido_json),
        clave_respuestas=normalize_latex_payload(data.clave_respuestas),
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
    await _assert_tool_enabled(db, data.tipo)

    tipo = data.tipo
    tema = data.tema
    nivel = data.nivel
    grado = data.grado or ""
    titulo = data.titulo or ""
    contenido_base = data.contenido_base or ""
    ocr_config = _build_ocr_config(data)
    params_config: dict = {}

    try:
        if tipo == "sopa_letras":
            params_config = {
                "num_palabras": data.num_palabras or 8,
                "palabras_obligatorias": data.palabras_obligatorias or [],
            }
            raw = await generate_sopa_letras(
                tema=tema,
                nivel=nivel,
                num_palabras=params_config["num_palabras"],
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
            params_config = {
                "num_horizontales": data.num_horizontales or 5,
                "num_verticales": data.num_verticales or 5,
                "palabras_obligatorias": data.palabras_obligatorias or [],
            }
            raw = await generate_crucigrama(
                tema=tema,
                nivel=nivel,
                num_horizontales=params_config["num_horizontales"],
                num_verticales=params_config["num_verticales"],
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
            params_config = {"num_pares": data.num_pares or 6}
            raw = await generate_emparejar(
                tema=tema,
                nivel=nivel,
                num_pares=params_config["num_pares"],
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
            params_config = {"moraleja_tema": data.moraleja_tema or ""}
            raw = await generate_cuento(
                tema=tema,
                nivel=nivel,
                contenido_base=contenido_base,
                grado=grado,
                moraleja_tema=params_config["moraleja_tema"],
            )
            cuento_data = raw.get("cuento", {})
            # Generate illustration using Pollinations — color + coloring page
            image_prompt = cuento_data.get("image_prompt", "")
            imagen_url_color = ""
            imagen_url_colorear = ""
            if image_prompt:
                imagen_url_color = get_pollinations_image_url(
                    image_prompt + ", children's book illustration, vibrant colors, watercolor style, detailed, kid-friendly",
                    model="flux",
                )
                imagen_url_colorear = get_pollinations_image_url(
                    image_prompt + ", coloring book page, black and white only, thick clean outlines, no color, no shading, no gradients, white background, line drawing, printable",
                    model="zimage",
                )
            cuento_data["imagen_url"] = imagen_url_color
            cuento_data["imagen_url_color"] = imagen_url_color
            cuento_data["imagen_url_colorear"] = imagen_url_colorear
            contenido = {
                "titulo": raw.get("titulo", titulo or tema),
                "preguntas": [],
                "cuento": cuento_data,
            }
            clave = {"preguntas": [], "cuento_moraleja": cuento_data.get("moraleja", "")}

        elif tipo == "para_colorear":
            # Translate Spanish description → detailed English prompt, then generate image
            desc = data.description_imagen or tema
            params_config = {"description_imagen": desc}
            letter_activity = _is_letter_activity(desc)
            en_prompt = await generate_coloring_prompt(desc, allow_letters=letter_activity)
            if letter_activity:
                letter_hint = _letter_layout_hint(desc)
                image_prompt = (
                    f"{en_prompt}, educational worksheet for children, "
                    f"{letter_hint}, "
                    "clear spacing between letters and drawings, black and white only, "
                    "thick clean outlines, no color, no shading, white background, printable"
                )
            else:
                image_prompt = (
                    f"{en_prompt}, coloring book page, thick clean black outlines, "
                    "no color, no shading, no gradients, white background, line art, printable, "
                    "kid-friendly, no text, no words, no letters, no title"
                )
            imagen_url = get_pollinations_image_url(image_prompt, model="flux")
            contenido = {
                "titulo": titulo or f"Para Colorear: {tema}",
                "preguntas": [],
                "para_colorear": {
                    "descripcion": desc,
                    "imagen_url": imagen_url,
                    "modo_educativo_letras": letter_activity,
                },
            }
            clave = {"preguntas": []}

        else:
            # Examen type
            distribucion = data.distribucion
            if not distribucion:
                distribucion = {"seleccion_multiple": 5, "verdadero_falso": 3, "respuesta_corta": 2}
            params_config = {"distribucion": distribucion}

            exam_data = await generate_exam(
                tema=tema,
                nivel=nivel,
                distribucion=distribucion,
                contenido_base=contenido_base,
                grado=grado,
            )
            exam_data = normalize_latex_payload(exam_data)

            preguntas_sin_respuesta = []
            clave_respuestas = []
            for idx, p in enumerate(exam_data.get("preguntas", []), start=1):
                if not isinstance(p, dict):
                    continue
                pregunta_limpia, clave_item = _normalize_exam_question(p, idx, ocr_config)
                preguntas_sin_respuesta.append(pregunta_limpia)
                clave_respuestas.append(clave_item)

            contenido = {
                "titulo": exam_data.get("titulo", titulo or tema),
                "preguntas": preguntas_sin_respuesta,
            }
            clave = {"preguntas": clave_respuestas}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando: {str(e)}")

    if isinstance(contenido, dict):
        contenido["metadata"] = {
            "tema": tema,
            "nivel": nivel,
            "grado": grado,
            "ocr": ocr_config,
        }

    h = Herramienta(
        profesor_id=current_user.id,
        tipo=tipo,
        titulo=titulo or contenido.get("titulo", tema),
        contenido_json=contenido,
        clave_respuestas=clave,
        config_json={
            "tema": tema,
            "nivel": nivel,
            "grado": grado,
            "params": params_config,
            "ocr": ocr_config,
        },
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
        h.contenido_json = normalize_latex_payload(data.contenido_json)
    if data.clave_respuestas is not None:
        h.clave_respuestas = normalize_latex_payload(data.clave_respuestas)
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
    if not h.contenido_json:
        raise HTTPException(status_code=400, detail="La herramienta no tiene contenido")

    await _assert_tool_enabled(db, h.tipo)

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
