import base64
import json
import re
from typing import Any

import httpx

from app.core.config import get_settings

settings = get_settings()

OPEN_CODE_RECOMMENDED_MODELS = {
    "content": "DeepSeek V4 Flash",
    "vision": "Qwen3.7 Plus",
    "feedback": "DeepSeek V4 Flash",
    "fallback": "DeepSeek V4 Flash",
}

OPEN_CODE_MODEL_CATALOG = [
    "GLM-5.1",
    "GLM-5",
    "Kimi K2.6",
    "Kimi K2.7 Code",
    "MiMo-V2.5",
    "MiMo-V2.5-Pro",
    "MiniMax M3",
    "MiniMax M2.7",
    "Qwen3.7 Max",
    "Qwen3.7 Plus",
    "Qwen3.6 Plus",
    "DeepSeek V4 Pro",
    "DeepSeek V4 Flash",
]

OPEN_CODE_MODEL_IDS = {
    "GLM-5.2": "glm-5.2",
    "GLM-5.1": "glm-5.1",
    "GLM-5": "glm-5",
    "Kimi K2.7 Code": "kimi-k2.7-code",
    "Kimi K2.7": "kimi-k2.7",
    "Kimi K2.6": "kimi-k2.6",
    "MiMo-V2.5": "mimo-v2.5",
    "MiMo V2.5": "mimo-v2.5",
    "MiMo-V2.5-Pro": "mimo-v2.5-pro",
    "MiMo V2.5 Pro": "mimo-v2.5-pro",
    "MiniMax M3": "minimax-m3",
    "MiniMax M2.7": "minimax-m2.7",
    "MiniMax M2.5": "minimax-m2.5",
    "Qwen3.7 Max": "qwen3.7-max",
    "Qwen3.7 Plus": "qwen3.7-plus",
    "Qwen3.6 Plus": "qwen3.6-plus",
    "DeepSeek V4 Pro": "deepseek-v4-pro",
    "DeepSeek V4 Flash": "deepseek-v4-flash",
}


def _normalize_base_url(base_url: str | None) -> str:
    base = (base_url or settings.OPEN_CODE_BASE_URL or "").strip().rstrip("/")
    if base.endswith("/chat/completions"):
        base = base[: -len("/chat/completions")].rstrip("/")
    return base


def normalize_open_code_model_id(model: str | None) -> str:
    selected = (model or "").strip()
    if not selected:
        return selected
    if selected.startswith("opencode-go/"):
        selected = selected.split("/", 1)[1]
    mapped = OPEN_CODE_MODEL_IDS.get(selected)
    if mapped:
        return mapped
    lower = selected.lower().replace(" ", "-").replace("_", "-")
    lower = lower.replace("v4-flash", "v4-flash").replace("v4-pro", "v4-pro")
    return lower


def _api_key(api_key: str | None = None) -> str:
    return (api_key or settings.OPEN_CODE_API_KEY or "").strip()


def _extract_json_from_text(raw_text: str) -> dict:
    if not raw_text:
        raise ValueError("Respuesta vacia del modelo Open Code")
    try:
        return json.loads(raw_text)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        raise ValueError("Open Code no devolvio JSON valido")
    return json.loads(match.group(0))


def _message_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        return ""
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        result = "\n".join(parts).strip()
        if result:
            return result
    reasoning = message.get("reasoning_content")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning.strip()
    return ""


async def open_code_chat_completion(
    *,
    messages: list[dict[str, Any]],
    model: str,
    base_url: str | None = None,
    api_key: str | None = None,
    temperature: float = 0.1,
    max_tokens: int | None = None,
    response_format: dict[str, str] | None = None,
) -> dict:
    base = _normalize_base_url(base_url)
    key = _api_key(api_key)
    selected_model = normalize_open_code_model_id(model)
    if not base:
        raise ValueError("OPEN_CODE_BASE_URL no esta configurada")
    if not key:
        raise ValueError("OPEN_CODE_API_KEY no esta configurada")
    if not selected_model:
        raise ValueError("No hay modelo Open Code configurado")

    payload: dict[str, Any] = {
        "model": selected_model,
        "messages": messages,
        "temperature": temperature,
    }
    # Open Code routes to models with different output budgets. Keep the
    # max_tokens argument for callers, but do not cap generations here.
    if response_format:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
        response.raise_for_status()
        return response.json() if response.content else {}


async def open_code_chat_json(
    *,
    messages: list[dict[str, Any]],
    model: str,
    base_url: str | None = None,
    api_key: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 4096,
) -> dict:
    payload = await open_code_chat_completion(
        messages=messages,
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return _extract_json_from_text(_message_text(payload))


async def open_code_vision_text(
    *,
    image_bytes: bytes,
    prompt: str,
    model: str,
    mime_type: str = "image/png",
    base_url: str | None = None,
    api_key: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 4096,
) -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{encoded}"
    payload = await open_code_chat_completion(
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return _message_text(payload)


async def open_code_vision_json(
    *,
    image_payloads: list[str],
    prompt: str,
    model: str,
    base_url: str | None = None,
    api_key: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1600,
) -> dict:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for image_b64 in image_payloads:
        content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}})
    payload = await open_code_chat_completion(
        messages=[{"role": "user", "content": content}],
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return _extract_json_from_text(_message_text(payload))


async def fetch_open_code_models(base_url: str | None = None, api_key: str | None = None) -> list[str]:
    base = _normalize_base_url(base_url)
    key = _api_key(api_key)
    if not base or not key:
        return OPEN_CODE_MODEL_CATALOG

    headers = {"Authorization": f"Bearer {key}"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(f"{base}/models", headers=headers)
            response.raise_for_status()
            payload = response.json() if response.content else {}
    except Exception:
        return OPEN_CODE_MODEL_CATALOG

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return OPEN_CODE_MODEL_CATALOG
    models = []
    for row in data:
        if isinstance(row, dict):
            model_id = str(row.get("id") or row.get("name") or "").strip()
            if model_id:
                models.append(model_id)
    return sorted(set(models)) or OPEN_CODE_MODEL_CATALOG
