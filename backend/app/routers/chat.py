import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, Nota, Examen, ChatHistory, ChatSession
from app.schemas.schemas import ChatMessage, ChatResponse, ChatHistoryOut, ChatSessionOut
from app.services.groq_service import rag_chat
from uuid import UUID

router = APIRouter(prefix="/chat", tags=["RAG Chatbot"])

# ── Xali session limits ──
MAX_QUESTIONS_PER_SESSION = 5
SESSION_DURATION_MINUTES = 10


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
            detail="Sesión cerrada. Debes iniciar una nueva sesión para continuar."
        )

    now = datetime.now(timezone.utc)
    elapsed = (now - session.inicio).total_seconds() / 60
    if elapsed > SESSION_DURATION_MINUTES:
        session.cerrada = True
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail=f"Tu sesión de {SESSION_DURATION_MINUTES} minutos ha expirado. Inicia una nueva sesión."
        )

    if session.preguntas_usadas >= MAX_QUESTIONS_PER_SESSION:
        session.cerrada = True
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail=f"Has alcanzado el límite de {MAX_QUESTIONS_PER_SESSION} preguntas en esta sesión."
        )

    # Get exam content (without answer key)
    result = await db.execute(select(Examen).where(Examen.id == nota.examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

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

    try:
        response = await rag_chat(
            user_message=data.message,
            exam_context=exam_context,
            student_answers=student_answers,
            feedback=feedback,
            conversation_history=conversation_history,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en chatbot: {str(e)}")

    # Save both messages to DB
    db.add(ChatHistory(nota_id=data.nota_id, user_id=current_user.id, role="user", content=data.message))
    db.add(ChatHistory(nota_id=data.nota_id, user_id=current_user.id, role="assistant", content=response))

    # Update session counter
    session.preguntas_usadas += 1
    await db.commit()

    remaining = MAX_QUESTIONS_PER_SESSION - session.preguntas_usadas
    time_remaining = max(0, SESSION_DURATION_MINUTES - elapsed)

    return ChatResponse(
        response=response,
        preguntas_restantes=remaining,
        minutos_restantes=round(time_remaining, 1),
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
        return ChatSessionOut(
            id=None,
            nota_id=nota_id,
            preguntas_usadas=0,
            preguntas_restantes=MAX_QUESTIONS_PER_SESSION,
            minutos_restantes=SESSION_DURATION_MINUTES,
            cerrada=True,
            inicio=None,
        )
    now = datetime.now(timezone.utc)
    elapsed = (now - session.inicio).total_seconds() / 60
    return ChatSessionOut(
        id=session.id,
        nota_id=nota_id,
        preguntas_usadas=session.preguntas_usadas,
        preguntas_restantes=MAX_QUESTIONS_PER_SESSION - session.preguntas_usadas,
        minutos_restantes=round(max(0, SESSION_DURATION_MINUTES - elapsed), 1),
        cerrada=session.cerrada or elapsed > SESSION_DURATION_MINUTES,
        inicio=session.inicio,
    )


@router.post("/session/{nota_id}/new", response_model=ChatSessionOut)
async def start_new_session(
    nota_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Close current session and start a new one."""
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

    # Create new session
    session = ChatSession(
        estudiante_id=student_id,
        nota_id=nota_id,
        inicio=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()
    return session
