from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.models import User, PreferenciaNotif, Notificacion
from app.schemas.schemas import PreferenciaNotifUpdate, PreferenciaNotifOut

router = APIRouter(prefix="/notifications", tags=["Notificaciones"])


@router.get("/preferences", response_model=PreferenciaNotifOut)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PreferenciaNotif).where(PreferenciaNotif.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()
    if not pref:
        # Create default
        pref = PreferenciaNotif(user_id=current_user.id)
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return PreferenciaNotifOut.model_validate(pref)


@router.patch("/preferences", response_model=PreferenciaNotifOut)
async def update_preferences(
    data: PreferenciaNotifUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PreferenciaNotif).where(PreferenciaNotif.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()
    if not pref:
        pref = PreferenciaNotif(user_id=current_user.id)
        db.add(pref)

    if data.acepta_email is not None:
        pref.acepta_email = data.acepta_email
    if data.acepta_whatsapp is not None:
        pref.acepta_whatsapp = data.acepta_whatsapp

    await db.commit()
    await db.refresh(pref)
    return PreferenciaNotifOut.model_validate(pref)


@router.get("/history")
async def get_notification_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 50,
):
    result = await db.execute(
        select(Notificacion)
        .where(Notificacion.user_id == current_user.id)
        .order_by(Notificacion.fecha_envio.desc())
        .limit(limit)
    )
    notifs = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "tipo": n.tipo,
            "canal": n.canal,
            "mensaje": n.mensaje,
            "enviado": n.enviado,
            "fecha_envio": n.fecha_envio.isoformat() if n.fecha_envio else None,
        }
        for n in notifs
    ]
