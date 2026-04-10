from collections import Counter
import re
from statistics import mean
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import (
    EncuestaImpacto,
    Examen,
    Materia,
    Nota,
    TiempoEvaluacion,
    User,
)
from app.schemas.schemas import (
    EncuestaImpactoCreate,
    EncuestaImpactoOut,
    TiempoEvaluacionCreate,
    TiempoEvaluacionOut,
)

router = APIRouter(prefix="/tesis", tags=["Impacto Tesis"])


def _safe_float(value):
    try:
        return float(value)
    except Exception:
        return None


def _grade_category(score: float) -> int:
    """Map 1.0-5.0 scale to ordinal categories for kappa."""
    if score < 3.0:
        return 1
    if score < 3.5:
        return 2
    if score < 4.0:
        return 3
    if score < 4.5:
        return 4
    return 5


def _cohen_kappa_metrics(system_scores: list[float], final_scores: list[float]) -> dict:
    k = 5
    matrix = [[0 for _ in range(k)] for _ in range(k)]

    for suggested, final in zip(system_scores, final_scores):
        i = _grade_category(suggested) - 1
        j = _grade_category(final) - 1
        matrix[i][j] += 1

    n = sum(sum(row) for row in matrix)
    if n == 0:
        return {
            "n": 0,
            "kappa": None,
            "kappa_ponderado": None,
            "matriz": matrix,
            "labels": ["<3.0", "3.0-3.4", "3.5-3.9", "4.0-4.4", "4.5-5.0"],
            "criterio_alta_concordancia": False,
            "mae": None,
        }

    row_totals = [sum(row) for row in matrix]
    col_totals = [sum(matrix[i][j] for i in range(k)) for j in range(k)]

    po = sum(matrix[i][i] for i in range(k)) / n
    pe = sum((row_totals[i] / n) * (col_totals[i] / n) for i in range(k))
    kappa = (po - pe) / (1 - pe) if (1 - pe) > 1e-12 else 1.0

    # Quadratic weighted kappa for ordinal scale.
    do = 0.0
    de = 0.0
    denom = (k - 1) ** 2
    for i in range(k):
        for j in range(k):
            weight = ((i - j) ** 2) / denom
            observed = matrix[i][j] / n
            expected = (row_totals[i] / n) * (col_totals[j] / n)
            do += weight * observed
            de += weight * expected

    kappa_weighted = 1 - (do / de) if de > 1e-12 else 1.0
    mae = mean(abs(s - f) for s, f in zip(system_scores, final_scores))

    return {
        "n": n,
        "kappa": round(kappa, 4),
        "kappa_ponderado": round(kappa_weighted, 4),
        "matriz": matrix,
        "labels": ["<3.0", "3.0-3.4", "3.5-3.9", "4.0-4.4", "4.5-5.0"],
        "criterio_alta_concordancia": kappa_weighted >= 0.75,
        "mae": round(mae, 4),
    }


