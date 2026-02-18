from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.dependencies import require_role, get_current_user
from app.models.models import User, Examen, Materia, Nota, Matricula, RespuestaOnline
from app.schemas.schemas import (
    ExamenCreate, ExamenOut, ExamenProfesorOut,
    NotaCreate, NotaUpdate, NotaOut,
    RespuestaOnlineCreate, RespuestaOnlineOut,
)
from app.services.notification_service import notify_enrolled_students, send_email, send_whatsapp
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/examenes", tags=["Exámenes"])


# ──────── AUTO-GRADING HELPER ────────

def _normalize(s: str) -> str:
    """Normalize a string for comparison."""
    if not s:
        return ""
    return s.strip().lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")


def auto_grade_objective(examen: Examen, respuestas_json: dict) -> dict | None:
    """
    Auto-grade objective questions (seleccion_multiple, verdadero_falso)
    by comparing against clave_respuestas. Returns grading result dict
    or None if auto-grading is not possible.
    """
    if not examen.clave_respuestas or not examen.contenido_json:
        return None

    clave_raw = examen.clave_respuestas
    if isinstance(clave_raw, dict) and "preguntas" in clave_raw:
        clave_list = clave_raw["preguntas"]
    elif isinstance(clave_raw, list):
        clave_list = clave_raw
    else:
        return None

    contenido = examen.contenido_json
    preguntas_info = {}
    for p in contenido.get("preguntas", []):
        preguntas_info[p.get("numero")] = p.get("tipo", "")

    resp_raw = respuestas_json
    if isinstance(resp_raw, dict) and "preguntas" in resp_raw:
        resp_list = resp_raw["preguntas"]
    elif isinstance(resp_raw, list):
        resp_list = resp_raw
    else:
        return None

    # Build lookup for student responses
    resp_map = {}
    for r in resp_list:
        if isinstance(r, dict):
            resp_map[r.get("numero")] = r.get("respuesta", "")

    # Build lookup for answer key
    clave_map = {}
    for c in clave_list:
        if isinstance(c, dict):
            clave_map[c.get("numero")] = c

    # Check if there are any non-objective questions
    auto_gradable_types = {"seleccion_multiple", "verdadero_falso"}
    has_open_ended = False
    preguntas_result = []
    nota_total = 0.0
    nota_maxima = 0.0

    for c in clave_list:
        if not isinstance(c, dict):
            continue
        num = c.get("numero")
        puntos = float(c.get("puntos", 1.0))
        respuesta_correcta = str(c.get("respuesta_correcta", ""))
        tipo = preguntas_info.get(num, "")
        respuesta_est = str(resp_map.get(num, ""))
        nota_maxima += puntos

        if tipo in auto_gradable_types:
            correcto = _normalize(respuesta_correcta) == _normalize(respuesta_est)
            preguntas_result.append({
                "numero": num,
                "respuesta_estudiante": respuesta_est,
                "respuesta_correcta": respuesta_correcta,
                "nota": puntos if correcto else 0.0,
                "nota_maxima": puntos,
                "retroalimentacion": "Correcto" if correcto else f"Incorrecto. La respuesta correcta es: {respuesta_correcta}",
                "correcto": correcto,
                "tipo": tipo,
            })
            if correcto:
                nota_total += puntos
        else:
            has_open_ended = True
            preguntas_result.append({
                "numero": num,
                "respuesta_estudiante": respuesta_est,
                "respuesta_correcta": respuesta_correcta,
                "nota": 0.0,
                "nota_maxima": puntos,
                "retroalimentacion": "Pendiente de revisión por el profesor",
                "correcto": False,
                "tipo": tipo,
                "pendiente": True,
            })

    return {
        "nota_total": round(nota_total, 2),
        "nota_maxima": round(nota_maxima, 2),
        "preguntas": preguntas_result,
        "tiene_preguntas_abiertas": has_open_ended,
        "calificacion_automatica": True,
    }


# ──────── STATIC PATHS FIRST (before /{examen_id}) ────────

