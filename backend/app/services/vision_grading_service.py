import base64
import json
import re
from typing import Any, Awaitable, Callable, cast

import fitz
import httpx
from groq import Groq

from app.core.config import get_settings

settings = get_settings()

groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None

INTERACTIVE_TYPES = {"sopa_letras", "crucigrama", "emparejar"}
DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
MAX_VISION_PAGES = 3


def _extract_json_from_text(raw_text: str) -> dict:
    if not raw_text:
        raise ValueError("Respuesta vacia del modelo")
    try:
        return json.loads(raw_text)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        raise ValueError("El modelo no devolvio JSON valido")
    return json.loads(match.group(0))


def _normalize_text(value: str) -> str:
    if not value:
        return ""
    clean = value.strip().lower()
    clean = (
        clean.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ü", "u")
        .replace("ñ", "n")
    )
    return clean


def _compact_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize_text(value))


def _normalize_direction(value: str | None) -> str:
    text = _normalize_text(value or "")
    if text.startswith("h") or "horizontal" in text:
        return "horizontal"
    if text.startswith("v") or "vertical" in text:
        return "vertical"
    return ""


def _encode_data_url(image_bytes: bytes, mime: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def _collect_groq_images(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> list[dict[str, Any]]:
    is_pdf = filename.lower().endswith(".pdf") or (content_type or "") == "application/pdf"
    images: list[dict[str, Any]] = []

    if is_pdf:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for idx, page in enumerate(doc):
            if idx >= MAX_VISION_PAGES:
                break
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            images.append({"type": "image_url", "image_url": {"url": _encode_data_url(img_bytes, "image/png")}})
        doc.close()
        return images

    mime = (content_type or "").strip().lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        mime = "image/png"
    images.append({"type": "image_url", "image_url": {"url": _encode_data_url(file_bytes, mime)}})
    return images


def _collect_ollama_images(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> list[str]:
    is_pdf = filename.lower().endswith(".pdf") or (content_type or "") == "application/pdf"
    images: list[str] = []

    if is_pdf:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for idx, page in enumerate(doc):
            if idx >= MAX_VISION_PAGES:
                break
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")
            images.append(base64.b64encode(img_bytes).decode("utf-8"))
        doc.close()
        return images

    images.append(base64.b64encode(file_bytes).decode("utf-8"))
    return images


def _vision_request_groq(prompt: str, images: list[dict[str, Any]], model: str) -> dict:
    if groq_client is None:
        raise RuntimeError("GROQ_API_KEY no configurada para vision")

    messages = cast(Any, [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                *images,
            ],
        }
    ])

    chat = groq_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.0,
        max_tokens=1200,
    )
    content = (chat.choices[0].message.content or "").strip()
    return _extract_json_from_text(content)


async def _vision_request_ollama(
    prompt: str,
    images: list[str],
    model: str,
    ollama_url: str,
    ollama_api_key: str | None,
) -> dict:
    selected_model = (model or "").strip()
    if not selected_model:
        raise ValueError("No hay modelo Ollama configurado para vision")

    base_url = (ollama_url or "").strip().rstrip("/")
    if not base_url:
        base_url = "http://host.docker.internal:11434"

    payload = {
        "model": selected_model,
        "stream": False,
        "format": "json",
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": images,
            }
        ],
    }

    headers = {"Authorization": f"Bearer {ollama_api_key}"} if ollama_api_key else None
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(f"{base_url}/api/chat", json=payload, headers=headers)
        response.raise_for_status()
        result = response.json() or {}
        content = (((result or {}).get("message") or {}).get("content") or "").strip()
        return _extract_json_from_text(content)


