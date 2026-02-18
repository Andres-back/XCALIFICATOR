import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, Nota, Examen, ChatHistory
from app.schemas.schemas import ChatMessage, ChatResponse, ChatHistoryOut
from app.services.groq_service import rag_chat
from uuid import UUID

router = APIRouter(prefix="/chat", tags=["RAG Chatbot"])


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
    """Student RAG chatbot - persistent multi-turn conversation."""
    # Get the nota (includes exam context and feedback)
    result = await db.execute(select(Nota).where(Nota.id == data.nota_id))
    nota = result.scalar_one_or_none()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    if nota.estudiante_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin permiso")

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
    await db.commit()

    return ChatResponse(response=response)
