import asyncio
from datetime import datetime
import json
import os
import re
from typing import Optional
from fastapi import HTTPException
from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage
from models.presentation_layout import SlideLayoutModel
from models.presentation_outline_model import SlideOutlineModel
from utils.llm_config import get_llm_config
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_utils import extract_structured_content, get_generate_kwargs
from utils.llm_provider import get_model
from utils.schema_utils import add_field_in_schema, remove_fields_from_schema


SLIDE_CONTENT_SYSTEM_PROMPT = """
You will be given slide content and response schema.
You need to generate structured content json based on the schema.

# Steps
1. Analyze the content.
2. Analyze the response schema.
3. Generate structured content json based on the schema.
4. Generate speaker note if required.
5. Provide structured content json as output.

# General Rules
- Make sure to follow language guidelines.
- Speaker note should be normal text, not markdown.
- Never ever go over the max character limit.
- Do not add emoji in the content.
- Don't provide $schema field in content json.
- Every field declared as an array in the schema MUST be a JSON array (never a single string or object). If only one item exists, still wrap it in an array.
{markdown_emphasis_rules}

{user_instructions}

{tone_instructions}

{verbosity_instructions}

{output_fields_instructions}
"""


SLIDE_CONTENT_USER_PROMPT = """
# Current Date and Time:
{current_date_time}

# Icon Query And Image Prompt Language:
English

# Slide Language:
{language}

# SLIDE CONTENT: START
{content}
# SLIDE CONTENT: END
"""


def _resolve_prompt_language(language: Optional[str]) -> str:
    if language is None:
        return "auto-detect"
    s = str(language).strip()
    if not s:
        return "auto-detect"
    if s.lower() in {"auto", "auto-detect"}:
        return "auto-detect"
    return s


def _get_schema_markdown(response_schema: Optional[dict]) -> str:
    if not response_schema:
        return "- Follow the provided response schema strictly."
    try:
        schema_text = json.dumps(response_schema, ensure_ascii=False)
    except Exception:
        return "- Follow the provided response schema strictly."
    return f"- Follow this response schema exactly: {schema_text}"


# ── Coerción de tipos contra el schema ──────────────────────────────────
# El frontend de Presenton hace field.map()/field.slice().map() sobre los
# campos declarados como "array". Si el LLM devuelve un string/objeto en su
# lugar, el editor crashea con "a.map is not a function". Aquí forzamos que
# todo campo array sea realmente una lista (resolviendo $ref de Pydantic).

def _resolve_ref(schema: dict, root: dict) -> dict:
    seen = 0
    while isinstance(schema, dict) and "$ref" in schema and seen < 10:
        ref = schema["$ref"]
        if not isinstance(ref, str) or not ref.startswith("#/"):
            break
        node = root
        for part in ref[2:].split("/"):
            if isinstance(node, dict):
                node = node.get(part, {})
            else:
                node = {}
                break
        schema = node if isinstance(node, dict) else {}
        seen += 1
    return schema if isinstance(schema, dict) else {}


def _schema_types(schema: dict) -> list:
    t = schema.get("type")
    if isinstance(t, list):
        return t
    if t:
        return [t]
    # Pydantic puede usar anyOf/oneOf en vez de "type"
    for key in ("anyOf", "oneOf", "allOf"):
        variants = schema.get(key)
        if isinstance(variants, list):
            collected = []
            for v in variants:
                if isinstance(v, dict):
                    collected.extend(_schema_types(v))
            if collected:
                return collected
    return []


def _coerce_to_schema(value, schema, root, depth: int = 0):
    if depth > 12 or not isinstance(schema, dict):
        return value
    schema = _resolve_ref(schema, root)
    types = _schema_types(schema)

    is_array = "array" in types or ("items" in schema and "object" not in types and "array" not in types and not schema.get("properties"))
    if is_array:
        items_schema = schema.get("items", {}) or {}
        if value is None:
            return []
        if isinstance(value, str):
            value = [value] if value.strip() else []
        elif not isinstance(value, list):
            value = [value]
        return [_coerce_to_schema(v, items_schema, root, depth + 1) for v in value]

    props = schema.get("properties")
    if props or "object" in types:
        if not isinstance(value, dict):
            return value
        out = dict(value)
        for k, sub in (props or {}).items():
            if k in out and isinstance(sub, dict):
                out[k] = _coerce_to_schema(out[k], sub, root, depth + 1)
        return out

    return value


