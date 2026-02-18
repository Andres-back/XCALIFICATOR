from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import httpx

from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_client_ip, get_user_agent
from app.models.models import User, Sesion, PreferenciaNotif
from app.schemas.schemas import (
    UserRegister, UserLogin, GoogleLoginRequest,
    TokenResponse, UserOut, RefreshTokenRequest, UserUpdate, ChangePasswordRequest,
)

router = APIRouter(prefix="/auth", tags=["Autenticación"])
settings = get_settings()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Check unique constraints
    existing = await db.execute(
        select(User).where((User.correo == data.correo) | (User.documento == data.documento))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Correo o documento ya registrado")

    user = User(
        nombre=data.nombre,
        apellido=data.apellido,
        documento=data.documento,
        correo=data.correo,
        celular=data.celular,
        password_hash=hash_password(data.password),
        rol="estudiante",
    )
    db.add(user)
    await db.flush()

    # Notification preferences
    pref = PreferenciaNotif(
        user_id=user.id,
        acepta_email=True,
        acepta_whatsapp=data.acepta_whatsapp or False,
    )
    db.add(pref)

    # Register session
    sesion = Sesion(
        user_id=user.id,
        ip=get_client_ip(request),
        dispositivo=get_user_agent(request),
    )
    db.add(sesion)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id), "rol": user.rol})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.correo == data.correo))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    if not user.activo:
        raise HTTPException(status_code=403, detail="Usuario deshabilitado")

    # Register session
    sesion = Sesion(
        user_id=user.id,
        ip=get_client_ip(request),
        dispositivo=get_user_agent(request),
    )
    db.add(sesion)
    await db.commit()

    access_token = create_access_token({"sub": str(user.id), "rol": user.rol})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(
    data: GoogleLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        idinfo = id_token.verify_oauth2_token(
            data.token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Token de Google inválido")

    google_id = idinfo["sub"]
    email = idinfo.get("email", "")
    nombre = idinfo.get("given_name", "")
    apellido = idinfo.get("family_name", "")

    # Check if user exists
    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.correo == email))
    )
    user = result.scalar_one_or_none()

    if not user:
        # Auto-create user
        user = User(
            nombre=nombre or "Usuario",
            apellido=apellido or "Google",
            documento=f"G-{google_id[:12]}",
            correo=email,
            google_id=google_id,
            rol="estudiante",
        )
        db.add(user)
        await db.flush()
        pref = PreferenciaNotif(user_id=user.id, acepta_email=True)
        db.add(pref)
    elif not user.google_id:
        user.google_id = google_id

    if not user.activo:
        raise HTTPException(status_code=403, detail="Usuario deshabilitado")

    sesion = Sesion(
        user_id=user.id,
        ip=get_client_ip(request),
        dispositivo=get_user_agent(request),
    )
    db.add(sesion)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id), "rol": user.rol})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token inválido")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o deshabilitado")

    access_token = create_access_token({"sub": str(user.id), "rol": user.rol})
    new_refresh = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
async def update_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current user's profile (nombre, apellido, celular)."""
    if data.nombre is not None:
        current_user.nombre = data.nombre.strip()
    if data.apellido is not None:
        current_user.apellido = data.apellido.strip()
    if data.celular is not None:
        current_user.celular = data.celular.strip() or None
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/me/password")
async def change_own_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change current user's password."""
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"detail": "Contraseña actualizada exitosamente"}
