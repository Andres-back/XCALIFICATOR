import json
import re
from typing import Any, cast
import httpx
from groq import Groq
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.models import APIUsageLog

settings = get_settings()

client = Groq(api_key=settings.GROQ_API_KEY)

# Model assignments per task
MODELS = {
    "grading": "llama-3.3-70b-versatile",
    "exam_generation": "llama-3.3-70b-versatile",
    "rag_chat": "meta-llama/llama-4-scout-17b-16e-instruct",
    "classification": "llama-3.1-8b-instant",
}


def _grade_system_prompt() -> str:
    return """Eres un calificador académico experto y justo del sistema educativo colombiano.
Califica cada respuesta del estudiante comparándola con la clave de respuestas.
Si una pregunta llega sin respuesta_correcta, infiere la respuesta esperada usando enunciado/opciones y conocimiento académico del tema.
Cuando debas inferir respuesta_correcta, sé conservador, explica el criterio y evita sobrecalificar.
USA ESCALA DE CALIFICACIÓN COLOMBIANA: de 1.0 a 5.0 donde 5.0 es la nota máxima y 3.0 es el mínimo aprobatorio.
Asigna notas proporcionales: si una pregunta vale X puntos, la nota parcial debe estar entre 0 y X.
La nota_total debe ser la suma de las notas parciales de las preguntas evaluadas.
La nota_maxima debe ser la suma de los puntos de las preguntas evaluadas.
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


def _grade_user_message(
    respuestas_estudiante: list[dict],
    clave_respuestas: list[dict],
    rubrica: str,
) -> str:
    return f"""Respuestas del estudiante:
{json.dumps(respuestas_estudiante, ensure_ascii=False, indent=2)}

Clave de respuestas:
{json.dumps(clave_respuestas, ensure_ascii=False, indent=2)}

