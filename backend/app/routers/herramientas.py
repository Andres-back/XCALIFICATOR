from datetime import datetime, timezone
import os
import re
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.ai_provider_config import get_profesor_ai_config
from app.core.config import get_settings
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.tool_flags import get_tool_label, is_tool_enabled, list_tool_flags
from app.core.latex_utils import normalize_latex_payload
from app.core.math_exam_validator import infer_correct_option_for_math_question
from app.models.models import User, Herramienta, Examen, Materia
from app.schemas.schemas import (
    HerramientaCreate, HerramientaUpdate, HerramientaAssign, HerramientaOut,
    HerramientaGenerate, HerramientaFlagOut,
    PresentacionEditRequest, PresentacionRegenerateRequest, PresentacionGoogleExportOut,
)
from app.services.groq_service import (
    generate_exam, generate_sopa_letras, generate_crucigrama,
    generate_emparejar, generate_cuento, get_pollinations_image_url,
    generate_coloring_prompt,
)
from app.services.google_slides_service import GoogleSlidesService
from app.services.presentation_service import PresentationService
from app.services.presenton_service import PresentonService
from app.routers.generation import _fix_crucigrama, _fix_sopa_letras

router = APIRouter(prefix="/herramientas", tags=["Herramientas"])
settings = get_settings()


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


def _presentation_slides_to_markdown(slides: list[dict]) -> list[str]:
    output: list[str] = []
    for idx, slide in enumerate(slides, start=1):
        title = str(slide.get("title") or f"Diapositiva {idx}").strip() or f"Diapositiva {idx}"
        body = str(slide.get("body") or "").strip()
        bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
        image_url = str(slide.get("image_url") or "").strip()

        lines = [f"# {title}"]
        if body:
            lines.append(body)

        for bullet in bullets:
            b = str(bullet).strip()
            if b:
                lines.append(f"- {b}")

        if image_url:
            lines.append(f"![{title}]({image_url})")

        output.append("\n".join(lines))

    return output


def _presentation_markdown_to_slides(slides_markdown: list[str]) -> list[dict]:
    parsed: list[dict] = []
    image_pattern = re.compile(r"!\[[^\]]*\]\(([^\)]+)\)")

    for idx, md in enumerate(slides_markdown, start=1):
        text = str(md or "")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        title = f"Diapositiva {idx}"
        body_lines: list[str] = []
        bullets: list[str] = []
        image_url = ""

        for line in lines:
            if line.startswith("# ") and title == f"Diapositiva {idx}":
                maybe_title = line[2:].strip()
                if maybe_title:
                    title = maybe_title
                continue
            if line.startswith("- "):
                bullet = line[2:].strip()
                if bullet:
                    bullets.append(bullet)
                continue

            image_match = image_pattern.search(line)
            if image_match and not image_url:
                image_url = image_match.group(1).strip()
                continue

            body_lines.append(line)

        parsed.append(
            {
                "title": title,
                "body": "\n".join(body_lines).strip(),
                "bullets": bullets,
                "image_url": image_url,
            }
        )

    return parsed


async def _assert_tool_enabled(db: AsyncSession, tipo: str) -> None:
    enabled = await is_tool_enabled(db, tipo)
    if enabled:
        return

    label = get_tool_label(tipo)
    raise HTTPException(
        status_code=403,
        detail=f"La herramienta '{label}' está deshabilitada por administración",
    )


async def _get_owned_herramienta(db: AsyncSession, herramienta_id: str, current_user: User) -> Herramienta:
    result = await db.execute(select(Herramienta).where(Herramienta.id == herramienta_id))
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    if h.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")
    return h


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