def _normalize_slide_content(content, response_schema):
    try:
        if isinstance(content, dict) and isinstance(response_schema, dict):
            return _coerce_to_schema(content, response_schema, response_schema)
    except Exception:
        pass
    return content


def _reconcile_image_prompts(content, response_schema, outline_text: str = ""):
    """Asegura que el prompt de imagen quede en el campo anidado `__image_prompt__`
    que `process_slide_and_fetch_assets` busca para generar la imagen.

    El LLM (qwen) suele aplanar el objeto `image` del schema y devolver un
    `image_prompt` de nivel superior; eso hacía que NUNCA se generara imagen.
    Aquí detectamos los objetos del schema que contienen `__image_prompt__` y
    rellenamos el contenido con la estructura correcta, tomando el prompt de:
    el valor anidado existente, un string, un `image_prompt`/`image_query` plano,
    o (último recurso) el título/outline de la slide.
    """
    if not isinstance(content, dict) or not isinstance(response_schema, dict):
        return content
    try:
        schema = _resolve_ref(response_schema, response_schema)
        props = schema.get("properties")
        if not isinstance(props, dict):
            return content

        # Prompt plano que el LLM pudo dejar en la raíz (lo consumimos).
        flat_prompt = None
        for k in ("image_prompt", "imagePrompt", "image_query", "imageQuery", "prompt"):
            v = content.get(k)
            if isinstance(v, str) and v.strip():
                flat_prompt = v.strip()
                content.pop(k, None)
                break

        title_fallback = ""
        for k in ("title", "heading", "name"):
            v = content.get(k)
            if isinstance(v, str) and v.strip():
                title_fallback = v.strip()
                break
        title_fallback = title_fallback or re.sub(r"\s+", " ", str(outline_text or "")).strip()[:80]

        for key, sub in props.items():
            sub_r = _resolve_ref(sub, response_schema) if isinstance(sub, dict) else {}
            sub_props = sub_r.get("properties", {}) if isinstance(sub_r, dict) else {}
            if isinstance(sub_props, dict) and "__image_prompt__" in sub_props:
                cur = content.get(key)
                prompt = None
                if isinstance(cur, dict) and isinstance(cur.get("__image_prompt__"), str) and cur["__image_prompt__"].strip():
                    prompt = cur["__image_prompt__"].strip()
                elif isinstance(cur, str) and cur.strip():
                    prompt = cur.strip()
                prompt = prompt or flat_prompt or (
                    f"Ilustracion educativa clara sobre: {title_fallback}" if title_fallback else "Ilustracion educativa clara para la clase"
                )
                obj = cur if isinstance(cur, dict) else {}
                obj["__image_prompt__"] = prompt
                content[key] = obj
    except Exception:
        pass
    # Además normaliza objetos imagen/icono ANIDADOS dentro de arrays (members,
    # cards, gallery...) para que el frontend nunca lea `.image.__image_url__`
    # sobre un `undefined`.
    return _normalize_array_image_items(content, response_schema, outline_text)


def _derive_item_prompt(item, image_prop: str, title_fallback: str) -> str:
    if isinstance(item, dict):
        cur = item.get(image_prop)
        if isinstance(cur, dict):
            p = cur.get("__image_prompt__")
            if isinstance(p, str) and p.strip():
                return p.strip()
        elif isinstance(cur, str) and cur.strip():
            return cur.strip()
        for k in ("title", "heading", "name", "label", "subtext", "description"):
            v = item.get(k)
            if isinstance(v, str) and v.strip():
                return f"Ilustracion educativa clara sobre: {v.strip()[:70]}"
    return (
        f"Ilustracion educativa clara sobre: {title_fallback}"
        if title_fallback
        else "Ilustracion educativa clara para la clase"
    )