Rúbrica adicional: {rubrica if rubrica else "Calificación estándar"}"""


def _extract_json_from_text(raw_text: str) -> dict:
    if not raw_text:
        raise ValueError("Respuesta vacía del modelo")

    try:
        return json.loads(raw_text)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        raise ValueError("El modelo no devolvió JSON válido")
    return json.loads(match.group(0))


def _require_content(raw_text: str | None, context: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        raise ValueError(f"Respuesta vacia del modelo en {context}")
    return text


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_grade_result(result: dict, clave_respuestas: list[dict]) -> dict:
    if not isinstance(result, dict):
        raise ValueError("Respuesta de calificación inválida")

    preguntas_raw = result.get("preguntas")
    preguntas: list[dict] = cast(list[dict], preguntas_raw) if isinstance(preguntas_raw, list) else []
    key_by_num = {
        str(c.get("numero")): c
        for c in (clave_respuestas or [])
        if isinstance(c, dict) and c.get("numero") is not None
    }

    normalized_questions = []
    for p in preguntas:
        if not isinstance(p, dict):
            continue
        num = p.get("numero")
        key = key_by_num.get(str(num))

        nota_maxima = _safe_float(p.get("nota_maxima"), 0.0)
        if nota_maxima <= 0 and key:
            nota_maxima = _safe_float(key.get("puntos"), 0.0)

        nota = _safe_float(p.get("nota"), 0.0)
        if nota_maxima > 0:
            nota = max(0.0, min(nota, nota_maxima))

        normalized = dict(p)
        normalized["nota"] = round(nota, 2)
        if nota_maxima > 0:
            normalized["nota_maxima"] = round(nota_maxima, 2)
        normalized_questions.append(normalized)

    nota_total = sum(_safe_float(p.get("nota"), 0.0) for p in normalized_questions)
    nota_maxima_total = sum(_safe_float(p.get("nota_maxima"), 0.0) for p in normalized_questions)

    if nota_maxima_total <= 0 and clave_respuestas:
        nota_maxima_total = sum(
            _safe_float(c.get("puntos"), 0.0) for c in clave_respuestas if isinstance(c, dict)
        )

    result["preguntas"] = normalized_questions
    result["nota_total"] = round(nota_total, 2)
    if nota_maxima_total > 0:
        result["nota_maxima"] = round(nota_maxima_total, 2)
    return result


async def _grade_exam_ollama(
    respuestas_estudiante: list[dict],
    clave_respuestas: list[dict],
    rubrica: str = "",
    model: str | None = None,
    ollama_url: str = "http://host.docker.internal:11434",
    ollama_api_key: str | None = None,
) -> dict:
    selected_model = str(model or "").strip()
    if not selected_model:
        raise ValueError("No hay modelo Ollama configurado para calificación")

    payload = {
        "model": selected_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": _grade_system_prompt()},
            {
                "role": "user",
                "content": _grade_user_message(
                    respuestas_estudiante=respuestas_estudiante,
                    clave_respuestas=clave_respuestas,
                    rubrica=rubrica,
                ),
            },
        ],
    }

    base_url = (ollama_url or "").strip().rstrip("/")
    if not base_url:
        base_url = "http://host.docker.internal:11434"

    async with httpx.AsyncClient(timeout=90.0) as http_client:
        headers = {"Authorization": f"Bearer {ollama_api_key}"} if ollama_api_key else None
        response = await http_client.post(f"{base_url}/api/chat", json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()

    content = (((result or {}).get("message") or {}).get("content") or "").strip()
    parsed = _extract_json_from_text(content)
    return parsed


async def _grade_exam_groq(
    respuestas_estudiante: list[dict],
    clave_respuestas: list[dict],
    rubrica: str = "",
    model: str | None = None,
) -> dict:
    selected_model = (model or MODELS["grading"]).strip()
    chat = client.chat.completions.create(
        model=selected_model,
        messages=[
            {"role": "system", "content": _grade_system_prompt()},
            {
                "role": "user",
                "content": _grade_user_message(
                    respuestas_estudiante=respuestas_estudiante,
                    clave_respuestas=clave_respuestas,
                    rubrica=rubrica,
                ),
            },
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    await _log_usage("grading", selected_model, chat.usage)
    response_text = _require_content(chat.choices[0].message.content, "grade_exam_groq")
    return json.loads(response_text)


async def grade_exam_with_fallback(
    respuestas_estudiante: list[dict],
    clave_respuestas: list[dict],
    rubrica: str = "",
    provider_config: dict | None = None,
) -> dict:
    cfg = provider_config or {}
    primary_provider = str(cfg.get("grading_provider") or "groq").strip().lower()
    fallback_provider = cfg.get("grading_fallback_provider")
    fallback_provider = str(fallback_provider).strip().lower() if fallback_provider else None

    primary_model = str(
        cfg.get("grading_model")
        or (MODELS["grading"] if primary_provider == "groq" else "")
    ).strip()
    fallback_model = str(
        cfg.get("grading_fallback_model")
        or (MODELS["grading"] if fallback_provider == "groq" else "")
    ).strip()
    ollama_url = str(cfg.get("ollama_url") or "http://host.docker.internal:11434").strip()
    ollama_api_key = str(cfg.get("ollama_api_key") or "").strip() or None

    attempts: list[tuple[str, str]] = [(primary_provider, primary_model)]
    if fallback_provider and fallback_provider != "none":
        if fallback_provider != primary_provider or fallback_model != primary_model:
            attempts.append((fallback_provider, fallback_model))

    errors: list[str] = []
    for provider, model in attempts:
        try:
            if provider == "groq":
                result = await _grade_exam_groq(
                    respuestas_estudiante=respuestas_estudiante,
                    clave_respuestas=clave_respuestas,
                    rubrica=rubrica,
                    model=model,
                )
                return _normalize_grade_result(result, clave_respuestas)

            if provider == "ollama":
                result = await _grade_exam_ollama(
                    respuestas_estudiante=respuestas_estudiante,
                    clave_respuestas=clave_respuestas,
                    rubrica=rubrica,
                    model=model,
                    ollama_url=ollama_url,
                    ollama_api_key=ollama_api_key,
                )
                return _normalize_grade_result(result, clave_respuestas)

            raise ValueError(f"Proveedor de grading no soportado: {provider}")
        except Exception as exc:
            errors.append(f"{provider}({model}): {str(exc)}")

    raise RuntimeError("No fue posible calificar con proveedores configurados. " + " | ".join(errors))


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


async def generate_exam(tema: str, nivel: str, distribucion: dict, contenido_base: str = "", grado: str = "") -> dict:
    """Generate an exam using Groq LLM."""
    grado_instruccion = f"\nGrado escolar: {grado}. Adapta el vocabulario, complejidad y contenido al nivel cognitivo de este grado del sistema educativo colombiano." if grado else ""
    system_prompt = f"""Eres un experto en pedagogía y diseño de evaluaciones del sistema educativo colombiano.
