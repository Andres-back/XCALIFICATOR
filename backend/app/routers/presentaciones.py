"""
Router de presentaciones â€” Fase 1 (MVP).

Endpoints:
    POST  /presentaciones/clase          â†’ genera slides para una clase
    GET   /presentaciones/health         â†’ smoke test del servicio Presenton
    GET   /presentaciones/mias           â†’ lista las presentaciones del profesor

Cada presentaciÃ³n generada se guarda como `Herramienta(tipo="presentacion")`
para reusarla y aparecer en la galerÃ­a del docente.

TambiÃ©n registra en `TiempoEvaluacion` una entrada con `actividad_tipo="presentacion"`
para alimentar las mÃ©tricas de impacto de la tesis.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_provider_config import get_profesor_ai_config
from app.core.database import get_db
from app.core.dependencies import require_role, get_client_ip
from app.core.latex_utils import normalize_latex_payload
from app.core.tool_flags import is_tool_enabled
from app.core.config import get_settings
from app.models.models import (
    Boletin, Examen, Herramienta, Materia, Nota,
    PeriodoAcademico, TiempoEvaluacion, User, AuditLog,
)
from app.schemas.schemas import ExamenProfesorOut
from app.services import presenton_service
from app.services.curriculum_service import retrieve_curriculum_context
from app.services.groq_service import generate_exam
from app.services.open_code_service import OPEN_CODE_RECOMMENDED_MODELS

router = APIRouter(prefix="/presentaciones", tags=["Presentaciones"])
logger = logging.getLogger(__name__)
settings = get_settings()
_editor_tickets: dict[str, dict] = {}


# â”€â”€ Schemas (locales al router para no contaminar schemas.py) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class PresentacionClaseRequest(BaseModel):
    titulo: str = Field(..., min_length=3, max_length=300, description="Tema de la clase")
    contenido: str = Field(default="", max_length=8000, description="Material base / notas del docente")
    grado: Optional[str] = Field(default=None, max_length=30, description="Grado escolar (ej. '6Â°', '11Â°')")
    objetivos: Optional[list[str]] = Field(default=None, description="Objetivos pedagÃ³gicos opcionales")
    num_slides: int = Field(default=8, ge=3, le=20)
    plantilla: str = Field(default="general", description="general | classic | modern")
    materia_id: Optional[UUID] = Field(default=None, description="Materia opcional para asociar la herramienta")
    dba_lineamiento: Optional[str] = Field(default=None, max_length=3000)
    metodologia: Optional[str] = Field(default=None, max_length=1500)
    orientacion: Optional[str] = Field(default=None, max_length=1500)
    enfoque: Optional[str] = Field(default=None, max_length=1500)


class PresentacionOut(BaseModel):
    id: UUID
    titulo: str
    pptx_url: Optional[str] = None
    thumbnails: list[str] = []
    edit_url: Optional[str] = None
    num_slides: int
    plantilla: str
    subtipo: str = "clase"  # 'clase' | 'repaso_examen' | 'boletin_periodo'
    materia_id: Optional[UUID] = None
    examen_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PresentacionQuizRequest(BaseModel):
    materia_id: Optional[UUID] = None
    titulo: Optional[str] = Field(default=None, max_length=250)
    num_preguntas: int = Field(default=5, ge=3, le=20)
    distribucion: Optional[dict[str, int]] = None


# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async def _assert_materia_owned(
    db: AsyncSession, materia_id: UUID, current_user: User
) -> Materia:
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso para esta materia")
    return materia


def _herramienta_to_out(h: Herramienta) -> PresentacionOut:
    cfg = h.config_json or {}
    contenido = h.contenido_json or {}
    return PresentacionOut(
        id=h.id,
        titulo=h.titulo,
        pptx_url=contenido.get("pptx_url"),
        thumbnails=contenido.get("thumbnails", []),
        edit_url=contenido.get("edit_url"),
        num_slides=int(cfg.get("num_slides", 0)),
        plantilla=cfg.get("plantilla", "general"),
        subtipo=contenido.get("subtipo", "clase"),
        materia_id=h.materia_id,
        examen_id=h.examen_id,
        created_at=h.created_at,
    )


def _quiz_distribution(num_preguntas: int, custom: Optional[dict[str, int]] = None) -> dict[str, int]:
    allowed = {"seleccion_multiple", "verdadero_falso", "respuesta_corta", "desarrollo"}
    if custom:
        clean = {
            key: max(0, int(value or 0))
            for key, value in custom.items()
            if key in allowed
        }
        total = sum(clean.values())
        if total > 0:
            if total != num_preguntas:
                factor = num_preguntas / total
                scaled = {key: max(0, int(round(value * factor))) for key, value in clean.items()}
                diff = num_preguntas - sum(scaled.values())
                scaled["seleccion_multiple"] = max(0, scaled.get("seleccion_multiple", 0) + diff)
                clean = scaled
            return {key: value for key, value in clean.items() if value > 0}
    seleccion = max(1, num_preguntas - 1)
    return {"seleccion_multiple": seleccion, "respuesta_corta": num_preguntas - seleccion}


def _presentation_text_for_quiz(h: Herramienta) -> str:
    contenido = h.contenido_json or {}
    parts: list[str] = [f"Titulo de la presentacion: {h.titulo}"]

    outline = contenido.get("outline")
    if isinstance(outline, list):
        for idx, item in enumerate(outline, start=1):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or item.get("slideTitle") or item.get("name") or "").strip()
            body = item.get("body") or item.get("bodyPoints") or item.get("description") or item.get("content") or ""
            if isinstance(body, list):
                body = "; ".join(str(x) for x in body if str(x).strip())
            text = " ".join(part for part in [title, str(body).strip()] if part)
            if text:
                parts.append(f"Diapositiva {idx}: {text}")

    presentacion = contenido.get("presentacion") if isinstance(contenido.get("presentacion"), dict) else {}
    slides = presentacion.get("slides") if isinstance(presentacion, dict) else []
    if isinstance(slides, list):
        for idx, slide in enumerate(slides, start=1):
            if not isinstance(slide, dict):
                continue
            title = str(slide.get("title") or slide.get("titulo") or "").strip()
            body = slide.get("bullets") or slide.get("content") or slide.get("body") or ""
            if isinstance(body, list):
                body = "; ".join(str(x) for x in body if str(x).strip())
            text = " ".join(part for part in [title, str(body).strip()] if part)
            if text:
                parts.append(f"Diapositiva {idx}: {text}")

    slides_markdown = presentacion.get("slides_markdown") if isinstance(presentacion, dict) else contenido.get("slides_markdown")
    if isinstance(slides_markdown, list):
        for idx, md in enumerate(slides_markdown, start=1):
            text = str(md or "").strip()
            if text:
                parts.append(f"Diapositiva {idx}: {text}")

    return "\n".join(parts)[:12000]




# â”€â”€ Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _safe_presenton_editor_url(raw_url: str) -> str:
    target = str(raw_url or "").strip()
    if not target:
        raise HTTPException(status_code=404, detail="La presentación no tiene editor disponible")

    public_base = settings.PRESENTON_PUBLIC_URL.rstrip("/")
    if target.startswith("/"):
        return urljoin(public_base + "/", target.lstrip("/"))

    parsed_target = urlparse(target)
    parsed_base = urlparse(public_base)
    if (
        parsed_target.scheme not in {"http", "https"}
        or parsed_target.hostname != parsed_base.hostname
        or parsed_target.port != parsed_base.port
    ):
        raise HTTPException(status_code=400, detail="URL de editor Presenton no permitida")
    return target


async def _get_owned_presentacion(
    db: AsyncSession,
    herramienta_id: UUID,
    current_user: User,
) -> Herramienta:
    result = await db.execute(
        select(Herramienta).where(
            Herramienta.id == herramienta_id,
            Herramienta.tipo == "presentacion",
        )
    )
    herr = result.scalar_one_or_none()
    if not herr:
        raise HTTPException(status_code=404, detail="Presentación no encontrada")
    if current_user.rol == "profesor" and str(herr.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso")
    return herr


def _create_editor_ticket(target: str, session_token: str) -> str:
    now = time.time()
    expired = [key for key, value in _editor_tickets.items() if value.get("expires", 0) <= now]
    for key in expired:
        _editor_tickets.pop(key, None)

    ticket = secrets.token_urlsafe(32)
    _editor_tickets[ticket] = {
        "target": target,
        "session_token": session_token,
        "expires": now + 60,
    }
    return ticket


def _attach_presenton_cookie(response: RedirectResponse, session_token: str) -> None:
    response.set_cookie(
        key="presenton_session",
        value=session_token,
        max_age=24 * 60 * 60,
        path="/",
        httponly=True,
        samesite="lax",
    )

    public_host = urlparse(settings.PRESENTON_PUBLIC_URL).hostname
    if public_host == "localhost":
        cookie = (
            f"presenton_session={session_token}; Domain=localhost; Path=/; "
            "Max-Age=86400; HttpOnly; SameSite=Lax"
        )
        response.raw_headers.append((b"set-cookie", cookie.encode("latin-1")))


@router.get("/health")
async def presenton_health():
    """Health de presentaciones: Presenton es el proveedor primario; local_pptx es el fallback."""
    presenton_up = await presenton_service.health_check()
    presenton_auth_ok = False
    presenton_error = ""
    try:
        await presenton_service._ensure_token()
        presenton_auth_ok = True
    except Exception as exc:
        presenton_error = str(exc)

    model = (
        os.getenv("PRESENTON_CUSTOM_MODEL")
        or settings.OPEN_CODE_FALLBACK_MODEL
        or OPEN_CODE_RECOMMENDED_MODELS["fallback"]
    ).strip()

    return {
        "ok": presenton_up,
        "provider": "presenton",
        "presenton_up": presenton_up,
        "presenton_auth_ok": presenton_auth_ok,
        "llm_provider": "presenton_custom_llm",
        "model": model,
        "presenton_error": presenton_error,
        "llm_error": "" if presenton_up else "Presenton no disponible. Verifica que el contenedor este corriendo y que PRESENTON_CUSTOM_LLM_API_KEY este configurada.",
    }


@router.get("/presenton-token")
async def get_presenton_editor_token(
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Devuelve el token de sesiÃ³n de Presenton para que el frontend pueda
    abrirle el editor sin pedir login nuevamente.
    Solo accesible para usuarios autenticados en xCalificator.
    """
    return {"detail": "Usa el ticket de editor. La sesion de Presenton se entrega con cookie HttpOnly."}