@router.post("/tiempos", response_model=TiempoEvaluacionOut, status_code=status.HTTP_201_CREATED)
async def create_tiempo_evaluacion(
    data: TiempoEvaluacionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    user_role = str(getattr(current_user, "rol", ""))
    user_id = getattr(current_user, "id", None)
    materia_id = data.materia_id
    examen_id = data.examen_id

    if examen_id is not None:
        ex_result = await db.execute(select(Examen).where(Examen.id == examen_id))
        examen = ex_result.scalar_one_or_none()
        if not examen:
            raise HTTPException(status_code=404, detail="Examen no encontrado")
        if user_role == "profesor":
            mat_result = await db.execute(select(Materia).where(Materia.id == examen.materia_id))
            materia_examen = mat_result.scalar_one_or_none()
            if materia_examen is not None and str(getattr(materia_examen, "profesor_id", "")) != str(user_id):
                raise HTTPException(status_code=403, detail="No puedes registrar tiempo sobre este examen")
        if materia_id is None:
            materia_id = getattr(examen, "materia_id", None)

    if materia_id is not None:
        mat_result = await db.execute(select(Materia).where(Materia.id == materia_id))
        materia = mat_result.scalar_one_or_none()
        if not materia:
            raise HTTPException(status_code=404, detail="Materia no encontrada")
        if user_role == "profesor" and str(getattr(materia, "profesor_id", "")) != str(user_id):
            raise HTTPException(status_code=403, detail="No puedes registrar tiempo sobre esta materia")

    entry = TiempoEvaluacion(
        profesor_id=user_id,
        materia_id=materia_id,
        examen_id=examen_id,
        fase=data.fase,
        actividad_tipo=data.actividad_tipo,
        grupo_pareado=data.grupo_pareado,
        duracion_minutos=data.duracion_minutos,
        estudiantes_evaluados=data.estudiantes_evaluados,
        observacion=data.observacion,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return TiempoEvaluacionOut.model_validate(entry)


@router.get("/tiempos/resumen")
async def get_tiempos_resumen(
    materia_id: str | None = Query(default=None),
    actividad_tipo: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    user_role = str(getattr(current_user, "rol", ""))
    user_id = getattr(current_user, "id", None)
    stmt = select(TiempoEvaluacion)

    filters = []
    if materia_id:
        filters.append(TiempoEvaluacion.materia_id == materia_id)
    if actividad_tipo:
        filters.append(TiempoEvaluacion.actividad_tipo == actividad_tipo)
    if user_role == "profesor":
        filters.append(TiempoEvaluacion.profesor_id == user_id)
    if filters:
        stmt = stmt.where(and_(*filters))

    stmt = stmt.order_by(TiempoEvaluacion.created_at.desc())
    records = (await db.execute(stmt)).scalars().all()

    if not records:
        return {
            "n_total": 0,
            "fases": {
                "sin_sistema": {"n": 0, "duracion_promedio_min": None, "duracion_x_estudiante_min": None},
                "con_sistema": {"n": 0, "duracion_promedio_min": None, "duracion_x_estudiante_min": None},
            },
            "reduccion_porcentual": None,
            "pares_validos": 0,
            "analisis_recomendado": "insuficiente",
            "nota": "No hay registros de tiempo para analizar.",
        }

    grouped = {"sin_sistema": [], "con_sistema": []}
    grouped_per_student = {"sin_sistema": [], "con_sistema": []}

    for r in records:
        dur = _safe_float(getattr(r, "duracion_minutos", None))
        if dur is None:
            continue
        fase = str(getattr(r, "fase", ""))
        if fase not in grouped:
            continue
        estudiantes_evaluados = int(getattr(r, "estudiantes_evaluados", 1) or 1)
        grouped[fase].append(dur)
        grouped_per_student[fase].append(dur / max(estudiantes_evaluados, 1))

    def _phase_stats(values: list[float], per_student: list[float]) -> dict:
        return {
            "n": len(values),
            "duracion_promedio_min": round(mean(values), 2) if values else None,
            "duracion_x_estudiante_min": round(mean(per_student), 3) if per_student else None,
        }

    pre_stats = _phase_stats(grouped["sin_sistema"], grouped_per_student["sin_sistema"])
    post_stats = _phase_stats(grouped["con_sistema"], grouped_per_student["con_sistema"])

    reduction = None
    if pre_stats["duracion_promedio_min"] and post_stats["duracion_promedio_min"] is not None:
        if pre_stats["duracion_promedio_min"] > 0:
            reduction = round(
                ((pre_stats["duracion_promedio_min"] - post_stats["duracion_promedio_min"]) / pre_stats["duracion_promedio_min"]) * 100,
                2,
            )

    paired_map = {}
    for r in records:
        grupo_raw = getattr(r, "grupo_pareado", None)
        if not grupo_raw:
            continue
        pair_key = str(grupo_raw).strip()
        if not pair_key:
            continue
        fase = str(getattr(r, "fase", ""))
        if fase not in grouped:
            continue
        paired_map.setdefault(pair_key, {})[fase] = _safe_float(getattr(r, "duracion_minutos", None))

    paired_records = [
        p for p in paired_map.values()
        if p.get("sin_sistema") is not None and p.get("con_sistema") is not None
    ]
    paired_count = len(paired_records)

    if paired_count >= 30:
        suggested_test = "t_pareada"
    elif paired_count >= 8:
        suggested_test = "wilcoxon"
    else:
        suggested_test = "insuficiente"

    return {
        "n_total": len(records),
        "fases": {
            "sin_sistema": pre_stats,
            "con_sistema": post_stats,
        },
        "reduccion_porcentual": reduction,
        "pares_validos": paired_count,
        "analisis_recomendado": suggested_test,
        "nota": "Usa t pareada si pares>=30 y supuestos de normalidad; si no, Wilcoxon para muestras relacionadas.",
    }


@router.get("/concordancia/kappa")
async def get_concordancia_kappa(
    materia_id: str | None = Query(default=None),
    examen_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    user_role = str(getattr(current_user, "rol", ""))
    user_id = getattr(current_user, "id", None)
    stmt = (
        select(Nota, Examen, Materia)
        .join(Examen, Nota.examen_id == Examen.id)
        .join(Materia, Examen.materia_id == Materia.id)
    )

    filters = []
    if materia_id:
        filters.append(Materia.id == materia_id)
    if examen_id:
        filters.append(Examen.id == examen_id)
    if user_role == "profesor":
        filters.append(Materia.profesor_id == user_id)
    if filters:
        stmt = stmt.where(and_(*filters))

    rows = (await db.execute(stmt)).all()

    system_scores = []
    final_scores = []

    for nota, _exam, _mat in rows:
        final_nota = _safe_float(getattr(nota, "nota", None))
        if final_nota is None:
            continue

        detalle_json = getattr(nota, "detalle_json", None)
        if not isinstance(detalle_json, dict):
            continue

        suggested = _safe_float(detalle_json.get("nota_total"))
        if suggested is None:
            continue

        system_scores.append(suggested)
        final_scores.append(final_nota)

    metrics = _cohen_kappa_metrics(system_scores, final_scores)

    return {
        "criterio_objetivo": "kappa >= 0.75",
        "resultado": metrics,
        "n_total_notas_filtradas": len(rows),
        "n_muestras_validas": metrics["n"],
    }


@router.post("/encuestas", response_model=EncuestaImpactoOut, status_code=status.HTTP_201_CREATED)
async def submit_encuesta_impacto(
    data: EncuestaImpactoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin", "profesor", "estudiante")),
):
    user_id = getattr(current_user, "id", None)
    user_role = str(getattr(current_user, "rol", ""))
    existing = await db.execute(
        select(EncuestaImpacto).where(
            EncuestaImpacto.user_id == user_id,
            EncuestaImpacto.hito == data.hito,
        )
    )
    encuesta = existing.scalar_one_or_none()

    if encuesta:
        setattr(encuesta, "claridad", data.claridad)
        setattr(encuesta, "utilidad", data.utilidad)
        setattr(encuesta, "pertinencia", data.pertinencia)
        setattr(encuesta, "satisfaccion", data.satisfaccion)
        setattr(encuesta, "facilidad_uso", data.facilidad_uso)
        setattr(encuesta, "comentario", data.comentario)
        setattr(encuesta, "consentimiento", data.consentimiento)
    else:
        encuesta = EncuestaImpacto(
            user_id=user_id,
            rol=user_role,
            hito=data.hito,
            claridad=data.claridad,
            utilidad=data.utilidad,
            pertinencia=data.pertinencia,
            satisfaccion=data.satisfaccion,
            facilidad_uso=data.facilidad_uso,
            comentario=data.comentario,
            consentimiento=data.consentimiento,
        )
        db.add(encuesta)

    await db.commit()
    await db.refresh(encuesta)
    return EncuestaImpactoOut.model_validate(encuesta)


@router.get("/encuestas/resumen")
async def get_encuestas_resumen(
    hito: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    stmt = select(EncuestaImpacto)
    if hito:
        stmt = stmt.where(EncuestaImpacto.hito == hito)

    rows = (await db.execute(stmt.order_by(EncuestaImpacto.created_at.desc()))).scalars().all()
    if not rows:
        return {
            "n_total": 0,
            "promedios": {},
            "por_rol": {},
            "distribuciones": {},
            "nota": "No hay respuestas de encuesta aún.",
        }

    def _as_int(value: Any) -> int | None:
        try:
            if value is None:
                return None
            return int(value)
        except Exception:
            return None

    def _avg(values: list[Any]) -> float | None:
        clean = [v for v in values if v is not None]
        return round(mean(clean), 3) if clean else None

    claridad_vals = [_as_int(getattr(r, "claridad", None)) for r in rows]
    utilidad_vals = [_as_int(getattr(r, "utilidad", None)) for r in rows]
    pertinencia_vals = [_as_int(getattr(r, "pertinencia", None)) for r in rows]
    satisfaccion_vals = [_as_int(getattr(r, "satisfaccion", None)) for r in rows]
    facilidad_vals = [_as_int(getattr(r, "facilidad_uso", None)) for r in rows]

    by_role = {}
    for rol in {str(getattr(r, "rol", "")) for r in rows}:
        rset = [r for r in rows if str(getattr(r, "rol", "")) == rol]
        by_role[rol] = {
            "n": len(rset),
            "claridad": _avg([_as_int(getattr(r, "claridad", None)) for r in rset]),
            "utilidad": _avg([_as_int(getattr(r, "utilidad", None)) for r in rset]),
            "pertinencia": _avg([_as_int(getattr(r, "pertinencia", None)) for r in rset]),
            "satisfaccion": _avg([_as_int(getattr(r, "satisfaccion", None)) for r in rset]),
            "facilidad_uso": _avg([_as_int(getattr(r, "facilidad_uso", None)) for r in rset]),
        }

    def _likert_distribution(values: list[Any]) -> dict:
        counter = Counter([v for v in values if v is not None])
        return {str(i): counter.get(i, 0) for i in range(1, 6)}

    return {
        "n_total": len(rows),
        "promedios": {
            "claridad": _avg(claridad_vals),
            "utilidad": _avg(utilidad_vals),
            "pertinencia": _avg(pertinencia_vals),
            "satisfaccion": _avg(satisfaccion_vals),
            "facilidad_uso": _avg(facilidad_vals),
        },
        "por_rol": by_role,
        "distribuciones": {
            "claridad": _likert_distribution(claridad_vals),
            "utilidad": _likert_distribution(utilidad_vals),
            "pertinencia": _likert_distribution(pertinencia_vals),
        },
    }


@router.get("/cualitativo")
async def get_analisis_cualitativo(
    hito: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    stmt = select(EncuestaImpacto)
    if hito:
        stmt = stmt.where(EncuestaImpacto.hito == hito)

    rows = (await db.execute(stmt.order_by(EncuestaImpacto.created_at.desc()))).scalars().all()
    comments_rows = [
        r for r in rows
        if isinstance(getattr(r, "comentario", None), str) and str(getattr(r, "comentario", "")).strip()
    ]

    stop_words = {
        "de", "la", "el", "y", "en", "que", "para", "con", "del", "los", "las", "una", "un",
        "por", "es", "se", "al", "como", "más", "muy", "pero", "lo", "le", "les", "su", "sus",
    }

    tokens = []
    for row in comments_rows:
        comment = str(getattr(row, "comentario", "")).lower()
        words = re.findall(r"[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}", comment)
        tokens.extend([w for w in words if w not in stop_words])

    common_themes = Counter(tokens).most_common(12)

    grouped_comments = {
        "profesor": [],
        "estudiante": [],
        "admin": [],
    }
    for row in comments_rows:
        role_key = str(getattr(row, "rol", "desconocido"))
        created_at = getattr(row, "created_at", None)
        grouped_comments.setdefault(role_key, []).append({
            "hito": str(getattr(row, "hito", "")),
            "comentario": str(getattr(row, "comentario", "")),
            "fecha": created_at.isoformat() if created_at is not None else None,
        })

    return {
        "n_comentarios": len(comments_rows),
        "temas_frecuentes": [{"tema": t, "frecuencia": c} for t, c in common_themes],
        "comentarios_por_rol": grouped_comments,
        "nota": "Analisis cualitativo inicial basado en frecuencia de terminos y comentarios abiertos.",
    }