Genera un examen en formato JSON ESTRICTAMENTE siguiendo este schema.
NO agregues texto fuera del JSON. NO uses markdown (excepto notación matemática).
Cada pregunta debe tener numeración clara (1., 2., 3...).
Las opciones de selección múltiple deben usar formato A) B) C) D).
Si el tema involucra matemáticas, física, química u otra materia con fórmulas, SIEMPRE escribe las fórmulas usando notación LaTeX: usa $...$ para fórmulas en línea y $$...$$ para fórmulas centradas. Ejemplos: $x^2 + y^2 = r^2$, $\\frac{{a}}{{b}}$, $\\sqrt{{x}}$, $\\int_0^1 x^2 dx$.
Reglas estrictas de formato matemático: NO uses notación ASCII como a/b, sqrt(x), sen(x) sin LaTeX o x**2; convierte todo a LaTeX válido (por ejemplo $\\frac{{a}}{{b}}$, $\\sqrt{{x}}$, $\\sin(x)$, $x^2$) y encierra SIEMPRE cada fórmula entre delimitadores $...$ o $$...$$.
Como la salida es JSON, recuerda escapar cada barra invertida en strings (ejemplo: para representar $\\frac{{1}}{{2}}$ en JSON debes escribir \\\\frac{{1}}{{2}}).
Si aparecen MATRICES, usa SIEMPRE notación LaTeX de matriz (por ejemplo $\\begin{{pmatrix}}1 & 2 \\\\ 3 & 4\\end{{pmatrix}}$) y NO uses formatos planos como (1 2 3 4).
Si aparecen LOGARITMOS, usa SIEMPRE $\\log_{{b}}(x)$ indicando base correctamente (ej: $\\log_{{2}}(8)$, $\\log_{{10}}(100)$).
Antes de responder, verifica coherencia matemática de cada pregunta: la respuesta_correcta debe ser consistente con el enunciado y opciones.
Incluye la respuesta correcta en el campo 'respuesta_correcta' (NO visible en la version estudiante).
Ajusta la dificultad al nivel: {nivel}.{grado_instruccion}
Tema: {tema}
Distribución: {json.dumps(distribucion, ensure_ascii=False)}

IMPORTANTE: La nota máxima del examen es 5.0 (escala colombiana 1.0-5.0). 
Distribuye los puntos entre las preguntas de modo que la SUMA TOTAL de puntos sea exactamente 5.0.

Schema JSON requerido:
{{
  "titulo": "string",
  "preguntas": [
    {{
      "numero": int,
      "tipo": "seleccion_multiple|verdadero_falso|respuesta_corta|desarrollo",
      "enunciado": "string",
      "opciones": ["A) ...", "B) ...", "C) ...", "D) ..."],  // solo para seleccion_multiple
      "respuesta_correcta": "string",
      "puntos": float,
      "nivel_bloom": "recordar|comprender|aplicar|analizar|evaluar|crear"
    }}
  ],
  "nota_maxima": 5.0
}}