@router.get("/{herramienta_id}/editor-session")
async def get_presenton_editor_session(
    herramienta_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Devuelve una sesion Presenton para abrir el editor desde xCalificator.
    La llamada llega autenticada por API; el navegador luego abre Presenton.
    """
    herr = await _get_owned_presentacion(db, herramienta_id, current_user)
    contenido = herr.contenido_json or {}
    target = _safe_presenton_editor_url(str(contenido.get("edit_url") or ""))
    try:
        token = await presenton_service._ensure_token()
        return {"editor_url": target, "session_token": token}
    except Exception as exc:
        logger.warning("No se pudo obtener sesion Presenton: %s", exc)
        raise HTTPException(status_code=503, detail="Servicio Presenton no disponible")


@router.post("/{herramienta_id}/editor-ticket")
async def create_presenton_editor_ticket(
    herramienta_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    herr = await _get_owned_presentacion(db, herramienta_id, current_user)
    contenido = herr.contenido_json or {}
    target = _safe_presenton_editor_url(str(contenido.get("edit_url") or ""))
    try:
        token = await presenton_service._ensure_token()
    except Exception as exc:
        logger.warning("No se pudo crear ticket Presenton: %s", exc)
        raise HTTPException(status_code=503, detail="Servicio Presenton no disponible")

    ticket = _create_editor_ticket(target, token)
    db.add(AuditLog(
        user_id=current_user.id,
        accion="open_presenton_editor",
        detalle={"herramienta_id": str(herramienta_id), "via": "ticket"},
        ip=get_client_ip(request),
    ))
    await db.commit()
    return {"open_url": f"/api/presentaciones/editor-ticket/{ticket}"}


@router.get("/editor-ticket/{ticket}")
async def open_presenton_editor_ticket(ticket: str):
    data = _editor_tickets.pop(ticket, None)
    if not data or data.get("expires", 0) <= time.time():
        raise HTTPException(status_code=404, detail="Ticket de editor expirado")

    response = RedirectResponse(url=data["target"], status_code=302)
    _attach_presenton_cookie(response, data["session_token"])
    return response


@router.get("/{herramienta_id}/editor")
async def open_presenton_editor(
    herramienta_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Puente SSO: si el usuario ya está autenticado en xCalificator, crea una
    sesión Presenton y redirige al editor sin mostrar login adicional.
    """
    herr = await _get_owned_presentacion(db, herramienta_id, current_user)
    contenido = herr.contenido_json or {}
    target = _safe_presenton_editor_url(str(contenido.get("edit_url") or ""))
    try:
        token = await presenton_service._ensure_token()
    except Exception as exc:
        logger.warning("No se pudo abrir sesión Presenton: %s", exc)
        raise HTTPException(status_code=503, detail="Servicio Presenton no disponible")

    response = RedirectResponse(url=target, status_code=302)
    _attach_presenton_cookie(response, token)
    db.add(AuditLog(
        user_id=current_user.id,
        accion="open_presenton_editor",
        detalle={"herramienta_id": str(herramienta_id), "via": "redirect"},
        ip=get_client_ip(request),
    ))
    await db.commit()
    return response


@router.post("/clase", response_model=PresentacionOut, status_code=201)
async def generar_presentacion_clase(
    payload: PresentacionClaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Genera una presentaciÃ³n de CLASE (slides para enseÃ±ar un tema)
    y la guarda como Herramienta del profesor.
    """
    # Feature flag: Â¿estÃ¡ habilitada esta tool?
    if not await is_tool_enabled(db, "presentacion"):
        raise HTTPException(
            status_code=403,
            detail="La herramienta 'PresentaciÃ³n' estÃ¡ deshabilitada por administraciÃ³n",
        )

    # Validar materia si vino
    materia = None
    if payload.materia_id:
        materia = await _assert_materia_owned(db, payload.materia_id, current_user)

    started = time.perf_counter()
    contenido_parts = []
    if payload.contenido:
        contenido_parts.append(f"Material base del profesor:\n{payload.contenido.strip()}")
    if payload.dba_lineamiento:
        contenido_parts.append(f"DBA, estandar o lineamiento indicado por el profesor:\n{payload.dba_lineamiento.strip()}")
    if payload.metodologia:
        contenido_parts.append(f"Metodologia sugerida:\n{payload.metodologia.strip()}")
    if payload.orientacion:
        contenido_parts.append(f"Orientacion pedagogica:\n{payload.orientacion.strip()}")
    if payload.enfoque:
        contenido_parts.append(f"Enfoque de clase:\n{payload.enfoque.strip()}")
    contenido = "\n\n".join(contenido_parts).strip()
    if materia is not None:
        rag_context = await retrieve_curriculum_context(
            db,
            materia,
            " ".join([payload.titulo, payload.grado or "", payload.contenido or "", payload.dba_lineamiento or ""]),
        )
        if rag_context:
            contenido = (
                (contenido or "").strip()
                + "\n\nDBA, plan curricular y documentos recuperados por RAG para esta clase:\n"
                + rag_context.strip()
            ).strip()

    try:
        result = await presenton_service.generate_lesson_presentation(
            titulo=payload.titulo,
            contenido=contenido,
            grado=payload.grado,
            objetivos=payload.objetivos,
            num_slides=payload.num_slides,
            plantilla=payload.plantilla,
        )
    except Exception as exc:
        logger.exception("Presenton no pudo generar la presentacion")
        raise HTTPException(status_code=502, detail=f"No pudimos generar la presentacion: {exc}")

    duracion_seg = round(time.perf_counter() - started, 2)

    # â”€â”€ Persistir como Herramienta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    herr = Herramienta(
        profesor_id=current_user.id,
        tipo="presentacion",
        titulo=payload.titulo,
        contenido_json={
            "presentation_id": result.get("presentation_id"),
            "pptx_path":       result.get("pptx_path"),
            "pptx_url":        result.get("pptx_url"),
            "thumbnails":      result.get("thumbnails", []),
            "edit_url":        result.get("edit_url"),
            "outline":         result.get("outline", []),
            "fallback":        bool(result.get("fallback")),
            "fallback_provider": result.get("fallback_provider", ""),
            "fallback_error":  result.get("fallback_error", ""),
            "subtipo":         "clase",
        },
        config_json={
            "num_slides":  payload.num_slides,
            "plantilla":   payload.plantilla,
            "grado":       payload.grado,
            "objetivos":   payload.objetivos or [],
            "dba_lineamiento": payload.dba_lineamiento,
            "metodologia": payload.metodologia,
            "orientacion": payload.orientacion,
            "enfoque": payload.enfoque,
            "duracion_generacion_seg": duracion_seg,
        },
        estado="listo",
        materia_id=payload.materia_id,
    )
    db.add(herr)

    # â”€â”€ Tracking de tiempo (componente de tesis) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    tiempo = TiempoEvaluacion(
        profesor_id=current_user.id,
        materia_id=payload.materia_id,
        examen_id=None,
        fase="con_sistema",
        actividad_tipo="presentacion",
        duracion_minutos=max(0.01, round(duracion_seg / 60, 2)),
        estudiantes_evaluados=1,
        observacion=f"Generacion automatica local PPTX ({payload.num_slides} slides)",
    )
    db.add(tiempo)

    await db.commit()
    await db.refresh(herr)

    return _herramienta_to_out(herr)


@router.get("/mias", response_model=list[PresentacionOut])
async def mis_presentaciones(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
    limit: int = 50,
):
    """Devuelve las Ãºltimas presentaciones generadas por el profesor actual."""
    result = await db.execute(
        select(Herramienta)
        .where(
            Herramienta.profesor_id == current_user.id,
            Herramienta.tipo == "presentacion",
        )
        .order_by(Herramienta.created_at.desc())
        .limit(limit)
    )
    return [_herramienta_to_out(h) for h in result.scalars().all()]


@router.post("/{presentacion_id}/quiz", response_model=ExamenProfesorOut, status_code=201)
async def generar_quiz_desde_presentacion(
    presentacion_id: UUID,
    payload: PresentacionQuizRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Genera un quiz reutilizable a partir de una presentacion guardada."""
    herr = await _get_owned_presentacion(db, presentacion_id, current_user)
    materia_id = payload.materia_id or herr.materia_id
    if not materia_id:
        raise HTTPException(
            status_code=400,
            detail="Elige una materia para guardar el quiz de esta presentacion.",
        )
    materia = await _assert_materia_owned(db, materia_id, current_user)

    contenido_base = _presentation_text_for_quiz(herr)
    if len(contenido_base.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="La presentacion no tiene suficiente contenido para crear un quiz.",
        )

    cfg = herr.config_json or {}
    contenido = herr.contenido_json or {}
    presentacion_nested = contenido.get("presentacion") if isinstance(contenido.get("presentacion"), dict) else {}
    presenton_id = contenido.get("presentation_id") or presentacion_nested.get("presentation_id")
    num_slides = int(cfg.get("num_slides") or presentacion_nested.get("n_slides") or 0)
    distribucion = _quiz_distribution(payload.num_preguntas, payload.distribucion)
    owner_id = str(herr.profesor_id or current_user.id)
    ai_cfg = await get_profesor_ai_config(db, owner_id)

    quiz_title = (payload.titulo or f"Quiz: {herr.titulo}").strip()
    try:
        exam_data = await generate_exam(
            tema=f"Quiz corto sobre la presentacion: {herr.titulo}",
            nivel="quiz corto de comprension",
            distribucion=distribucion,
            contenido_base=(
                "Crea un quiz breve en espanol basado SOLO en estas diapositivas. "
                "Evalua comprension, conceptos clave y aplicacion sencilla.\n\n"
                + contenido_base
            ),
            grado=str(cfg.get("grado") or ""),
            provider_config=ai_cfg,
        )
    except Exception as exc:
        logger.exception("No se pudo generar quiz desde presentacion")
        raise HTTPException(status_code=502, detail=f"No pudimos generar el quiz: {exc}")

    preguntas_raw = exam_data.get("preguntas") if isinstance(exam_data, dict) else None
    if not isinstance(preguntas_raw, list) or not preguntas_raw:
        raise HTTPException(status_code=502, detail="La IA no devolvio preguntas para el quiz.")

    preguntas = []
    clave = []
    for idx, raw in enumerate(preguntas_raw, start=1):
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        numero = item.get("numero") or idx
        item["numero"] = numero
        respuesta = item.pop("respuesta_correcta", "")
        puntos = float(item.get("puntos") or 1.0)
        preguntas.append(item)
        clave.append({
            "numero": numero,
            "tipo": item.get("tipo", ""),
            "respuesta_correcta": respuesta,
            "puntos": puntos,
        })

    if not preguntas:
        raise HTTPException(status_code=502, detail="La IA no devolvio preguntas validas para el quiz.")

    metadata = {
        "generado_desde": "presentacion",
        "origen_presentacion_id": str(herr.id),
        "presenton_id": str(presenton_id or ""),
        "slides_usadas": num_slides or None,
    }
    examen = Examen(
        materia_id=materia.id,
        titulo=quiz_title,
        tipo="quiz_presentacion",
        contenido_json=normalize_latex_payload({
            "titulo": quiz_title,
            "preguntas": preguntas,
            "metadata": metadata,
        }),
        clave_respuestas=normalize_latex_payload({
            "preguntas": clave,
            "nota_maxima": float(exam_data.get("nota_maxima") or 5.0),
            "metadata": metadata,
        }),
        activo_online=False,
        activo_fisico=True,
    )
    db.add(examen)
    await db.flush()
    db.add(AuditLog(
        user_id=current_user.id,
        accion="create_quiz_from_presentation",
        detalle={
            "presentacion_id": str(herr.id),
            "examen_id": str(examen.id),
            "materia_id": str(materia.id),
            "num_preguntas": len(preguntas),
        },
        ip=get_client_ip(request),
    ))
    await db.commit()
    await db.refresh(examen)
    return ExamenProfesorOut.model_validate(examen)


@router.post("/repaso-examen/{examen_id}", response_model=PresentacionOut, status_code=201)
async def generar_presentacion_repaso(
    examen_id: UUID,
    plantilla: str = "general",
    num_slides: int = 8,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Genera una presentaciÃ³n de RETROALIMENTACIÃ“N de un examen.

    Auto-extrae las preguntas con menor tasa de acierto y construye slides
    explicando los conceptos correctos. Cero input manual del docente.
    """
    if not await is_tool_enabled(db, "presentacion"):
        raise HTTPException(status_code=403, detail="Herramienta deshabilitada")

    # â”€â”€ Cargar examen + materia con verificaciÃ³n de propiedad â”€â”€â”€â”€â”€â”€â”€â”€â”€
    exam_result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = exam_result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    mat_result = await db.execute(select(Materia).where(Materia.id == examen.materia_id))
    materia = mat_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso para este examen")

    # â”€â”€ Cargar todas las notas y reconstruir stats por pregunta â”€â”€â”€â”€â”€â”€â”€â”€
    notas_result = await db.execute(select(Nota).where(Nota.examen_id == examen_id))
    notas = notas_result.scalars().all()
    if not notas:
        raise HTTPException(
            status_code=400,
            detail="AÃºn no hay calificaciones para este examen. Califica algunos antes de generar el repaso.",
        )

    # Agregar tasas de acierto por pregunta
    q_stats: dict[int, dict] = {}
    for n in notas:
        if not n.detalle_json or "preguntas" not in n.detalle_json:
            continue
        for p in n.detalle_json["preguntas"]:
            num = p.get("numero")
            if num is None:
                continue
            if num not in q_stats:
                q_stats[num] = {"numero": num, "total": 0, "correctas": 0, "tipo": p.get("tipo", "")}
            q_stats[num]["total"] += 1
            if p.get("correcto"):
                q_stats[num]["correctas"] += 1

    # Enriquecer con enunciado y respuesta correcta del examen
    contenido = examen.contenido_json or {}
    clave = examen.clave_respuestas or {}
    preguntas_lookup = {
        p.get("numero"): p for p in (contenido.get("preguntas") or [])
    }
    clave_lookup = {
        c.get("numero"): c for c in (
            clave.get("preguntas") if isinstance(clave, dict) and "preguntas" in clave
            else (clave if isinstance(clave, list) else [])
        )
    }

    enriched: list[dict] = []
    for num, st in q_stats.items():
        if st["total"] == 0:
            continue
        rate = round((st["correctas"] / st["total"]) * 100, 1)
        pq = preguntas_lookup.get(num, {})
        ck = clave_lookup.get(num, {})
        enriched.append({
            "numero": num,
            "enunciado": pq.get("enunciado") or pq.get("pregunta") or f"Pregunta {num}",
            "tipo": st["tipo"] or pq.get("tipo", ""),
            "respuesta_correcta": ck.get("respuesta_correcta", ""),
            "tasa_acierto": rate,
        })

    # Tomar las 3-5 mÃ¡s falladas
    enriched.sort(key=lambda x: x["tasa_acierto"])
    preguntas_falladas = enriched[:5]

    # Stats globales
    scores = [float(n.nota) for n in notas if n.nota is not None]
    promedio = sum(scores) / len(scores) if scores else 0.0
    nota_maxima = 5.0
    if isinstance(clave, dict) and "preguntas" in clave:
        nota_maxima = sum(float(p.get("puntos", 1.0)) for p in clave["preguntas"])

    # â”€â”€ Generar con Presenton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    started = time.perf_counter()
    try:
        result = await presenton_service.generate_review_presentation(
            titulo_examen=examen.titulo,
            materia=materia.nombre,
            preguntas_falladas=preguntas_falladas,
            promedio=promedio,
            nota_maxima=nota_maxima,
            num_slides=num_slides,
            plantilla=plantilla,
        )
    except Exception as exc:
        logger.exception("Error generando presentaciÃ³n de repaso")
        raise HTTPException(status_code=502, detail=f"No pudimos generar el repaso: {exc}")

    duracion_seg = round(time.perf_counter() - started, 2)
    titulo_pres = f"Repaso â€” {examen.titulo}"

    herr = Herramienta(
        profesor_id=current_user.id,
        tipo="presentacion",
        titulo=titulo_pres,
        contenido_json={
            "presentation_id": result.get("presentation_id"),
            "pptx_path":       result.get("pptx_path"),
            "pptx_url":        result.get("pptx_url"),
            "thumbnails":      result.get("thumbnails", []),
            "edit_url":        result.get("edit_url"),
            "outline":         result.get("outline", []),
            "subtipo":         "repaso_examen",
        },
        config_json={
            "num_slides":      num_slides,
            "plantilla":       plantilla,
            "examen_id":       str(examen_id),
            "examen_titulo":   examen.titulo,
            "promedio_grupo":  round(promedio, 2),
            "preguntas_repasadas": [q["numero"] for q in preguntas_falladas],
            "duracion_generacion_seg": duracion_seg,
        },
        estado="listo",
        materia_id=materia.id,
        examen_id=examen.id,
    )
    db.add(herr)

    db.add(TiempoEvaluacion(
        profesor_id=current_user.id,
        materia_id=materia.id,
        examen_id=examen.id,
        fase="con_sistema",
        actividad_tipo="presentacion_repaso",
        duracion_minutos=max(0.01, round(duracion_seg / 60, 2)),
        estudiantes_evaluados=len(notas),
        observacion=f"Repaso automÃ¡tico con {len(preguntas_falladas)} preguntas mÃ¡s falladas",
    ))

    await db.commit()
    await db.refresh(herr)
    return _herramienta_to_out(herr)


@router.post("/boletin/{materia_id}/{periodo_id}", response_model=PresentacionOut, status_code=201)
async def generar_presentacion_boletin(
    materia_id: UUID,
    periodo_id: UUID,
    plantilla: str = "modern",
    num_slides: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Genera una presentaciÃ³n de RESUMEN DE PERÃODO para reuniones de padres
    o direcciÃ³n acadÃ©mica. Auto-extrae datos del boletÃ­n ya calculado.
    """
    if not await is_tool_enabled(db, "presentacion"):
        raise HTTPException(status_code=403, detail="Herramienta deshabilitada")

    materia = await _assert_materia_owned(db, materia_id, current_user)

    per_result = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id))
    periodo = per_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="PerÃ­odo acadÃ©mico no encontrado")

    bol_result = await db.execute(
        select(Boletin).where(
            Boletin.materia_id == materia_id,
            Boletin.periodo_id == periodo_id,
        )
    )
    boletines = bol_result.scalars().all()
    if not boletines:
        raise HTTPException(
            status_code=400,
            detail="No hay boletines calculados para este perÃ­odo. CalcÃºlalos antes de generar el resumen.",
        )

    # Stats del grupo
    notas_finales = [float(b.nota_final) for b in boletines if b.nota_final is not None]
    promedio = sum(notas_finales) / len(notas_finales) if notas_finales else 0.0
    aprobados = sum(1 for n in notas_finales if n >= 3.0)
    reprobados = len(notas_finales) - aprobados

    # Top 5 estudiantes (cargar nombres)
    top_ids = sorted(boletines, key=lambda b: float(b.nota_final or 0), reverse=True)[:5]
    top_estudiantes: list[dict] = []
    for b in top_ids:
        u_result = await db.execute(select(User).where(User.id == b.estudiante_id))
        u = u_result.scalar_one_or_none()
        if u:
            top_estudiantes.append({
                "nombre": f"{u.nombre} {u.apellido}",
                "nota": float(b.nota_final or 0),
            })

    # HeurÃ­stica simple para fortalezas/debilidades â€” el LLM las refinarÃ¡
    fortalezas: list[str] = []
    debilidades: list[str] = []
    if promedio >= 4.0:
        fortalezas.append("Promedio alto del grupo, reflejo de buen rendimiento general")
    if aprobados >= len(notas_finales) * 0.8:
        fortalezas.append("MÃ¡s del 80% del grupo aprobÃ³ el perÃ­odo")
    if reprobados > len(notas_finales) * 0.3:
        debilidades.append(f"{reprobados} estudiantes requieren refuerzo acadÃ©mico")
    if promedio < 3.0:
        debilidades.append("Promedio del grupo por debajo de aprobaciÃ³n â€” revisar plan de estudios")

    started = time.perf_counter()
    try:
        result = await presenton_service.generate_period_presentation(
            materia=materia.nombre,
            periodo=periodo.nombre,
            promedio_grupo=promedio,
            aprobados=aprobados,
            reprobados=reprobados,
            top_estudiantes=top_estudiantes,
            fortalezas=fortalezas,
            debilidades=debilidades,
            num_slides=num_slides,
            plantilla=plantilla,
        )
    except Exception as exc:
        logger.exception("Error generando presentaciÃ³n de perÃ­odo")
        raise HTTPException(status_code=502, detail=f"No pudimos generar el resumen: {exc}")

    duracion_seg = round(time.perf_counter() - started, 2)
    titulo_pres = f"{materia.nombre} â€” {periodo.nombre}"

    herr = Herramienta(
        profesor_id=current_user.id,
        tipo="presentacion",
        titulo=titulo_pres,
        contenido_json={
            "presentation_id": result.get("presentation_id"),
            "pptx_path":       result.get("pptx_path"),
            "pptx_url":        result.get("pptx_url"),
            "thumbnails":      result.get("thumbnails", []),
            "edit_url":        result.get("edit_url"),
            "outline":         result.get("outline", []),
            "subtipo":         "boletin_periodo",
        },
        config_json={
            "num_slides":     num_slides,
            "plantilla":      plantilla,
            "periodo_id":     str(periodo_id),
            "periodo_nombre": periodo.nombre,
            "promedio_grupo": round(promedio, 2),
            "aprobados":      aprobados,
            "reprobados":     reprobados,
            "duracion_generacion_seg": duracion_seg,
        },
        estado="listo",
        materia_id=materia.id,
    )
    db.add(herr)

    db.add(TiempoEvaluacion(
        profesor_id=current_user.id,
        materia_id=materia.id,
        examen_id=None,
        fase="con_sistema",
        actividad_tipo="presentacion_boletin",
        duracion_minutos=max(0.01, round(duracion_seg / 60, 2)),
        estudiantes_evaluados=len(boletines),
        observacion=f"Resumen de perÃ­odo {periodo.nombre} con {len(boletines)} boletines",
    ))

    await db.commit()
    await db.refresh(herr)
    return _herramienta_to_out(herr)


@router.delete("/{herramienta_id}", status_code=204)
async def eliminar_presentacion(
    herramienta_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Elimina una presentaciÃ³n del profesor."""
    result = await db.execute(
        select(Herramienta).where(
            Herramienta.id == herramienta_id,
            Herramienta.tipo == "presentacion",
        )
    )
    herr = result.scalar_one_or_none()
    if not herr:
        raise HTTPException(status_code=404, detail="PresentaciÃ³n no encontrada")

    if current_user.rol == "profesor" and str(herr.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso")

    await db.delete(herr)
    await db.commit()
    return None
