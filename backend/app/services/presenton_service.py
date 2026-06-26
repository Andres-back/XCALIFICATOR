"""
Servicio para integración con Presenton (generador de presentaciones IA).

Presenton corre como contenedor Docker (xcalificator_presenton) y reutiliza
la GROQ_API_KEY del proyecto. Expone una API HTTP que recibe un prompt
y devuelve un archivo .pptx guardado en /app_data/exports/ dentro del
contenedor. El servicio descarga el archivo y lo reexpone en /uploads/
del backend para que el navegador pueda descargarlo sin necesitar
credenciales de Presenton.

Documentación: https://github.com/presenton/presenton
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import time
from typing import Optional
import zipfile
import xml.etree.ElementTree as ET

import httpx

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

PPT_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"

ET.register_namespace("p", PPT_NS)
ET.register_namespace("r", REL_NS)
ET.register_namespace("", PKG_REL_NS)


# ── Session token cache ────────────────────────────────────────────────
_session: dict = {"token": None, "expires": 0.0}
_session_lock: Optional[asyncio.Lock] = None


def _get_lock() -> asyncio.Lock:
    global _session_lock
    if _session_lock is None:
        _session_lock = asyncio.Lock()
    return _session_lock


async def _fetch_presenton_token() -> str:
    url = f"{settings.PRESENTON_URL.rstrip('/')}/api/v1/auth/login"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={
            "username": settings.PRESENTON_AUTH_USERNAME,
            "password": settings.PRESENTON_AUTH_PASSWORD,
        })
    if resp.status_code != 200:
        raise RuntimeError(
            f"Presenton auth falló ({resp.status_code}): {resp.text[:200]}"
        )
    token = resp.cookies.get("presenton_session")
    if not token:
        raise RuntimeError("Presenton login no devolvió cookie de sesión")
    return token


async def _ensure_token() -> str:
    async with _get_lock():
        if _session["token"] and time.time() < _session["expires"]:
            return _session["token"]
        token = await _fetch_presenton_token()
        _session["token"] = token
        _session["expires"] = time.time() + 20 * 24 * 3600  # 20-day cache
        return token


# ── Plantillas soportadas ──────────────────────────────────────────────
TEMPLATES = {
    "general":  "general",
    "classic":  "standard",  # renamed in Presenton — map to "standard"
    "modern":   "modern",
    "standard": "standard",
    "swift":    "swift",
}

SLIDE_PRESETS = {
    "corta":    5,
    "media":    8,
    "completa": 12,
}


# ── Prompt builders ────────────────────────────────────────────────────

def _build_lesson_prompt(
    titulo: str,
    contenido: str,
    grado: Optional[str] = None,
    objetivos: Optional[list[str]] = None,
) -> str:
    bloques: list[str] = [
        f"Crea una presentación educativa en ESPAÑOL para una clase sobre: {titulo}.",
    ]
    if grado:
        bloques.append(
            f"Audiencia: estudiantes de {grado} del sistema educativo colombiano. "
            f"Adapta vocabulario, ejemplos y profundidad a ese nivel."
        )
    if objetivos:
        bloques.append("Objetivos pedagógicos:\n- " + "\n- ".join(objetivos))
    if contenido:
        bloques.append(
            "Material base que debes utilizar y resumir:\n"
            f"{contenido}"
        )
    bloques.append(
        "Estructura sugerida:\n"
        "1. Slide de portada con el título y una imagen alusiva.\n"
        "2. Objetivos de aprendizaje.\n"
        "3. Conceptos clave (uno por slide, con ejemplo).\n"
        "4. Aplicación práctica o ejercicio guiado.\n"
        "5. Repaso y cierre.\n"
        "Estilo: claro, atractivo, sin jerga técnica innecesaria."
    )
    return "\n\n".join(bloques)


def _compact_text(value: str, limit: int = 360) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _build_lesson_slides_markdown(
    titulo: str,
    contenido: str,
    grado: Optional[str],
    objetivos: Optional[list[str]],
    num_slides: int,
) -> list[str]:
    objectives = [str(obj).strip() for obj in (objetivos or []) if str(obj).strip()]
    if not objectives:
        objectives = [
            f"Comprender las ideas principales de {titulo}",
            "Aplicar el tema con un ejemplo de clase",
            "Cerrar con una pregunta de verificacion",
        ]

    context = _compact_text(contenido, 1200)
    level = f" para grado {grado}" if grado else ""
    image_hint = (
        "Imagen educativa sugerida: ilustracion didactica, completa dentro del marco, "
        "sin texto y sin recortes."
    )

    base_slides = [
        f"## {titulo}\nClase educativa en espanol{level}. Presenta el tema con una idea clara y visual.\n{image_hint}",
        "## Objetivos de aprendizaje\n" + "\n".join(f"- {obj}" for obj in objectives[:4]),
        f"## Punto de partida\nPregunta inicial: que saben los estudiantes sobre {titulo}? Conecta con una situacion cotidiana.\n{image_hint}",
        f"## Conceptos clave\n- Idea principal del tema.\n- Palabras importantes que el estudiante debe reconocer.\n- Relacion con el DBA o lineamiento cuando aplique.",
        f"## Explicacion guiada\nUsa lenguaje sencillo para explicar {titulo}. Incluye un ejemplo paso a paso.\n{image_hint}",
        "## Ejemplo de clase\nMuestra un caso cercano al estudiante y explica como se aplica el concepto.",
        f"## Actividad corta\nPropone una pregunta o mini ejercicio para verificar comprension sobre {titulo}.\n{image_hint}",
        "## Trabajo colaborativo\nIndica una actividad breve en parejas o grupos para discutir el concepto.",
        f"## Error comun\nExplica una confusion frecuente y como evitarla con una regla sencilla.\n{image_hint}",
        "## Pregunta formativa\nIncluye una pregunta de seleccion o respuesta corta para revisar si entendieron.",
        "## Sintesis\nResume en tres ideas lo mas importante de la clase.",
        f"## Cierre y siguiente paso\nPropone una tarea corta o reto para continuar aprendiendo.\n{image_hint}",
    ]

    if context:
        base_slides[3] += f"\n\nMaterial base del profesor: {_compact_text(context, 320)}"

    while len(base_slides) < num_slides:
        idx = len(base_slides) + 1
        text = f"## Profundizacion {idx}\nAmplia un aspecto importante de {titulo} con un ejemplo claro."
        if idx % 2 == 1:
            text += f"\n{image_hint}"
        base_slides.append(text)

    return base_slides[:num_slides]


def _build_review_prompt(
    titulo_examen: str,
    materia: str,
    preguntas_falladas: list[dict],
    promedio: float,
    nota_maxima: float,
    grado: Optional[str] = None,
) -> str:
    bloques: list[str] = [
        f"Crea una presentación de RETROALIMENTACIÓN en ESPAÑOL para repasar el examen "
        f"\"{titulo_examen}\" de la materia {materia}.",
        f"Datos generales: promedio del grupo {promedio:.2f} sobre {nota_maxima:.1f}.",
    ]
    if grado:
        bloques.append(
            f"Audiencia: estudiantes de {grado} del sistema educativo colombiano. "
            f"Usa lenguaje cercano y motivador (no acusatorio)."
        )
    if preguntas_falladas:
        lineas = []
        for q in preguntas_falladas:
            lineas.append(
                f"- Pregunta {q.get('numero')}: {q.get('enunciado','(sin enunciado)')[:280]}\n"
                f"  Tasa de acierto: {q.get('tasa_acierto',0)}% — Respuesta correcta: {q.get('respuesta_correcta','')}"
            )
        bloques.append("Preguntas con MENOR acierto que debemos repasar:\n" + "\n".join(lineas))

    bloques.append(
        "Estructura obligatoria:\n"
        "1. Portada con el título 'Repaso del examen' y la materia.\n"
        "2. Slide de panorama: cuántos estudiantes, promedio, qué salió bien.\n"
        "3. Una slide por cada pregunta a repasar: enunciado + respuesta correcta + "
        "explicación clara del concepto.\n"
        "4. Slide de errores comunes / tips para no caer en ellos.\n"
        "5. Slide final motivacional y de próximos pasos.\n"
        "Tono: empático, sin culpar al estudiante. Enfocado en el aprendizaje."
    )
    return "\n\n".join(bloques)


def _build_period_summary_prompt(
    materia: str,
    periodo: str,
    promedio_grupo: float,
    aprobados: int,
    reprobados: int,
    top_estudiantes: list[dict],
    fortalezas: list[str] = None,
    debilidades: list[str] = None,
    grado: Optional[str] = None,
) -> str:
    bloques: list[str] = [
        f"Crea una presentación de RESUMEN DEL PERÍODO en ESPAÑOL para la materia "
        f"{materia}, período {periodo}.",
        f"Audiencia: padres de familia y dirección académica. Tono profesional pero cercano.",
    ]
    if grado:
        bloques.append(f"Grado: {grado}.")
    bloques.append(
        f"Datos clave del período:\n"
        f"- Promedio del grupo: {promedio_grupo:.2f}\n"
        f"- Estudiantes aprobados: {aprobados}\n"
        f"- Estudiantes reprobados: {reprobados}\n"
    )
    if top_estudiantes:
        bloques.append(
            "Mejores promedios:\n"
            + "\n".join(f"- {e.get('nombre')}: {e.get('nota'):.2f}" for e in top_estudiantes[:5])
        )
    if fortalezas:
        bloques.append("Fortalezas observadas:\n- " + "\n- ".join(fortalezas))
    if debilidades:
        bloques.append("Áreas a reforzar:\n- " + "\n- ".join(debilidades))
    bloques.append(
        "Estructura obligatoria:\n"
        "1. Portada con materia y período.\n"
        "2. Resumen ejecutivo (1 slide con las cifras clave).\n"
        "3. Distribución de notas (visual claro).\n"
        "4. Reconocimientos a estudiantes destacados.\n"
        "5. Fortalezas observadas en el grupo.\n"
        "6. Áreas a reforzar y plan de mejora.\n"
        "7. Próximos pasos y compromiso del docente.\n"
        "Lenguaje claro, evitar jerga pedagógica innecesaria."
    )
    return "\n\n".join(bloques)


# ── PPTX download + local cache ────────────────────────────────────────

def _pptx_slide_numbers(zip_file: zipfile.ZipFile) -> list[int]:
    numbers: list[int] = []
    for name in zip_file.namelist():
        match = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", name)
        if match:
            numbers.append(int(match.group(1)))
    return sorted(numbers)


def _ensure_pptx_slide_count(filepath: str, expected_slides: Optional[int]) -> None:
    if not expected_slides or expected_slides <= 0:
        return
    try:
        with zipfile.ZipFile(filepath, "r") as src:
            slide_numbers = _pptx_slide_numbers(src)
        while len(slide_numbers) < expected_slides:
            _duplicate_last_pptx_slide(filepath)
            with zipfile.ZipFile(filepath, "r") as src:
                slide_numbers = _pptx_slide_numbers(src)
        if len(slide_numbers) != expected_slides:
            logger.warning(
                "PPTX slide count after repair: expected=%s actual=%s file=%s",
                expected_slides,
                len(slide_numbers),
                filepath,
            )
    except Exception as exc:
        logger.warning("No se pudo verificar/reparar conteo PPTX: %s", exc)


def _duplicate_last_pptx_slide(filepath: str) -> None:
    with zipfile.ZipFile(filepath, "r") as src:
        names = src.namelist()
        slide_numbers = _pptx_slide_numbers(src)
        if not slide_numbers:
            return
        old_num = slide_numbers[-1]
        new_num = old_num + 1
        old_slide = f"ppt/slides/slide{old_num}.xml"
        new_slide = f"ppt/slides/slide{new_num}.xml"
        old_rels = f"ppt/slides/_rels/slide{old_num}.xml.rels"
        new_rels = f"ppt/slides/_rels/slide{new_num}.xml.rels"
        files = {name: src.read(name) for name in names}

    files[new_slide] = files[old_slide]
    if old_rels in files:
        files[new_rels] = files[old_rels]

    content_root = ET.fromstring(files["[Content_Types].xml"])
    override_tag = f"{{{CONTENT_NS}}}Override"
    part_name = f"/ppt/slides/slide{new_num}.xml"
    if not any(node.attrib.get("PartName") == part_name for node in content_root.findall(override_tag)):
        ET.SubElement(
            content_root,
            override_tag,
            {
                "PartName": part_name,
                "ContentType": "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
            },
        )
    files["[Content_Types].xml"] = ET.tostring(content_root, encoding="utf-8", xml_declaration=True)

    rels_root = ET.fromstring(files["ppt/_rels/presentation.xml.rels"])
    rel_tag = f"{{{PKG_REL_NS}}}Relationship"
    rid_nums = []
    for rel in rels_root.findall(rel_tag):
        rid = rel.attrib.get("Id", "")
        if rid.startswith("rId") and rid[3:].isdigit():
            rid_nums.append(int(rid[3:]))
    new_rid = f"rId{(max(rid_nums) if rid_nums else 0) + 1}"
    ET.SubElement(
        rels_root,
        rel_tag,
        {
            "Id": new_rid,
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
            "Target": f"slides/slide{new_num}.xml",
        },
    )
    files["ppt/_rels/presentation.xml.rels"] = ET.tostring(rels_root, encoding="utf-8", xml_declaration=True)

    pres_root = ET.fromstring(files["ppt/presentation.xml"])
    sld_id_lst = pres_root.find(f"{{{PPT_NS}}}sldIdLst")
    if sld_id_lst is not None:
        ids = []
        for node in sld_id_lst.findall(f"{{{PPT_NS}}}sldId"):
            try:
                ids.append(int(node.attrib.get("id", "0")))
            except Exception:
                pass
        ET.SubElement(
            sld_id_lst,
            f"{{{PPT_NS}}}sldId",
            {
                "id": str((max(ids) if ids else 255) + 1),
                f"{{{REL_NS}}}id": new_rid,
            },
        )
        files["ppt/presentation.xml"] = ET.tostring(pres_root, encoding="utf-8", xml_declaration=True)

    fd, tmp_path = tempfile.mkstemp(suffix=".pptx", dir=os.path.dirname(filepath))
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as dst:
            for name in names:
                dst.writestr(name, files[name])
            for extra in (new_slide, new_rels):
                if extra not in names and extra in files:
                    dst.writestr(extra, files[extra])
        os.replace(tmp_path, filepath)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


async def _download_and_store_pptx(
    client: httpx.AsyncClient,
    pptx_path: str,
    token: str,
    presentation_id: str,
    expected_slides: Optional[int] = None,
) -> str:
    """
    Downloads the PPTX from Presenton's nginx (cookie-gated) and saves it to
    the backend's /uploads/presentations/ directory so the browser can fetch
    it without needing a Presenton session cookie.

    Returns the relative URL /uploads/presentations/<id>.pptx, or "" on failure.
    """
    if not pptx_path:
        return ""
    download_url = f"{settings.PRESENTON_URL.rstrip('/')}{pptx_path}"
    # Nginx auth_request passes Cookie header (not Authorization) to the verify endpoint
    resp = await client.get(download_url, cookies={"presenton_session": token})
    if resp.status_code != 200:
        logger.warning("No se pudo descargar PPTX de Presenton (%s): %s", resp.status_code, pptx_path)
        return ""

    pres_dir = os.path.join(settings.UPLOAD_DIR, "presentations")
    os.makedirs(pres_dir, exist_ok=True)
    filename = f"{presentation_id}.pptx"
    filepath = os.path.join(pres_dir, filename)
    with open(filepath, "wb") as fh:
        fh.write(resp.content)
    _ensure_pptx_slide_count(filepath, expected_slides)

    return f"/uploads/presentations/{filename}"


# ── Core generator (new Presenton API) ────────────────────────────────

async def _generate_with_prompt(
    titulo: str,
    prompt: str,
    num_slides: int,
    plantilla: str,
    *,
    include_title_slide: bool = True,
    include_table_of_contents: bool = False,
    slides_markdown: Optional[list[str]] = None,
) -> dict:
    """Single-call presentation generation using POST /api/v1/ppt/presentation/generate."""
    if plantilla not in TEMPLATES:
        plantilla = "general"
    num_slides = max(3, min(int(num_slides or 8), 20))

    timeout = httpx.Timeout(settings.PRESENTON_TIMEOUT, connect=10.0)
    auth = (settings.PRESENTON_AUTH_USERNAME, settings.PRESENTON_AUTH_PASSWORD)

    async with httpx.AsyncClient(timeout=timeout) as client:
        payload = {
            "content": prompt,
            "n_slides": num_slides,
            "language": "Spanish",
            "template": TEMPLATES[plantilla],
            "export_as": "pptx",
            "include_title_slide": include_title_slide,
            "include_table_of_contents": include_table_of_contents,
            "instructions": (
                "FORMATO OBLIGATORIO: "
                "1. Usa SOLO texto plano. PROHIBIDO usar LaTeX, comandos como \\frac, \\times, \\sum, $...$ o cualquier marcado matemático especial. "
                "2. Para fracciones escribe '3/4' o símbolos Unicode: ½ ⅓ ¼ ¾. "
                "3. Para operaciones usa: × ÷ ± √ ² ³ π ∑ en lugar de comandos LaTeX. "
                "4. PROHIBIDO subrayar texto con guiones bajos (_palabra_) ni usar HTML. "
                "5. Cada diapositiva: título corto + máximo 4 líneas de cuerpo. "
                "6. IMAGENES: aproximadamente 1 de cada 2 diapositivas debe usar una imagen educativa cuando el layout lo permita. "
                "7. Las imagenes deben ser didacticas, aptas para clase, coherentes con el tema, y pensadas para estudiantes hispanohablantes. "
                "8. Imagenes siempre contenidas completas dentro de su caja: no fondo recortado, no cover/crop, no texto encima de la imagen. "
                "9. Usa composicion balanceada: texto corto a un lado y la imagen completa al otro, o imagen pequena centrada debajo del texto. "
                "10. Las palabras clave/prompt de imagen deben ser del tema principal, simples y concretas, sin texto dentro de la imagen salvo fichas de letras o rotulos pedidos por el docente. "
                "11. Si el motor interno solicita salida estructurada, responde con JSON valido (cada campo de lista debe ser un arreglo JSON, nunca texto)."
            ),
        }
        if slides_markdown:
            payload["slides_markdown"] = [str(slide) for slide in slides_markdown[:num_slides]]
            payload["include_title_slide"] = False
            payload["include_table_of_contents"] = False

        # Red de seguridad: reintenta toda la generación si Presenton falla.
        # Los fallos suelen ocurrir temprano (outline ~30s), así que reintentar
        # es barato. Objetivo: la generación de presentaciones nunca falla.
        url = f"{settings.PRESENTON_URL.rstrip('/')}/api/v1/ppt/presentation/generate"
        resp = None
        last_detail = ""
        for attempt in range(4):
            resp = await client.post(url, json=payload, auth=auth)
            if resp.status_code == 401:
                # token/credenciales: un reintento inmediato
                resp = await client.post(url, json=payload, auth=auth)
            if resp.status_code < 400:
                break
            last_detail = resp.text[:300]
            logger.warning(
                "Presenton intento %d/4 falló (%d): %s",
                attempt + 1, resp.status_code, last_detail,
            )
            if attempt < 3:
                await asyncio.sleep(1.5 * (attempt + 1))

        if resp is None or resp.status_code >= 400:
            raise RuntimeError(
                f"Presenton respondió {resp.status_code if resp else 'sin respuesta'}: {last_detail}"
            )

        data = resp.json()
        presentation_id = str(data.get("presentation_id", ""))
        pptx_path       = data.get("path", "")
        edit_path       = data.get("edit_path", "")

        token = await _ensure_token()
        pptx_url = await _download_and_store_pptx(
            client,
            pptx_path,
            token,
            presentation_id,
            expected_slides=num_slides,
        )
        if not pptx_url and pptx_path:
            # La descarga falló (token de sesión stale, p.ej. tras recrear Presenton).
            # El PPTX YA existe en Presenton; basta con un token fresco para bajarlo.
            for _dl_try in range(3):
                try:
                    fresh = await _fetch_presenton_token()
                    _session["token"] = fresh
                    _session["expires"] = time.time() + 20 * 24 * 3600
                    pptx_url = await _download_and_store_pptx(
                        client,
                        pptx_path,
                        fresh,
                        presentation_id,
                        expected_slides=num_slides,
                    )
                except Exception as exc:
                    logger.warning("Reintento de descarga PPTX falló: %s", exc)
                    pptx_url = ""
                if pptx_url:
                    break
                await asyncio.sleep(1.0)
        edit_url = (
            f"{settings.PRESENTON_PUBLIC_URL.rstrip('/')}{edit_path}" if edit_path else ""
        )

    return {
        "presentation_id": presentation_id,
        "pptx_path":       pptx_path,
        "pptx_url":        pptx_url,
        "thumbnails":      [],
        "edit_url":        edit_url,
        "outline":         [],
    }


# ── Public generators ──────────────────────────────────────────────────

async def generate_lesson_presentation(
    titulo: str,
    contenido: str = "",
    *,
    grado: Optional[str] = None,
    objetivos: Optional[list[str]] = None,
    num_slides: int = 8,
    plantilla: str = "general",
) -> dict:
    prompt = _build_lesson_prompt(titulo, contenido, grado=grado, objetivos=objetivos)
    slides_markdown = _build_lesson_slides_markdown(
        titulo,
        contenido,
        grado,
        objetivos,
        num_slides,
    )
    result = await _generate_with_prompt(
        titulo=titulo,
        prompt=prompt,
        num_slides=num_slides,
        plantilla=plantilla,
        include_title_slide=True,
        slides_markdown=slides_markdown,
    )
    if not result.get("pptx_url"):
        raise RuntimeError("Presenton no devolvio un archivo PPTX descargable")
    return result


async def generate_review_presentation(
    titulo_examen: str,
    materia: str,
    preguntas_falladas: list[dict],
    *,
    promedio: float = 0.0,
    nota_maxima: float = 5.0,
    grado: Optional[str] = None,
    num_slides: int = 8,
    plantilla: str = "general",
) -> dict:
    prompt = _build_review_prompt(
        titulo_examen=titulo_examen,
        materia=materia,
        preguntas_falladas=preguntas_falladas,
        promedio=promedio,
        nota_maxima=nota_maxima,
        grado=grado,
    )
    return await _generate_with_prompt(
        titulo=f"Repaso — {titulo_examen}",
        prompt=prompt,
        num_slides=num_slides,
        plantilla=plantilla,
        include_title_slide=True,
    )


async def generate_period_presentation(
    materia: str,
    periodo: str,
    *,
    promedio_grupo: float,
    aprobados: int,
    reprobados: int,
    top_estudiantes: list[dict],
    fortalezas: Optional[list[str]] = None,
    debilidades: Optional[list[str]] = None,
    grado: Optional[str] = None,
    num_slides: int = 10,
    plantilla: str = "modern",
) -> dict:
    prompt = _build_period_summary_prompt(
        materia=materia,
        periodo=periodo,
        promedio_grupo=promedio_grupo,
        aprobados=aprobados,
        reprobados=reprobados,
        top_estudiantes=top_estudiantes,
        fortalezas=fortalezas,
        debilidades=debilidades,
        grado=grado,
    )
    return await _generate_with_prompt(
        titulo=f"{materia} — {periodo}",
        prompt=prompt,
        num_slides=num_slides,
        plantilla=plantilla,
        include_title_slide=True,
    )


# ── Health check ───────────────────────────────────────────────────────

async def health_check() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.PRESENTON_URL.rstrip('/')}/")
            return resp.status_code < 500
    except Exception as exc:
        logger.warning("Presenton health check falló: %s", exc)
        return False


# ── PresentonService class (legacy interface) ──────────────────────────

class PresentonService:
    """
    Clase-fachada compatible con herramientas.py y presentation_service.py.
    Delega en las funciones asíncronas standalone del mismo módulo.
    """

    @property
    def public_base_url(self) -> str:
        return settings.PRESENTON_PUBLIC_URL

    async def get_session_token(self) -> Optional[str]:
        return await _ensure_token()

    async def generateSlides(self, payload: dict) -> dict:
        title    = str(payload.get("title") or payload.get("topic") or "Presentación").strip()
        content  = str(payload.get("content") or "").strip()
        language = str(payload.get("language") or "Spanish").strip()
        n_slides = int(payload.get("n_slides") or payload.get("slides") or 8)
        template = str(payload.get("template") or "general").strip()
        slides_md: list = payload.get("slides_markdown") or []
        include_title_slide = bool(payload.get("include_title_slide", True))
        include_table_of_contents = bool(payload.get("include_table_of_contents", False))

        if slides_md:
            content = "\n\n".join(str(s) for s in slides_md) + (f"\n\n{content}" if content else "")
            include_title_slide = False
            include_table_of_contents = False

        prompt = (
            f"Crea una presentación educativa en {language} sobre: {title}.\n"
            + (f"\nContenido base:\n{content}" if content else "")
        )

        result = await _generate_with_prompt(
            titulo=title,
            prompt=prompt,
            num_slides=n_slides,
            plantilla=template,
            include_title_slide=include_title_slide,
            include_table_of_contents=include_table_of_contents,
        )
        if not result.get("pptx_url"):
            raise RuntimeError("Presenton no devolvio un archivo descargable")

        return {
            "presentation_id": result["presentation_id"],
            "path":            result["pptx_path"],
            "download_url":    result["pptx_url"],
            "edit_path":       "",
            "edit_url":        result["edit_url"],
            "thumbnails":      [],
        }