@router.post("/{herramienta_id}/presenton-session")
async def get_presenton_session(
    herramienta_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Return a fresh Presenton session token so the frontend can set it as a cookie
    (cookies are port-agnostic: a cookie for localhost:80 is also sent to localhost:5000)."""
    h = await _get_owned_herramienta(db, herramienta_id, current_user)
    if h.tipo != "presentacion":
        raise HTTPException(status_code=400, detail="No es una presentacion")

    pres = (h.contenido_json or {}).get("presentacion") or {}
    presentation_id = str(pres.get("presentation_id") or "").strip()
    editor_url = str((pres.get("editor") or {}).get("url") or "").strip()

    try:
        svc = PresentonService()
    except Exception:
        return {"session_token": None, "editor_url": editor_url}

    if not editor_url and presentation_id:
        editor_url = f"{svc.public_base_url}/presentation/{presentation_id}"
    if not editor_url:
        editor_url = svc.public_base_url

    token = await svc.get_session_token()
    return {"session_token": token, "editor_url": editor_url}


@router.get("/{herramienta_id}/download-pptx")
async def download_pptx_file(
    herramienta_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    h = await _get_owned_herramienta(db, herramienta_id, current_user)
    if h.tipo != "presentacion":
        raise HTTPException(status_code=400, detail="No es una presentacion")

    pres = (h.contenido_json or {}).get("presentacion") or {}
    path = (pres.get("archivo") or {}).get("path", "")
    if not path:
        raise HTTPException(status_code=404, detail="Sin archivo PPTX disponible. Regenera la presentacion para obtenerlo.")

    # presenton_data volume is mounted at /presenton_data in backend; presenton uses /app_data
    local_path = path.replace("/app_data/", "/presenton_data/", 1)
    if not os.path.isfile(local_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado. Puede que deba regenerar la presentacion.")

    filename = os.path.basename(local_path)
    ext = os.path.splitext(filename)[1].lower()
    media_type = (
        "application/pdf"
        if ext == ".pdf"
        else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    return FileResponse(local_path, filename=filename, media_type=media_type)


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
    if tipo == "presentacion":
        ocr_config = {
            "enabled": False,
            "prefijo": "R",
            "hoja_respuestas": False,
            "lineas_abiertas": 3,
        }
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

        elif tipo == "presentacion":
            ai_cfg = await get_profesor_ai_config(db, str(current_user.id))
            requested_mode = (data.modo_presentacion or data.proveedor_ia_presentacion or "auto").strip().lower()

            params_config = {
                "num_diapositivas": data.num_diapositivas or 8,
                "contenido_base": contenido_base,
                "idioma_presentacion": data.idioma_presentacion or "Espanol",
                "tono_presentacion": data.tono_presentacion or "educational",
                "verbosidad_presentacion": data.verbosidad_presentacion or "standard",
                "template_presenton": data.template_presenton or "general",
                "incluir_tabla_contenido": bool(data.incluir_tabla_contenido),
                "incluir_portada": bool(data.incluir_portada),
                "busqueda_web": bool(data.busqueda_web),
                "formato_exportacion": data.formato_exportacion or "pptx",
                "modo_presentacion": requested_mode,
                "ollama_url_presentacion": data.ollama_url_presentacion or ai_cfg.get("ollama_url") or "",
                "ollama_model_presentacion": data.ollama_model_presentacion
                or settings.OLLAMA_PRESENTATION_MODEL
                or ai_cfg.get("grading_model")
                or "",
                "usar_imagenes_pexels": bool(data.usar_imagenes_pexels),
                "imagenes_pexels_por_slide": data.imagenes_pexels_por_slide or 1,
                "exportar_google_slides": bool(data.exportar_google_slides),
                "instrucciones_presentacion": data.instrucciones_presentacion or "",
            }

            generated = await PresentationService().generatePresentation(
                {
                    "topic": tema,
                    "title": titulo or f"Clase: {tema}",
                    "level": nivel,
                    "grade": grado,
                    "base_content": contenido_base,
                    "slides": params_config["num_diapositivas"],
                    "mode": params_config["modo_presentacion"],
                    "language": params_config["idioma_presentacion"],
                    "tone": params_config["tono_presentacion"],
                    "verbosity": params_config["verbosidad_presentacion"],
                    "template": params_config["template_presenton"],
                    "include_table_of_contents": params_config["incluir_tabla_contenido"],
                    "include_title_slide": params_config["incluir_portada"],
                    "web_search": params_config["busqueda_web"],
                    "export_as": params_config["formato_exportacion"],
                    "instructions": params_config["instrucciones_presentacion"],
                    "use_pexels_images": params_config["usar_imagenes_pexels"],
                    "pexels_images_per_slide": params_config["imagenes_pexels_por_slide"],
                    "export_google_slides": params_config["exportar_google_slides"],
                    "ollama_url": params_config["ollama_url_presentacion"],
                    "ollama_model": params_config["ollama_model_presentacion"],
                }
            )

            presenton_data = generated.get("presenton") if isinstance(generated.get("presenton"), dict) else {}
            google_slides = generated.get("google_slides") if isinstance(generated.get("google_slides"), dict) else None

            contenido = {
                "titulo": generated.get("title") or titulo or f"Clase: {tema}",
                "preguntas": [],
                "presentacion": {
                    "presentation_id": presenton_data.get("presentation_id"),
                    "provider_requested": params_config["modo_presentacion"],
                    "provider_used": generated.get("provider_used"),
                    "provider_mode_requested": generated.get("provider_mode_requested"),
                    "provider_mode_used": generated.get("provider_mode_used"),
                    "slides": generated.get("slides") or [],
                    "slides_markdown": generated.get("slides_markdown") or [],
                    "resumen_docente": generated.get("teacher_summary") or "",
                    "objetivos": generated.get("objectives") or [],
                    "template": generated.get("template"),
                    "tone": generated.get("tone"),
                    "verbosity": generated.get("verbosity"),
                    "language": generated.get("language"),
                    "n_slides": generated.get("n_slides"),
                    "export_as": generated.get("export_as"),
                    "include_title_slide": generated.get("include_title_slide"),
                    "include_table_of_contents": generated.get("include_table_of_contents"),
                    "web_search": generated.get("web_search"),
                    "archivo": {
                        "path": presenton_data.get("path") or "",
                        "url": presenton_data.get("download_url") or "",
                    },
                    "editor": {
                        "path": presenton_data.get("edit_path") or "",
                        "url": presenton_data.get("edit_url") or "",
                    },
                    "google_slides": google_slides,
                },
            }
            clave = {
                "preguntas": [],
                "presentacion_info": {
                    "presentation_id": presenton_data.get("presentation_id"),
                    "provider_used": generated.get("provider_used"),
                },
            }

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


@router.put("/{herramienta_id}/presentacion", response_model=HerramientaOut)
async def update_presentacion_herramienta(
    herramienta_id: str,
    data: PresentacionEditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    h = await _get_owned_herramienta(db, herramienta_id, current_user)
    if h.tipo != "presentacion":
        raise HTTPException(status_code=400, detail="La herramienta no es una presentacion")

    contenido_actual = h.contenido_json if isinstance(h.contenido_json, dict) else {}
    presentacion_actual = contenido_actual.get("presentacion") if isinstance(contenido_actual.get("presentacion"), dict) else {}
    presentation_id = presentacion_actual.get("presentation_id")

    slides = [slide.model_dump() for slide in data.slides]
    slides_markdown = _presentation_slides_to_markdown(slides)
    render_result: dict = {}

    if data.rerender:
        render_payload = {
            "topic": data.titulo or h.titulo,
            "title": data.titulo or h.titulo,
            "slides_markdown": slides_markdown,
            "presentation_id": presentation_id,
            "template": data.template_presenton or presentacion_actual.get("template") or "general",
            "language": data.idioma_presentacion or presentacion_actual.get("language") or "Espanol",
            "tone": data.tono_presentacion or presentacion_actual.get("tone") or "educational",
            "verbosity": data.verbosidad_presentacion or presentacion_actual.get("verbosity") or "standard",
            "include_table_of_contents": bool(data.incluir_tabla_contenido),
            "include_title_slide": bool(data.incluir_portada),
            "web_search": bool(data.busqueda_web),
            "export_as": data.formato_exportacion or presentacion_actual.get("export_as") or "pptx",
        }

        render_result = await PresentonService().generateSlides(render_payload)
        presentation_id = render_result.get("presentation_id") or presentation_id

    updated_presentacion = dict(presentacion_actual)
    updated_presentacion.update(
        {
            "presentation_id": presentation_id,
            "slides": slides,
            "slides_markdown": slides_markdown,
            "template": data.template_presenton or updated_presentacion.get("template") or "general",
            "tone": data.tono_presentacion or updated_presentacion.get("tone") or "educational",
            "verbosity": data.verbosidad_presentacion or updated_presentacion.get("verbosity") or "standard",
            "language": data.idioma_presentacion or updated_presentacion.get("language") or "Espanol",
            "n_slides": len(slides),
            "export_as": data.formato_exportacion or updated_presentacion.get("export_as") or "pptx",
            "include_title_slide": bool(data.incluir_portada),
            "include_table_of_contents": bool(data.incluir_tabla_contenido),
            "web_search": bool(data.busqueda_web),
        }
    )

    if render_result:
        updated_presentacion["archivo"] = {
            "path": render_result.get("path") or "",
            "url": render_result.get("download_url") or "",
        }
        updated_presentacion["editor"] = {
            "path": render_result.get("edit_path") or "",
            "url": render_result.get("edit_url") or "",
        }

    contenido_nuevo = dict(contenido_actual)
    if data.titulo:
        h.titulo = data.titulo
        contenido_nuevo["titulo"] = data.titulo
    contenido_nuevo.setdefault("preguntas", [])
    contenido_nuevo["presentacion"] = updated_presentacion

    cfg = h.config_json if isinstance(h.config_json, dict) else {}
    params_cfg = cfg.get("params") if isinstance(cfg.get("params"), dict) else {}
    params_cfg.update(
        {
            "num_diapositivas": len(slides),
            "idioma_presentacion": updated_presentacion.get("language"),
            "tono_presentacion": updated_presentacion.get("tone"),
            "verbosidad_presentacion": updated_presentacion.get("verbosity"),
            "template_presenton": updated_presentacion.get("template"),
            "incluir_tabla_contenido": updated_presentacion.get("include_table_of_contents"),
            "incluir_portada": updated_presentacion.get("include_title_slide"),
            "busqueda_web": updated_presentacion.get("web_search"),
            "formato_exportacion": updated_presentacion.get("export_as"),
        }
    )
    cfg["params"] = params_cfg

    h.contenido_json = normalize_latex_payload(contenido_nuevo)
    h.config_json = cfg
    h.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(h)
    return HerramientaOut.model_validate(h)


@router.post("/{herramienta_id}/presentacion/regenerate", response_model=HerramientaOut)
async def regenerate_presentacion_herramienta(
    herramienta_id: str,
    data: PresentacionRegenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    h = await _get_owned_herramienta(db, herramienta_id, current_user)
    if h.tipo != "presentacion":
        raise HTTPException(status_code=400, detail="La herramienta no es una presentacion")

    contenido_actual = h.contenido_json if isinstance(h.contenido_json, dict) else {}
    presentacion_actual = contenido_actual.get("presentacion") if isinstance(contenido_actual.get("presentacion"), dict) else {}
    metadata = contenido_actual.get("metadata") if isinstance(contenido_actual.get("metadata"), dict) else {}
    cfg = h.config_json if isinstance(h.config_json, dict) else {}
    params_cfg = cfg.get("params") if isinstance(cfg.get("params"), dict) else {}

    ai_cfg = await get_profesor_ai_config(db, str(current_user.id))

    topic = data.topic or metadata.get("tema") or h.titulo
    grade = data.grade or metadata.get("grado") or ""
    level = data.level or metadata.get("nivel") or "intermedio"

    generation_payload = {
        "topic": topic,
        "title": h.titulo,
        "level": level,
        "grade": grade,
        "base_content": params_cfg.get("contenido_base") or "",
        "slides": data.slides or params_cfg.get("num_diapositivas") or 8,
        "mode": data.mode or params_cfg.get("modo_presentacion") or "auto",
        "language": data.language or params_cfg.get("idioma_presentacion") or "Espanol",
        "tone": data.tone or params_cfg.get("tono_presentacion") or "educational",
        "verbosity": data.verbosity or params_cfg.get("verbosidad_presentacion") or "standard",
        "template": data.template or params_cfg.get("template_presenton") or "general",
        "include_table_of_contents": bool(data.include_table_of_contents),
        "include_title_slide": bool(data.include_title_slide),
        "web_search": bool(data.web_search),
        "export_as": data.export_as or params_cfg.get("formato_exportacion") or "pptx",
        "instructions": data.instructions or params_cfg.get("instrucciones_presentacion") or "",
        "use_pexels_images": bool(data.use_pexels_images),
        "pexels_images_per_slide": data.pexels_images_per_slide or 1,
        "export_google_slides": bool(data.export_google_slides),
        "ollama_url": data.ollama_url or params_cfg.get("ollama_url_presentacion") or ai_cfg.get("ollama_url") or "",
        "ollama_model": data.ollama_model
        or params_cfg.get("ollama_model_presentacion")
        or settings.OLLAMA_PRESENTATION_MODEL
        or ai_cfg.get("grading_model")
        or "",
    }

    generated = await PresentationService().generatePresentation(generation_payload)
    presenton_data = generated.get("presenton") if isinstance(generated.get("presenton"), dict) else {}
    google_slides = generated.get("google_slides") if isinstance(generated.get("google_slides"), dict) else None

    contenido_nuevo = {
        "titulo": generated.get("title") or h.titulo,
        "preguntas": [],
        "metadata": {
            "tema": topic,
            "nivel": level,
            "grado": grade,
            "ocr": {
                "enabled": False,
                "prefijo": "R",
                "hoja_respuestas": False,
                "lineas_abiertas": 3,
            },
        },
        "presentacion": {
            "presentation_id": presenton_data.get("presentation_id") or presentacion_actual.get("presentation_id"),
            "provider_requested": generation_payload.get("mode"),
            "provider_used": generated.get("provider_used"),
            "provider_mode_requested": generated.get("provider_mode_requested"),
            "provider_mode_used": generated.get("provider_mode_used"),
            "slides": generated.get("slides") or [],
            "slides_markdown": generated.get("slides_markdown") or [],
            "resumen_docente": generated.get("teacher_summary") or "",
            "objetivos": generated.get("objectives") or [],
            "template": generated.get("template"),
            "tone": generated.get("tone"),
            "verbosity": generated.get("verbosity"),
            "language": generated.get("language"),
            "n_slides": generated.get("n_slides"),
            "export_as": generated.get("export_as"),
            "include_title_slide": generated.get("include_title_slide"),
            "include_table_of_contents": generated.get("include_table_of_contents"),
            "web_search": generated.get("web_search"),
            "archivo": {
                "path": presenton_data.get("path") or "",
                "url": presenton_data.get("download_url") or "",
            },
            "editor": {
                "path": presenton_data.get("edit_path") or "",
                "url": presenton_data.get("edit_url") or "",
            },
            "google_slides": google_slides,
        },
    }

    cfg["tema"] = topic
    cfg["nivel"] = level
    cfg["grado"] = grade
    cfg["params"] = {
        "num_diapositivas": generation_payload["slides"],
        "idioma_presentacion": generation_payload["language"],
        "tono_presentacion": generation_payload["tone"],
        "verbosidad_presentacion": generation_payload["verbosity"],
        "template_presenton": generation_payload["template"],
        "incluir_tabla_contenido": generation_payload["include_table_of_contents"],
        "incluir_portada": generation_payload["include_title_slide"],
        "busqueda_web": generation_payload["web_search"],
        "formato_exportacion": generation_payload["export_as"],
        "modo_presentacion": generation_payload["mode"],
        "ollama_url_presentacion": generation_payload["ollama_url"],
        "ollama_model_presentacion": generation_payload["ollama_model"],
        "usar_imagenes_pexels": generation_payload["use_pexels_images"],
        "imagenes_pexels_por_slide": generation_payload["pexels_images_per_slide"],
        "exportar_google_slides": generation_payload["export_google_slides"],
        "instrucciones_presentacion": generation_payload["instructions"],
    }
    cfg["ocr"] = {
        "enabled": False,
        "prefijo": "R",
        "hoja_respuestas": False,
        "lineas_abiertas": 3,
    }

    h.titulo = contenido_nuevo.get("titulo") or h.titulo
    h.contenido_json = normalize_latex_payload(contenido_nuevo)
    h.config_json = cfg
    h.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(h)
    return HerramientaOut.model_validate(h)


@router.post("/{herramienta_id}/presentacion/export/google", response_model=PresentacionGoogleExportOut)
async def export_presentacion_google(
    herramienta_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    h = await _get_owned_herramienta(db, herramienta_id, current_user)
    if h.tipo != "presentacion":
        raise HTTPException(status_code=400, detail="La herramienta no es una presentacion")

    contenido_actual = h.contenido_json if isinstance(h.contenido_json, dict) else {}
    presentacion_actual = contenido_actual.get("presentacion") if isinstance(contenido_actual.get("presentacion"), dict) else {}

    slides = presentacion_actual.get("slides") if isinstance(presentacion_actual.get("slides"), list) else []
    if not slides:
        slides_markdown = presentacion_actual.get("slides_markdown") if isinstance(presentacion_actual.get("slides_markdown"), list) else []
        if slides_markdown:
            slides = _presentation_markdown_to_slides(slides_markdown)

    if not slides:
        raise HTTPException(status_code=400, detail="No hay diapositivas para exportar")

    title = contenido_actual.get("titulo") or h.titulo or "Presentacion"
    exported = await GoogleSlidesService().export_presentation(title=title, slides=slides)

    presentacion_actual["google_slides"] = exported
    contenido_actual["presentacion"] = presentacion_actual
    h.contenido_json = normalize_latex_payload(contenido_actual)
    h.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(h)

    return PresentacionGoogleExportOut(
        presentation_id=exported.get("presentation_id"),
        url=exported.get("url"),
        embed_url=exported.get("embed_url"),
    )


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

    if h.tipo == "presentacion":
        raise HTTPException(
            status_code=400,
            detail="Las presentaciones no se asignan como examen. Usa descarga o enlace de edicion.",
        )

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
