import asyncio
import json
import math
import os
from typing import Optional

from fastapi import HTTPException
from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage
from models.presentation_layout import PresentationLayoutModel
from models.presentation_outline_model import PresentationOutlineModel
from utils.llm_config import get_llm_config
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_utils import extract_structured_content, get_generate_kwargs
from utils.llm_provider import get_model
from utils.get_dynamic_models import get_presentation_structure_model_with_n_slides
from models.presentation_structure_model import PresentationStructureModel


STRUCTURE_FROM_SLIDES_MARKDOWN_SYSTEM_PROMPT = """
You will be given available slide layouts and content for each slide.
You need to select a layout for each slide based on the mentioned guidelines.

# Steps
1. Analyze all available slide layouts.
2. Analyze content for each slide.
3. Select a layout for each slide one by one by following the selection rules.

# Analyzing Slide Layouts
- Identify what each layout contains based on provided schema markdown.

# Analyzing Content
- Identify how the content is structured.
- Identify if the content contains tables.

# Selection Rules
- If content contains table, then select either table layout or graph layout.
- Don't select layout with image unless content contains image.
- Don't select table layout if content does not contain table.
- You are allowed to select same layout for multiple slides.

# Table Layout Selection Rules
- Must select table layout if the content contains table with text data.
- Must only select a layout with table if the table only contains text data.

# Graph Layout Selection Rules
- Must only select a layout with chart if the content contains table with numeric data.
- Identify how many columns are present in the table.
- Must select a layout that supports n-1 charts for n columns.
- Must prioritize layouts that support multiple charts.
- Don't select metrics layout for content containing table with numeric data.
- For example, if content contains table with 3 columns, then select a layout that supports 2 charts.

{user_instructions}

# Output Rules: 
- One layout index for each slide in json array format.
- Example: [0, 1, 2, 3, 4]

{presentation_layout}
"""


GET_MESSAGES_SYSTEM_PROMPT = """
You're a professional presentation designer with creative freedom to design engaging presentations.

# DESIGN PHILOSOPHY
- Create visually compelling and varied presentations
- Match layout to content purpose and audience needs

# Layout Selection Guidelines
1. **Content-driven choices**: Let the slide's purpose guide layout selection
- Opening/closing → Title layouts
- Processes/workflows → Visual process layouts  
- Comparisons/contrasts → Side-by-side layouts
- Data/metrics → Chart/graph layouts
- Concepts/ideas → Image + text layouts
- Key insights → Emphasis layouts

2. **Visual variety**: Aim for diverse slide layouts across the presentation. 
- Don't use same layout for multiple slides unless necessary.
- Mix text-heavy and visual-heavy slides naturally
- Use your judgment on when repetition serves the content
- Balance information density across slides
- Adjacent slide layouts should be different unless instructed/necessary otherwise.

3. **Audience experience**: Consider how slides work together
- Create natural transitions between topics

4. **Table of contents**:
- Must only use table of contents layout if slide content contains table of contents.

{user_instruction_header}

User instruction should be taken into account while creating the presentation structure, except for number of slides.

Select layout index for each of the {n_slides} slides based on what will best serve the presentation's goals. Output must be valid json.

"""


def get_messages(
    presentation_layout: PresentationLayoutModel,
    n_slides: int,
    data: str,
    instructions: Optional[str] = None,
) -> list[Message]:
    system_prompt = GET_MESSAGES_SYSTEM_PROMPT.format(
        user_instruction_header="# User Instruction:" if instructions else "",
        n_slides=n_slides,
    )

    return [
        SystemMessage(content=system_prompt),
        UserMessage(
            content=(
                f"{presentation_layout.to_string()}\n\n"
                "--------------------------------------\n\n"
                f"{data}"
            )
        ),
    ]


def get_messages_for_slides_markdown(
    presentation_layout: PresentationLayoutModel,
    n_slides: int,
    data: str,
    instructions: Optional[str] = None,
) -> list[Message]:
    system_prompt = STRUCTURE_FROM_SLIDES_MARKDOWN_SYSTEM_PROMPT.format(
        user_instructions=instructions or "",
        presentation_layout=presentation_layout.to_string(),
    )

    return [SystemMessage(content=system_prompt), UserMessage(content=data)]


def _layout_has_image(presentation_layout: PresentationLayoutModel, idx: int) -> bool:
    try:
        return "image" in json.dumps(
            presentation_layout.slides[idx].json_schema
        ).lower()
    except Exception:
        return False


