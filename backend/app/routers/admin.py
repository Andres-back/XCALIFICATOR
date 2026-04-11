from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case, cast, Date
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.ai_provider_config import (
    get_global_ai_config,
    upsert_global_ai_config,
    get_profesor_ai_config,
    has_profesor_ai_override,
    clear_profesor_ai_override,
    upsert_profesor_ai_config,
    fetch_ollama_models,
    fetch_groq_models,
    split_groq_models,
)
from app.core.dependencies import require_role
from app.core.security import hash_password
from app.core.tool_flags import SUPPORTED_TOOL_TYPES, list_tool_flags, set_tool_flag
from app.models.models import User, Sesion, Nota, AuditLog, Materia, Matricula, Examen, RespuestaOnline, APIUsageLog, Boletin, PeriodoAcademico
from app.schemas.schemas import (
    UserOut, AdminUserCreate, AdminUserUpdate, ChangePasswordRequest, ChangeRoleRequest,
    SesionOut, AdminStats, AuditLogOut, AdminMateriaOut, APIUsageStats, APIUsageByModel,
    HerramientaFlagOut, HerramientaFlagUpdate,
    ProfesorAIConfigOut, ProfesorAIConfigUpdate, OllamaModelsOut, GroqModelsOut, GlobalAIConfigOut,
)

router = APIRouter(prefix="/admin", tags=["Administración"])


async def _get_profesor_or_404(db: AsyncSession, profesor_id: str) -> User:
    result = await db.execute(
        select(User).where(
            User.id == profesor_id,
            User.rol == "profesor",
        )
    )
    profesor = result.scalar_one_or_none()
    if not profesor:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")
    return profesor


def _to_profesor_config_out(profesor: User, cfg: dict, uses_global: bool = False) -> ProfesorAIConfigOut:
    return ProfesorAIConfigOut(
        profesor_id=profesor.id,
        profesor_nombre=f"{profesor.nombre} {profesor.apellido}",
        profesor_correo=profesor.correo,
        uses_global=uses_global,
        grading_provider=cfg.get("grading_provider") or "groq",
        grading_model=cfg.get("grading_model") or None,
        grading_fallback_provider=cfg.get("grading_fallback_provider") or None,
        grading_fallback_model=cfg.get("grading_fallback_model") or None,
        ocr_provider=cfg.get("ocr_provider") or "paddleocr",
        ocr_model=cfg.get("ocr_model") or None,
        ocr_fallback_provider=cfg.get("ocr_fallback_provider") or None,
        ocr_fallback_model=cfg.get("ocr_fallback_model") or None,
        chat_model=cfg.get("chat_model") or "meta-llama/llama-4-scout-17b-16e-instruct",
        ollama_url=cfg.get("ollama_url") or "http://host.docker.internal:11434",
        updated_at=cfg.get("updated_at"),
        updated_by=cfg.get("updated_by"),
    )


def _to_global_config_out(cfg: dict) -> GlobalAIConfigOut:
    return GlobalAIConfigOut(
        grading_provider=cfg.get("grading_provider") or "groq",
        grading_model=cfg.get("grading_model") or None,
        grading_fallback_provider=cfg.get("grading_fallback_provider") or None,
        grading_fallback_model=cfg.get("grading_fallback_model") or None,
        ocr_provider=cfg.get("ocr_provider") or "paddleocr",
        ocr_model=cfg.get("ocr_model") or None,
        ocr_fallback_provider=cfg.get("ocr_fallback_provider") or None,
        ocr_fallback_model=cfg.get("ocr_fallback_model") or None,
        chat_model=cfg.get("chat_model") or "meta-llama/llama-4-scout-17b-16e-instruct",
        ollama_url=cfg.get("ollama_url") or "http://host.docker.internal:11434",
        updated_at=cfg.get("updated_at"),
        updated_by=cfg.get("updated_by"),
    )


# ──────────────── STATS ────────────────