@router.get("/mis-notas", response_model=list[NotaOut])
async def get_my_notas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    result = await db.execute(
        select(Nota)
        .options(selectinload(Nota.examen).selectinload(Examen.materia))
        .where(Nota.estudiante_id == current_user.id)
        .order_by(Nota.created_at.desc())
    )
    out = []
    for n in result.scalars().all():
        d = NotaOut.model_validate(n)
        if n.examen:
            d.examen_titulo = n.examen.titulo
            if n.examen.materia:
                d.materia_nombre = n.examen.materia.nombre
        out.append(d)
    return out


@router.post("/notas", response_model=NotaOut, status_code=status.HTTP_201_CREATED)
async def create_nota(
    data: NotaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    nota = Nota(
        estudiante_id=data.estudiante_id,
        examen_id=data.examen_id,
        nota=data.nota,
        detalle_json=data.detalle_json,
        retroalimentacion=data.retroalimentacion,
    )
    db.add(nota)
    await db.commit()
    await db.refresh(nota)
    return NotaOut.model_validate(nota)


@router.patch("/notas/{nota_id}", response_model=NotaOut)
async def update_nota(
    nota_id: str,
    data: NotaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Nota).where(Nota.id == nota_id))
    nota = result.scalar_one_or_none()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")

    if data.nota is not None:
        nota.nota = data.nota
    if data.detalle_json is not None:
        nota.detalle_json = data.detalle_json
    if data.retroalimentacion is not None:
        nota.retroalimentacion = data.retroalimentacion
    await db.commit()
    await db.refresh(nota)
    return NotaOut.model_validate(nota)


@router.delete("/notas/{nota_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_nota(
    nota_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Nota).where(Nota.id == nota_id))
    nota = result.scalar_one_or_none()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    await db.delete(nota)
    await db.commit()


