from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.config import get_settings
from app.core.ai_provider_config import (
    get_profesor_ai_config,
    upsert_profesor_ai_config,
    fetch_ollama_models,
    fetch_groq_models,
    split_groq_models,
    fetch_open_code_models,
    split_open_code_models,
)
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    create_email_confirm_token,
)
from app.core.dependencies import get_current_user, get_client_ip, get_user_agent
from app.models.models import User, Sesion, PreferenciaNotif, AuditLog
from app.schemas.schemas import (
    UserRegister, UserLogin,
    TokenResponse, UserOut, RefreshTokenRequest, UserUpdate,
    ChangePasswordRequest, ChangeOwnPasswordRequest,
    LocalAIConfigOut, LocalAIConfigUpdate, LocalOllamaModelsOut,
)
from app.services.notification_service import send_email

router = APIRouter(prefix="/auth", tags=["Autenticación"])
settings = get_settings()


def _cookie_secure(request: Request) -> bool:
    proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    host = request.headers.get("host", "")
    return proto == "https" and "localhost" not in host and "127.0.0.1" not in host


def _set_auth_cookies(response: Response, request: Request, access_token: str, refresh_token: str) -> None:
    secure = _cookie_secure(request)
    response.set_cookie("access_token", access_token, max_age=settings.JWT_EXPIRY, httponly=True, secure=secure, samesite="lax", path="/")
    response.set_cookie("refresh_token", refresh_token, max_age=settings.JWT_REFRESH_EXPIRY, httponly=True, secure=secure, samesite="lax", path="/")


def _clear_auth_cookies(response: Response, request: Request) -> None:
    secure = _cookie_secure(request)
    response.delete_cookie("access_token", path="/", secure=secure, samesite="lax")
    response.delete_cookie("refresh_token", path="/", secure=secure, samesite="lax")