def _count_images_in_schema(node, root, in_array: bool = False, depth: int = 0):
    """Devuelve (campos_imagen_simples, hay_imagen_dentro_de_array).

    Recorre el json_schema (resolviendo $ref) para distinguir un layout de UNA
    sola imagen de uno con MÚLTIPLES/ARRAY de imágenes (galerías, members...),
    que son costosos (varias llamadas a la API) y propensos al crash del editor.
    """
    if depth > 14 or not isinstance(node, dict):
        return (0, False)
    if "$ref" in node:
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/"):
            tgt = root
            for part in ref[2:].split("/"):
                tgt = tgt.get(part, {}) if isinstance(tgt, dict) else {}
            node = tgt if isinstance(tgt, dict) else {}
    single, arr_img = 0, False
    props = node.get("properties")
    if isinstance(props, dict):
        if "__image_prompt__" in props or "__image_url__" in props:
            # Este nodo ES un objeto-imagen; no recursamos en sus sub-props.
            if in_array:
                arr_img = True
            else:
                single += 1
        else:
            for v in props.values():
                s, a = _count_images_in_schema(v, root, in_array, depth + 1)
                single += s
                arr_img = arr_img or a
    items = node.get("items")
    if isinstance(items, dict):
        s, a = _count_images_in_schema(items, root, True, depth + 1)
        single += s
        arr_img = arr_img or a
    for key in ("anyOf", "oneOf", "allOf"):
        for v in (node.get(key) or []):
            s, a = _count_images_in_schema(v, root, in_array, depth + 1)
            single += s
            arr_img = arr_img or a
    return (single, arr_img)


def _layout_is_clean_single_image(presentation_layout: PresentationLayoutModel, idx: int) -> bool:
    """Layout con exactamente UNA imagen y sin arrays de imágenes (ideal educativo)."""
    try:
        schema = presentation_layout.slides[idx].json_schema
        single, arr_img = _count_images_in_schema(schema, schema)
        return single == 1 and not arr_img
    except Exception:
        return False


def _layout_is_image_heavy(presentation_layout: PresentationLayoutModel, idx: int) -> bool:
    """Layout con varias imágenes o un array de imágenes (a evitar)."""
    try:
        schema = presentation_layout.slides[idx].json_schema
        single, arr_img = _count_images_in_schema(schema, schema)
        return arr_img or single > 1
    except Exception:
        return False


def _fallback_structure(
    presentation_outline: PresentationOutlineModel,
    presentation_layout: PresentationLayoutModel,
) -> PresentationStructureModel:
    n = len(presentation_outline.slides)
    total_layouts = len(presentation_layout.slides)
    if total_layouts <= 0:
        return PresentationStructureModel(slides=[0 for _ in range(n)])

    image_layouts = [i for i in range(total_layouts) if _layout_has_image(presentation_layout, i)]
    non_image_layouts = [i for i in range(total_layouts) if not _layout_has_image(presentation_layout, i)]
    single_image_layouts = [i for i in image_layouts if _layout_is_clean_single_image(presentation_layout, i)]
    preferred_image_layouts = single_image_layouts or image_layouts
    text_layout = non_image_layouts[0] if non_image_layouts else 0
    slides: list[int] = []
    image_count = 0
    image_target = max(1, math.ceil(n / 2))
    for idx in range(n):
        if preferred_image_layouts and idx % 2 == 0 and image_count < image_target:
            slides.append(preferred_image_layouts[image_count % len(preferred_image_layouts)])
            image_count += 1
        else:
            slides.append(text_layout)
    return PresentationStructureModel(slides=slides)