@router.get("/notas/estudiante/{estudiante_id}", response_model=list[NotaOut])
async def get_notas_estudiante(
    estudiante_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.rol == "estudiante" and str(current_user.id) != estudiante_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    result = await db.execute(
        select(Nota).where(Nota.estudiante_id == estudiante_id).order_by(Nota.created_at.desc())
    )
    return [NotaOut.model_validate(n) for n in result.scalars().all()]


@router.get("/notas/examen/{examen_id}", response_model=list[NotaOut])
async def get_notas_examen(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(
        select(Nota)
        .options(selectinload(Nota.estudiante))
        .where(Nota.examen_id == examen_id)
        .order_by(Nota.created_at.desc())
    )
    out = []
    for n in result.scalars().all():
        d = NotaOut.model_validate(n)
        if n.estudiante:
            d.estudiante_nombre = n.estudiante.nombre
            d.estudiante_apellido = n.estudiante.apellido
        out.append(d)
    return out


@router.get("/notas/examen/{examen_id}/stats")
async def get_examen_stats(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Detailed exam statistics for professor dashboard."""
    result = await db.execute(
        select(Nota)
        .options(selectinload(Nota.estudiante))
        .where(Nota.examen_id == examen_id)
    )
    notas = result.scalars().all()

    if not notas:
        return {"total": 0}

    # Get exam for nota_maxima
    exam_result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = exam_result.scalar_one_or_none()

    # Compute nota_maxima from clave_respuestas (Colombian scale: 5.0)
    nota_maxima = 5.0
    if examen and examen.clave_respuestas:
        clave = examen.clave_respuestas
        if isinstance(clave, dict) and "preguntas" in clave:
            nota_maxima = sum(float(p.get("puntos", 1.0)) for p in clave["preguntas"])

    scores = [float(n.nota) for n in notas if n.nota is not None]
    if not scores:
        return {"total": len(notas), "nota_maxima": nota_maxima}

    avg = sum(scores) / len(scores)
    # Colombian grading: aprobado >= 3.0 on a 1.0-5.0 scale
    aprobados = sum(1 for s in scores if s >= 3.0)

    # Grade distribution in Colombian scale ranges
    ranges = [
        {"label": "1.0 - 1.9", "min": 0, "max": 2.0},
        {"label": "2.0 - 2.9", "min": 2.0, "max": 3.0},
        {"label": "3.0 - 3.4", "min": 3.0, "max": 3.5},
        {"label": "3.5 - 3.9", "min": 3.5, "max": 4.0},
        {"label": "4.0 - 4.5", "min": 4.0, "max": 4.6},
        {"label": "4.6 - 5.0", "min": 4.6, "max": 5.01},
    ]
    distribucion = []
    for r in ranges:
        count = sum(1 for s in scores if r["min"] <= s < r["max"])
        distribucion.append({"label": r["label"], "count": count})

    # Per-question stats from detalle_json
    question_stats = {}
    for n in notas:
        if n.detalle_json and "preguntas" in n.detalle_json:
            for p in n.detalle_json["preguntas"]:
                num = p.get("numero")
                if num not in question_stats:
                    question_stats[num] = {"numero": num, "total": 0, "correctas": 0, "tipo": p.get("tipo", "")}
                question_stats[num]["total"] += 1
                if p.get("correcto", False):
                    question_stats[num]["correctas"] += 1

    preguntas_stats = []
    for num in sorted(question_stats.keys()):
        qs = question_stats[num]
        rate = round((qs["correctas"] / qs["total"]) * 100, 1) if qs["total"] > 0 else 0
        preguntas_stats.append({
            "numero": num,
            "tipo": qs["tipo"],
            "total": qs["total"],
            "correctas": qs["correctas"],
            "tasa_acierto": rate,
        })

    # Top/bottom students
    estudiantes_ranking = []
    for n in sorted(notas, key=lambda x: float(x.nota or 0), reverse=True):
        nombre = f"{n.estudiante.nombre} {n.estudiante.apellido}".strip() if n.estudiante else str(n.estudiante_id)
        estudiantes_ranking.append({"nombre": nombre, "nota": float(n.nota) if n.nota else 0})

    return {
        "total": len(notas),
        "nota_maxima": nota_maxima,
        "promedio": round(avg, 2),
        "mediana": round(sorted(scores)[len(scores) // 2], 2),
        "max_nota": round(max(scores), 2),
        "min_nota": round(min(scores), 2),
        "aprobados": aprobados,
        "reprobados": len(scores) - aprobados,
        "tasa_aprobacion": round((aprobados / len(scores)) * 100, 1),
        "distribucion": distribucion,
        "preguntas_stats": preguntas_stats,
        "ranking": estudiantes_ranking,
    }


@router.get("/mis-respuestas")
async def get_my_responses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    """Return list of exam IDs the student has already responded to."""
    result = await db.execute(
        select(RespuestaOnline.examen_id).where(
            RespuestaOnline.estudiante_id == current_user.id
        )
    )
    return [str(row[0]) for row in result.all()]


@router.post("/responder")
async def submit_response(
    data: RespuestaOnlineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("estudiante")),
):
    result = await db.execute(select(Examen).where(Examen.id == data.examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    if not examen.activo_online:
        raise HTTPException(status_code=400, detail="Este examen no está activo online")

    # Check fecha_limite
    if examen.fecha_limite and datetime.now(timezone.utc) > examen.fecha_limite:
        raise HTTPException(status_code=400, detail="El plazo para responder este examen ha vencido")

    existing = await db.execute(
        select(RespuestaOnline).where(
            RespuestaOnline.estudiante_id == current_user.id,
            RespuestaOnline.examen_id == data.examen_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya enviaste respuestas para este examen")

    respuesta = RespuestaOnline(
        estudiante_id=current_user.id,
        examen_id=data.examen_id,
        respuestas_json=data.respuestas_json,
    )
    db.add(respuesta)
    await db.commit()
    await db.refresh(respuesta)

    # ── Auto-grade objective questions ──
    grading_result = auto_grade_objective(examen, data.respuestas_json)
    nota_data = None
    if grading_result:
        try:
            nota = Nota(
                estudiante_id=current_user.id,
                examen_id=str(data.examen_id),
                nota=grading_result["nota_total"],
                detalle_json=grading_result,
                retroalimentacion="\n".join(
                    f"P{p['numero']}: {p['retroalimentacion']}"
                    for p in grading_result.get("preguntas", [])
                ),
            )
            db.add(nota)
            await db.commit()
            await db.refresh(nota)
            nota_data = {
                "id": str(nota.id),
                "nota": float(nota.nota) if nota.nota else 0,
                "tiene_preguntas_abiertas": grading_result.get("tiene_preguntas_abiertas", False),
            }
            logger.info(f"Auto-graded exam {data.examen_id} for student {current_user.id}: {nota.nota}")
        except Exception as e:
            logger.error(f"Auto-grading failed: {e}")

    return {
        "id": str(respuesta.id),
        "estudiante_id": str(respuesta.estudiante_id),
        "examen_id": str(respuesta.examen_id),
        "respuestas_json": respuesta.respuestas_json,
        "enviado_at": respuesta.enviado_at.isoformat() if respuesta.enviado_at else None,
        "nota": nota_data,
    }


# ──────── CRUD EXÁMENES ────────

@router.post("/", response_model=ExamenProfesorOut, status_code=status.HTTP_201_CREATED)
async def create_examen(
    data: ExamenCreate,
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")
    if materia.profesor_id != current_user.id and current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permiso")

    examen = Examen(
        materia_id=materia_id,
        titulo=data.titulo,
        tipo=data.tipo,
        contenido_json=data.contenido_json,
        clave_respuestas=data.clave_respuestas,
        activo_online=data.activo_online,
        fecha_limite=data.fecha_limite,
    )
    db.add(examen)
    await db.commit()
    await db.refresh(examen)
    return ExamenProfesorOut.model_validate(examen)


@router.get("/{examen_id}/respuestas-online")
async def get_respuestas_online(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """List all online submissions for a given exam, with student info and grading status."""
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    result = await db.execute(
        select(RespuestaOnline)
        .options(selectinload(RespuestaOnline.estudiante))
        .where(RespuestaOnline.examen_id == examen_id)
        .order_by(RespuestaOnline.enviado_at.desc())
    )
    respuestas = result.scalars().all()

    # Check which students already have a Nota for this exam
    notas_result = await db.execute(
        select(Nota.estudiante_id).where(Nota.examen_id == examen_id)
    )
    graded_ids = {str(row[0]) for row in notas_result.all()}

    # Also get notas for score display
    notas_full = await db.execute(
        select(Nota).where(Nota.examen_id == examen_id)
    )
    notas_map = {str(n.estudiante_id): n for n in notas_full.scalars().all()}

    out = []
    for r in respuestas:
        est = r.estudiante
        nota_obj = notas_map.get(str(r.estudiante_id))
        out.append({
            "id": str(r.id),
            "estudiante_id": str(r.estudiante_id),
            "estudiante_nombre": f"{est.nombre} {est.apellido}" if est else "Desconocido",
            "estudiante_documento": est.documento if est else "",
            "examen_id": str(r.examen_id),
            "enviado_at": r.enviado_at.isoformat() if r.enviado_at else None,
            "ya_calificado": str(r.estudiante_id) in graded_ids,
            "nota": float(nota_obj.nota) if nota_obj and nota_obj.nota else None,
            "tiene_preguntas_abiertas": (nota_obj.detalle_json or {}).get("tiene_preguntas_abiertas", False) if nota_obj else False,
        })
    return out


@router.get("/materia/{materia_id}")
async def get_examenes_by_materia(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Examen).where(Examen.materia_id == materia_id).order_by(Examen.created_at.desc())
    )
    examenes = result.scalars().all()

    if current_user.rol == "estudiante":
        return [ExamenOut.model_validate(e) for e in examenes if e.activo_online]
    return [ExamenProfesorOut.model_validate(e) for e in examenes]


@router.get("/{examen_id}")
async def get_examen(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    if current_user.rol == "estudiante":
        out = ExamenOut.model_validate(examen)
        if out.contenido_json and "preguntas" in out.contenido_json:
            out.contenido_json["preguntas"] = [
                {k: v for k, v in p.items() if k != "respuesta_correcta"}
                for p in out.contenido_json["preguntas"]
            ]
        return out
    return ExamenProfesorOut.model_validate(examen)


@router.patch("/{examen_id}/toggle-online")
async def toggle_online(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(
        select(Examen).where(Examen.id == examen_id)
    )
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    was_active = examen.activo_online
    examen.activo_online = not examen.activo_online
    await db.commit()

    # Notify students when exam is ACTIVATED (not when deactivated)
    if not was_active and examen.activo_online:
        try:
            materia_result = await db.execute(
                select(Materia).where(Materia.id == examen.materia_id)
            )
            materia = materia_result.scalar_one_or_none()
            materia_nombre = materia.nombre if materia else "Sin materia"

            await notify_enrolled_students(
                db_session=db,
                materia_id=str(examen.materia_id),
                template_name="examen_asignado",
                subject=f"Nuevo examen disponible: {examen.titulo}",
                context={
                    "examen": examen.titulo,
                    "materia": materia_nombre,
                    "fecha_limite": examen.fecha_limite.strftime("%d/%m/%Y %H:%M") if examen.fecha_limite else None,
                },
            )
        except Exception as e:
            logger.error(f"Error notifying students: {e}")

    return {"activo_online": examen.activo_online}


@router.patch("/{examen_id}")
async def update_examen(
    examen_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Update exam fields (titulo, contenido_json, clave_respuestas, activo_online, fecha_limite)."""
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    allowed_fields = {"titulo", "contenido_json", "clave_respuestas", "activo_online", "fecha_limite", "fecha_activacion", "tipo"}
    for field, value in data.items():
        if field in allowed_fields:
            setattr(examen, field, value)

    await db.commit()
    await db.refresh(examen)
    return ExamenProfesorOut.model_validate(examen)


@router.post("/notas/{nota_id}/send-feedback")
async def send_feedback_to_student(
    nota_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Send retroalimentación notification to the student for a specific nota."""
    from app.models.models import PreferenciaNotif, Notificacion
    from datetime import timezone as tz

    result = await db.execute(
        select(Nota).where(Nota.id == nota_id)
    )
    nota = result.scalar_one_or_none()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")

    # Get student
    student_result = await db.execute(select(User).where(User.id == nota.estudiante_id))
    student = student_result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")

    # Get exam
    exam_result = await db.execute(select(Examen).where(Examen.id == nota.examen_id))
    examen = exam_result.scalar_one_or_none()
    examen_titulo = examen.titulo if examen else "Examen"

    # Get preferences
    pref_result = await db.execute(
        select(PreferenciaNotif).where(PreferenciaNotif.user_id == nota.estudiante_id)
    )
    pref = pref_result.scalar_one_or_none()

    context = {
        "nombre": student.nombre,
        "examen": examen_titulo,
        "nota": float(nota.nota) if nota.nota else 0,
        "nota_maxima": 5.0,
    }

    sent_channels = []

    if pref and pref.acepta_email and student.correo:
        sent = await send_email(student.correo, f"Retroalimentación: {examen_titulo}", "retroalimentacion", context)
        if sent:
            sent_channels.append("email")
        notif = Notificacion(
            user_id=nota.estudiante_id, tipo="retroalimentacion", canal="email",
            mensaje=f"Retroalimentación: {examen_titulo}", enviado=sent,
            fecha_envio=datetime.now(tz.utc) if sent else None,
        )
        db.add(notif)

    if pref and pref.acepta_whatsapp and student.celular:
        sent = await send_whatsapp(student.celular, "retroalimentacion", context)
        if sent:
            sent_channels.append("whatsapp")
        notif = Notificacion(
            user_id=nota.estudiante_id, tipo="retroalimentacion", canal="whatsapp",
            mensaje=f"WhatsApp retroalimentación: {examen_titulo}", enviado=sent,
            fecha_envio=datetime.now(tz.utc) if sent else None,
        )
        db.add(notif)

    await db.commit()
    return {"detail": f"Retroalimentación enviada por: {', '.join(sent_channels) if sent_channels else 'ningún canal (verifica preferencias del estudiante)'}"}


@router.delete("/{examen_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_examen(
    examen_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    result = await db.execute(select(Examen).where(Examen.id == examen_id))
    examen = result.scalar_one_or_none()
    if not examen:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
    await db.delete(examen)
    await db.commit()