NOTA: Solo genera preguntas de tipo seleccion_multiple, verdadero_falso, respuesta_corta o desarrollo.
NO generes crucigrama ni sopa_letras aquí."""

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
    response_text = _require_content(chat.choices[0].message.content, "generate_exam")
    return json.loads(response_text)


async def generate_sopa_letras(
    tema: str,
    nivel: str,
    num_palabras: int = 8,
    palabras_obligatorias: list[str] | None = None,
    contenido_base: str = "",
    grado: str = "",
) -> dict:
    """Generate a word search puzzle using Groq LLM."""
    grado_inst = f"\nGrado escolar: {grado}. Adapta las palabras al nivel cognitivo de este grado del sistema educativo colombiano." if grado else ""
    obligatorias_inst = ""
    if palabras_obligatorias:
        clean = [p.upper().replace(" ", "") for p in palabras_obligatorias if p.strip()]
        if clean:
            obligatorias_inst = f"\nPALABRAS OBLIGATORIAS que DEBEN aparecer en la sopa: {', '.join(clean)}. Completa el total con más palabras del tema."

    system_prompt = f"""Eres un experto en diseño de sopas de letras educativas.
Genera SOLAMENTE una sopa de letras en formato JSON. NO generes preguntas de examen.
NO agregues texto fuera del JSON. NO uses markdown.
Nivel: {nivel}.{grado_inst}
Tema: {tema}
Número de palabras a incluir: {num_palabras}{obligatorias_inst}

REGLAS OBLIGATORIAS:
1. La cuadrícula DEBE ser cuadrada de al menos 15x15 celdas.
2. TODAS las celdas deben tener exactamente UNA letra mayúscula sin excepción.
3. Las palabras se colocan en horizontal (izq→der), vertical (arriba→abajo), o diagonal.
4. Las palabras NO deben tener tildes, eñes ni caracteres especiales (ej: TELEFONO en vez de TELÉFONO, NINO en vez de NIÑO).
5. NINGUNA palabra debe quedar cortada ni salir de los límites de la cuadrícula.
6. La cuadrícula debe ser lo suficientemente grande para contener TODAS las palabras.
7. Las celdas no ocupadas por palabras se llenan con letras mayúsculas aleatorias.

Schema JSON EXACTO requerido:
{{
  "titulo": "string",
  "sopa_letras": {{
    "grid": [["A","B","C",...], ...],
    "size": int,
    "palabras": ["PALABRA1", "PALABRA2", ...],
    "ubicaciones": [
      {{"palabra": "PALABRA1", "fila": 0, "columna": 2, "direccion": "horizontal"}},
      {{"palabra": "PALABRA2", "fila": 3, "columna": 5, "direccion": "vertical"}}
    ]
  }}
}}"""

    user_msg = f"Genera la sopa de letras sobre: {tema}"
    if contenido_base:
        user_msg += f"\n\nContenido base:\n{contenido_base}"

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
    response_text = _require_content(chat.choices[0].message.content, "generate_sopa_letras")
    return json.loads(response_text)


async def generate_crucigrama(
    tema: str,
    nivel: str,
    num_horizontales: int = 5,
    num_verticales: int = 5,
    palabras_obligatorias: list[str] | None = None,
    contenido_base: str = "",
    grado: str = "",
) -> dict:
    """Generate a crossword puzzle using Groq LLM."""
    grado_inst = f"\nGrado escolar: {grado}. Adapta las pistas y palabras al nivel cognitivo de este grado del sistema educativo colombiano." if grado else ""
    obligatorias_inst = ""
    if palabras_obligatorias:
        clean = [p.upper().replace(" ", "") for p in palabras_obligatorias if p.strip()]
        if clean:
            obligatorias_inst = f"\nPALABRAS OBLIGATORIAS que DEBEN aparecer en el crucigrama: {', '.join(clean)}. Distribúyelas entre horizontales y verticales."

    system_prompt = f"""Eres un experto en crucigramas educativos.
Genera palabras y pistas para un crucigrama. La cuadrícula se construye automáticamente.
Nivel: {nivel}.{grado_inst}
Tema: {tema}
Genera {num_horizontales} palabras para horizontales y {num_verticales} para verticales.{obligatorias_inst}

