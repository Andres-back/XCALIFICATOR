import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.ai_provider_config import get_profesor_ai_config
from app.core.dependencies import require_role
from app.models.models import User, Nota, Examen, Materia, ChatHistory, ChatSession
from app.schemas.schemas import ChatMessage, ChatResponse, ChatHistoryOut, ChatSessionOut
from app.services.groq_service import rag_chat, classify_chat_relevance
from uuid import UUID

router = APIRouter(prefix="/chat", tags=["RAG Chatbot"])

# ── Xali session limits ──
MAX_QUESTIONS_PER_SESSION = 5
SESSION_DURATION_MINUTES = 10


def _cooldown_seconds_from_start(started_at: datetime | None) -> int:
    if not started_at:
        return 0
    elapsed_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
    remaining = int(SESSION_DURATION_MINUTES * 60 - elapsed_seconds)
    return max(0, remaining)


def _format_cooldown_detail(wait_seconds: int) -> str:
    minutes = wait_seconds // 60
    seconds = wait_seconds % 60
    if minutes > 0:
        return (
            f"Debes esperar {minutes} min {seconds:02d} s para iniciar una nueva sesión. "
            f"Solo se permite una sesión cada {SESSION_DURATION_MINUTES} minutos."
        )
    return (
        f"Debes esperar {seconds} s para iniciar una nueva sesión. "
        f"Solo se permite una sesión cada {SESSION_DURATION_MINUTES} minutos."
    )


