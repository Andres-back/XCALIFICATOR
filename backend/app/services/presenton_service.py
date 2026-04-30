"""
Servicio para integración con Presenton (generador de presentaciones IA).

Presenton corre como contenedor Docker (xcalificator_presenton) y reutiliza
la GROQ_API_KEY del proyecto. Expone una API HTTP que recibe un prompt + outline
y devuelve un archivo .pptx más metadatos.

Documentación: https://github.com/presenton/presenton
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


# ── Plantillas soportadas ──────────────────────────────────────────────
TEMPLATES = {
    "general":  "general",
    "classic":  "classic",
    "modern":   "modern",
}

# Niveles de slides que el wizard ofrece al docente
SLIDE_PRESETS = {
    "corta":    5,
    "media":    8,
    "completa": 12,
}


def _build_lesson_prompt(
    titulo: str,
    contenido: str,
    grado: Optional[str] = None,
    objetivos: Optional[list[str]] = None,
) -> str:
    """
    Arma el prompt en español que Presenton usará para crear el outline.
    Diseñado para producir slides de CLASE (no de examen ni de retroalimentación).
    """
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
    """
    Prompt para presentación de RETROALIMENTACIÓN de un examen.
    Se centra en explicar las preguntas con menor tasa de acierto.

    `preguntas_falladas` es una lista de dicts con:
        {numero, enunciado, tipo, respuesta_correcta, tasa_acierto, explicacion?}
    """
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
        "explicación clara del concepto (no de la pregunta literal).\n"
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
    """
    Prompt para presentación de RESUMEN DE PERÍODO (reuniones de padres / dirección).
    """
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


# ── Generadores especializados ─────────────────────────────────────────

async def _generate_with_prompt(
    titulo: str, prompt: str, num_slides: int, plantilla: str
) -> dict:
    """Núcleo común: outline + presentation. Reutilizable por todos los flujos."""
    if plantilla not in TEMPLATES:
        plantilla = "general"
    num_slides = max(3, min(int(num_slides or 8), 20))

    timeout = httpx.Timeout(settings.PRESENTON_TIMEOUT, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        outline_resp = await _post(client, "/api/v1/ppt/outlines/generate", {
            "prompt":   prompt,
            "n_slides": num_slides,
            "language": "Spanish",
        })
        outlines = outline_resp.get("outlines") or outline_resp.get("data") or []
        if not outlines:
            raise RuntimeError("Presenton no devolvió outline (verifica GROQ_API_KEY)")

        pres_resp = await _post(client, "/api/v1/ppt/presentation/generate", {
            "outlines": outlines,
            "title":    titulo,
            "template": TEMPLATES[plantilla],
            "language": "Spanish",
        })

    presentation_id = pres_resp.get("presentation_id") or pres_resp.get("id") or ""
    pptx_path       = pres_resp.get("pptx_path") or pres_resp.get("path") or ""
    pptx_url        = pres_resp.get("pptx_url")  or pres_resp.get("download_url") or ""
    thumbnails      = pres_resp.get("thumbnails") or pres_resp.get("previews") or []
    edit_url        = pres_resp.get("edit_url")

    if pptx_path and not pptx_url:
        pptx_url = f"{settings.PRESENTON_URL.rstrip('/')}{pptx_path}"

    return {
        "presentation_id": presentation_id,
        "pptx_path":       pptx_path,
        "pptx_url":        pptx_url,
        "thumbnails":      thumbnails,
        "edit_url":        edit_url,
        "outline":         outlines,
    }


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
    """Presentación de retroalimentación (las 3 preguntas más falladas + tips)."""
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
    """Presentación de cierre de período (reuniones de padres / dirección)."""
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


# ── Cliente HTTP ───────────────────────────────────────────────────────

async def _post(client: httpx.AsyncClient, path: str, payload: dict) -> dict:
    url = f"{settings.PRESENTON_URL.rstrip('/')}{path}"
    resp = await client.post(url, json=payload)
    if resp.status_code >= 400:
        raise RuntimeError(
            f"Presenton respondió {resp.status_code} en {path}: {resp.text[:300]}"
        )
    return resp.json()


async def health_check() -> bool:
    """Verifica que Presenton esté arriba (para smoke test del admin)."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.PRESENTON_URL.rstrip('/')}/")
            return resp.status_code < 500
    except Exception as exc:
        logger.warning("Presenton health check falló: %s", exc)
        return False


# ── Generación de presentación de clase ────────────────────────────────

async def generate_lesson_presentation(
    titulo: str,
    contenido: str = "",
    *,
    grado: Optional[str] = None,
    objetivos: Optional[list[str]] = None,
    num_slides: int = 8,
    plantilla: str = "general",
) -> dict:
    """Genera una presentación de CLASE."""
    prompt = _build_lesson_prompt(titulo, contenido, grado=grado, objetivos=objetivos)
    return await _generate_with_prompt(
        titulo=titulo, prompt=prompt, num_slides=num_slides, plantilla=plantilla,
    )