async def _grade_sopa_with_vision(
    images: Any,
    palabras: list[str],
    model: str,
    vision_request: Callable[[str, Any, str], Awaitable[dict]],
) -> dict | None:
    palabras = [p for p in (palabras or []) if isinstance(p, str) and p.strip()]
    if not palabras:
        return None

    prompt = (
        "Eres un corrector de sopa de letras. Analiza la imagen del estudiante y "
        "detecta solo las palabras de la lista que estan claramente marcadas (circuladas, "
        "resaltadas o subrayadas). No inventes palabras y no asumas que todas estan encontradas. "
        "Devuelve SOLO JSON valido con este schema exacto:\n"
        "{\"palabras_encontradas\": [\"...\"], \"observaciones\": \"...\"}\n"
        f"Lista de palabras objetivo: {json.dumps(palabras, ensure_ascii=False)}"
    )

    data = await vision_request(prompt, images, model)
    found_raw = data.get("palabras_encontradas") if isinstance(data, dict) else []
    found_raw = found_raw if isinstance(found_raw, list) else []

    key_map = {_compact_text(p): p for p in palabras}
    found = []
    for w in found_raw:
        key = key_map.get(_compact_text(str(w)))
        if key and key not in found:
            found.append(key)

    total = len(palabras)
    found_count = len(found)
    nota_act = round((found_count / total * 5.0) if total else 0.0, 2)
    detalle_palabras = [
        {"palabra": p, "encontrada": p in set(found)}
        for p in palabras
    ]

    return {
        "nota_total": nota_act,
        "nota_maxima": 5.0,
        "preguntas": [
            {
                "numero": "sopa_letras",
                "tipo": "sopa_letras",
                "nota": nota_act,
                "nota_maxima": 5.0,
                "correcto": found_count == total,
                "retroalimentacion": f"Sopa de letras: {found_count}/{total} palabras encontradas",
                "respuesta_estudiante": ", ".join(found),
                "respuesta_correcta": ", ".join(palabras),
                "detalle_palabras": detalle_palabras,
            }
        ],
    }


def _build_crucigrama_pistas(contenido: dict) -> list[dict[str, Any]]:
    crucigrama = contenido.get("crucigrama") if isinstance(contenido, dict) else None
    if not isinstance(crucigrama, dict):
        return []

    pistas = []
    for p in crucigrama.get("pistas_horizontal", []):
        if not isinstance(p, dict):
            continue
        pistas.append({
            "numero": p.get("numero"),
            "direccion": "horizontal",
            "pista": p.get("pista", ""),
            "longitud": p.get("longitud"),
        })
    for p in crucigrama.get("pistas_vertical", []):
        if not isinstance(p, dict):
            continue
        pistas.append({
            "numero": p.get("numero"),
            "direccion": "vertical",
            "pista": p.get("pista", ""),
            "longitud": p.get("longitud"),
        })
    return pistas


async def _grade_crucigrama_with_vision(
    images: Any,
    contenido: dict,
    key_entries: list[dict],
    model: str,
    vision_request: Callable[[str, Any, str], Awaitable[dict]],
) -> dict | None:
    if not key_entries:
        return None

    pistas = _build_crucigrama_pistas(contenido)
    if not pistas:
        return None

    prompt = (
        "Eres un corrector de crucigramas. Analiza la imagen del crucigrama resuelto y "
        "extrae la respuesta escrita por el estudiante para cada pista listada. "
        "No inventes respuestas y deja en blanco si no puedes leerla. "
        "Devuelve SOLO JSON valido con este schema exacto:\n"
        "{\"respuestas\": [{\"numero\": 1, \"direccion\": \"horizontal\", \"respuesta_estudiante\": \"...\"}], "
        "\"observaciones\": \"...\"}\n"
        f"Pistas: {json.dumps(pistas, ensure_ascii=False)}"
    )

    data = await vision_request(prompt, images, model)
    resp_raw = data.get("respuestas") if isinstance(data, dict) else []
    resp_raw = resp_raw if isinstance(resp_raw, list) else []

    student_map: dict[tuple[int, str], str] = {}
    student_by_num: dict[int, str] = {}
    for item in resp_raw:
        if not isinstance(item, dict):
            continue
        num_raw = item.get("numero")
        if num_raw is None:
            continue
        try:
            num = int(num_raw)
        except (TypeError, ValueError):
            continue
        direccion = _normalize_direction(item.get("direccion"))
        respuesta = str(item.get("respuesta_estudiante") or item.get("respuesta") or "").strip()
        if not respuesta:
            continue
        if direccion:
            student_map[(num, direccion)] = respuesta
        if num not in student_by_num:
            student_by_num[num] = respuesta

    correct_words = 0
    total_words = len(key_entries)
    word_details = []

    for entry in key_entries:
        if not isinstance(entry, dict):
            continue
        num_raw = entry.get("numero")
        if num_raw is None:
            continue
        try:
            num = int(num_raw)
        except (TypeError, ValueError):
            continue
        direccion = _normalize_direction(entry.get("direccion"))
        respuesta_correcta = str(entry.get("respuesta") or "").strip()
        student_answer = ""
        if direccion:
            student_answer = student_map.get((num, direccion), "")
        if not student_answer:
            student_answer = student_by_num.get(num, "")

        correcto = _compact_text(student_answer) == _compact_text(respuesta_correcta)
        if correcto:
            correct_words += 1

        word_details.append({
            "pista": "",
            "respuesta_correcta": respuesta_correcta,
            "respuesta_estudiante": student_answer,
            "correcto": correcto,
            "numero": num,
            "dir": direccion or "",
        })

    nota_act = round((correct_words / total_words * 5.0) if total_words else 0.0, 2)

    return {
        "nota_total": nota_act,
        "nota_maxima": 5.0,
        "preguntas": [
            {
                "numero": "crucigrama",
                "tipo": "crucigrama",
                "nota": nota_act,
                "nota_maxima": 5.0,
                "correcto": correct_words == total_words,
                "retroalimentacion": f"Crucigrama: {correct_words}/{total_words} palabras correctas",
                "detalle_palabras": word_details,
            }
        ],
    }


