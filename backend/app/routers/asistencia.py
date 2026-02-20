import io
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, Asistencia, Materia, Matricula
from app.schemas.schemas import AsistenciaCreate, AsistenciaUpdate, AsistenciaOut
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors

router = APIRouter(prefix="/asistencia", tags=["Asistencia"])


@router.get("/materia/{materia_id}")
async def get_asistencia_by_materia(
    materia_id: str,
    fecha: date = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get attendance records for a materia, optionally filtered by date."""
    query = select(Asistencia).where(Asistencia.materia_id == materia_id)
    if fecha:
        query = query.where(Asistencia.fecha == fecha)
    query = query.order_by(Asistencia.fecha.desc())

    result = await db.execute(query)
    records = result.scalars().all()

    out = []
    for r in records:
        est_result = await db.execute(select(User).where(User.id == r.estudiante_id))
        est = est_result.scalar_one_or_none()
        d = AsistenciaOut.model_validate(r)
        if est:
            d.estudiante_nombre = est.nombre
            d.estudiante_apellido = est.apellido
        out.append(d)
    return out


@router.get("/materia/{materia_id}/dates")
async def get_attendance_dates(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get unique dates on which attendance was registered for a materia."""
    result = await db.execute(
        select(Asistencia.fecha)
        .where(Asistencia.materia_id == materia_id)
        .distinct()
        .order_by(Asistencia.fecha.desc())
    )
    return [str(row[0]) for row in result.all()]


@router.post("/materia/{materia_id}", status_code=status.HTTP_201_CREATED)
async def register_asistencia(
    materia_id: str,
    data: AsistenciaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Register attendance for a date. Upserts records."""
    # Verify materia
    mat_result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = mat_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    created = []
    for reg in data.registros:
        est_id = reg.get("estudiante_id")
        estado = reg.get("estado", "presente")
        obs = reg.get("observacion", "")

        # Upsert
        existing = await db.execute(
            select(Asistencia).where(
                Asistencia.materia_id == materia_id,
                Asistencia.estudiante_id == est_id,
                Asistencia.fecha == data.fecha,
            )
        )
        record = existing.scalar_one_or_none()
        if record:
            record.estado = estado
            record.observacion = obs
        else:
            record = Asistencia(
                materia_id=materia_id,
                estudiante_id=est_id,
                fecha=data.fecha,
                estado=estado,
                observacion=obs,
                registrado_por=current_user.id,
            )
            db.add(record)
        created.append(record)

    await db.commit()
    return {"detail": f"Asistencia registrada para {len(created)} estudiantes"}


@router.get("/materia/{materia_id}/historial/{estudiante_id}")
async def get_student_attendance(
    materia_id: str,
    estudiante_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get attendance history for a specific student in a materia."""
    result = await db.execute(
        select(Asistencia)
        .where(
            Asistencia.materia_id == materia_id,
            Asistencia.estudiante_id == estudiante_id,
        )
        .order_by(Asistencia.fecha.desc())
    )
    records = result.scalars().all()

    total = len(records)
    presentes = sum(1 for r in records if r.estado == "presente")
    ausentes = sum(1 for r in records if r.estado == "ausente")
    tardanzas = sum(1 for r in records if r.estado == "tardanza")
    justificados = sum(1 for r in records if r.estado == "justificado")

    return {
        "total": total,
        "presentes": presentes,
        "ausentes": ausentes,
        "tardanzas": tardanzas,
        "justificados": justificados,
        "porcentaje_asistencia": round((presentes + justificados) / total * 100, 1) if total > 0 else 0,
        "registros": [AsistenciaOut.model_validate(r) for r in records],
    }


@router.get("/materia/{materia_id}/export-pdf")
async def export_attendance_pdf(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Export a printable attendance list as PDF."""
    mat_result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = mat_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    # Get students
    est_result = await db.execute(
        select(User).join(Matricula).where(Matricula.materia_id == materia_id).order_by(User.apellido)
    )
    students = est_result.scalars().all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=40, bottomMargin=30)
    styles = getSampleStyleSheet()
    elements = []

    # Title
    elements.append(Paragraph(f"Lista de Asistencia - {materia.nombre}", styles["Title"]))
    elements.append(Paragraph(f"Código: {materia.codigo}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    # Table header: N°, Nombre, Documento, then 10 date columns
    header = ["N°", "Nombre Completo", "Documento"]
    for i in range(10):
        header.append(f"___/___")

    data = [header]
    for idx, est in enumerate(students, 1):
        row = [str(idx), f"{est.apellido} {est.nombre}", est.documento]
        for i in range(10):
            row.append("")
        data.append(row)

    col_widths = [25, 160, 70] + [40] * 10
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E0E7FF")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ]))
    elements.append(t)

    elements.append(Spacer(1, 20))
    elements.append(Paragraph("P = Presente | A = Ausente | T = Tardanza | J = Justificado", styles["Normal"]))

    doc.build(elements)
    return StreamingResponse(
        io.BytesIO(buffer.getvalue()),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="asistencia_{materia.codigo}.pdf"'},
    )