REGLAS OBLIGATORIAS:
1. Las respuestas deben ser UNA SOLA PALABRA en MAYÚSCULA, sin tildes, sin espacios, sin Ñ.
2. Las palabras DEBEN compartir letras comunes (A, E, O, R, S, N, I, L, T, C) para que se crucen.
3. NO repitas la misma palabra en horizontales y verticales.
4. Cada pista debe ser una descripción clara y educativa.
5. NO generes grid, size, fila, columna ni longitud. Solo palabras y pistas.
6. Longitud recomendada por palabra: entre 4 y 8 letras (máximo 10).
7. Evita tecnicismos muy largos o palabras compuestas difíciles de cruzar.
8. Mantén equilibrio semántico: horizontales y verticales deben tener dificultad similar.

Responde SOLO con JSON válido:
{{
  "titulo": "string",
  "crucigrama": {{
    "pistas_horizontal": [
      {{"pista": "Descripción...", "respuesta": "PALABRA"}}
    ],
    "pistas_vertical": [
      {{"pista": "Descripción...", "respuesta": "PALABRA"}}
    ]
  }}
}}"""

    user_msg = f"Genera el crucigrama sobre: {tema}"
    if contenido_base:
        user_msg += f"\n\nContenido base:\n{contenido_base}"

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
    response_text = _require_content(chat.choices[0].message.content, "generate_crucigrama")
    return json.loads(response_text)


async def grade_exam(
    respuestas_estudiante: list[dict],
    clave_respuestas: list[dict],
    rubrica: str = "",
) -> dict:
    """Grade exam responses using Groq LLM."""
    result = await _grade_exam_groq(
        respuestas_estudiante=respuestas_estudiante,
        clave_respuestas=clave_respuestas,
        rubrica=rubrica,
    )
    return _normalize_grade_result(result, clave_respuestas)


async def rag_chat(
    user_message: str,
    exam_context: str,
    student_answers: str,
    feedback: str,
    conversation_history: list[dict] | None = None,
    model: str | None = None,
) -> str:
    """RAG chatbot limited to student's exam context with full conversation history."""
    selected_model = str(model or MODELS["rag_chat"]).strip() or MODELS["rag_chat"]

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
10. Recuerda la conversación previa para dar continuidad y no repetirte.
11. Cuando haya matemáticas/física/química, escribe SIEMPRE fórmulas con LaTeX válido: $...$ para inline y $$...$$ para bloques.
12. Evita notación plana como a/b, sqrt(x), x**2 o matrices tipo (1 2 3 4); conviértelo a LaTeX correcto.
13. Estructura cada respuesta con este formato amable:
    - **Diagnóstico breve**
    - **Procedimiento paso a paso**
    - **Resultado y verificación**