async def _grade_emparejar_with_vision(
    images: Any,
    contenido: dict,
    key_entries: list[dict],
    model: str,
    vision_request: Callable[[str, Any, str], Awaitable[dict]],
) -> dict | None:
    if not key_entries:
        return None

    pares = []
    emparejar = contenido.get("emparejar") if isinstance(contenido, dict) else None
    if isinstance(emparejar, dict):
        pares = emparejar.get("pares", [])
    if not isinstance(pares, list) or not pares:
        pares = key_entries

    prompt = (
        "Eres un corrector de actividad de emparejar. Observa la imagen y determina "
        "las conexiones que el estudiante realizo entre la columna izquierda y la derecha. "
        "Devuelve SOLO JSON valido con este schema exacto:\n"
        "{\"emparejamientos\": [{\"izquierda\": \"...\", \"derecha\": \"...\"}], "
        "\"observaciones\": \"...\"}\n"
        "Usa exactamente los textos listados para izquierda y derecha. "
        "No inventes emparejamientos si no se ven claros. "
        f"Elementos: {json.dumps(pares, ensure_ascii=False)}"
    )

    data = await vision_request(prompt, images, model)
    matches_raw = data.get("emparejamientos") if isinstance(data, dict) else []
    matches_raw = matches_raw if isinstance(matches_raw, list) else []

    key_by_left = {}
    for p in key_entries:
        if not isinstance(p, dict):
            continue
        left = str(p.get("izquierda") or "").strip()
        right = str(p.get("derecha") or "").strip()
        if left:
            key_by_left[_compact_text(left)] = {"izquierda": left, "derecha": right}

    pares_bien = 0
    total_pares = len(key_by_left)
    detalle_pares = []
    used_left = set()

    for match in matches_raw:
        if not isinstance(match, dict):
            continue
        left_raw = str(match.get("izquierda") or "").strip()
        right_raw = str(match.get("derecha") or "").strip()
        left_key = _compact_text(left_raw)
        if not left_key or left_key in used_left:
            continue
        key = key_by_left.get(left_key)
        if not key:
            continue
        used_left.add(left_key)
        correcto = _compact_text(right_raw) == _compact_text(key.get("derecha", ""))
        if correcto:
            pares_bien += 1
        detalle_pares.append({
            "izquierda": key.get("izquierda", ""),
            "derecha_correcta": key.get("derecha", ""),
            "derecha_estudiante": right_raw,
            "correcto": correcto,
        })

    for left_key, key in key_by_left.items():
        if left_key in used_left:
            continue
        detalle_pares.append({
            "izquierda": key.get("izquierda", ""),
            "derecha_correcta": key.get("derecha", ""),
            "derecha_estudiante": "",
            "correcto": False,
        })

    nota_act = round((pares_bien / total_pares * 5.0) if total_pares else 0.0, 2)

    return {
        "nota_total": nota_act,
        "nota_maxima": 5.0,
        "preguntas": [
            {
                "numero": "emparejar",
                "tipo": "emparejar",
                "nota": nota_act,
                "nota_maxima": 5.0,
                "correcto": pares_bien == total_pares,
                "retroalimentacion": f"Emparejar: {pares_bien}/{total_pares} pares correctos",
                "detalle_pares": detalle_pares,
            }
        ],
    }


