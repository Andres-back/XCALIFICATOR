from __future__ import annotations

import re
import unicodedata

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_provider_config import get_profesor_ai_config
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User
from app.services.open_code_service import open_code_chat_completion, _message_text

router = APIRouter(prefix="/xali-master", tags=["Xali Master"])

XALI_MODEL = "MiMo-V2.5"

TOOL_CATALOG = [
    {
        "name": "Materias",
        "route": "/profesor/materias",
        "purpose": "crear, abrir y administrar materias, estudiantes, DBA y documentos curriculares",
    },
    {
        "name": "Herramientas",
        "route": "/profesor/herramientas",
        "purpose": "digitalizar examenes desde fotos, crear actividades, examenes, sopas de letras, crucigramas y presentaciones",
    },
    {
        "name": "Diseñar examen con IA",
        "route": "/profesor/crear-examen-chat",
        "purpose": "chat interactivo para diseñar un examen paso a paso: el profesor describe el tema, sube imágenes o PDFs de su libro/notas, y la IA genera el examen personalizado pregunta a pregunta",
    },
    {
        "name": "Crear examen",
        "route": "/profesor/herramientas",
        "purpose": "crear examenes rapidos o personalizados con seleccion multiple, verdadero/falso, desarrollo, unir columnas",
    },
    {
        "name": "Digitalizar examen",
        "route": "/profesor/herramientas",
        "purpose": "subir 1 a 3 fotos de un examen fisico y convertirlo en examen editable con OCR",
    },
    {
        "name": "Presentaciones",
        "route": "/profesor/presentacion",
        "purpose": "generar diapositivas para clase con IA (Presenton): tema, grado, objetivos y material base",
    },
    {
        "name": "Mis presentaciones",
        "route": "/profesor/presentaciones",
        "purpose": "ver, descargar o abrir presentaciones ya creadas",
    },
    {
        "name": "Calificar",
        "route": "/profesor/materias",
        "purpose": "entrar a una materia, abrir un examen y calificar entregas o fotos OCR",
    },
    {
        "name": "Notas",
        "route": "/profesor/materias",
        "purpose": "revisar notas, retroalimentacion y evidencias OCR por estudiante",
    },
    {
        "name": "Asistencia",
        "route": "/profesor/materias",
        "purpose": "registrar asistencia diaria de estudiantes por materia: presente, ausente, tarde, excusa",
    },
    {
        "name": "Boletines",
        "route": "/profesor/materias",
        "purpose": "generar boletines por periodo con promedios ponderados y observaciones en PDF",
    },
    {
        "name": "Reportes",
        "route": "/profesor/reportes",
        "purpose": "consultar estadisticas de notas, distribucion, ranking y reportes consolidados",
    },
    {
        "name": "IA personal",
        "route": "/perfil",
        "purpose": "configurar llaves de API y modelos de IA personales del profesor (Open Code, Groq, Ollama)",
    },
    {
        "name": "Configuracion admin",
        "route": "/admin/ai-config",
        "purpose": "configurar proveedores de IA, OCR, llaves globales y mascotas de Xali para profesor y estudiante",
    },
]

