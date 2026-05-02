"""
Router de presentaciones — Fase 1 (MVP).

Endpoints:
    POST  /presentaciones/clase          → genera slides para una clase
    GET   /presentaciones/health         → smoke test del servicio Presenton
    GET   /presentaciones/mias           → lista las presentaciones del profesor

Cada presentación generada se guarda como `Herramienta(tipo="presentacion")`
para reusarla y aparecer en la galería del docente.

También registra en `TiempoEvaluacion` una entrada con `actividad_tipo="presentacion"`
para alimentar las métricas de impacto de la tesis.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_role
from app.core.tool_flags import is_tool_enabled
from app.models.models import (
    Boletin, Examen, Herramienta, Materia, Nota,
    PeriodoAcademico, TiempoEvaluacion, User,
)
from app.services import presenton_service

router = APIRouter(prefix="/presentaciones", tags=["Presentaciones"])
logger = logging.getLogger(__name__)


# ── Schemas (locales al router para no contaminar schemas.py) ──────────

class PresentacionClaseRequest(BaseModel):
    titulo: str = Field(..., min_length=3, max_length=300, description="Tema de la clase")
    contenido: str = Field(default="", max_length=8000, description="Material base / notas del docente")
    grado: Optional[str] = Field(default=None, max_length=30, description="Grado escolar (ej. '6°', '11°')")
    objetivos: Optional[list[str]] = Field(default=None, description="Objetivos pedagógicos opcionales")
    num_slides: int = Field(default=8, ge=3, le=20)
    plantilla: str = Field(default="general", description="general | classic | modern")
    materia_id: Optional[UUID] = Field(default=None, description="Materia opcional para asociar la herramienta")


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


# ── Helpers ────────────────────────────────────────────────────────────

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


# ── Endpoints ──────────────────────────────────────────────────────────

@router.get("/health")
async def presenton_health():
    """Smoke test: ¿Presenton está respondiendo?"""
    ok = await presenton_service.health_check()
    return {"ok": ok}


@router.get("/presenton-token")
async def get_presenton_editor_token(
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Devuelve el token de sesión de Presenton para que el frontend pueda
    abrirle el editor sin pedir login nuevamente.
    Solo accesible para usuarios autenticados en xCalificator.
    """
    try:
        token = await presenton_service._ensure_token()
        return {"token": token}
    except Exception as exc:
        logger.warning("No se pudo obtener token Presenton: %s", exc)
        raise HTTPException(status_code=503, detail="Servicio Presenton no disponible")