@router.get("/stats", response_model=AdminStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    activos = (await db.execute(select(func.count(User.id)).where(User.activo == True))).scalar() or 0
    inactivos = (await db.execute(select(func.count(User.id)).where(User.activo == False))).scalar() or 0

    # Role counts
    role_counts = (await db.execute(
        select(User.rol, func.count(User.id)).group_by(User.rol)
    )).all()
    role_map = {r: c for r, c in role_counts}

    sesiones_activas = (await db.execute(
        select(func.count(Sesion.id)).where(Sesion.fecha_fin.is_(None))
    )).scalar() or 0

    examenes_hoy = (await db.execute(
        select(func.count(Nota.id)).where(Nota.created_at >= today_start)
    )).scalar() or 0

    total_materias = (await db.execute(select(func.count(Materia.id)))).scalar() or 0
    total_examenes = (await db.execute(select(func.count(Examen.id)))).scalar() or 0
    total_notas = (await db.execute(select(func.count(Nota.id)))).scalar() or 0

    promedio = (await db.execute(select(func.avg(Nota.nota)))).scalar()
    promedio_global = round(float(promedio), 2) if promedio else None

    examenes_online = (await db.execute(
        select(func.count(Examen.id)).where(Examen.activo_online == True)
    )).scalar() or 0

    registros_recientes = (await db.execute(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    )).scalar() or 0

    return AdminStats(
        total_usuarios=total,
        sesiones_activas=sesiones_activas,
        examenes_calificados_hoy=examenes_hoy,
        usuarios_activos=activos,
        usuarios_inactivos=inactivos,
        total_profesores=role_map.get("profesor", 0),
        total_estudiantes=role_map.get("estudiante", 0),
        total_admins=role_map.get("admin", 0),
        total_materias=total_materias,
        total_examenes=total_examenes,
        total_notas=total_notas,
        promedio_global=promedio_global,
        examenes_online_activos=examenes_online,
        registros_ultimos_7_dias=registros_recientes,
    )


# ──────────────── USERS CRUD ────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [UserOut.model_validate(u) for u in users]


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return UserOut.model_validate(user)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
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
        rol=data.rol,
        grado=data.grado,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_create_user",
        detalle={"nuevo_usuario": str(user.id), "rol": user.rol},
    )
    db.add(audit)
    await db.commit()

    return UserOut.model_validate(user)