14. Si piden una gráfica, entrega una mini tabla de valores (en texto) + interpretación pedagógica del comportamiento; no inventes imágenes.
15. Si usas matrices o sistemas, usa notación LaTeX (ejemplo: $$\\begin{{pmatrix}}a & b \\\\ c & d\\end{{pmatrix}}$$)."""

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (last 20 messages max to stay within context window)
    if conversation_history:
        for msg in conversation_history[-20:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    chat = client.chat.completions.create(
        model=selected_model,
        messages=cast(Any, messages),
        temperature=0.3,
        max_tokens=1024,
    )
    await _log_usage("rag_chat", selected_model, chat.usage)
    return _require_content(chat.choices[0].message.content, "rag_chat")


def _truncate_for_classifier(text: str, max_chars: int = 1800) -> str:
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars] + "..."


async def classify_chat_relevance(
    user_message: str,
    exam_context: str,
    student_answers: str,
    feedback: str,
    conversation_history: list[dict] | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Classify whether a student's message is related to the active exam context."""
    selected_model = str(model or MODELS["classification"]).strip() or MODELS["classification"]

    recent_history: list[str] = []
    if conversation_history:
        for msg in conversation_history[-6:]:
            role = "estudiante" if msg.get("role") == "user" else "xali"
            content = _truncate_for_classifier(str(msg.get("content") or ""), 240)
            if content:
                recent_history.append(f"{role}: {content}")

    system_prompt = """Eres un clasificador binario de relevancia para un tutor académico.
Debes decidir si el mensaje del estudiante está RELACIONADO con su evaluación actual.

Marca is_exam_related=true SOLO si el mensaje trata sobre:
- preguntas, respuestas, conceptos, procedimientos o errores del examen
- retroalimentación, nota o desempeño de esa evaluación
- dudas de estudio directamente vinculadas al contenido evaluado

Marca is_exam_related=false si el mensaje pide o conversa sobre temas ajenos:
- recetas, entretenimiento, deportes, chistes, tecnología no académica, vida personal, etc.

Responde ÚNICAMENTE JSON válido con este schema exacto:
{
  "is_exam_related": boolean,
  "confidence": float,
  "reason": "string corto"
}
"""

    payload = {
        "mensaje_estudiante": str(user_message or ""),
        "historial_reciente": recent_history,
        "contexto_examen": _truncate_for_classifier(exam_context, 3000),
        "respuestas_estudiante": _truncate_for_classifier(student_answers, 1800),
        "retroalimentacion": _truncate_for_classifier(feedback, 1200),
    }

    try:
        chat = client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0,
            max_tokens=180,
            response_format={"type": "json_object"},
        )
        await _log_usage("classification", selected_model, chat.usage)
        response_text = _require_content(chat.choices[0].message.content, "classify_chat_relevance")
        parsed = _extract_json_from_text(response_text)

        confidence_raw = parsed.get("confidence", 0.0)
        try:
            confidence = float(confidence_raw)
        except Exception:
            confidence = 0.0

        return {
            "is_exam_related": bool(parsed.get("is_exam_related")),
            "confidence": max(0.0, min(1.0, confidence)),
            "reason": str(parsed.get("reason") or ""),
        }
    except Exception:
        return {
            "is_exam_related": False,
            "confidence": 0.0,
            "reason": "fallback_block",
        }