def _normalize_array_image_items(content, response_schema, outline_text: str = ""):
    """Garantiza que cada item de un array que el schema declara con objeto-imagen
    (o objeto-icono) tenga realmente ese objeto.

    Causa del crash del editor `Cannot read properties of undefined (reading
    '__image_url__')`: layouts como HorizontalHeightSpanningImagesWithTitleSlide
    hacen `members.map(m => m.image.__image_url__)` SIN optional chaining, y el
    LLM a veces produce items sin el campo `image`. Como el frontend está
    compilado dentro de la imagen de Presenton, lo arreglamos en la capa de datos.
    """
    if not isinstance(content, dict) or not isinstance(response_schema, dict):
        return content
    try:
        schema = _resolve_ref(response_schema, response_schema)
        props = schema.get("properties")
        if not isinstance(props, dict):
            return content

        title_fallback = ""
        for k in ("title", "heading", "name"):
            v = content.get(k)
            if isinstance(v, str) and v.strip():
                title_fallback = v.strip()
                break
        title_fallback = title_fallback or re.sub(r"\s+", " ", str(outline_text or "")).strip()[:80]

        for key, sub in props.items():
            sub_r = _resolve_ref(sub, response_schema) if isinstance(sub, dict) else {}
            if not isinstance(sub_r, dict):
                continue
            if "array" not in _schema_types(sub_r) and "items" not in sub_r:
                continue
            items_schema = _resolve_ref(sub_r.get("items", {}) or {}, response_schema)
            item_props = items_schema.get("properties", {}) if isinstance(items_schema, dict) else {}
            if not isinstance(item_props, dict) or not item_props:
                continue

            image_props, icon_props = [], []
            for p_name, p_sub in item_props.items():
                p_r = _resolve_ref(p_sub, response_schema) if isinstance(p_sub, dict) else {}
                p_props = p_r.get("properties", {}) if isinstance(p_r, dict) else {}
                if not isinstance(p_props, dict):
                    continue
                if "__image_prompt__" in p_props or "__image_url__" in p_props:
                    image_props.append(p_name)
                if "__icon_query__" in p_props or "__icon_url__" in p_props:
                    icon_props.append(p_name)

            if not image_props and not icon_props:
                continue

            arr = content.get(key)
            if not isinstance(arr, list) or not arr:
                continue

            new_arr = []
            for item in arr:
                if not isinstance(item, dict):
                    item = {"title": str(item).strip()[:60]} if item is not None else {}
                for ip in image_props:
                    cur = item.get(ip)
                    if not isinstance(cur, dict):
                        cur = {}
                    has_prompt = isinstance(cur.get("__image_prompt__"), str) and cur["__image_prompt__"].strip()
                    has_url = isinstance(cur.get("__image_url__"), str) and cur["__image_url__"].strip()
                    if not has_prompt and not has_url:
                        cur["__image_prompt__"] = _derive_item_prompt(item, ip, title_fallback)
                    item[ip] = cur
                for icp in icon_props:
                    cur = item.get(icp)
                    if not isinstance(cur, dict):
                        cur = {}
                    cur.setdefault("__icon_url__", "")
                    if not (isinstance(cur.get("__icon_query__"), str) and cur["__icon_query__"].strip()):
                        label = ""
                        for k in ("title", "heading", "name", "label"):
                            v = item.get(k)
                            if isinstance(v, str) and v.strip():
                                label = v.strip()[:40]
                                break
                        cur["__icon_query__"] = label or (title_fallback[:40] if title_fallback else "idea")
                    item[icp] = cur
                new_arr.append(item)
            content[key] = new_arr
    except Exception:
        pass
    return content