@router.get("/{nota_id}/history", response_model=list[ChatHistoryOut])
async def get_chat_history(
    nota_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Get persistent chat history for a nota."""
    # Verify ownership
    result = await db.execute(select(Nota).where(Nota.id == nota_id))
    nota = result.scalar_one_or_none()
    if not nota or nota.estudiante_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    result = await db.execute(
        select(ChatHistory)
        .where(ChatHistory.nota_id == nota_id, ChatHistory.user_id == current_user.id)
        .order_by(ChatHistory.created_at.asc())
    )
    return result.scalars().all()


@router.post("/", response_model=ChatResponse)
async def student_chat(
    data: ChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Student RAG chatbot - persistent multi-turn conversation with session limits."""
    # Get the nota (includes exam context and feedback)
    result = await db.execute(select(Nota).where(Nota.id == data.nota_id))
    nota = result.scalar_one_or_none()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    if nota.estudiante_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    # ── Session management ──
    session = await _get_or_create_session(db, current_user.id, data.nota_id)
    if session.cerrada:
        raise HTTPException(
            status_code=429,
            detail="Sesión cerrada. Debes iniciar una nueva sesión para continuar.",
            headers={"X-RateLimit-Reason": "chat-session"},
        )

    now = datetime.now(timezone.utc)
    elapsed = (now - session.inicio).total_seconds() / 60
    if elapsed > SESSION_DURATION_MINUTES:
        session.cerrada = True
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail=f"Tu sesión de {SESSION_DURATION_MINUTES} minutos ha expirado. Inicia una nueva sesión.",
            headers={"X-RateLimit-Reason": "chat-session"},
        )

    if session.preguntas_usadas >= MAX_QUESTIONS_PER_SESSION:
        session.cerrada = True
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail=f"Has alcanzado el límite de {MAX_QUESTIONS_PER_SESSION} preguntas en esta sesión.",
            headers={"X-RateLimit-Reason": "chat-session"},
        )

    # Get exam content (without answer key)
    result = await db.execute(select(Examen).where(Examen.id == nota.examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    # Resolve profesor config to select chatbot model
    profesor_ai_cfg = None
    if getattr(examen, "materia_id", None):
        mat_result = await db.execute(select(Materia).where(Materia.id == examen.materia_id))
        materia = mat_result.scalar_one_or_none()
        profesor_ai_cfg = await get_profesor_ai_config(
            db,
            str(materia.profesor_id) if materia and getattr(materia, "profesor_id", None) else None,
        )

    # Build context - NO answer key
    exam_context = json.dumps(examen.contenido_json, ensure_ascii=False) if examen.contenido_json else ""
    student_answers = json.dumps(nota.detalle_json, ensure_ascii=False) if nota.detalle_json else ""
    feedback = nota.retroalimentacion or ""

    # Load conversation history from DB
    hist_result = await db.execute(
        select(ChatHistory)
        .where(ChatHistory.nota_id == data.nota_id, ChatHistory.user_id == current_user.id)
        .order_by(ChatHistory.created_at.asc())
    )
    history_rows = hist_result.scalars().all()
    conversation_history = [{"role": h.role, "content": h.content} for h in history_rows]

    # Validate scope: Xali must only answer exam-related questions.
    _cfg_relevance = profesor_ai_cfg or {}
    relevance_provider = "open_code" if _cfg_relevance.get("open_code_api_key") else _cfg_relevance.get("content_provider")
    relevance = await classify_chat_relevance(
        user_message=data.message,
        exam_context=exam_context,
        student_answers=student_answers,
        feedback=feedback,
        conversation_history=conversation_history,
        provider=relevance_provider,
        open_code_base_url=_cfg_relevance.get("open_code_base_url"),
        open_code_api_key=_cfg_relevance.get("open_code_api_key"),
        open_code_model=_cfg_relevance.get("chat_model") or _cfg_relevance.get("open_code_content_model"),
    )

    is_related = bool(relevance.get("is_exam_related", False))
    confidence = float(relevance.get("confidence", 0.0) or 0.0)

    if (not is_related) or confidence < 0.55:
        response = (
            "Solo puedo ayudarte con preguntas relacionadas con esta evaluación. "
            "Pregúntame sobre una pregunta del examen, tu retroalimentación o el procedimiento correcto para resolverla."
        )

        db.add(ChatHistory(nota_id=data.nota_id, user_id=current_user.id, role="user", content=data.message))
        db.add(ChatHistory(nota_id=data.nota_id, user_id=current_user.id, role="assistant", content=response))

        session.preguntas_usadas += 1
        if session.preguntas_usadas >= MAX_QUESTIONS_PER_SESSION:
            session.cerrada = True
        await db.commit()

        remaining = max(0, MAX_QUESTIONS_PER_SESSION - session.preguntas_usadas)
        time_remaining = max(0, SESSION_DURATION_MINUTES - elapsed)
        cooldown_seconds = _cooldown_seconds_from_start(session.inicio)
        can_start_new = remaining == 0 and cooldown_seconds == 0

        return ChatResponse(
            response=response,
            preguntas_restantes=remaining,
            minutos_restantes=round(time_remaining, 1),
            cooldown_segundos=cooldown_seconds,
            puede_iniciar_nueva_sesion=can_start_new,
        )

    try:
        _cfg = profesor_ai_cfg or {}
        chat_provider = "open_code" if _cfg.get("open_code_api_key") else _cfg.get("content_provider")
        response = await rag_chat(
            user_message=data.message,
            exam_context=exam_context,
            student_answers=student_answers,
            feedback=feedback,
            conversation_history=conversation_history,
            model=_cfg.get("chat_model"),
            provider=chat_provider,
            open_code_base_url=_cfg.get("open_code_base_url"),
            open_code_api_key=_cfg.get("open_code_api_key"),
            open_code_model=_cfg.get("chat_model") or _cfg.get("open_code_content_model"),
            ollama_url=_cfg.get("ollama_url"),
            ollama_api_key=_cfg.get("ollama_api_key"),
            ollama_model=_cfg.get("content_model"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en chatbot: {str(e)}")

    # Save both messages to DB
    db.add(ChatHistory(nota_id=data.nota_id, user_id=current_user.id, role="user", content=data.message))
    db.add(ChatHistory(nota_id=data.nota_id, user_id=current_user.id, role="assistant", content=response))

    # Update session counter
    session.preguntas_usadas += 1
    if session.preguntas_usadas >= MAX_QUESTIONS_PER_SESSION:
        session.cerrada = True
    await db.commit()

    remaining = max(0, MAX_QUESTIONS_PER_SESSION - session.preguntas_usadas)
    time_remaining = max(0, SESSION_DURATION_MINUTES - elapsed)
    cooldown_seconds = _cooldown_seconds_from_start(session.inicio)
    can_start_new = remaining == 0 and cooldown_seconds == 0

    return ChatResponse(
        response=response,
        preguntas_restantes=remaining,
        minutos_restantes=round(time_remaining, 1),
        cooldown_segundos=cooldown_seconds,
        puede_iniciar_nueva_sesion=can_start_new,
    )


# ── Session endpoints ──

@router.get("/session/{nota_id}", response_model=ChatSessionOut)
async def get_session_status(
    nota_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Get current session status for a nota."""
    session = await _get_active_session(db, current_user.id, nota_id)
    if not session:
        last_session = await _get_last_session(db, current_user.id, nota_id)
        cooldown_seconds = _cooldown_seconds_from_start(
            last_session.inicio if last_session else None
        )
        return ChatSessionOut(
            id=None,
            nota_id=nota_id,
            preguntas_usadas=0,
            preguntas_restantes=MAX_QUESTIONS_PER_SESSION,
            minutos_restantes=0.0,
            cerrada=True,
            cooldown_segundos=cooldown_seconds,
            puede_iniciar_nueva_sesion=(cooldown_seconds == 0),
            inicio=None,
        )
    now = datetime.now(timezone.utc)
    elapsed = (now - session.inicio).total_seconds() / 60
    cooldown_seconds = _cooldown_seconds_from_start(session.inicio)
    cerrada_o_expirada = session.cerrada or elapsed > SESSION_DURATION_MINUTES
    return ChatSessionOut(
        id=session.id,
        nota_id=nota_id,
        preguntas_usadas=session.preguntas_usadas,
        preguntas_restantes=MAX_QUESTIONS_PER_SESSION - session.preguntas_usadas,
        minutos_restantes=round(max(0, SESSION_DURATION_MINUTES - elapsed), 1),
        cerrada=cerrada_o_expirada,
        cooldown_segundos=cooldown_seconds,
        puede_iniciar_nueva_sesion=(cerrada_o_expirada and cooldown_seconds == 0),
        inicio=session.inicio,
    )


@router.post("/session/{nota_id}/new", response_model=ChatSessionOut)
async def start_new_session(
    nota_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Close current session and start a new one respecting cooldown."""
    last_session = await _get_last_session(db, current_user.id, nota_id)
    cooldown_seconds = _cooldown_seconds_from_start(last_session.inicio if last_session else None)
    if cooldown_seconds > 0:
        raise HTTPException(
            status_code=429,
            detail=_format_cooldown_detail(cooldown_seconds),
            headers={
                "X-RateLimit-Reason": "chat-cooldown",
                "Retry-After": str(cooldown_seconds),
            },
        )

    # Close any existing active session
    old = await _get_active_session(db, current_user.id, nota_id)
    if old:
        old.cerrada = True

    session = ChatSession(
        estudiante_id=current_user.id,
        nota_id=nota_id,
        inicio=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return ChatSessionOut(
        id=session.id,
        nota_id=nota_id,
        preguntas_usadas=0,
        preguntas_restantes=MAX_QUESTIONS_PER_SESSION,
        minutos_restantes=SESSION_DURATION_MINUTES,
        cerrada=False,
        cooldown_segundos=_cooldown_seconds_from_start(session.inicio),
        puede_iniciar_nueva_sesion=False,
        inicio=session.inicio,
    )


@router.post("/session/{nota_id}/close")
async def close_session(
    nota_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Manually close current session."""
    session = await _get_active_session(db, current_user.id, nota_id)
    if not session:
        raise HTTPException(status_code=404, detail="No hay sesión activa")
    session.cerrada = True
    await db.commit()
    return {"detail": "Sesión cerrada"}


# ── Helpers ──

async def _get_active_session(
    db: AsyncSession, student_id, nota_id
) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.estudiante_id == student_id,
            ChatSession.nota_id == nota_id,
            ChatSession.cerrada == False,
        ).order_by(ChatSession.inicio.desc())
    )
    return result.scalar_one_or_none()


async def _get_last_session(
    db: AsyncSession, student_id, nota_id
) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession)
        .where(
            ChatSession.estudiante_id == student_id,
            ChatSession.nota_id == nota_id,
        )
        .order_by(ChatSession.inicio.desc())
    )
    return result.scalars().first()


async def _get_or_create_session(
    db: AsyncSession, student_id, nota_id
) -> ChatSession:
    session = await _get_active_session(db, student_id, nota_id)
    if session:
        # Check if expired
        elapsed = (datetime.now(timezone.utc) - session.inicio).total_seconds() / 60
        if elapsed <= SESSION_DURATION_MINUTES and session.preguntas_usadas < MAX_QUESTIONS_PER_SESSION:
            return session
        session.cerrada = True
        await db.flush()

    last_session = session or await _get_last_session(db, student_id, nota_id)
    cooldown_seconds = _cooldown_seconds_from_start(last_session.inicio if last_session else None)
    if cooldown_seconds > 0:
        raise HTTPException(
            status_code=429,
            detail=_format_cooldown_detail(cooldown_seconds),
            headers={
                "X-RateLimit-Reason": "chat-cooldown",
                "Retry-After": str(cooldown_seconds),
            },
        )

    # Create new session
    session = ChatSession(
        estudiante_id=student_id,
        nota_id=nota_id,
        inicio=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()
    return session