async def generate_emparejar(
    tema: str,
    nivel: str,
    num_pares: int = 6,
    contenido_base: str = "",
    grado: str = "",
) -> dict:
    """Generate a matching activity using Groq LLM."""
    grado_inst = f"\nGrado escolar: {grado}. Adapta el vocabulario y contenido al nivel cognitivo de este grado del sistema educativo colombiano." if grado else ""

    system_prompt = f"""Eres un experto en diseño de actividades educativas.
Genera SOLAMENTE una actividad de emparejar (matching) en formato JSON. NO generes preguntas de examen.
NO agregues texto fuera del JSON. NO uses markdown.
Nivel: {nivel}.{grado_inst}
Tema: {tema}
Número de pares a generar: {num_pares}

REGLAS OBLIGATORIAS:
1. Genera exactamente {num_pares} pares de conceptos relacionados del tema.
2. Cada par tiene un elemento en la columna izquierda y su correspondiente en la columna derecha.
3. Los elementos deben ser claros, concisos y educativos.
4. La columna izquierda puede ser: conceptos, definiciones, palabras, fechas, etc.
5. La columna derecha contiene su correspondencia: significados, nombres, traducciones, eventos, etc.
6. Los pares deben tener una relación clara e inequívoca.

Schema JSON EXACTO requerido:
{{
  "titulo": "string",
  "emparejar": {{
    "instrucciones": "string con instrucciones para el estudiante",
    "pares": [
      {{"id": 1, "izquierda": "Concepto A", "derecha": "Definición A"}},
      {{"id": 2, "izquierda": "Concepto B", "derecha": "Definición B"}}
    ]
  }}
}}"""

    user_msg = f"Genera la actividad de emparejar sobre: {tema}"
    if contenido_base:
        user_msg += f"\n\nContenido base:\n{contenido_base}"

    chat = client.chat.completions.create(
        model=MODELS["exam_generation"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.7,
        max_tokens=2048,
        response_format={"type": "json_object"},
    )
    await _log_usage("exam_generation", MODELS["exam_generation"], chat.usage)
    response_text = _require_content(chat.choices[0].message.content, "generate_emparejar")
    return json.loads(response_text)


async def generate_cuento(
    tema: str,
    nivel: str,
    contenido_base: str = "",
    grado: str = "",
    moraleja_tema: str = "",
) -> dict:
    """Generate an educational story with moral lesson using Groq LLM."""
    grado_inst = f"\nGrado escolar: {grado}. Adapta el vocabulario, complejidad narrativa y extensión al nivel cognitivo de este grado del sistema educativo colombiano." if grado else ""
    moraleja_inst = f"\nEnfoca la moraleja/enseñanza en: {moraleja_tema}" if moraleja_tema else ""

    system_prompt = f"""Eres un experto escritor de cuentos educativos para niños y jóvenes colombianos.
Genera SOLAMENTE un cuento educativo con moraleja en formato JSON. NO uses markdown.
Nivel: {nivel}.{grado_inst}
Tema: {tema}{moraleja_inst}

REGLAS OBLIGATORIAS:
1. El cuento debe ser original, creativo y apropiado para el nivel escolar.
2. Debe incluir personajes memorables y una narrativa envolvente.
3. La moraleja o enseñanza debe estar claramente conectada al tema.
4. Incluye un título atractivo para el cuento.
5. Divide el cuento en párrafos claros para facilitar la lectura.
6. Incluye una descripción visual detallada para generar una ilustración (en inglés).
7. El cuento debe tener entre 300 y 800 palabras dependiendo del nivel.

Schema JSON EXACTO requerido:
{{
  "titulo": "string - título atractivo del cuento",
  "cuento": {{
    "texto": "string - el cuento completo con párrafos separados por \\n\\n",
    "moraleja": "string - la moraleja o enseñanza del cuento",
    "personajes": ["nombre1", "nombre2"],
    "image_prompt": "string in ENGLISH - A detailed description for generating a beautiful children's book illustration: describe the main scene, characters, setting, colors, and art style. Should be kid-friendly, colorful, and suitable as a coloring page. Example: A friendly fox and a wise owl sitting under a big oak tree in a magical forest, watercolor style, children's book illustration, detailed line art"
  }}
}}"""

    user_msg = f"Genera el cuento educativo sobre: {tema}"
    if contenido_base:
        user_msg += f"\n\nContenido base:\n{contenido_base}"

    chat = client.chat.completions.create(
        model=MODELS["exam_generation"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.8,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    await _log_usage("exam_generation", MODELS["exam_generation"], chat.usage)
    response_text = _require_content(chat.choices[0].message.content, "generate_cuento")
    return json.loads(response_text)


async def generate_coloring_prompt(descripcion: str, allow_letters: bool = False) -> str:
    """Translate a Spanish coloring-page description into a detailed English image prompt."""
    if allow_letters:
        constraints = (
            "The prompt must: describe cute educational elements clearly, specify 'coloring book page', "
            "'thick clean black outlines', 'white background', 'no color', 'no shading', "
            "'printable line art', 'kid-friendly'. "
            "If the request is about vowels/alphabet/syllables, include large uppercase tracing letters "
            "requested by the user (for example A E I O U) with dotted guides. "
            "Avoid decorative full sentences."
        )
    else:
        constraints = (
            "The prompt must: describe cute cartoon characters clearly, specify 'coloring book page', "
            "'thick clean black outlines', 'white background', 'no color', 'no shading', 'no text', "
            "'no words', 'no letters', 'no title', 'printable line art', 'kid-friendly'."
        )

    chat = client.chat.completions.create(
        model=MODELS["classification"],
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an image-prompt specialist for children's coloring pages. "
                    "The user gives you a description in Spanish. "
                    "Return ONLY a single English image prompt (no explanations, no markdown). "
                    f"{constraints} "
                    "Be specific about the animals/characters requested. Keep it under 80 words."
                ),
            },
            {"role": "user", "content": descripcion},
        ],
        temperature=0.4,
        max_tokens=120,
    )
    return _require_content(chat.choices[0].message.content, "generate_coloring_prompt")


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
    result = _require_content(chat.choices[0].message.content, "classify_writing").lower()
    return "manuscrito" if "manuscrito" in result else "impreso"