SYSTEM_KNOWLEDGE = [
    {
        "title": "Mapa general del sistema",
        "route": "/profesor/materias",
        "keywords": "inicio profesor sistema plataforma donde esta cada cosa menu navegacion xcalificator ayuda",
        "content": (
            "XCalificator organiza el trabajo del profesor en Materias, Herramientas, Calificar Tarea, "
            "Xali Master, Reportes e Impacto Tesis. Materias concentra estudiantes, examenes, notas, asistencia, "
            "DBA, curriculo y boletines. Herramientas concentra generadores y digitalizacion. Xali Master guia al "
            "profesor y recomienda la ruta correcta."
        ),
    },
    {
        "title": "Materias y grupos",
        "route": "/profesor/materias",
        "keywords": "materia materias grupo grupos estudiantes estudiante curso clase dba curriculo curriculares plan area grado",
        "content": (
            "En Materias el profesor crea una materia con el boton Crear materia o Nueva materia, completa nombre, "
            "grado, grupo y area, y guarda. Luego abre esa materia para administrar estudiantes, DBA, documentos "
            "curriculares, examenes, asistencia, notas y boletines."
        ),
    },
    {
        "title": "Crear examenes con IA",
        "route": "/profesor/crear-examen-chat",
        "keywords": "crear examen evaluacion prueba quiz preguntas inteligencia artificial chat disenar disenador libro pdf imagen",
        "content": (
            "Para disenar un examen paso a paso se usa Crear examen con IA. El profesor indica tema, grado, tipo de "
            "preguntas y puede adjuntar fotos o PDF de material base. Debe revisar las preguntas generadas antes de "
            "guardar o publicar, porque el sistema ayuda pero el docente conserva la decision final."
        ),
    },
    {
        "title": "Herramientas de actividades",
        "route": "/profesor/herramientas",
        "keywords": "herramientas actividad actividades sopa letras crucigrama emparejar cuento colorear imprimir descargar asignar",
        "content": (
            "Herramientas permite crear recursos como sopa de letras, crucigramas, emparejar columnas, cuentos, hojas "
            "para colorear y examenes rapidos. El flujo normal es generar, previsualizar, ajustar si hace falta y luego "
            "imprimir, descargar o asignar. En crucigramas y sopas no se necesita espacio de Respuestas OCR porque la "
            "calificacion debe usar vision sobre lo escrito, pintado o encerrado por el estudiante."
        ),
    },
    {
        "title": "Digitalizar examenes fisicos",
        "route": "/profesor/herramientas",
        "keywords": "digitalizar ocr foto fotos escanear fisico papel imagen convertir examen editable",
        "content": (
            "Digitalizar examen convierte 1 a 3 fotos de un examen fisico en un examen editable. El profesor sube las "
            "imagenes, espera la extraccion OCR/Vision, revisa en pantalla cada pregunta, corrige errores de lectura y "
            "guarda solo cuando el contenido coincida con el papel."
        ),
    },
    {
        "title": "Calificar tareas y examenes",
        "route": "/profesor/calificar-tarea",
        "keywords": "calificar calificacion nota notas corregir tarea respuesta respuestas entrega evidencia vision ocr",
        "content": (
            "Calificar Tarea permite subir evidencias de estudiantes y obtener apoyo de Vision/OCR para revisar respuestas. "
            "En examenes publicados, el profesor entra a la materia, abre el examen y revisa entregas, puntajes, evidencias "
            "y retroalimentacion antes de cerrar la nota."
        ),
    },
    {
        "title": "Presentaciones",
        "route": "/profesor/presentacion",
        "keywords": "presentacion presentaciones diapositiva diapositivas slides slide presenton ppt pptx imagenes descargar editar",
        "content": (
            "Presentaciones genera diapositivas con IA usando tema, grado, objetivos, cantidad de slides y material base. "
            "El sistema debe respetar la cantidad seleccionada, por ejemplo 12 si el profesor pide 12. Mis presentaciones "
            "permite abrir, editar en Presenton sin volver a iniciar sesion y descargar el PPTX."
        ),
    },
    {
        "title": "Notas, boletines y reportes",
        "route": "/profesor/reportes",
        "keywords": "notas boletin boletines reportes estadisticas promedio periodo ranking informe desempeno",
        "content": (
            "Las notas se consultan desde la materia o reportes. Boletines usa periodos y promedios para generar informes "
            "academicos. Reportes muestra estadisticas, distribuciones, rankings y consolidados para analizar desempeno."
        ),
    },
    {
        "title": "Asistencia",
        "route": "/profesor/materias",
        "keywords": "asistencia presente ausente tarde excusa fecha registrar llamada lista clase",
        "content": (
            "La asistencia se registra dentro de una materia. El profesor selecciona la fecha y marca cada estudiante como "
            "presente, ausente, tarde o con excusa. Esa informacion queda asociada a la materia y al periodo."
        ),
    },
    {
        "title": "Estudiantes",
        "route": "/estudiante",
        "keywords": "estudiante estudiantes alumno alumnos responder examen online tarea subir foto notas boletin",
        "content": (
            "El estudiante ve sus actividades, responde examenes online cuando estan asignados, puede subir evidencias si "
            "el flujo lo requiere y consulta notas o boletin desde su panel. La cuenta es la misma plataforma, pero cada "
            "rol ve las rutas que le corresponden."
        ),
    },
    {
        "title": "Configuracion de IA y mascotas",
        "route": "/admin/ai-config",
        "keywords": "admin administrador configuracion ia vision ocr open code groq ollama api llave mascota xali profesor estudiante",
        "content": (
            "El administrador define proveedores y modelos de IA/OCR en Configuracion IA y Vision. Tambien puede subir una "
            "mascota de Xali para profesores y otra para estudiantes. El profesor normalmente configura llaves personales "
            "en Perfil solo si el admin no dejo una configuracion global suficiente."
        ),
    },
    {
        "title": "Perfil y credenciales",
        "route": "/perfil",
        "keywords": "perfil credenciales api key llave open code groq ollama telegram cuenta modelo",
        "content": (
            "Perfil permite revisar datos de cuenta y configuraciones personales como llaves o modelos de IA cuando estan "
            "habilitadas. Xali no debe pedir contrasenas ni llaves dentro del chat; solo debe guiar al profesor a la seccion."
        ),
    },
]


class XaliMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2500)


class XaliRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2500)
    history: list[XaliMessage] = Field(default_factory=list, max_length=8)
    current_path: str = Field(default="", max_length=300)


class XaliAction(BaseModel):
    label: str
    route: str
    reason: str


class XaliResponse(BaseModel):
    response: str
    actions: list[XaliAction] = []
    model: str = XALI_MODEL
    rag_used: bool = True
    responder: str = "open_code_rag"


def _normalize_text(value: str) -> str:
    raw = unicodedata.normalize("NFKD", value or "")
    ascii_text = "".join(ch for ch in raw if not unicodedata.combining(ch))
    return ascii_text.lower()


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", _normalize_text(value))
        if len(token) >= 3
    }


def _retrieve_knowledge(message: str, current_path: str) -> list[dict[str, str]]:
    query_tokens = _tokens(f"{message} {current_path}")
    broad_help = bool(
        query_tokens
        & {"ayuda", "sistema", "xcalificator", "todo", "funciona", "hacer", "puedes", "guia"}
    )
    scored: list[tuple[int, dict[str, str]]] = []
    for item in SYSTEM_KNOWLEDGE:
        item_tokens = _tokens(f"{item['title']} {item['keywords']} {item['content']} {item['route']}")
        score = len(query_tokens & item_tokens)
        if current_path and item["route"] and _normalize_text(current_path).startswith(_normalize_text(item["route"])):
            score += 4
        if broad_help and item["title"] in {"Mapa general del sistema", "Materias y grupos", "Herramientas de actividades"}:
            score += 3
        if score > 0:
            scored.append((score, item))

    if not scored:
        scored = [(1, item) for item in SYSTEM_KNOWLEDGE[:4]]

    scored.sort(key=lambda entry: entry[0], reverse=True)
    return [item for _, item in scored[:6]]


def _format_knowledge(items: list[dict[str, str]]) -> str:
    return "\n".join(
        f"- {item['title']}: {item['content']}"
        for item in items
    )


def _teacher_friendly_response(value: str) -> str:
    """Remove implementation details that can leak from the model prompt."""
    text = str(value or "").strip()
    if not text:
        return text

    text = re.sub(r"(?im)^\s*#{1,6}\s*", "", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"(?im)^\s*(ruta|url|endpoint|rag|modelo|responder)\s*:.*$", "", text)
    text = re.sub(r"\s*\([^)]*/(?:profesor|admin|estudiante|api|perfil)[^)]*\)", "", text)
    text = re.sub(r"/(?:profesor|admin|estudiante|api|perfil)[\w/-]*", "", text)
    text = re.sub(r"\b(?:Open\s*Code|RAG|API|endpoint|URL|localhost|HTTP)\b", "IA", text, flags=re.I)
    text = re.sub(r"\bslides?\b", "diapositivas", text, flags=re.I)
    text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _pick_actions(message: str, response: str, user_role: str = "profesor") -> list[XaliAction]:
    message_text = _normalize_text(message)
    text = _normalize_text(f"{message} {response}")
    rules = [
        (("crucigrama", "sopa", "sopa de letras", "emparejar", "unir columnas", "imprimir", "descargar", "herramienta", "herramientas"), "Herramientas"),
        (("crear materia", "nueva materia", "materia nueva", "agregar materia"), "Materias"),
        (("presentacion", "diapositiva", "slide", "presenton"), "Presentaciones"),
        (("digitalizar", "foto", "ocr", "imagen", "escanear"), "Digitalizar examen"),
        (("examen", "evaluacion", "quiz", "prueba", "test"), "Crear examen"),
        (("materia", "dba", "curricular", "estudiante", "grupo", "clase"), "Materias"),
        (("calificar", "nota", "respuesta", "corregir", "revisar entrega"), "Calificar"),
        (("asistencia", "registro", "presente", "ausente", "tarde"), "Asistencia"),
        (("boletin", "periodo", "nota final", "informe academico"), "Boletines"),
        (("reporte", "estadistica", "distribucion", "ranking"), "Reportes"),
        (("api", "llave", "modelo", "open code", "ollama", "groq", "configurar ia"), "IA personal"),
        (("mascota", "admin", "administrador", "configuracion ia"), "Configuracion admin"),
    ]
    selected: list[str] = []
    for keywords, name in rules:
        if any(keyword in message_text for keyword in keywords):
            selected.append(name)

    if not selected:
        for keywords, name in rules:
            if any(keyword in text for keyword in keywords):
                selected.append(name)

    if not selected:
        selected = ["Herramientas", "Materias"]

    actions: list[XaliAction] = []
    seen_routes: set[str] = set()
    for name in selected[:3]:
        tool = next((item for item in TOOL_CATALOG if item["name"] == name), None)
        if tool and tool["name"] == "Configuracion admin" and user_role != "admin":
            tool = next((item for item in TOOL_CATALOG if item["name"] == "IA personal"), None)
        if tool and tool["route"] not in seen_routes:
            seen_routes.add(tool["route"])
            actions.append(
                XaliAction(
                    label=tool["name"],
                    route=tool["route"],
                    reason=tool["purpose"],
                )
            )
    return actions


