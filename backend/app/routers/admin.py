from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case, cast, Date
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.security import hash_password
from app.core.tool_flags import SUPPORTED_TOOL_TYPES, list_tool_flags, set_tool_flag
from app.core.ai_provider_config import (
    get_global_ai_config,
    upsert_global_ai_config,
    get_profesor_ai_config,
    upsert_profesor_ai_config,
    has_profesor_ai_override,
    clear_profesor_ai_override,
    fetch_ollama_models,
    fetch_groq_models,
    split_groq_models,
    fetch_open_code_models,
    split_open_code_models,
    _get_profesor_ai_row,
    ensure_ai_provider_table,
)
from app.models.models import User, Sesion, Nota, AuditLog, Materia, Matricula, Examen, RespuestaOnline, APIUsageLog, Boletin, PeriodoAcademico, Herramienta, TiempoEvaluacion
from app.schemas.schemas import (
    UserOut, AdminUserCreate, AdminUserUpdate, ChangePasswordRequest, ChangeRoleRequest,
    SesionOut, AdminStats, AuditLogOut, AdminMateriaOut, APIUsageStats, APIUsageByModel,
    HerramientaFlagOut, HerramientaFlagUpdate,
)

router = APIRouter(prefix="/admin", tags=["Administración"])


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


# ──────────────── PRESENTACIONES STATS (TESIS) ────────────────

