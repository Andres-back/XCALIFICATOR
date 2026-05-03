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
import time
from typing import Optional

import httpx

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


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

async def _download_and_store_pptx(
    client: httpx.AsyncClient,
    pptx_path: str,
    token: str,
    presentation_id: str,
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

    return f"/uploads/presentations/{filename}"


# ── Core generator (new Presenton API) ────────────────────────────────

async def _generate_with_prompt(
    titulo: str, prompt: str, num_slides: int, plantilla: str
) -> dict:
    """Single-call presentation generation using POST /api/v1/ppt/presentation/generate."""
    if plantilla not in TEMPLATES:
        plantilla = "general"
    num_slides = max(3, min(int(num_slides or 8), 20))

    token = await _ensure_token()
    timeout = httpx.Timeout(settings.PRESENTON_TIMEOUT, connect=10.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        payload = {
            "content": prompt,
            "n_slides": num_slides,
            "language": "Spanish",
            "template": TEMPLATES[plantilla],
            "export_as": "pptx",
            "include_title_slide": True,
            "instructions": (
                "CRITICAL FORMATTING RULES — follow every rule exactly:\n"
                "1. Plain text ONLY. NEVER use LaTeX: no \\frac, \\times, \\sum, $...$, \\begin, \\end or any math markup.\n"
                "2. Write fractions as '3/4' or Unicode: ½ ⅓ ¼ ¾. Write operators as × ÷ ± √ ² ³ π ∑.\n"
                "3. NEVER underline words with underscores (_word_) and NEVER use HTML tags.\n"
                "4. Each slide: one short title (max 8 words) + max 4 bullet points + 1 image.\n"
                "5. Image search keywords MUST be in ENGLISH, simple, concrete nouns directly related to the slide topic "
                "(e.g. 'photosynthesis leaf', 'mathematics classroom', 'fraction pie chart'). "
                "Avoid abstract words like 'education' or 'learning' as standalone keywords."
            ),
        }

        resp = await client.post(
            f"{settings.PRESENTON_URL.rstrip('/')}/api/v1/ppt/presentation/generate",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 401:
            # Token was invalidated — clear and retry once
            _session["token"] = None
            _session["expires"] = 0.0
            token = await _ensure_token()
            resp = await client.post(
                f"{settings.PRESENTON_URL.rstrip('/')}/api/v1/ppt/presentation/generate",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )

        if resp.status_code >= 400:
            raise RuntimeError(
                f"Presenton respondió {resp.status_code}: {resp.text[:300]}"
            )

        data = resp.json()
        presentation_id = str(data.get("presentation_id", ""))
        pptx_path       = data.get("path", "")
        edit_path       = data.get("edit_path", "")

        pptx_url = await _download_and_store_pptx(client, pptx_path, token, presentation_id)
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
    return await _generate_with_prompt(
        titulo=titulo, prompt=prompt, num_slides=num_slides, plantilla=plantilla,
    )


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
        return None

    async def generateSlides(self, payload: dict) -> dict:
        title    = str(payload.get("title") or payload.get("topic") or "Presentación").strip()
        content  = str(payload.get("content") or "").strip()
        language = str(payload.get("language") or "Spanish").strip()
        n_slides = int(payload.get("n_slides") or payload.get("slides") or 8)
        template = str(payload.get("template") or "general").strip()
        slides_md: list = payload.get("slides_markdown") or []

        if slides_md:
            content = "\n\n".join(str(s) for s in slides_md) + (f"\n\n{content}" if content else "")

        prompt = (
            f"Crea una presentación educativa en {language} sobre: {title}.\n"
            + (f"\nContenido base:\n{content}" if content else "")
        )

        result = await _generate_with_prompt(
            titulo=title, prompt=prompt, num_slides=n_slides, plantilla=template,
        )

        return {
            "presentation_id": result["presentation_id"],
            "path":            result["pptx_path"],
            "download_url":    result["pptx_url"],
            "edit_path":       "",
            "edit_url":        result["edit_url"],
            "thumbnails":      [],
        }