def _outline_title_and_body(outline_text: str) -> tuple[str, str]:
    text = re.sub(r"\s+", " ", str(outline_text or "")).strip()
    if not text:
        return "Punto clave", "Explicacion breve del tema para la clase."
    parts = re.split(r"[.:;-]", text, maxsplit=1)
    title = (parts[0] or text)[:70].strip() or "Punto clave"
    body = (parts[1] if len(parts) > 1 else text)[:180].strip() or text[:180]
    return title, body


def _ensure_non_empty_slide_content(content, response_schema, outline_text: str):
    if not isinstance(content, dict):
        content = {}
    out = dict(content)
    title, body = _outline_title_and_body(outline_text)

    def has_visible_text(value) -> bool:
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, list):
            return any(has_visible_text(v) for v in value)
        if isinstance(value, dict):
            return any(has_visible_text(v) for v in value.values())
        return value is not None

    if any(has_visible_text(v) for k, v in out.items() if not str(k).startswith("__")):
        return out

    props = response_schema.get("properties", {}) if isinstance(response_schema, dict) else {}
    for key in props:
        lower = key.lower()
        if "title" in lower or "heading" in lower:
            out[key] = title
        elif "description" in lower or "content" in lower or "body" in lower or "text" in lower:
            out[key] = body
        elif props.get(key, {}).get("type") == "array":
            out[key] = [{"title": title, "description": body}]
    out.setdefault("title", title)
    out.setdefault("description", body)
    return out


def _fallback_slide_content(response_schema, outline_text: str):
    content = _ensure_non_empty_slide_content({}, response_schema, outline_text)
    normalized = normalize_content_for_editor(_normalize_slide_content(content, response_schema))
    return _reconcile_image_prompts(normalized, response_schema, outline_text)