async def _close_user_sessions(db: AsyncSession, user_id):
    """Close all open sessions for a user (set fecha_fin)."""
    await db.execute(
        update(Sesion)
        .where(Sesion.user_id == user_id, Sesion.fecha_fin.is_(None))
        .values(fecha_fin=datetime.now(timezone.utc))
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister,
    request: Request,
    response: Response,
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
        acepta_telegram=data.acepta_telegram or False,
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

    # Send email confirmation asynchronously
    try:
        confirm_token = create_email_confirm_token(str(user.id))
        confirm_link = f"http://localhost/api/auth/confirm-email?token={confirm_token}"
        await send_email(
            to=user.correo,
            subject="Confirma tu correo - XCalificator",
            template_name="confirmar_correo",
            context={"nombre": user.nombre, "link": confirm_link},
        )
    except Exception:
        pass  # Don't break registration if email fails

    access_token = create_access_token({"sub": str(user.id), "rol": user.rol})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    _set_auth_cookies(response, request, access_token, refresh_token)

    return TokenResponse(
        access_token=None,
        refresh_token=None,
        user=UserOut.model_validate(user),
    )


@router.get("/confirm-email")
async def confirm_email(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Confirm user email address via token in the link."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "email_confirm":
        raise HTTPException(status_code=400, detail="Token de confirmación inválido o expirado")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.correo_verificado:
        return {"detail": "El correo ya fue confirmado anteriormente"}

    user.correo_verificado = True
    await db.commit()
    return {"detail": "Correo confirmado exitosamente. Ya puedes usar la plataforma."}


@router.post("/resend-confirmation")
async def resend_confirmation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resend email confirmation."""
    if current_user.correo_verificado:
        return {"detail": "El correo ya fue confirmado"}

    confirm_token = create_email_confirm_token(str(current_user.id))
    confirm_link = f"http://localhost/api/auth/confirm-email?token={confirm_token}"
    sent = await send_email(
        to=current_user.correo,
        subject="Confirma tu correo - XCalificator",
        template_name="confirmar_correo",
        context={"nombre": current_user.nombre, "link": confirm_link},
    )
    if not sent:
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo. Verifica la configuración SMTP.")
    return {"detail": "Correo de confirmación reenviado"}


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    request: Request,
    response: Response,
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

    # Close previous open sessions for normal login
    await _close_user_sessions(db, user.id)

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
    _set_auth_cookies(response, request, access_token, refresh_token)

    return TokenResponse(
        access_token=None,
        refresh_token=None,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    data: RefreshTokenRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    refresh_value = (data.refresh_token if data and data.refresh_token else None) or request.cookies.get("refresh_token")
    payload = decode_token(refresh_value)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token inválido")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o deshabilitado")

    access_token = create_access_token({"sub": str(user.id), "rol": user.rol})
    new_refresh = create_refresh_token({"sub": str(user.id)})
    _set_auth_cookies(response, request, access_token, new_refresh)

    return TokenResponse(
        access_token=None,
        refresh_token=None,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
async def update_profile(
    data: UserUpdate,
    request: Request,
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
    db.add(AuditLog(
        user_id=current_user.id,
        accion="update_profile",
        detalle={"fields": list(data.model_dump(exclude_unset=True).keys())},
        ip=get_client_ip(request),
    ))
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/me/password")
async def change_own_password(
    data: ChangeOwnPasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change current user's password."""
    if not current_user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Tu cuenta no tiene contraseña local configurada. Solicita restablecimiento de contraseña.",
        )

    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="La contraseña actual es incorrecta")

    if verify_password(data.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser diferente a la actual")

    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"detail": "Contraseña actualizada exitosamente"}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close all active sessions for the current user."""
    await _close_user_sessions(db, current_user.id)
    await db.commit()
    _clear_auth_cookies(response, request)
    return {"detail": "Sesión cerrada"}


def _as_local_ai_out(cfg: dict) -> LocalAIConfigOut:
    return LocalAIConfigOut(
        content_provider=cfg.get("content_provider") or "groq",
        grading_provider=cfg.get("grading_provider") or "groq",
        ocr_provider=cfg.get("ocr_provider") or "open_code_vision",
        groq_api_key=cfg.get("groq_api_key") or None,
        ollama_url=cfg.get("ollama_url") or "http://host.docker.internal:11434",
        ollama_api_key=cfg.get("ollama_api_key") or None,
        open_code_base_url=cfg.get("open_code_base_url") or None,
        open_code_api_key=cfg.get("open_code_api_key") or None,
        content_model=cfg.get("content_model") or None,
        grading_local_model=cfg.get("grading_model") or cfg.get("grading_fallback_model") or None,
        ocr_local_model=cfg.get("ocr_model") or cfg.get("ocr_fallback_model") or None,
        open_code_content_model=cfg.get("open_code_content_model") or None,
        open_code_vision_model=cfg.get("open_code_vision_model") or None,
        open_code_feedback_model=cfg.get("open_code_feedback_model") or None,
    )


@router.get("/me/local-ai-config", response_model=LocalAIConfigOut)
async def get_my_local_ai_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol != "profesor":
        raise HTTPException(status_code=403, detail="Solo los profesores pueden configurar IA local")

    cfg = await get_profesor_ai_config(db, str(current_user.id))
    return _as_local_ai_out(cfg)


@router.put("/me/local-ai-config", response_model=LocalAIConfigOut)
async def update_my_local_ai_config(
    data: LocalAIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol != "profesor":
        raise HTTPException(status_code=403, detail="Solo los profesores pueden configurar IA local")

    current_cfg = await get_profesor_ai_config(db, str(current_user.id))
    patch = data.model_dump(exclude_unset=True)

    merged = {
        **current_cfg,
        "content_provider": patch.get("content_provider", current_cfg.get("content_provider")),
        "grading_provider": patch.get("grading_provider", current_cfg.get("grading_provider")),
        "ocr_provider": patch.get("ocr_provider", current_cfg.get("ocr_provider")),
        "groq_api_key": patch.get("groq_api_key", current_cfg.get("groq_api_key")),
        "ollama_url": patch.get("ollama_url", current_cfg.get("ollama_url")),
        "ollama_api_key": patch.get("ollama_api_key", current_cfg.get("ollama_api_key")),
        "open_code_base_url": patch.get("open_code_base_url", current_cfg.get("open_code_base_url")),
        "open_code_api_key": patch.get("open_code_api_key", current_cfg.get("open_code_api_key")),
        "open_code_content_model": patch.get("open_code_content_model", current_cfg.get("open_code_content_model")),
        "open_code_vision_model": patch.get("open_code_vision_model", current_cfg.get("open_code_vision_model")),
        "open_code_feedback_model": patch.get("open_code_feedback_model", current_cfg.get("open_code_feedback_model")),
        "content_model": patch.get("content_model", current_cfg.get("content_model")),
        "grading_model": patch.get("grading_local_model", current_cfg.get("grading_model")),
        "ocr_model": patch.get("ocr_local_model", current_cfg.get("ocr_model")),
    }

    if merged.get("content_provider") == "open_code" and not merged.get("content_model"):
        merged["content_model"] = merged.get("open_code_content_model")
    if merged.get("grading_provider") == "open_code" and not merged.get("grading_model"):
        merged["grading_model"] = merged.get("open_code_feedback_model")
    if merged.get("ocr_provider") == "open_code_vision" and not merged.get("ocr_model"):
        merged["ocr_model"] = merged.get("open_code_vision_model")

    updated = await upsert_profesor_ai_config(
        db=db,
        profesor_id=str(current_user.id),
        config=merged,
        updated_by=str(current_user.id),
    )
    await db.commit()
    return _as_local_ai_out(updated)


@router.get("/me/ollama-models", response_model=LocalOllamaModelsOut)
async def get_my_ollama_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol != "profesor":
        raise HTTPException(status_code=403, detail="Solo los profesores pueden consultar modelos Ollama")

    cfg = await get_profesor_ai_config(db, str(current_user.id))
    ollama_url = cfg.get("ollama_url") or "http://host.docker.internal:11434"
    ollama_api_key = cfg.get("ollama_api_key") or None

    try:
        models = await fetch_ollama_models(ollama_url, ollama_api_key)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo consultar Ollama en {ollama_url}: {str(exc)}",
        )

    return LocalOllamaModelsOut(ollama_url=ollama_url, models=models)


@router.get("/me/groq-models")
async def get_my_groq_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol != "profesor":
        raise HTTPException(status_code=403, detail="Solo los profesores pueden consultar modelos Groq")

    cfg = await get_profesor_ai_config(db, str(current_user.id))
    try:
        models = await fetch_groq_models(cfg.get("groq_api_key"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar Groq Cloud: {str(exc)}")

    return split_groq_models(models)


@router.get("/me/open-code-models")
async def get_my_open_code_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol != "profesor":
        raise HTTPException(status_code=403, detail="Solo los profesores pueden consultar modelos Open Code")

    cfg = await get_profesor_ai_config(db, str(current_user.id))
    try:
        models = await fetch_open_code_models(
            cfg.get("open_code_base_url") or "",
            cfg.get("open_code_api_key"),
        )
    except Exception:
        models = []

    return split_open_code_models(models)
