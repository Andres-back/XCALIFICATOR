import asyncio
import time

from app.core.ai_provider_config import get_global_ai_config
from app.core.database import AsyncSessionLocal
from app.services.groq_service import generate_exam
from app.services.open_code_service import open_code_chat_json


MODELS = [
    "DeepSeek V4 Flash",
    "MiMo-V2.5",
    "MiniMax M2.7",
    "Qwen3.7 Plus",
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        cfg = await get_global_ai_config(db)

    base_url = cfg.get("open_code_base_url")
    api_key = cfg.get("open_code_api_key")
    print(f"open_code_configured={bool(base_url and api_key)}")
    print(f"base_url_present={bool(base_url)} api_key_present={bool(api_key)}")
    if not base_url or not api_key:
        return

    messages = [
        {
            "role": "system",
            "content": "Responde solo JSON valido.",
        },
        {
            "role": "user",
            "content": (
                "Genera un mini objeto JSON para una actividad docente: "
                '{"titulo": string, "objetivos": [string], "pasos": [string]}. '
                "Usa maximo 3 pasos."
            ),
        },
    ]

    for model in MODELS:
        started = time.perf_counter()
        try:
            result = await open_code_chat_json(
                model=model,
                base_url=base_url,
                api_key=api_key,
                messages=messages,
                temperature=0.2,
                max_tokens=500,
            )
            elapsed = round(time.perf_counter() - started, 2)
            keys = ",".join(sorted(result.keys()))
            print(f"{model}: ok {elapsed}s keys={keys}")
        except Exception as exc:
            elapsed = round(time.perf_counter() - started, 2)
            print(f"{model}: error {elapsed}s {exc.__class__.__name__}: {str(exc)[:180]}")

    started = time.perf_counter()
    try:
        exam = await generate_exam(
            tema="ciclo del agua",
            nivel="facil",
            grado="6",
            distribucion={"seleccion_multiple": 2, "respuesta_corta": 1},
            contenido_base="",
            provider_config=cfg,
        )
        elapsed = round(time.perf_counter() - started, 2)
        preguntas = exam.get("preguntas") if isinstance(exam, dict) else []
        print(f"generate_exam_path: ok {elapsed}s preguntas={len(preguntas) if isinstance(preguntas, list) else 0}")
    except Exception as exc:
        elapsed = round(time.perf_counter() - started, 2)
        print(f"generate_exam_path: error {elapsed}s {exc.__class__.__name__}: {str(exc)[:180]}")


if __name__ == "__main__":
    asyncio.run(main())
