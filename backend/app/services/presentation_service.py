from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx
from groq import Groq

from app.core.config import get_settings, normalize_ollama_native_url
from app.services.google_slides_service import GoogleSlidesService
from app.services.presenton_service import PresentonService
from app.routers.ai_assets import classify_image_policy


settings = get_settings()

_GROQ_MODEL = "llama-3.3-70b-versatile"
_ALLOWED_MODES = {"auto", "cloud", "local"}


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("La respuesta del modelo llego vacia")

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("No fue posible extraer JSON valido")

    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("El JSON generado no es un objeto")
    return parsed


def _normalize_mode(value: str | None) -> str:
    mode = str(value or "auto").strip().lower()
    return mode if mode in _ALLOWED_MODES else "auto"


def _build_planner_prompt(
    *,
    topic: str,
    title: str,
    level: str,
    grade: str,
    base_content: str,
    n_slides: int,
    language: str,
    instructions: str,
) -> str:
    return (
        "Eres un experto en diseno instruccional para clases escolares en Colombia. "
        "Debes planificar una presentacion de clase y responder solo en JSON valido.\n\n"
        "Schema exacto de respuesta:\n"
        "{\n"
        '  "title": "string",\n'
        '  "teacher_summary": "string",\n'
        '  "objectives": ["string"],\n'
        '  "slides": [\n'
        "    {\n"
        '      "title": "string",\n'
        '      "body": "string",\n'
        '      "bullets": ["string"],\n'
        '      "image_query": "string",\n'
        '      "speaker_notes": "string"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Reglas:\n"
        f"1. Genera exactamente {n_slides} slides; este total ya incluye portada, contenido y cierre.\n"
        "2. Cada slide debe tener titulo breve, contenido pedagogico claro y vocabulario natural en espanol.\n"
        "3. Incluye ejemplos concretos, mini-actividad o pregunta guia cuando aplique.\n"
        "4. Haz la secuencia como una clase real: inicio, desarrollo, practica guiada, verificacion y cierre.\n"
        "5. image_query debe describir una imagen educativa concreta, sin texto dentro de la imagen salvo que sea una ficha de letras o rotulos indispensables.\n"
        "6. Para ejercicios matematicos, quimicos o cientificos, image_query debe pedir precision visual y composicion limpia.\n"
        "7. No escribas texto fuera del JSON.\n"
        f"8. Idioma objetivo: {language}.\n"
        f"9. Nivel de complejidad: {level}.\n"
        f"10. Grado sugerido: {grade or 'no especificado'}.\n\n"
        "Contexto:\n"
        f"- Tema: {topic}\n"
        f"- Titulo sugerido: {title or topic}\n"
        f"- Contenido base: {base_content or 'sin contenido base'}\n"
        f"- Instrucciones adicionales: {instructions or 'ninguna'}"
    )


def _coerce_slide(item: Any, idx: int) -> dict[str, Any]:
    if isinstance(item, dict):
        title = str(item.get("title") or f"Diapositiva {idx}").strip() or f"Diapositiva {idx}"
        body = str(item.get("body") or item.get("content") or "").strip()
        image_query = str(item.get("image_query") or title).strip()
        speaker_notes = str(item.get("speaker_notes") or "").strip()

        raw_bullets = item.get("bullets") if isinstance(item.get("bullets"), list) else []
        bullets = [str(b).strip() for b in raw_bullets if str(b).strip()]

        return {
            "title": title,
            "body": body,
            "bullets": bullets,
            "image_query": image_query,
            "speaker_notes": speaker_notes,
            "image_url": str(item.get("image_url") or "").strip(),
        }

    if isinstance(item, str):
        text = item.strip()
        if not text:
            text = f"Contenido clave de la diapositiva {idx}"
        return {
            "title": f"Diapositiva {idx}",
            "body": text,
            "bullets": [],
            "image_query": text,
            "speaker_notes": "",
            "image_url": "",
        }

    return {
        "title": f"Diapositiva {idx}",
        "body": "Contenido clave",
        "bullets": [],
        "image_query": f"Diapositiva {idx}",
        "speaker_notes": "",
        "image_url": "",
    }


def _coerce_slides(payload: dict[str, Any], n_slides: int) -> list[dict[str, Any]]:
    raw = payload.get("slides") if isinstance(payload.get("slides"), list) else []
    slides = [_coerce_slide(item, idx) for idx, item in enumerate(raw, start=1)]

    if len(slides) < n_slides:
        for idx in range(len(slides) + 1, n_slides + 1):
            slides.append(
                {
                    "title": f"Diapositiva {idx}",
                    "body": "Punto clave del tema.",
                    "bullets": ["Explicacion principal", "Ejemplo rapido"],
                    "image_query": f"{payload.get('title') or 'educacion'} slide {idx}",
                    "speaker_notes": "",
                    "image_url": "",
                }
            )

    return slides[:n_slides]