@router.post("/clase", response_model=PresentacionOut, status_code=201)
async def generar_presentacion_clase(
    payload: PresentacionClaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Genera una presentación de CLASE (slides para enseñar un tema)
    y la guarda como Herramienta del profesor.
    """
    # Feature flag: ¿está habilitada esta tool?
    if not await is_tool_enabled(db, "presentacion"):
        raise HTTPException(
            status_code=403,
            detail="La herramienta 'Presentación' está deshabilitada por administración",
        )

    # Validar materia si vino
    if payload.materia_id:
        await _assert_materia_owned(db, payload.materia_id, current_user)

    # ── Llamar a Presenton ─────────────────────────────────────────────
    started = time.perf_counter()
    try:
        result = await presenton_service.generate_lesson_presentation(
            titulo=payload.titulo,
            contenido=payload.contenido,
            grado=payload.grado,
            objetivos=payload.objetivos,
            num_slides=payload.num_slides,
            plantilla=payload.plantilla,
        )
    except Exception as exc:
        logger.exception("Error generando presentación con Presenton")
        raise HTTPException(
            status_code=502,
            detail=f"No pudimos generar la presentación: {exc}",
        )

    duracion_seg = round(time.perf_counter() - started, 2)

    # ── Persistir como Herramienta ─────────────────────────────────────
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
            "subtipo":         "clase",
        },
        config_json={
            "num_slides":  payload.num_slides,
            "plantilla":   payload.plantilla,
            "grado":       payload.grado,
            "objetivos":   payload.objetivos or [],
            "duracion_generacion_seg": duracion_seg,
        },
        estado="listo",
        materia_id=payload.materia_id,
    )
    db.add(herr)

    # ── Tracking de tiempo (componente de tesis) ───────────────────────
    tiempo = TiempoEvaluacion(
        profesor_id=current_user.id,
        materia_id=payload.materia_id,
        examen_id=None,
        fase="con_sistema",
        actividad_tipo="presentacion",
        duracion_minutos=round(duracion_seg / 60, 2),
        estudiantes_evaluados=1,
        observacion=f"Generación automática vía Presenton ({payload.num_slides} slides)",
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
    """Devuelve las últimas presentaciones generadas por el profesor actual."""
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


@router.post("/repaso-examen/{examen_id}", response_model=PresentacionOut, status_code=201)
async def generar_presentacion_repaso(
    examen_id: UUID,
    plantilla: str = "general",
    num_slides: int = 8,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """
    Genera una presentación de RETROALIMENTACIÓN de un examen.

    Auto-extrae las preguntas con menor tasa de acierto y construye slides
    explicando los conceptos correctos. Cero input manual del docente.
    """
    if not await is_tool_enabled(db, "presentacion"):
        raise HTTPException(status_code=403, detail="Herramienta deshabilitada")

    # ── Cargar examen + materia con verificación de propiedad ─────────
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

    # ── Cargar todas las notas y reconstruir stats por pregunta ────────
    notas_result = await db.execute(select(Nota).where(Nota.examen_id == examen_id))
    notas = notas_result.scalars().all()
    if not notas:
        raise HTTPException(
            status_code=400,
            detail="Aún no hay calificaciones para este examen. Califica algunos antes de generar el repaso.",
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

    # Tomar las 3-5 más falladas
    enriched.sort(key=lambda x: x["tasa_acierto"])
    preguntas_falladas = enriched[:5]

    # Stats globales
    scores = [float(n.nota) for n in notas if n.nota is not None]
    promedio = sum(scores) / len(scores) if scores else 0.0
    nota_maxima = 5.0
    if isinstance(clave, dict) and "preguntas" in clave:
        nota_maxima = sum(float(p.get("puntos", 1.0)) for p in clave["preguntas"])

    # ── Generar con Presenton ─────────────────────────────────────────
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
        logger.exception("Error generando presentación de repaso")
        raise HTTPException(status_code=502, detail=f"No pudimos generar el repaso: {exc}")

    duracion_seg = round(time.perf_counter() - started, 2)
    titulo_pres = f"Repaso — {examen.titulo}"

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
        duracion_minutos=round(duracion_seg / 60, 2),
        estudiantes_evaluados=len(notas),
        observacion=f"Repaso automático con {len(preguntas_falladas)} preguntas más falladas",
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
    Genera una presentación de RESUMEN DE PERÍODO para reuniones de padres
    o dirección académica. Auto-extrae datos del boletín ya calculado.
    """
    if not await is_tool_enabled(db, "presentacion"):
        raise HTTPException(status_code=403, detail="Herramienta deshabilitada")

    materia = await _assert_materia_owned(db, materia_id, current_user)

    per_result = await db.execute(select(PeriodoAcademico).where(PeriodoAcademico.id == periodo_id))
    periodo = per_result.scalar_one_or_none()
    if not periodo:
        raise HTTPException(status_code=404, detail="Período académico no encontrado")

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
            detail="No hay boletines calculados para este período. Calcúlalos antes de generar el resumen.",
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

    # Heurística simple para fortalezas/debilidades — el LLM las refinará
    fortalezas: list[str] = []
    debilidades: list[str] = []
    if promedio >= 4.0:
        fortalezas.append("Promedio alto del grupo, reflejo de buen rendimiento general")
    if aprobados >= len(notas_finales) * 0.8:
        fortalezas.append("Más del 80% del grupo aprobó el período")
    if reprobados > len(notas_finales) * 0.3:
        debilidades.append(f"{reprobados} estudiantes requieren refuerzo académico")
    if promedio < 3.0:
        debilidades.append("Promedio del grupo por debajo de aprobación — revisar plan de estudios")

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
        logger.exception("Error generando presentación de período")
        raise HTTPException(status_code=502, detail=f"No pudimos generar el resumen: {exc}")

    duracion_seg = round(time.perf_counter() - started, 2)
    titulo_pres = f"{materia.nombre} — {periodo.nombre}"

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
        duracion_minutos=round(duracion_seg / 60, 2),
        estudiantes_evaluados=len(boletines),
        observacion=f"Resumen de período {periodo.nombre} con {len(boletines)} boletines",
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
    """Elimina una presentación del profesor."""
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

    await db.delete(herr)
    await db.commit()
    return None