@router.get("/presentaciones-stats")
async def get_presentaciones_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Métricas de uso de presentaciones para la tesis.
    Cubre adopción, distribución por tipo, top docentes y tiempo invertido.

    Devuelve:
        {
          "total": int,
          "por_subtipo": [{ subtipo, label, count }],
          "top_profesores": [{ profesor_id, nombre, count }],
          "tiempo_promedio_seg": float,
          "tiempo_total_minutos": float,    # de TiempoEvaluacion
          "adopcion_diaria": [{ date, count }],   # últimos 30 días
          "ultimas": [{ titulo, profesor, subtipo, created_at }],
        }
    """
    now = datetime.now(timezone.utc)
    thirty_ago = now - timedelta(days=30)

    # ── Total ─────────────────────────────────────────────────────
    total = (await db.execute(
        select(func.count(Herramienta.id))
        .where(Herramienta.tipo == "presentacion")
    )).scalar_one()

    # ── Por subtipo (clase / repaso_examen / boletin_periodo) ─────
    # Postgres JSONB → contenido_json->>'subtipo'
    subtipo_expr = Herramienta.contenido_json["subtipo"].astext.label("subtipo")
    subtipo_rows = (await db.execute(
        select(subtipo_expr, func.count(Herramienta.id))
        .where(Herramienta.tipo == "presentacion")
        .group_by(subtipo_expr)
    )).all()
    SUBTIPO_LABELS = {
        "clase":           "Clases",
        "repaso_examen":   "Repasos",
        "boletin_periodo": "Boletines",
    }
    por_subtipo = [
        {
            "subtipo": (r[0] or "clase"),
            "label":   SUBTIPO_LABELS.get(r[0] or "clase", "Otra"),
            "count":   int(r[1]),
        }
        for r in subtipo_rows
    ]
    # Asegurar que aparecen los 3 tipos aunque tengan 0
    seen = {x["subtipo"] for x in por_subtipo}
    for k, lbl in SUBTIPO_LABELS.items():
        if k not in seen:
            por_subtipo.append({"subtipo": k, "label": lbl, "count": 0})
    por_subtipo.sort(key=lambda x: -x["count"])

    # ── Top 5 profesores por uso ──────────────────────────────────
    top_rows = (await db.execute(
        select(
            User.id,
            User.nombre,
            User.apellido,
            func.count(Herramienta.id).label("count"),
        )
        .join(Herramienta, Herramienta.profesor_id == User.id)
        .where(Herramienta.tipo == "presentacion")
        .group_by(User.id, User.nombre, User.apellido)
        .order_by(func.count(Herramienta.id).desc())
        .limit(5)
    )).all()
    top_profesores = [
        {
            "profesor_id": str(r[0]),
            "nombre": f"{r[1]} {r[2]}".strip(),
            "count": int(r[3]),
        }
        for r in top_rows
    ]

    # ── Tiempo promedio de generación (segundos) ──────────────────
    # Lo guardamos en config_json.duracion_generacion_seg.
    # Traemos los valores y promediamos en Python (más portable que cast SQL).
    dur_rows = (await db.execute(
        select(Herramienta.config_json)
        .where(Herramienta.tipo == "presentacion")
    )).all()
    duraciones = []
    for (cfg,) in dur_rows:
        if cfg and isinstance(cfg, dict):
            v = cfg.get("duracion_generacion_seg")
            if v is not None:
                try:
                    duraciones.append(float(v))
                except (ValueError, TypeError):
                    pass
    tiempo_promedio_seg = round(sum(duraciones) / len(duraciones), 2) if duraciones else 0.0

    # ── Tiempo total invertido (minutos) según TiempoEvaluacion ──
    tiempo_total = (await db.execute(
        select(func.coalesce(func.sum(TiempoEvaluacion.duracion_minutos), 0))
        .where(TiempoEvaluacion.actividad_tipo.in_([
            "presentacion", "presentacion_repaso", "presentacion_boletin",
        ]))
    )).scalar_one()
    tiempo_total_minutos = float(tiempo_total or 0)

    # ── Adopción diaria (últimos 30 días) ─────────────────────────
    daily_rows = (await db.execute(
        select(
            cast(Herramienta.created_at, Date).label("day"),
            func.count(Herramienta.id),
        )
        .where(
            Herramienta.tipo == "presentacion",
            Herramienta.created_at >= thirty_ago,
        )
        .group_by(cast(Herramienta.created_at, Date))
        .order_by(cast(Herramienta.created_at, Date))
    )).all()
    adopcion_diaria = [
        {"date": str(r[0]), "count": int(r[1])} for r in daily_rows
    ]

    # ── Últimas 5 presentaciones ──────────────────────────────────
    ult_rows = (await db.execute(
        select(
            Herramienta.titulo,
            Herramienta.contenido_json,
            Herramienta.created_at,
            User.nombre,
            User.apellido,
        )
        .join(User, User.id == Herramienta.profesor_id)
        .where(Herramienta.tipo == "presentacion")
        .order_by(Herramienta.created_at.desc())
        .limit(5)
    )).all()
    ultimas = []
    for r in ult_rows:
        contenido = r[1] or {}
        ultimas.append({
            "titulo": r[0],
            "subtipo": contenido.get("subtipo", "clase") if isinstance(contenido, dict) else "clase",
            "profesor": f"{r[3]} {r[4]}".strip(),
            "created_at": r[2].isoformat() if r[2] else None,
        })

    return {
        "total":                int(total or 0),
        "por_subtipo":          por_subtipo,
        "top_profesores":       top_profesores,
        "tiempo_promedio_seg":  tiempo_promedio_seg,
        "tiempo_total_minutos": round(tiempo_total_minutos, 2),
        "adopcion_diaria":      adopcion_diaria,
        "ultimas":              ultimas,
    }


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


# ──────────────── BOLETINES GLOBALES ────────────────

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

    # Get all published boletines for this period
    q = (
        select(Boletin)
        .where(Boletin.periodo_id == periodo_id, Boletin.publicado == True)
    )
    boletines_result = await db.execute(q)
    boletines = boletines_result.scalars().all()

    # Fetch all referenced students, materias
    student_ids = list({b.estudiante_id for b in boletines})
    if not student_ids:
        return {"periodo": {"id": str(periodo.id), "nombre": periodo.nombre, "numero": periodo.numero},
                "grados": []}

    students_result = await db.execute(
        select(User).where(User.id.in_(student_ids))
    )
    students_map = {u.id: u for u in students_result.scalars().all()}

    materia_ids = list({b.materia_id for b in boletines})
    materias_result = await db.execute(
        select(Materia).where(Materia.id.in_(materia_ids))
    )
    materias_map = {m.id: m for m in materias_result.scalars().all()}

    # Group boletines by student
    student_boletines = {}
    for b in boletines:
        if b.estudiante_id not in student_boletines:
            student_boletines[b.estudiante_id] = []
        materia = materias_map.get(b.materia_id)
        student_boletines[b.estudiante_id].append({
            "materia_id": str(b.materia_id),
            "materia_nombre": materia.nombre if materia else "Desconocida",
            "nota_final": float(b.nota_final) if b.nota_final else 0.0,
            "desglose_json": b.desglose_json,
            "publicado_at": b.publicado_at.isoformat() if b.publicado_at else None,
        })

    # Build per-student records grouped by grado
    grado_groups = {}
    for sid, bols in student_boletines.items():
        est = students_map.get(sid)
        if not est:
            continue
        est_grado = est.grado or "Sin grado"

        # Filter by grado if specified
        if grado and est_grado != grado:
            continue

        if est_grado not in grado_groups:
            grado_groups[est_grado] = []

        notas = [b["nota_final"] for b in bols]
        promedio = round(sum(notas) / len(notas), 2) if notas else 0.0

        grado_groups[est_grado].append({
            "estudiante_id": str(sid),
            "nombre": f"{est.nombre} {est.apellido}",
            "documento": est.documento,
            "grado": est_grado,
            "materias": sorted(bols, key=lambda x: x["materia_nombre"]),
            "promedio_general": promedio,
            "total_materias": len(bols),
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
        "grados": result_grados,
        "available_grados": available_grados,
    }


# ──────────────── AI CONFIG ENDPOINTS ────────────────

class AIConfigUpdate(BaseModel):
    content_provider: Optional[str] = None
    content_model: Optional[str] = None
    content_fallback_provider: Optional[str] = None
    content_fallback_model: Optional[str] = None
    grading_provider: Optional[str] = None
    grading_model: Optional[str] = None
    grading_fallback_provider: Optional[str] = None
    grading_fallback_model: Optional[str] = None
    ocr_provider: Optional[str] = None
    ocr_model: Optional[str] = None
    ocr_fallback_provider: Optional[str] = None
    ocr_fallback_model: Optional[str] = None
    chat_model: Optional[str] = None
    groq_api_key: Optional[str] = None
    ollama_url: Optional[str] = None
    ollama_api_key: Optional[str] = None
    ollama_cloud_url: Optional[str] = None
    ollama_cloud_api_key: Optional[str] = None
    ollama_cloud_ocr_model: Optional[str] = None
    open_code_base_url: Optional[str] = None
    open_code_api_key: Optional[str] = None
    open_code_content_model: Optional[str] = None
    open_code_vision_model: Optional[str] = None
    open_code_feedback_model: Optional[str] = None
    presenton_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    cloudflare_account_id: Optional[str] = None
    cloudflare_api_token: Optional[str] = None
    cloudflare_image_model: Optional[str] = None
    cloudflare_image_fallback_model: Optional[str] = None


@router.get("/groq-models")
async def get_groq_models(
    api_key: Optional[str] = None,
    current_user: User = Depends(require_role("admin")),
):
    """Fetches available Groq model list and splits by capability."""
    try:
        models = await fetch_groq_models(api_key)
        return split_groq_models(models)
    except Exception:
        return split_groq_models([])


@router.get("/open-code-models")
async def get_open_code_models(
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    current_user: User = Depends(require_role("admin")),
):
    """Fetches Open Code model list from an OpenAI-compatible gateway or returns known defaults."""
    try:
        models = await fetch_open_code_models(base_url or "", api_key)
        return split_open_code_models(models)
    except Exception:
        return split_open_code_models([])


@router.get("/ai-configs/global")
async def get_global_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Returns the global AI/OCR configuration."""
    cfg = await get_global_ai_config(db)
    return cfg