async def generate_presentation_structure(
    presentation_outline: PresentationOutlineModel,
    presentation_layout: PresentationLayoutModel,
    instructions: Optional[str] = None,
    using_slides_markdown: bool = False,
) -> PresentationStructureModel:
    client = get_client(config=get_llm_config())
    model = get_model()
    response_model = get_presentation_structure_model_with_n_slides(
        len(presentation_outline.slides)
    )

    try:
        messages = (
            get_messages_for_slides_markdown(
                presentation_layout,
                len(presentation_outline.slides),
                presentation_outline.to_string(),
                instructions,
            )
            if using_slides_markdown
            else get_messages(
                presentation_layout,
                len(presentation_outline.slides),
                presentation_outline.to_string(),
                instructions,
            )
        )
        response_format = JSONSchemaResponse(
            name="response",
            json_schema=response_model.model_json_schema(),
            strict=True,
        )

        timeout = float(os.getenv("PRESENTON_STRUCTURE_TIMEOUT", "6"))
        max_attempts = max(1, int(os.getenv("PRESENTON_STRUCTURE_ATTEMPTS", "1")))

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
            except Exception as exc:
                print(
                    f"[structure-fallback] {type(exc).__name__} after {timeout}s "
                    f"attempt={attempt + 1}/{max_attempts}"
                )
                if attempt >= max_attempts - 1:
                    return _fallback_structure(presentation_outline, presentation_layout)
                continue
            content = extract_structured_content(response.content)
            if content is not None:
                # Normalize various LLM output formats to {"slides": [int, ...]}
                def _to_int(v):
                    try: return int(v)
                    except: return None
                normalized = None
                if isinstance(content, list):
                    # [{"slide_number": 1, "layout_index": 4, ...}, ...]
                    if content and isinstance(content[0], dict):
                        idxs = [_to_int(item.get("layout_index", item.get("layout", item.get("index")))) for item in content]
                        normalized = {"slides": [i for i in idxs if i is not None]}
                    else:
                        normalized = {"slides": [_to_int(v) for v in content if _to_int(v) is not None]}
                elif isinstance(content, dict):
                    if "slides" in content:
                        raw_slides = content["slides"]
                        if raw_slides and isinstance(raw_slides[0], dict):
                            idxs = [_to_int(s.get("layout_index", s.get("index", s.get("layout")))) for s in raw_slides]
                            normalized = {"slides": [i for i in idxs if i is not None]}
                        else:
                            normalized = content
                    elif any(k.startswith("slide_") for k in content):
                        sorted_keys = sorted(k for k in content if k.startswith("slide_"))
                        vals = []
                        for k in sorted_keys:
                            v = content[k]
                            if isinstance(v, dict):
                                vals.append(_to_int(v.get("layout_index", v.get("index"))))
                            else:
                                vals.append(_to_int(v))
                        normalized = {"slides": [i for i in vals if i is not None]}
                    else:
                        # Flatten any nested list values
                        for v in content.values():
                            if isinstance(v, list):
                                if v and isinstance(v[0], dict):
                                    idxs = [_to_int(s.get("layout_index", s.get("index"))) for s in v]
                                    normalized = {"slides": [i for i in idxs if i is not None]}
                                else:
                                    normalized = {"slides": [_to_int(x) for x in v if _to_int(x) is not None]}
                                break
                if normalized is None:
                    normalized = content
                # Garantiza exactamente n_slides índices de layout válidos:
                # el LLM a veces devuelve menos (IndexError aguas abajo) o más.
                n = len(presentation_outline.slides)
                slides_list = normalized.get("slides") if isinstance(normalized, dict) else None
                if not isinstance(slides_list, list):
                    slides_list = []
                slides_list = [s for s in slides_list if isinstance(s, int)]
                if len(slides_list) < n:
                    pad = slides_list[-1] if slides_list else 0
                    slides_list = slides_list + [pad] * (n - len(slides_list))
                slides_list = slides_list[:n]

                # Image density: around 1 image layout every 2 slides.
                # If an image layout exceeds the target, switch to a text layout.
                total_layouts = len(presentation_layout.slides)
                slides_list = [i if 0 <= i < total_layouts else 0 for i in slides_list]

                image_layouts = [i for i in range(total_layouts) if _layout_has_image(presentation_layout, i)]
                non_image_layouts = [i for i in range(total_layouts) if not _layout_has_image(presentation_layout, i)]
                # Preferimos layouts de UNA sola imagen (limpios, baratos, sin riesgo
                # de array de imágenes incompleto que crashea el editor).
                single_image_layouts = [i for i in image_layouts if _layout_is_clean_single_image(presentation_layout, i)]
                preferred_image_layouts = single_image_layouts or image_layouts
                if image_layouts and non_image_layouts:
                    fallback = non_image_layouts[0]
                    target_images = max(1, math.ceil(n / 2))
                    used = 0
                    for j, idx in enumerate(slides_list):
                        wants_image = (j % 2 == 0) and used < target_images
                        if wants_image:
                            # Forzamos layout de 1 sola imagen si la slide no tiene
                            # imagen o si es multi-imagen/array (costoso y frágil).
                            if not _layout_has_image(presentation_layout, idx) or _layout_is_image_heavy(presentation_layout, idx):
                                slides_list[j] = preferred_image_layouts[used % len(preferred_image_layouts)]
                            used += 1
                        elif _layout_has_image(presentation_layout, idx):
                            slides_list[j] = fallback

                normalized["slides"] = slides_list
                return PresentationStructureModel(**normalized)

            if attempt < max_attempts - 1:
                await asyncio.sleep(0.5 * (attempt + 1))

        print("[structure-fallback] empty model response")
        return _fallback_structure(presentation_outline, presentation_layout)
    except Exception as e:
        raise handle_llm_client_exceptions(e)