async def grade_interactive_with_vision(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
    exam_tipo: str | None,
    contenido_json: dict | None,
    clave_respuestas: dict | None,
    provider_config: dict | None = None,
) -> dict:
    content = contenido_json if isinstance(contenido_json, dict) else {}
    claves = clave_respuestas if isinstance(clave_respuestas, dict) else {}

    tipos = set()
    if exam_tipo in INTERACTIVE_TYPES:
        tipos.add(exam_tipo)
    for t in INTERACTIVE_TYPES:
        if t in content:
            tipos.add(t)

    if not tipos:
        return {}

    cfg = provider_config or {}
    provider = str(cfg.get("ocr_provider") or "groq_vision").strip().lower()
    if provider not in ("groq_vision", "ollama_vision"):
        provider = "groq_vision"

    selected_model = str(cfg.get("ocr_model") or "").strip()
    if provider == "ollama_vision" and not selected_model:
        selected_model = str(cfg.get("ocr_fallback_model") or "").strip()
    if provider == "groq_vision":
        selected_model = selected_model or DEFAULT_VISION_MODEL

    if provider == "ollama_vision" and not selected_model:
        raise ValueError("No hay modelo Ollama configurado para vision")

    if provider == "ollama_vision":
        images = _collect_ollama_images(file_bytes, filename, content_type)
        if not images:
            raise ValueError("No se pudo preparar la imagen para vision")

        ollama_url = str(cfg.get("ollama_url") or "http://host.docker.internal:11434").strip()
        ollama_api_key = str(cfg.get("ollama_api_key") or "").strip() or None

        async def vision_request(prompt: str, images_payload: Any, model_name: str) -> dict:
            return await _vision_request_ollama(prompt, images_payload, model_name, ollama_url, ollama_api_key)
    else:
        images = _collect_groq_images(file_bytes, filename, content_type)
        if not images:
            raise ValueError("No se pudo preparar la imagen para vision")

        async def vision_request(prompt: str, images_payload: Any, model_name: str) -> dict:
            return _vision_request_groq(prompt, images_payload, model_name)

    preguntas = []
    nota_total = 0.0
    nota_maxima = 0.0

    for tipo in sorted(tipos):
        if tipo == "sopa_letras":
            sopa_content = content.get("sopa_letras") if isinstance(content, dict) else None
            if not isinstance(sopa_content, dict):
                sopa_content = {}
            palabras = claves.get("sopa_palabras") or sopa_content.get("palabras", [])
            result = await _grade_sopa_with_vision(images, palabras, selected_model, vision_request)
        elif tipo == "crucigrama":
            key_entries = claves.get("crucigrama_respuestas") or []
            result = await _grade_crucigrama_with_vision(images, content, key_entries, selected_model, vision_request)
        elif tipo == "emparejar":
            key_entries = claves.get("emparejar_respuestas") or []
            result = await _grade_emparejar_with_vision(images, content, key_entries, selected_model, vision_request)
        else:
            result = None

        if not result:
            continue

        preguntas.extend(result.get("preguntas", []))
        nota_total += float(result.get("nota_total", 0.0))
        nota_maxima += float(result.get("nota_maxima", 0.0))

    if not preguntas:
        return {}

    return {
        "nota_total": round(nota_total, 2),
        "nota_maxima": round(nota_maxima, 2),
        "preguntas": preguntas,
        "calificacion_automatica": True,
        "tiene_preguntas_abiertas": False,
    }