def _split_editor_items(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    text = str(value).strip()
    if not text:
        return []
    parts = [
        p.strip(" -\t\r\n")
        for p in re.split(r"\n+|;|,(?=\s*[A-ZÁÉÍÓÚÑ0-9])", text)
        if p.strip(" -\t\r\n")
    ]
    return parts or [text]


def _editor_item_to_object(field: str, item, idx: int, parent: dict) -> dict:
    if isinstance(item, dict):
        out = dict(item)
    else:
        title = str(item).strip() or f"Elemento {idx + 1}"
        parent_description = str(parent.get("description") or parent.get("content") or "").strip()
        out = {
            "title": title[:60],
            "description": parent_description[:100] or f"Punto clave sobre {title}",
        }

    out["title"] = str(out.get("title") or f"Elemento {idx + 1}").strip()[:60]
    out["description"] = str(
        out.get("description") or out.get("text") or out.get("content") or out["title"]
    ).strip()[:140]

    # Several Presenton React layouts dereference bullet.icon.__icon_url__
    # directly. Keep a valid object even when the LLM omitted it.
    if field in {"bulletPoints", "problemCategories", "categories", "items", "steps"}:
        icon = out.get("icon")
        if not isinstance(icon, dict):
            out["icon"] = {"__icon_url__": "", "__icon_query__": out["title"][:40]}
        else:
            icon.setdefault("__icon_url__", "")
            icon.setdefault("__icon_query__", out["title"][:40])

    return out


def normalize_content_for_editor(content):
    if not isinstance(content, dict):
        return content

    out = dict(content)
    for field in ("problemCategories", "bulletPoints", "categories", "items", "steps"):
        if field in out and not isinstance(out[field], list):
            raw_items = _split_editor_items(out[field])
            out[field] = [
                _editor_item_to_object(field, item, idx, out)
                for idx, item in enumerate(raw_items)
            ]
        elif field in out and isinstance(out[field], list):
            out[field] = [
                _editor_item_to_object(field, item, idx, out)
                for idx, item in enumerate(out[field])
            ]

    return out


def get_system_prompt(
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    response_schema: Optional[dict] = None,
):
    markdown_emphasis_rules = (
        "- Strictly use markdown to emphasize important points, by bolding or "
        "italicizing the part of text."
    )

    user_instructions = f"# User Instructions:\n{instructions}" if instructions else ""
    tone_instructions = (
        f"# Tone Instructions:\nMake slide as {tone} as possible." if tone else ""
    )

    verbosity_instructions = ""
    if verbosity:
        verbosity_instructions = "# Verbosity Instructions:\n"
        if verbosity == "concise":
            verbosity_instructions += "Make slide as concise as possible."
        elif verbosity == "standard":
            verbosity_instructions += "Make slide as standard as possible."
        elif verbosity == "text-heavy":
            verbosity_instructions += "Make slide as text-heavy as possible."

    output_fields_instructions = "# Output Fields:\n" + _get_schema_markdown(
        response_schema
    )

    return SLIDE_CONTENT_SYSTEM_PROMPT.format(
        markdown_emphasis_rules=markdown_emphasis_rules,
        user_instructions=user_instructions,
        tone_instructions=tone_instructions,
        verbosity_instructions=verbosity_instructions,
        output_fields_instructions=output_fields_instructions,
    )


def get_user_prompt(outline: str, language: Optional[str]):
    return SLIDE_CONTENT_USER_PROMPT.format(
        current_date_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        language=_resolve_prompt_language(language),
        content=outline,
    )


def get_messages(
    outline: str,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
    response_schema: Optional[dict] = None,
) -> list[Message]:

    return [
        SystemMessage(
            content=get_system_prompt(
                tone,
                verbosity,
                instructions,
                response_schema,
            ),
        ),
        UserMessage(
            content=get_user_prompt(outline, language),
        ),
    ]


async def get_slide_content_from_type_and_outline(
    slide_layout: SlideLayoutModel,
    outline: SlideOutlineModel,
    language: Optional[str],
    tone: Optional[str] = None,
    verbosity: Optional[str] = None,
    instructions: Optional[str] = None,
):
    client = get_client(config=get_llm_config())
    model = get_model()

    response_schema = remove_fields_from_schema(
        slide_layout.json_schema, ["__image_url__", "__icon_url__"]
    )
    response_schema = add_field_in_schema(
        response_schema,
        {
            "__speaker_note__": {
                "type": "string",
                "minLength": 100,
                "maxLength": 250,
                "description": "Speaker note for the slide",
            }
        },
        True,
    )

    try:
        response_format = JSONSchemaResponse(
            name="response",
            json_schema=response_schema,
            strict=False,
        )
        messages = get_messages(
            outline.content,
            language,
            tone,
            verbosity,
            instructions,
            response_schema,
        )

        # 2s era demasiado agresivo: mandaba casi todas las slides al fallback
        # genérico. Damos tiempo real al LLM para producir contenido de calidad;
        # el fallback queda solo como red de seguridad ante un cuelgue real.
        timeout = float(os.getenv("PRESENTON_SLIDE_CONTENT_TIMEOUT", "75"))
        max_attempts = max(1, int(os.getenv("PRESENTON_SLIDE_CONTENT_ATTEMPTS", "2")))

        for attempt in range(max_attempts):
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        client.generate,
                        **get_generate_kwargs(
                            model=model,
                            messages=messages,
                            response_format=response_format,
                        ),
                    ),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                print(
                    f"[slide-content-fallback] timeout after {timeout}s "
                    f"attempt={attempt + 1}/{max_attempts}"
                )
                if attempt >= max_attempts - 1:
                    return _fallback_slide_content(response_schema, outline.content)
                continue

            content = extract_structured_content(response.content)
            if content is not None:
                # Forzar tipos del schema (arrays = listas) para que el editor
                # no crashee con "a.map is not a function".
                content = _ensure_non_empty_slide_content(
                    content,
                    response_schema,
                    outline.content,
                )
                normalized = normalize_content_for_editor(
                    _normalize_slide_content(content, response_schema)
                )
                return _reconcile_image_prompts(
                    normalized, response_schema, outline.content
                )

            if attempt < max_attempts - 1:
                await asyncio.sleep(0.5 * (attempt + 1))

        print("[slide-content-fallback] empty model response")
        return _fallback_slide_content(response_schema, outline.content)

    except Exception as e:
        raise handle_llm_client_exceptions(e)