def _slides_to_markdown(slides: list[dict[str, Any]]) -> list[str]:
    output: list[str] = []
    for idx, slide in enumerate(slides, start=1):
        title = str(slide.get("title") or f"Diapositiva {idx}").strip() or f"Diapositiva {idx}"
        body = str(slide.get("body") or "").strip()
        bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
        image_url = str(slide.get("image_url") or "").strip()
        image_prompt = str(slide.get("image_prompt") or "").strip()

        lines: list[str] = [f"# {title}"]
        if body:
            lines.append(body)

        for bullet in bullets:
            b = str(bullet).strip()
            if b:
                lines.append(f"- {b}")

        if image_url:
            lines.append(f"![{title}]({image_url})")
        elif image_prompt:
            lines.append(f"Imagen educativa sugerida: {image_prompt}")

        output.append("\n".join(lines))

    return output


def _plan_with_groq_sync(prompt: str) -> dict[str, Any]:
    api_key = (settings.GROQ_API_KEY or "").strip()
    if not api_key:
        raise ValueError("GROQ_API_KEY no esta configurada")

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=_GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": "Genera contenido educativo para presentaciones y responde solo JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.35,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )

    raw = ((completion.choices or [{}])[0].message.content or "").strip()
    return _extract_json_object(raw)


async def _plan_with_groq(prompt: str) -> dict[str, Any]:
    return await asyncio.to_thread(_plan_with_groq_sync, prompt)