def _fallback_response(message: str) -> str:
    text = message.lower()
    if any(word in text for word in ("digitalizar", "foto", "ocr", "imagen")):
        return (
            "Para digitalizar un examen, entra a Herramientas y usa Digitalizar examen. "
            "Sube de 1 a 3 fotos, revisa las preguntas detectadas y guarda el examen cuando todo coincida."
        )
    if any(word in text for word in ("presentacion", "diapositiva", "slide")):
        return (
            "Para crear diapositivas, entra a Presentaciones. Escribe tema, grado y objetivos; "
            "el sistema generara un archivo PPTX descargable para editarlo si lo necesitas."
        )
    if any(word in text for word in ("examen", "quiz", "evaluacion")):
        return (
            "Para crear un examen, ve a Herramientas y elige Crear examen. "
            "Selecciona materia, tema y revisa las preguntas antes de publicar."
        )
    if any(word in text for word in ("calificar", "nota", "respuesta")):
        return (
            "Para calificar, abre la materia, entra al examen y revisa las entregas. "
            "Si subiste foto OCR, verifica la hoja original, el texto detectado y la calificacion por pregunta."
        )
    return (
        "Puedo guiarte dentro de XCalificator. Dime si quieres crear un examen, digitalizar fotos, "
        "crear diapositivas, calificar respuestas o revisar notas."
    )


def _rag_fast_response(message: str, knowledge: list[dict[str, str]]) -> str:
    text = _normalize_text(message)
    primary = knowledge[0] if knowledge else SYSTEM_KNOWLEDGE[0]
    title = primary["title"]
    route = primary["route"]
    content = primary["content"]

    if any(phrase in text for phrase in ("crear materia", "nueva materia", "materia nueva", "agregar materia")):
        return (
            "1. Entra a **Materias**.\n"
            "2. Pulsa **Crear materia** o **Nueva materia**.\n"
            "3. Completa nombre, grado, grupo y area.\n"
            "4. Guarda y abre la materia para cargar estudiantes, DBA o actividades."
        )
    if any(word in text for word in ("presentacion", "presentaciones", "diapositiva", "slide", "pptx")):
        return (
            "1. Entra a **Presentaciones** y escribe tema, grado, objetivos y material base.\n"
            "2. En cantidad selecciona el numero exacto de diapositivas, por ejemplo **12**.\n"
            "3. Cuando termine, abre **Mis presentaciones** para editar o descargar el **PPTX**."
        )
    if any(word in text for word in ("crucigrama", "sopa", "emparejar", "imprimir", "descargar")):
        return (
            "Usa **Herramientas** para generar la actividad, revisarla en pantalla y luego **imprimir** o **descargar**. "
            "En **crucigramas** y **sopas de letras** no necesitas Respuestas OCR: la revision debe hacerse con **Vision** "
            "sobre lo que el estudiante escribio, pinto o encerro."
        )
    if any(word in text for word in ("digitalizar", "ocr", "foto", "fotos", "imagen")):
        return (
            "1. Ve a **Herramientas** y abre **Digitalizar examen**.\n"
            "2. Sube de 1 a 3 fotos claras del examen fisico.\n"
            "3. Revisa y corrige cada pregunta detectada antes de guardar."
        )
    if any(word in text for word in ("calificar", "nota", "tarea", "respuesta", "corregir")):
        return (
            "Para calificar, entra a **Calificar Tarea** o abre el examen desde la **Materia**. "
            "Revisa la evidencia, la lectura Vision/OCR, los puntajes por pregunta y ajusta la nota antes de finalizar."
        )
    if any(word in text for word in ("dba", "curriculo", "curricular", "materia", "estudiante")):
        return (
            "Entra a **Materias**, abre la materia correspondiente y desde alli administra estudiantes, DBA, documentos "
            "curriculares, examenes, asistencia, notas y boletines."
        )

    return (
        f"Sobre **{title}**: {content} "
        "Si me dices que quieres hacer exactamente, te doy los pasos concretos."
    )


