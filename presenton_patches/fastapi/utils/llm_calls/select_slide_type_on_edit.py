import asyncio
from fastapi import HTTPException
from llmai import get_client
from llmai.shared import JSONSchemaResponse, Message, SystemMessage, UserMessage
from models.presentation_layout import PresentationLayoutModel, SlideLayoutModel
from models.slide_layout_index import SlideLayoutIndex
from models.sql.slide import SlideModel
from utils.llm_config import get_llm_config
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_utils import extract_structured_content, get_generate_kwargs
from utils.llm_provider import get_model


def get_messages(
    prompt: str,
    slide_data: dict,
    layout: PresentationLayoutModel,
    current_slide_layout: int,
    memory_context: str = "",
) -> list[Message]:
    memory_block = (
        f"\n# Retrieved Presentation Memory Context\n{memory_context}\n"
        if memory_context
        else ""
    )

    return [
        SystemMessage(
            content=f"""
Select a Slide Layout index based on provided user prompt and current slide data.
{layout.to_string()}
{memory_block}

# Output
- Return valid JSON with this exact shape: {{"index": 0}}
- The index must be one of the available slide layout indexes.

# Notes
- Do not select a different slide layout than current unless the user prompt needs it.
- If the prompt is not clear, select the layout most relevant to the current slide data.
""",
        ),
        UserMessage(
            content=f"""
- User Prompt: {prompt}
- Current Slide Data: {slide_data}
- Current Slide Layout: {current_slide_layout}
""",
        ),
    ]


def _coerce_layout_index(content, current_index: int, max_index: int) -> int | None:
    def to_int(value):
        try:
            return int(value)
        except Exception:
            return None

    candidate = None
    if isinstance(content, dict):
        for key in (
            "index",
            "selected_layout",
            "layout_index",
            "layout",
            "selectedLayout",
            "selected_layout_index",
        ):
            if key in content:
                candidate = to_int(content.get(key))
                break
        if candidate is None and isinstance(content.get("slide"), dict):
            candidate = _coerce_layout_index(content["slide"], current_index, max_index)
    elif isinstance(content, list) and content:
        first = content[0]
        candidate = _coerce_layout_index(first, current_index, max_index)
    else:
        candidate = to_int(content)

    if candidate is None:
        return None
    if candidate < 0 or candidate > max_index:
        return current_index if 0 <= current_index <= max_index else None
    return candidate


async def get_slide_layout_from_prompt(
    prompt: str,
    layout: PresentationLayoutModel,
    slide: SlideModel,
    memory_context: str = "",
) -> SlideLayoutModel:
    client = get_client(config=get_llm_config())
    model = get_model()

    slide_layout_index = layout.get_slide_layout_index(slide.layout)

    try:
        response_format = JSONSchemaResponse(
            name="response",
            json_schema=SlideLayoutIndex.model_json_schema(),
            strict=False,
        )
        messages = get_messages(
            prompt,
            slide.content,
            layout,
            slide_layout_index,
            memory_context,
        )

        for attempt in range(3):
            response = await asyncio.to_thread(
                client.generate,
                **get_generate_kwargs(
                    model=model,
                    messages=messages,
                    response_format=response_format,
                ),
            )
            content = extract_structured_content(response.content)
            if content is not None:
                index = _coerce_layout_index(
                    content,
                    slide_layout_index,
                    len(layout.slides) - 1,
                )
                if index is not None:
                    return layout.slides[index]

            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))

        return layout.slides[slide_layout_index]

    except Exception as e:
        raise handle_llm_client_exceptions(e)