@router.patch("/users/{user_id}/toggle", response_model=UserOut)
async def toggle_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="No puedes deshabilitarte a ti mismo")

    user.activo = not user.activo
    audit = AuditLog(
        user_id=current_user.id,
        accion="toggle_user",
        detalle={"target_user": str(user.id), "nuevo_estado": user.activo},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def change_user_role(
    user_id: str,
    data: ChangeRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")

    old_rol = user.rol
    user.rol = data.rol
    audit = AuditLog(
        user_id=current_user.id,
        accion="change_role",
        detalle={"target_user": str(user.id), "old_rol": old_rol, "new_rol": data.rol},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}/grado", response_model=UserOut)
async def change_user_grado(
    user_id: str,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    old_grado = user.grado
    user.grado = data.grado
    audit = AuditLog(
        user_id=current_user.id,
        accion="change_grado",
        detalle={"target_user": str(user.id), "old_grado": old_grado, "new_grado": data.grado},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}/password")
async def admin_change_password(
    user_id: str,
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.password_hash = hash_password(data.new_password)
    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_change_password",
        detalle={"target_user": str(user.id)},
    )
    db.add(audit)
    await db.commit()
    return {"message": "Contraseña actualizada"}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if str(user.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_delete_user",
        detalle={"deleted_user": str(user.id), "correo": user.correo, "rol": user.rol},
    )
    db.add(audit)
    await db.commit()

    await db.delete(user)
    await db.commit()


# ──────────────── SESSIONS ────────────────

@router.get("/users/{user_id}/sessions", response_model=list[SesionOut])
async def get_user_sessions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(
        select(Sesion).where(Sesion.user_id == user_id).order_by(Sesion.fecha_inicio.desc()).limit(50)
    )
    sesiones = result.scalars().all()
    return [SesionOut.model_validate(s) for s in sesiones]


@router.get("/sessions")
async def get_all_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
    activas: bool = False,
    limit: int = 100,
):
    """Return sessions with user info. ?activas=true returns only active (no fecha_fin)."""
    q = select(Sesion).options(selectinload(Sesion.user)).order_by(Sesion.fecha_inicio.desc())
    if activas:
        q = q.where(Sesion.fecha_fin.is_(None))
    q = q.limit(limit)
    result = await db.execute(q)
    sesiones = result.scalars().all()
    out = []
    for s in sesiones:
        d = {
            "id": str(s.id),
            "user_id": str(s.user_id),
            "ip": str(s.ip) if s.ip else None,
            "dispositivo": s.dispositivo,
            "fecha_inicio": s.fecha_inicio.isoformat() if s.fecha_inicio else None,
            "fecha_fin": s.fecha_fin.isoformat() if s.fecha_fin else None,
            "usuario_nombre": f"{s.user.nombre} {s.user.apellido}" if s.user else None,
            "usuario_correo": s.user.correo if s.user else None,
            "usuario_rol": s.user.rol if s.user else None,
        }
        out.append(d)
    return out


# ──────────────── MATERIAS MANAGEMENT ────────────────

@router.get("/materias", response_model=list[AdminMateriaOut])
async def list_all_materias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(
        select(Materia).options(selectinload(Materia.profesor)).order_by(Materia.created_at.desc())
    )
    materias = result.scalars().all()

    out = []
    for m in materias:
        # Count students
        est_count = (await db.execute(
            select(func.count(Matricula.id)).where(Matricula.materia_id == m.id)
        )).scalar() or 0
        # Count exams
        ex_count = (await db.execute(
            select(func.count(Examen.id)).where(Examen.materia_id == m.id)
        )).scalar() or 0

        d = AdminMateriaOut.model_validate(m)
        d.profesor_nombre = f"{m.profesor.nombre} {m.profesor.apellido}" if m.profesor else None
        d.num_estudiantes = est_count
        d.num_examenes = ex_count
        out.append(d)
    return out


@router.delete("/materias/{materia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_materia(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_delete_materia",
        detalle={"materia_id": str(materia.id), "nombre": materia.nombre},
    )
    db.add(audit)
    await db.commit()

    await db.delete(materia)
    await db.commit()


# ──────────────── AUDIT LOG ────────────────

@router.get("/audit", response_model=list[AuditLogOut])
async def get_audit_log(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
    limit: int = 100,
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    logs = result.scalars().all()
    return [AuditLogOut.model_validate(l) for l in logs]


# ──────────────── API USAGE ────────────────

@router.get("/api-usage", response_model=APIUsageStats)
async def get_api_usage(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Groq API usage stats for admin dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    # Requests & tokens today
    today_agg = (await db.execute(
        select(
            func.count(APIUsageLog.id),
            func.coalesce(func.sum(APIUsageLog.total_tokens), 0),
        ).where(APIUsageLog.created_at >= today_start)
    )).one()
    req_today = int(today_agg[0])
    tok_today = int(today_agg[1])

    # Requests & tokens this month
    month_agg = (await db.execute(
        select(
            func.count(APIUsageLog.id),
            func.coalesce(func.sum(APIUsageLog.total_tokens), 0),
        ).where(APIUsageLog.created_at >= month_start)
    )).one()
    req_month = int(month_agg[0])
    tok_month = int(month_agg[1])

    # Usage by task (this month)
    by_task_rows = (await db.execute(
        select(
            APIUsageLog.model,
            APIUsageLog.task,
            func.count(APIUsageLog.id),
            func.coalesce(func.sum(APIUsageLog.total_tokens), 0),
        )
        .where(APIUsageLog.created_at >= month_start)
        .group_by(APIUsageLog.model, APIUsageLog.task)
    )).all()
    usage_by_task = [
        APIUsageByModel(model=r[0], task=r[1], requests=int(r[2]), total_tokens=int(r[3]))
        for r in by_task_rows
    ]

    # Daily history (last 7 days)
    daily_rows = (await db.execute(
        select(
            cast(APIUsageLog.created_at, Date).label("day"),
            func.count(APIUsageLog.id),
            func.coalesce(func.sum(APIUsageLog.total_tokens), 0),
        )
        .where(APIUsageLog.created_at >= week_ago)
        .group_by(cast(APIUsageLog.created_at, Date))
        .order_by(cast(APIUsageLog.created_at, Date))
    )).all()
    daily_history = [
        {"date": str(r[0]), "requests": int(r[1]), "tokens": int(r[2])}
        for r in daily_rows
    ]

    DAILY_REQ_LIMIT = 14400  # Groq free tier

    return APIUsageStats(
        total_requests_today=req_today,
        total_requests_this_month=req_month,
        total_tokens_today=tok_today,
        total_tokens_this_month=tok_month,
        remaining_requests_today=max(0, DAILY_REQ_LIMIT - req_today),
        usage_by_task=usage_by_task,
        daily_history=daily_history,
    )


# ──────────────── TOOL FLAGS ────────────────

@router.get("/herramientas-flags", response_model=list[HerramientaFlagOut])
async def get_herramientas_flags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return await list_tool_flags(db)


@router.put("/herramientas-flags/{tipo}", response_model=HerramientaFlagOut)
async def update_herramientas_flag(
    tipo: str,
    data: HerramientaFlagUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if tipo not in SUPPORTED_TOOL_TYPES:
        raise HTTPException(status_code=404, detail="Tipo de herramienta no encontrado")

    await set_tool_flag(
        db=db,
        tipo=tipo,
        enabled=data.enabled,
        updated_by=str(current_user.id),
    )

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_tool_flag_update",
        detalle={"tipo": tipo, "enabled": data.enabled},
    )
    db.add(audit)
    await db.commit()

    flags = await list_tool_flags(db)
    selected = next((f for f in flags if f.get("tipo") == tipo), None)
    if not selected:
        raise HTTPException(status_code=500, detail="No se pudo leer la configuración actualizada")
    return selected


# ──────────────── IA/OCR CONFIG POR PROFESOR ────────────────

@router.get("/ai-configs/global", response_model=GlobalAIConfigOut)
async def get_global_ai_config_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    cfg = await get_global_ai_config(db)
    return _to_global_config_out(cfg)


@router.put("/ai-configs/global", response_model=GlobalAIConfigOut)
async def update_global_ai_config_endpoint(
    data: ProfesorAIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    current_cfg = await get_global_ai_config(db)
    patch = data.model_dump(exclude_unset=True)
    merged = {**current_cfg, **patch}

    updated_cfg = await upsert_global_ai_config(
        db=db,
        config=merged,
        updated_by=str(current_user.id),
    )

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_ai_global_config_update",
        detalle={"changes": patch},
    )
    db.add(audit)
    await db.commit()

    return _to_global_config_out(updated_cfg)


@router.get("/ai-configs/global/ollama-models", response_model=OllamaModelsOut)
async def detect_global_ollama_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    cfg = await get_global_ai_config(db)
    ollama_url = cfg.get("ollama_url") or "http://host.docker.internal:11434"

    try:
        models = await fetch_ollama_models(ollama_url)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo consultar Ollama en {ollama_url}: {str(exc)}",
        )

    return OllamaModelsOut(
        profesor_id=None,
        ollama_url=ollama_url,
        models=models,
    )

@router.get("/ai-configs", response_model=list[ProfesorAIConfigOut])
async def list_profesores_ai_configs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    result = await db.execute(
        select(User)
        .where(User.rol == "profesor")
        .order_by(User.nombre.asc(), User.apellido.asc())
    )
    profesores = result.scalars().all()

    out = []
    for profesor in profesores:
        uses_override = await has_profesor_ai_override(db, str(profesor.id))
        cfg = await get_profesor_ai_config(db, str(profesor.id))
        out.append(_to_profesor_config_out(profesor, cfg, uses_global=not uses_override))
    return out


@router.get("/ai-configs/{profesor_id}", response_model=ProfesorAIConfigOut)
async def get_profesor_ai_config_endpoint(
    profesor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    profesor = await _get_profesor_or_404(db, profesor_id)
    uses_override = await has_profesor_ai_override(db, str(profesor.id))
    cfg = await get_profesor_ai_config(db, str(profesor.id))
    return _to_profesor_config_out(profesor, cfg, uses_global=not uses_override)


@router.put("/ai-configs/{profesor_id}", response_model=ProfesorAIConfigOut)
async def update_profesor_ai_config(
    profesor_id: str,
    data: ProfesorAIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    profesor = await _get_profesor_or_404(db, profesor_id)
    current_cfg = await get_profesor_ai_config(db, str(profesor.id))
    patch = data.model_dump(exclude_unset=True)
    merged = {**current_cfg, **patch}

    await upsert_profesor_ai_config(
        db=db,
        profesor_id=str(profesor.id),
        config=merged,
        updated_by=str(current_user.id),
    )

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_ai_config_update",
        detalle={
            "profesor_id": str(profesor.id),
            "profesor_correo": profesor.correo,
            "changes": patch,
        },
    )
    db.add(audit)
    await db.commit()

    updated_cfg = await get_profesor_ai_config(db, str(profesor.id))
    return _to_profesor_config_out(profesor, updated_cfg, uses_global=False)


@router.delete("/ai-configs/{profesor_id}/override", response_model=ProfesorAIConfigOut)
async def clear_profesor_ai_config_override(
    profesor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    profesor = await _get_profesor_or_404(db, profesor_id)

    await clear_profesor_ai_override(db, str(profesor.id))

    audit = AuditLog(
        user_id=current_user.id,
        accion="admin_ai_config_clear_override",
        detalle={
            "profesor_id": str(profesor.id),
            "profesor_correo": profesor.correo,
        },
    )
    db.add(audit)
    await db.commit()

    effective_cfg = await get_profesor_ai_config(db, str(profesor.id))
    return _to_profesor_config_out(profesor, effective_cfg, uses_global=True)


@router.get("/ai-configs/{profesor_id}/ollama-models", response_model=OllamaModelsOut)
async def detect_profesor_ollama_models(
    profesor_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    profesor = await _get_profesor_or_404(db, profesor_id)
    cfg = await get_profesor_ai_config(db, str(profesor.id))
    ollama_url = cfg.get("ollama_url") or "http://host.docker.internal:11434"

    try:
        models = await fetch_ollama_models(ollama_url)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo consultar Ollama en {ollama_url}: {str(exc)}",
        )

    return OllamaModelsOut(
        profesor_id=profesor.id,
        ollama_url=ollama_url,
        models=models,
    )


@router.get("/groq-models", response_model=GroqModelsOut)
async def list_groq_models_catalog(
    current_user: User = Depends(require_role("admin")),
):
    try:
        models = await fetch_groq_models()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar Groq Models API: {str(exc)}")

    return GroqModelsOut(**split_groq_models(models))


# ──────────────── BOLETINES GLOBALES ────────────────

def _safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _infer_competencia(activity: dict) -> str:
    tipo = str(activity.get("tipo") or "").strip().lower()
    titulo = str(activity.get("titulo") or "").strip().lower()
    full = f"{tipo} {titulo}"

    if any(k in full for k in ["proyecto", "taller", "laboratorio", "lab", "practica", "práctica", "problema", "reto", "caso"]):
        return "Resolución de problemas y aplicación"

    if any(k in full for k in ["exposicion", "exposición", "debate", "oral", "presentacion", "presentación", "participacion", "participación", "sustentacion", "sustentación"]):
        return "Comunicación y argumentación"

    if any(k in full for k in ["analisis", "análisis", "interpretacion", "interpretación", "lectura", "ensayo", "informe", "texto"]):
        return "Pensamiento crítico e interpretación"

    if tipo in {"desarrollo", "respuesta_corta"}:
        return "Comunicación escrita y argumentación"

    if tipo in {"seleccion_multiple", "verdadero_falso", "completar", "quiz", "prueba", "examen"}:
        return "Comprensión conceptual"

    if any(k in full for k in ["sopa", "crucigrama", "emparejar", "juego", "dinamica", "dinámica"]):
        return "Relación y aplicación de conceptos"

    return "Competencia académica general"


def _strength_level(avg: float) -> str:
    if avg >= 4.5:
        return "sobresaliente"
    if avg >= 4.0:
        return "alto"
    return "adecuado"


def _build_materia_insights(activities: list[dict], nota_definitiva: float) -> tuple[list[str], list[str]]:
    competencia_stats = {}

    for activity in activities:
        if not isinstance(activity, dict):
            continue

        nota_raw = activity.get("nota")
        if nota_raw is None:
            continue

        try:
            nota = round(float(nota_raw), 2)
        except (TypeError, ValueError):
            continue

        competencia = _infer_competencia(activity)
        peso = _safe_float(activity.get("porcentaje"), 0.0)
        if peso <= 0:
            peso = 1.0

        item = competencia_stats.setdefault(
            competencia,
            {
                "weighted_sum": 0.0,
                "weight_total": 0.0,
                "count": 0,
            },
        )
        item["weighted_sum"] += nota * peso
        item["weight_total"] += peso
        item["count"] += 1

    ranked = []
    for competencia, stats in competencia_stats.items():
        if stats["weight_total"] <= 0:
            continue
        promedio = round(stats["weighted_sum"] / stats["weight_total"], 2)
        ranked.append(
            {
                "competencia": competencia,
                "promedio": promedio,
                "count": int(stats["count"]),
            }
        )

    fortalezas = []
    for row in sorted(ranked, key=lambda x: x["promedio"], reverse=True):
        if row["promedio"] < 3.8:
            continue
        fortalezas.append(
            f"{row['competencia']}: desempeño { _strength_level(row['promedio']) } ({row['promedio']:.2f}) en {row['count']} actividad(es)."
        )
        if len(fortalezas) >= 3:
            break

    debilidades = []
    for row in sorted(ranked, key=lambda x: x["promedio"]):
        if row["promedio"] >= 3.0:
            continue
        debilidades.append(
            f"{row['competencia']}: requiere refuerzo ({row['promedio']:.2f}) en {row['count']} actividad(es)."
        )
        if len(debilidades) >= 3:
            break

    if not fortalezas:
        if nota_definitiva >= 4.0:
            fortalezas = ["Competencias consolidadas con rendimiento global alto."]
        elif nota_definitiva >= 3.0:
            fortalezas = ["Cumple de forma básica las competencias esperadas del período."]
        else:
            fortalezas = ["Cuenta con evidencias para trazar plan de fortalecimiento por competencias."]

    if not debilidades:
        if nota_definitiva < 3.0:
            debilidades = ["Se requiere acompañamiento integral para fortalecer competencias base."]
        else:
            debilidades = ["Sin debilidades críticas por competencias en las evidencias calificadas."]

    return fortalezas, debilidades


def _join_names(items: list[str]) -> str:
    clean = [str(x).strip() for x in items if str(x).strip()]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    if len(clean) == 2:
        return f"{clean[0]} y {clean[1]}"
    return f"{', '.join(clean[:-1])} y {clean[-1]}"


def _build_student_general_note(materias_payload: list[dict], promedio_definitivo: float) -> str:
    if not materias_payload:
        return "Aun no hay suficientes calificaciones para generar una nota general del estudiante."

    ranked_desc = sorted(
        materias_payload,
        key=lambda x: _safe_float(x.get("nota_definitiva"), 0.0),
        reverse=True,
    )
    ranked_asc = list(reversed(ranked_desc))

    strong_subjects = []
    for m in ranked_desc:
        nota = _safe_float(m.get("nota_definitiva"), 0.0)
        if nota >= 3.8:
            strong_subjects.append(str(m.get("materia_nombre") or ""))
        if len(strong_subjects) >= 2:
            break

    weak_subjects = []
    for m in ranked_asc:
        nota = _safe_float(m.get("nota_definitiva"), 0.0)
        if nota < 3.0:
            weak_subjects.append(str(m.get("materia_nombre") or ""))
        if len(weak_subjects) >= 2:
            break

    parts = []
    if promedio_definitivo >= 4.3:
        parts.append("El estudiante presenta un desempeno academico sobresaliente.")
    elif promedio_definitivo >= 3.8:
        parts.append("El estudiante presenta un buen desempeno academico y muestra compromiso constante.")
    elif promedio_definitivo >= 3.0:
        parts.append("El estudiante cumple con los desempenos esperados y va por buen camino.")
    else:
        parts.append("El estudiante esta en proceso de fortalecimiento y requiere acompanamiento academico.")

    if strong_subjects:
        parts.append(
            f"Se destaca especialmente en {_join_names(strong_subjects)}."
        )

    if weak_subjects:
        parts.append(
            f"Debe mejorar en {_join_names(weak_subjects)}, pero no esta mal: con practica y apoyo en casa puede avanzar rapidamente."
        )

    if promedio_definitivo >= 4.0:
        parts.append("Tienes un hijo genial, sigamos potenciando sus talentos.")
    elif promedio_definitivo >= 3.0 and not weak_subjects:
        parts.append("Continua fortaleciendo habitos de estudio para seguir creciendo.")

    return " ".join(parts)

@router.get("/boletines-global/{periodo_id}")
async def get_boletines_global(
    periodo_id: str,
    grado: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Global report cards: aggregate all published boletines across ALL materias
    for each student in a given periodo, grouped by grado.
    """
    # Validate periodo
    periodo_result = await db.execute(
        select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id)
    )
    periodo = periodo_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período no encontrado")

    # Get configured periods to build historical table (P1..P4 or configured set)
    periodos_result = await db.execute(
        select(PeriodoAcademico).order_by(PeriodoAcademico.numero.asc())
    )
    periodos_configurados = periodos_result.scalars().all()
    periodos_config_payload = [
        {
            "id": str(p.id),
            "nombre": p.nombre,
            "numero": p.numero,
            "porcentaje": _safe_float(p.porcentaje, 0.0),
            "activo": bool(p.activo),
        }
        for p in periodos_configurados
    ]
    period_ids = [p.id for p in periodos_configurados]

    # Get all published boletines for the selected period (main period view)
    q = (
        select(Boletin)
        .where(Boletin.periodo_id == periodo_id, Boletin.publicado == True)
    )
    boletines_result = await db.execute(q)
    boletines = boletines_result.scalars().all()

    # Fetch all referenced students, materias
    student_ids = list({b.estudiante_id for b in boletines})
    materia_ids = list({b.materia_id for b in boletines})
    students_map = {}
    materias_map = {}
    if student_ids:
        students_result = await db.execute(
            select(User).where(User.id.in_(student_ids))
        )
        students_map = {u.id: u for u in students_result.scalars().all()}

    if materia_ids:
        materias_result = await db.execute(
            select(Materia).where(Materia.id.in_(materia_ids))
        )
        materias_map = {m.id: m for m in materias_result.scalars().all()}

    # Fetch historical boletines for configured periods to fill P1..P4 and definitive grade.
    historic_map = {}
    historic_by_subject = {}
    if student_ids and materia_ids:
        period_filter_ids = [periodo.id]
        if period_ids:
            period_filter_ids = period_ids

        historic_result = await db.execute(
            select(Boletin).where(
                Boletin.estudiante_id.in_(student_ids),
                Boletin.materia_id.in_(materia_ids),
                Boletin.publicado == True,
                Boletin.periodo_id.in_(period_filter_ids),
            )
        )
        historic_boletines = historic_result.scalars().all()
        for hb in historic_boletines:
            key = (str(hb.estudiante_id), str(hb.materia_id), str(hb.periodo_id))
            historic_map[key] = hb
            sm_key = (str(hb.estudiante_id), str(hb.materia_id))
            if sm_key not in historic_by_subject:
                historic_by_subject[sm_key] = []
            historic_by_subject[sm_key].append(hb)

    selected_by_student = {}
    for b in boletines:
        if b.estudiante_id not in selected_by_student:
            selected_by_student[b.estudiante_id] = []
        selected_by_student[b.estudiante_id].append(b)

    # Build per-student records grouped by grado
    grado_groups = {}
    for sid, bols in selected_by_student.items():
        est = students_map.get(sid)
        if not est:
            continue
        est_grado = est.grado or "Sin grado"

        # Filter by grado if specified
        if grado and est_grado != grado:
            continue

        if est_grado not in grado_groups:
            grado_groups[est_grado] = []

        materias_payload = []
        for b in bols:
            sid_str = str(sid)
            mid_str = str(b.materia_id)
            materia = materias_map.get(b.materia_id)
            historical_subject = historic_by_subject.get((sid_str, mid_str), [])

            notas_periodos = {}
            weighted_sum = 0.0
            weighted_pct_total = 0.0
            notas_disponibles = []
            all_activities = []

            source_periodos = periodos_configurados or [periodo]
            for p in source_periodos:
                hb = historic_map.get((sid_str, mid_str, str(p.id)))
                nota_p = None
                if hb and hb.nota_final is not None:
                    nota_p = round(float(hb.nota_final), 2)
                    notas_disponibles.append(nota_p)

                    pct = _safe_float(getattr(p, "porcentaje", 0), 0.0)
                    if pct > 0:
                        weighted_sum += nota_p * (pct / 100.0)
                        weighted_pct_total += pct

                notas_periodos[str(p.numero)] = nota_p

            if weighted_pct_total > 0:
                nota_definitiva = round(min(5.0, weighted_sum / (weighted_pct_total / 100.0)), 2)
            elif notas_disponibles:
                nota_definitiva = round(sum(notas_disponibles) / len(notas_disponibles), 2)
            else:
                nota_definitiva = 0.0

            for hb in historical_subject:
                desglose = hb.desglose_json if isinstance(hb.desglose_json, dict) else {}
                acts = desglose.get("actividades") if isinstance(desglose, dict) else []
                if not isinstance(acts, list):
                    continue
                period_item = next((pp for pp in source_periodos if str(pp.id) == str(hb.periodo_id)), None)
                periodo_numero = period_item.numero if period_item else None
                for act in acts:
                    if isinstance(act, dict):
                        all_activities.append({**act, "periodo_numero": periodo_numero})

            fortalezas, debilidades = _build_materia_insights(all_activities, nota_definitiva)

            materias_payload.append({
                "materia_id": mid_str,
                "materia_nombre": materia.nombre if materia else "Desconocida",
                "nota_final": _safe_float(b.nota_final, 0.0),
                "desglose_json": b.desglose_json,
                "publicado_at": b.publicado_at.isoformat() if b.publicado_at else None,
                "notas_periodos": notas_periodos,
                "nota_definitiva": nota_definitiva,
                "fortalezas": fortalezas,
                "debilidades": debilidades,
            })

        notas_periodo_actual = [m["nota_final"] for m in materias_payload]
        promedio_periodo = round(sum(notas_periodo_actual) / len(notas_periodo_actual), 2) if notas_periodo_actual else 0.0

        notas_definitivas = [m["nota_definitiva"] for m in materias_payload if m["nota_definitiva"] is not None]
        promedio_definitivo = round(sum(notas_definitivas) / len(notas_definitivas), 2) if notas_definitivas else 0.0
        nota_general = _build_student_general_note(materias_payload, promedio_definitivo)

        grado_groups[est_grado].append({
            "estudiante_id": str(sid),
            "nombre": f"{est.nombre} {est.apellido}",
            "documento": est.documento,
            "grado": est_grado,
            "materias": sorted(materias_payload, key=lambda x: x["materia_nombre"]),
            "promedio_general": promedio_periodo,
            "promedio_periodo_actual": promedio_periodo,
            "promedio_definitivo": promedio_definitivo,
            "nota_general": nota_general,
            "total_materias": len(materias_payload),
        })

    # Sort students within each grado by apellido
    for g in grado_groups:
        grado_groups[g].sort(key=lambda x: x["nombre"])

    # Build sorted grado list (Transición, 1°..11°, Sin grado)
    grado_order = ['Transición', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°', 'Sin grado']
    sorted_grados = sorted(
        grado_groups.keys(),
        key=lambda g: grado_order.index(g) if g in grado_order else 999
    )

    result_grados = []
    for g in sorted_grados:
        estudiantes = grado_groups[g]
        promedios = [e["promedio_general"] for e in estudiantes]
        result_grados.append({
            "grado": g,
            "total_estudiantes": len(estudiantes),
            "promedio_grado": round(sum(promedios) / len(promedios), 2) if promedios else 0.0,
            "estudiantes": estudiantes,
        })

    # Collect all available grados for filter
    all_grados_result = await db.execute(
        select(User.grado).where(User.rol == "estudiante", User.grado.isnot(None)).distinct()
    )
    available_grados = sorted(
        [r[0] for r in all_grados_result.all()],
        key=lambda g: grado_order.index(g) if g in grado_order else 999
    )

    return {
        "periodo": {
            "id": str(periodo.id),
            "nombre": periodo.nombre,
            "numero": periodo.numero,
        },
        "periodos_configurados": periodos_config_payload,
        "grados": result_grados,
        "available_grados": available_grados,
    }