@router.post("/chat", response_model=XaliResponse)
async def xali_master_chat(
    payload: XaliRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    retrieved_knowledge = _retrieve_knowledge(payload.message, payload.current_path)
    knowledge_text = _format_knowledge(retrieved_knowledge[:4])
    catalog_text = (
        "Secciones disponibles para guiar al profesor: Materias, Herramientas, Presentaciones, "
        "Mis presentaciones, Calificar Tarea, Reportes y Perfil. Los botones del chat llevan al lugar correcto."
    )
    history = [
        {"role": item.role, "content": item.content}
        for item in payload.history[-4:]
        if item.content.strip()
    ]
    messages = [
        {
            "role": "system",
            "content": (
                "Eres **Xali Master**, asistente experto integrado en XCalificator para docentes colombianos de basica y media.\n\n"
                "## Tu mision\n"
                "Guiar al profesor a la seccion correcta, explicar como usar cada funcion y resolver dudas sobre la plataforma. "
                "Eres conciso, empático y practico.\n\n"
                "## Formato de respuesta OBLIGATORIO\n"
                "- **Negrita** para nombres de secciones, botones y terminos clave (ej. **Herramientas**, **Digitalizar examen**).\n"
                "- Lista con guion `- item` para pasos o enumeraciones de 2 o mas elementos.\n"
                "- Numeracion `1. 2. 3.` para secuencias de pasos que deben seguirse en orden.\n"
                "- Maximo 5 puntos por respuesta. Respuesta directa, sin relleno ni saludos.\n"
                "- Espanol colombiano natural. Tutea al profesor.\n\n"
                "## Restricciones\n"
                "- No inventes funciones que no esten en el catalogo.\n"
                "- Usa primero la base de conocimiento recuperada; si no alcanza, apoyate en el catalogo.\n"
                "- No pidas ni menciones contrasenas ni llaves de API.\n"
                "- Si el profesor pregunta por configuracion de IA, indicale ir a **Perfil** o contactar al admin.\n\n"
                f"Seccion actual del profesor: `{payload.current_path or 'inicio'}`\n\n"
                f"## Base de conocimiento recuperada (RAG interno)\n{knowledge_text}\n\n"
                f"## Catalogo de secciones\n{catalog_text}"
            ),
        },
        *history,
        {"role": "user", "content": payload.message},
    ]
    messages = [
        {
            "role": "system",
            "content": (
                "Eres Xali, asistente de XCalificator para profesores que no saben de tecnologia. "
                "Responde en espanol claro, calido y directo, maximo 80 palabras. "
                "No muestres rutas, enlaces internos, nombres de modelos, RAG, API, codigo ni detalles tecnicos. "
                "No uses titulos con ##. Usa nombres visibles de secciones y botones, por ejemplo Materias, "
                "Herramientas, Presentaciones o Calificar Tarea. No uses emojis. Di diapositivas, no slides. "
                "Si corresponde, di que puede usar el boton que aparece "
                "debajo de tu respuesta para ir al lugar correcto.\n\n"
                f"Conocimiento interno:\n{knowledge_text}\n"
                f"Secciones:\n{catalog_text}"
            ),
        },
        *history[-2:],
        {"role": "user", "content": payload.message},
    ]
    model = XALI_MODEL
    try:
        ai_cfg = await get_profesor_ai_config(db, str(current_user.id))
        api_key = str(ai_cfg.get("open_code_api_key") or "").strip()
        base_url = str(ai_cfg.get("open_code_base_url") or "").strip()
        model = str(
            ai_cfg.get("chat_model")
            or ai_cfg.get("open_code_feedback_model")
            or XALI_MODEL
        ).strip() or XALI_MODEL
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="Xali necesita que la inteligencia artificial del sistema este configurada. Revisa Perfil o pide ayuda al administrador.",
            )
        result = await open_code_chat_completion(
            messages=messages,
            model=model,
            base_url=base_url or None,
            api_key=api_key,
            temperature=0.1,
            max_tokens=450,
        )
        response = _message_text(result)
        response = _teacher_friendly_response(response)
        if not response:
            raise HTTPException(status_code=502, detail="Xali no logro preparar una respuesta clara. Intenta de nuevo en unos segundos.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Xali no pudo responder en este momento. Intenta de nuevo en unos segundos.") from exc

    return XaliResponse(
        response=response,
        actions=_pick_actions(payload.message, response, current_user.rol),
        model=model,
        rag_used=True,
        responder="open_code_rag",
    )
