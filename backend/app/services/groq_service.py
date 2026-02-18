import json
from groq import Groq
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.models import APIUsageLog

settings = get_settings()

client = Groq(api_key=settings.GROQ_API_KEY)

# Model assignments per task
MODELS = {
    "grading": "llama-3.3-70b-versatile",
    "exam_generation": "meta-llama/llama-4-maverick-17b-128e-instruct",
    "rag_chat": "meta-llama/llama-4-scout-17b-16e-instruct",
    "classification": "llama-3.1-8b-instant",
}


async def _log_usage(task: str, model: str, usage):
    """Log API usage to the database."""
    try:
        async with AsyncSessionLocal() as session:
            log = APIUsageLog(
                model=model,
                task=task,
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                total_tokens=getattr(usage, "total_tokens", 0) or 0,
            )
            session.add(log)
            await session.commit()
    except Exception:
        pass  # Don't break functionality if logging fails


async def generate_exam(tema: str, nivel: str, distribucion: dict, contenido_base: str = "") -> dict:
    """Generate an exam using Groq LLM."""
    system_prompt = f"""Eres un experto en pedagogía y diseño de evaluaciones.
Genera un examen en formato JSON ESTRICTAMENTE siguiendo este schema.
NO agregues texto fuera del JSON. NO uses markdown.
Cada pregunta debe tener numeración clara (1., 2., 3...).
Las opciones de selección múltiple deben usar formato A) B) C) D).
Incluye la respuesta correcta en el campo 'respuesta_correcta' (NO visible en la version estudiante).
Ajusta la dificultad al nivel: {nivel}.
Tema: {tema}
Distribución: {json.dumps(distribucion, ensure_ascii=False)}

Schema JSON requerido:
{{
  "titulo": "string",
  "preguntas": [
    {{
      "numero": int,
      "tipo": "seleccion_multiple|verdadero_falso|respuesta_corta|desarrollo|crucigrama|sopa_letras",
      "enunciado": "string",
      "opciones": ["A) ...", "B) ...", "C) ...", "D) ..."],  // solo para seleccion_multiple
      "respuesta_correcta": "string",
      "puntos": float,
      "nivel_bloom": "recordar|comprender|aplicar|analizar|evaluar|crear"
    }}
  ],
  "crucigrama": {{  // solo si se solicita
    "grid": [[]], "pistas_horizontal": [], "pistas_vertical": []
  }},
  "sopa_letras": {{  // solo si se solicita
    "grid": [[]], "palabras": []
  }}
}}"""

    user_msg = f"Genera el examen basándote en el siguiente contenido:\n\n{contenido_base}" if contenido_base else "Genera el examen."

    chat = client.chat.completions.create(
        model=MODELS["exam_generation"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.7,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    await _log_usage("exam_generation", MODELS["exam_generation"], chat.usage)
    response_text = chat.choices[0].message.content
    return json.loads(response_text)


async def grade_exam(
    respuestas_estudiante: list[dict],
    clave_respuestas: list[dict],
    rubrica: str = "",
) -> dict:
    """Grade exam responses using Groq LLM."""
    system_prompt = """Eres un calificador académico experto y justo.
Califica cada respuesta del estudiante comparándola con la clave de respuestas.
Asigna una nota parcial si la respuesta es parcialmente correcta.
Proporciona retroalimentación constructiva y específica para cada pregunta.

Responde ÚNICAMENTE con JSON válido siguiendo este schema exacto:
{
  "nota_total": float,
  "nota_maxima": float,
  "preguntas": [
    {
      "numero": int,
      "respuesta_estudiante": "string",
      "respuesta_correcta": "string",
      "nota": float,
      "nota_maxima": float,
      "retroalimentacion": "string",
      "correcto": boolean
    }
  ]
}"""

    user_msg = f"""Respuestas del estudiante:
{json.dumps(respuestas_estudiante, ensure_ascii=False, indent=2)}

Clave de respuestas:
{json.dumps(clave_respuestas, ensure_ascii=False, indent=2)}

Rúbrica adicional: {rubrica if rubrica else "Calificación estándar"}"""

    chat = client.chat.completions.create(
        model=MODELS["grading"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    await _log_usage("grading", MODELS["grading"], chat.usage)
    response_text = chat.choices[0].message.content
    return json.loads(response_text)


async def rag_chat(
    user_message: str,
    exam_context: str,
    student_answers: str,
    feedback: str,
    conversation_history: list[dict] | None = None,
) -> str:
    """RAG chatbot limited to student's exam context with full conversation history."""
    system_prompt = f"""Eres un asistente pedagógico experto y amigable llamado "Xali".
Tu ÚNICA fuente de información es el examen del estudiante y sus resultados.

CONTEXTO DEL EXAMEN:
{exam_context}

RESPUESTAS DEL ESTUDIANTE:
{student_answers}

RETROALIMENTACIÓN DEL PROFESOR/IA:
{feedback}

TU ROL Y COMPORTAMIENTO:
1. Explica de forma CLARA y PRÁCTICA por qué las respuestas del estudiante estuvieron mal o bien.
2. Muestra cuál era el proceso correcto para llegar a la respuesta correcta, paso a paso.
3. Usa ejemplos sencillos y analogías para que el estudiante entienda fácilmente.
4. Si una respuesta fue correcta, felicita al estudiante y refuerza el concepto.
5. Si fue incorrecta, explica el error específico y guía al estudiante a entender la lógica correcta.
6. Puedes revelar las respuestas correctas SOLO después de explicar el proceso y razonamiento.
7. Sé motivador y constructivo. Nunca hagas sentir mal al estudiante.
8. Responde SOLO sobre el contexto del examen. Si preguntan algo fuera del tema, indica amablemente que solo puedes ayudar con este examen.
9. Mantén respuestas concisas pero completas. Usa listas y formato claro.
10. Recuerda la conversación previa para dar continuidad y no repetirte."""

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (last 20 messages max to stay within context window)
    if conversation_history:
        for msg in conversation_history[-20:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    chat = client.chat.completions.create(
        model=MODELS["rag_chat"],
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
    )
    await _log_usage("rag_chat", MODELS["rag_chat"], chat.usage)
    return chat.choices[0].message.content


async def classify_writing(text_sample: str) -> str:
    """Classify if text is handwritten or printed."""
    chat = client.chat.completions.create(
        model=MODELS["classification"],
        messages=[
            {"role": "system", "content": "Clasifica si el siguiente texto extraído proviene de escritura manuscrita o texto impreso/digital. Responde SOLO con 'manuscrito' o 'impreso'."},
            {"role": "user", "content": text_sample},
        ],
        temperature=0,
        max_tokens=10,
    )
    await _log_usage("classification", MODELS["classification"], chat.usage)
    result = chat.choices[0].message.content.strip().lower()
    return "manuscrito" if "manuscrito" in result else "impreso"