async def _plan_with_open_code(
    *,
    prompt: str,
    base_url: str,
    api_key: str,
    model: str,
) -> dict[str, Any]:
    from app.services.open_code_service import open_code_chat_completion, OPEN_CODE_RECOMMENDED_MODELS
    oc_model = model.strip() or OPEN_CODE_RECOMMENDED_MODELS["content"]
    result = await open_code_chat_completion(
        messages=[
            {"role": "system", "content": "Genera contenido educativo para presentaciones y responde solo JSON."},
            {"role": "user", "content": prompt},
        ],
        model=oc_model,
        base_url=base_url or None,
        api_key=api_key or None,
        temperature=0.35,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    raw = (((result.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    return _extract_json_object(raw)


async def _plan_with_ollama(*, prompt: str, ollama_url: str, ollama_model: str) -> dict[str, Any]:
    model = str(ollama_model or "").strip()
    if not model:
        raise ValueError("No hay modelo Ollama configurado para presentaciones")

    base = normalize_ollama_native_url(ollama_url or settings.OLLAMA_URL)
    if not base:
        raise ValueError("No hay OLLAMA_URL configurada")

    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "messages": [
            {
                "role": "system",
                "content": "Genera contenido educativo para presentaciones y responde solo JSON.",
            },
            {"role": "user", "content": prompt},
        ],
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(f"{base}/api/chat", json=payload)

    if response.status_code >= 400:
        raise ValueError(f"Ollama devolvio {response.status_code}: {response.text}")

    data = response.json() or {}
    content = (((data.get("message") or {}).get("content")) or "").strip()
    return _extract_json_object(content)


async def _groq_cloud_ready() -> bool:
    key = (settings.GROQ_API_KEY or "").strip()
    if not key:
        return False

    headers = {"Authorization": f"Bearer {key}"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get("https://api.groq.com/openai/v1/models", headers=headers)
        return response.status_code < 400
    except Exception:
        return False


class PresentationService:
    def __init__(self):
        self._presenton_service: PresentonService | None = None

    def _get_presenton(self) -> PresentonService | None:
        if self._presenton_service is not None:
            return self._presenton_service
        try:
            self._presenton_service = PresentonService()
            return self._presenton_service
        except Exception:
            return None

    async def generatePresentation(self, input_payload: dict[str, Any]) -> dict[str, Any]:
        topic = str(input_payload.get("topic") or "").strip()
        if not topic:
            raise ValueError("topic es obligatorio")

        title = str(input_payload.get("title") or topic).strip()
        level = str(input_payload.get("level") or "intermedio").strip() or "intermedio"
        grade = str(input_payload.get("grade") or "").strip()
        base_content = str(input_payload.get("base_content") or "").strip()
        instructions = str(input_payload.get("instructions") or "").strip()
        language = str(input_payload.get("language") or "Espanol").strip() or "Espanol"

        n_slides = int(input_payload.get("slides") or 8)
        n_slides = max(1, min(n_slides, 50))

        mode = _normalize_mode(input_payload.get("mode"))
        template = str(input_payload.get("template") or "general").strip() or "general"
        tone = str(input_payload.get("tone") or "educational").strip() or "educational"
        verbosity = str(input_payload.get("verbosity") or "standard").strip() or "standard"
        include_toc = bool(input_payload.get("include_table_of_contents"))
        include_title = bool(input_payload.get("include_title_slide", True))
        web_search = bool(input_payload.get("web_search"))
        export_as = str(input_payload.get("export_as") or "pptx").strip() or "pptx"

        ollama_url = str(input_payload.get("ollama_url") or settings.OLLAMA_URL or "").strip()
        ollama_model = str(input_payload.get("ollama_model") or settings.OLLAMA_PRESENTATION_MODEL or "").strip()
        open_code_base_url = str(input_payload.get("open_code_base_url") or "").strip()
        open_code_api_key = str(input_payload.get("open_code_api_key") or "").strip()
        open_code_model = str(input_payload.get("open_code_model") or "").strip()
        # OpenAI queda RESTRINGIDO a imágenes; la key se conserva solo para ilustrar
        # slides, nunca para el planning de texto.
        openai_api_key = str(input_payload.get("openai_api_key") or settings.OPENAI_API_KEY or "").strip()

        use_generated_images = bool(input_payload.get("use_generated_images", False))

        export_google_slides = bool(input_payload.get("export_google_slides"))

        provider_used = ""
        open_code_ready = bool(open_code_base_url and open_code_api_key)

        if mode == "local":
            provider_used = "ollama"
        elif mode == "cloud":
            provider_used = "open_code" if open_code_ready else "groq"
        else:
            if open_code_ready:
                provider_used = "open_code"
            elif await _groq_cloud_ready():
                provider_used = "groq"
            else:
                provider_used = "ollama"

        provider_mode_used = "local" if provider_used == "ollama" else "cloud"

        prompt = _build_planner_prompt(
            topic=topic,
            title=title,
            level=level,
            grade=grade,
            base_content=base_content,
            n_slides=n_slides,
            language=language,
            instructions=instructions,
        )

        if provider_used == "open_code":
            try:
                planning_payload = await _plan_with_open_code(
                    prompt=prompt,
                    base_url=open_code_base_url,
                    api_key=open_code_api_key,
                    model=open_code_model,
                )
            except Exception:
                planning_payload = await _plan_with_groq(prompt) if await _groq_cloud_ready() else await _plan_with_ollama(prompt=prompt, ollama_url=ollama_url, ollama_model=ollama_model)
        elif provider_used == "groq":
            planning_payload = await _plan_with_groq(prompt)
        else:
            planning_payload = await _plan_with_ollama(
                prompt=prompt,
                ollama_url=ollama_url,
                ollama_model=ollama_model,
            )

        slides = _coerce_slides(planning_payload, n_slides)

        if use_generated_images:
            for idx, slide in enumerate(slides, start=1):
                if idx % 2 == 0:
                    slide["image_provider"] = "none"
                    slide["image_policy"] = "text_slide"
                    continue
                image_prompt = str(slide.get("image_query") or slide.get("title") or topic).strip()
                slide["image_prompt"] = (
                    f"Ilustracion educativa para diapositiva en espanol: {image_prompt}. "
                    f"Tema: {topic}. Estilo limpio, apto para clase, sujeto completo dentro del marco, "
                    "sin recortes, sin texto dentro de la imagen salvo que sea necesario para una ficha o rotulo."
                )
                slide["image_provider"] = "hybrid_auto"
                slide["image_policy"] = classify_image_policy(slide["image_prompt"], kind="slide")

        slides_markdown = _slides_to_markdown(slides)

        presenton_result: dict[str, Any] = {}
        presenton_svc = self._get_presenton()
        if presenton_svc is not None:
            try:
                presenton_result = await presenton_svc.generateSlides(
                    {
                        "content": topic,
                        "slides_markdown": slides_markdown,
                        "instructions": instructions or None,
                        "tone": tone,
                        "verbosity": verbosity,
                        "web_search": web_search,
                        "n_slides": n_slides,
                        "language": language,
                        "template": template,
                        "include_table_of_contents": include_toc,
                        "include_title_slide": False,
                        "export_as": export_as,
                    }
                )
            except Exception as presenton_err:
                import logging
                logging.getLogger(__name__).warning(
                    "Presenton no pudo generar el archivo PPTX: %s", presenton_err
                )

        google_result = None
        if export_google_slides:
            google_result = await GoogleSlidesService().export_presentation(
                title=str(planning_payload.get("title") or title),
                slides=slides,
            )

        return {
            "title": str(planning_payload.get("title") or title),
            "teacher_summary": str(planning_payload.get("teacher_summary") or ""),
            "objectives": planning_payload.get("objectives") if isinstance(planning_payload.get("objectives"), list) else [],
            "slides": slides,
            "slides_markdown": slides_markdown,
            "provider_mode_requested": mode,
            "provider_mode_used": provider_mode_used,
            "provider_used": provider_used,
            "image_provider": "ai_generation" if use_generated_images else "none",
            "n_slides": n_slides,
            "language": language,
            "tone": tone,
            "verbosity": verbosity,
            "template": template,
            "include_table_of_contents": include_toc,
            "include_title_slide": include_title,
            "web_search": web_search,
            "export_as": export_as,
            "presenton": presenton_result,
            "google_slides": google_result,
        }

    async def generate_presentation(self, input_payload: dict[str, Any]) -> dict[str, Any]:
        return await self.generatePresentation(input_payload)


async def generate_presentation(input_payload: dict[str, Any]) -> dict[str, Any]:
    return await PresentationService().generatePresentation(input_payload)