@router.put("/ai-configs/global")
async def update_global_config(
    payload: AIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Updates the global AI/OCR configuration."""
    cfg = await upsert_global_ai_config(db, payload.model_dump(exclude_none=True), str(current_user.id))
    await db.commit()
    return cfg


@router.get("/ai-configs/global/ollama-models")
async def get_global_ollama_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Fetches available Ollama models using the global Ollama URL."""
    cfg = await get_global_ai_config(db)
    try:
        models = await fetch_ollama_models(cfg.get("ollama_url", ""), cfg.get("ollama_api_key"))
    except Exception:
        models = []
    return {"models": models}


@router.get("/ai-configs/global/groq-models")
async def get_global_groq_models(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Fetches available Groq models using the global or environment key."""
    cfg = await get_global_ai_config(db)
    try:
        models = await fetch_groq_models(cfg.get("groq_api_key"))
    except Exception:
        models = []
    return split_groq_models(models)


@router.get("/ai-configs")
async def list_ai_configs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Lists all professors with their effective AI config and override status."""
    await ensure_ai_provider_table(db)
    result = await db.execute(
        select(User).where(User.rol == "profesor", User.activo == True)  # noqa: E712
        .order_by(User.apellido, User.nombre)
    )
    profesores = result.scalars().all()

    rows = []
    for prof in profesores:
        has_override = await has_profesor_ai_override(db, str(prof.id))
        cfg = await get_profesor_ai_config(db, str(prof.id))
        # Get raw override values if they exist
        raw_row = await _get_profesor_ai_row(db, str(prof.id))
        effective = cfg if not has_override else (raw_row or cfg)
        rows.append({
            "profesor_id": str(prof.id),
            "profesor_nombre": f"{prof.nombre} {prof.apellido}".strip(),
            "profesor_correo": prof.correo,
            "uses_global": not has_override,
            **(raw_row if has_override and raw_row else cfg),
        })

    return rows


@router.get("/ai-configs/{profesor_id}")
async def get_profesor_config(
    profesor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Returns the effective AI config for a specific professor."""
    result = await db.execute(select(User).where(User.id == profesor_id))
    prof = result.scalar_one_or_none()
    if not prof:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    has_override = await has_profesor_ai_override(db, str(profesor_id))
    raw_row = await _get_profesor_ai_row(db, str(profesor_id))
    cfg = await get_profesor_ai_config(db, str(profesor_id))
    return {
        "profesor_id": str(prof.id),
        "profesor_nombre": f"{prof.nombre} {prof.apellido}".strip(),
        "profesor_correo": prof.correo,
        "uses_global": not has_override,
        **(raw_row if has_override and raw_row else cfg),
    }


@router.put("/ai-configs/{profesor_id}")
async def update_profesor_config(
    profesor_id: UUID,
    payload: AIConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Sets an individual AI config override for a specific professor."""
    result = await db.execute(select(User).where(User.id == profesor_id))
    prof = result.scalar_one_or_none()
    if not prof:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    cfg = await upsert_profesor_ai_config(
        db, str(profesor_id), payload.model_dump(exclude_none=True), str(current_user.id)
    )
    await db.commit()
    return {
        "profesor_id": str(prof.id),
        "profesor_nombre": f"{prof.nombre} {prof.apellido}".strip(),
        "profesor_correo": prof.correo,
        "uses_global": False,
        **cfg,
    }


@router.delete("/ai-configs/{profesor_id}/override", status_code=200)
async def clear_profesor_config_override(
    profesor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Removes the individual AI config override for a professor (reverts to global)."""
    result = await db.execute(select(User).where(User.id == profesor_id))
    prof = result.scalar_one_or_none()
    if not prof:
        raise HTTPException(status_code=404, detail="Profesor no encontrado")

    await clear_profesor_ai_override(db, str(profesor_id))
    await db.commit()
    cfg = await get_global_ai_config(db)
    return {
        "profesor_id": str(prof.id),
        "profesor_nombre": f"{prof.nombre} {prof.apellido}".strip(),
        "profesor_correo": prof.correo,
        "uses_global": True,
        **cfg,
    }


@router.get("/ai-configs/{profesor_id}/ollama-models")
async def get_profesor_ollama_models(
    profesor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Fetches available Ollama models using the professor's configured Ollama URL."""
    cfg = await get_profesor_ai_config(db, str(profesor_id))
    try:
        models = await fetch_ollama_models(cfg.get("ollama_url", ""), cfg.get("ollama_api_key"))
    except Exception:
        models = []
    return {"models": models}


@router.get("/ai-configs/{profesor_id}/groq-models")
async def get_profesor_groq_models(
    profesor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Fetches available Groq models using the professor's effective key."""
    cfg = await get_profesor_ai_config(db, str(profesor_id))
    try:
        models = await fetch_groq_models(cfg.get("groq_api_key"))
    except Exception:
        models = []
    return split_groq_models(models)
