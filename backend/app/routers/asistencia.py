import io
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.models import User, Asistencia, Materia, Matricula, MateriaEncuentro
from app.schemas.schemas import AsistenciaCreate, AsistenciaOut
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors

router = APIRouter(prefix="/asistencia", tags=["Asistencia"])

DAY_NAME_BY_WEEKDAY = {
    0: "lunes",
    1: "martes",
    2: "miercoles",
    3: "jueves",
    4: "viernes",
    5: "sabado",
    6: "domingo",
}

DAY_ORDER = {
    "lunes": 0,
    "martes": 1,
    "miercoles": 2,
    "jueves": 3,
    "viernes": 4,
    "sabado": 5,
    "domingo": 6,
}


async def _assert_materia_access(
    db: AsyncSession,
    materia_id: str,
    current_user: User,
) -> Materia:
    mat_result = await db.execute(select(Materia).where(Materia.id == materia_id))
    materia = mat_result.scalar_one_or_none()
    if not materia:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    if current_user.rol == "profesor" and str(materia.profesor_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sin permiso para esta materia")

    return materia


async def _assert_fecha_en_dia_programado(
    db: AsyncSession,
    materia_id: str,
    fecha: date,
) -> None:
    result = await db.execute(
        select(MateriaEncuentro.dia_semana).where(MateriaEncuentro.materia_id == materia_id)
    )
    dias_programados = {day for day in result.scalars().all()}

    # Backward compatibility: legacy materias may not have schedule yet.
    if not dias_programados:
        return

    dia_fecha = DAY_NAME_BY_WEEKDAY[fecha.weekday()]
    if dia_fecha in dias_programados:
        return

    dias_ordenados = sorted(dias_programados, key=lambda day: DAY_ORDER.get(day, 99))
    dias_legibles = ", ".join(day.capitalize() for day in dias_ordenados)
    raise HTTPException(
        status_code=400,
        detail=f"La fecha seleccionada no coincide con el horario de encuentros. Dias permitidos: {dias_legibles}",
    )


@router.get("/materia/{materia_id}")
async def get_asistencia_by_materia(
    materia_id: str,
    fecha: date = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get attendance records for a materia, optionally filtered by date."""
    await _assert_materia_access(db, materia_id, current_user)

    query = (
        select(Asistencia, User.nombre, User.apellido)
        .join(User, User.id == Asistencia.estudiante_id, isouter=True)
        .where(Asistencia.materia_id == materia_id)
    )
    if fecha:
        query = query.where(Asistencia.fecha == fecha)
    query = query.order_by(Asistencia.fecha.desc())

    result = await db.execute(query)
    rows = result.all()

    out = []
    for record, estudiante_nombre, estudiante_apellido in rows:
        d = AsistenciaOut.model_validate(record)
        d.estudiante_nombre = estudiante_nombre
        d.estudiante_apellido = estudiante_apellido
        out.append(d)
    return out


@router.get("/materia/{materia_id}/dates")
async def get_attendance_dates(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get unique dates on which attendance was registered for a materia."""
    await _assert_materia_access(db, materia_id, current_user)

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
    await _assert_materia_access(db, materia_id, current_user)
    await _assert_fecha_en_dia_programado(db, materia_id, data.fecha)

    matriculas_result = await db.execute(
        select(Matricula.estudiante_id).where(Matricula.materia_id == materia_id)
    )
    enrolled_ids = {str(sid) for sid in matriculas_result.scalars().all()}

    incoming_by_student: dict[str, dict] = {}
    for reg in data.registros:
        raw_estudiante_id = reg.get("estudiante_id")
        try:
            estudiante_id = UUID(str(raw_estudiante_id))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"ID de estudiante inválido: {raw_estudiante_id}")

        estudiante_id_str = str(estudiante_id)
        if estudiante_id_str not in enrolled_ids:
            raise HTTPException(status_code=400, detail=f"El estudiante {estudiante_id_str} no está inscrito en esta materia")

        incoming_by_student[estudiante_id_str] = {
            "estudiante_id": estudiante_id,
            "estado": reg.get("estado", "presente"),
            "observacion": reg.get("observacion", ""),
        }

    if not incoming_by_student:
        raise HTTPException(status_code=400, detail="No se recibieron registros de asistencia")

    incoming_ids = [payload["estudiante_id"] for payload in incoming_by_student.values()]
    existing_result = await db.execute(
        select(Asistencia).where(
            Asistencia.materia_id == materia_id,
            Asistencia.fecha == data.fecha,
            Asistencia.estudiante_id.in_(incoming_ids),
        )
    )
    existing_by_student = {
        str(record.estudiante_id): record
        for record in existing_result.scalars().all()
    }

    processed = 0
    for estudiante_id_str, payload in incoming_by_student.items():
        record = existing_by_student.get(estudiante_id_str)
        if record:
            record.estado = payload["estado"]
            record.observacion = payload["observacion"]
        else:
            db.add(
                Asistencia(
                    materia_id=materia_id,
                    estudiante_id=payload["estudiante_id"],
                    fecha=data.fecha,
                    estado=payload["estado"],
                    observacion=payload["observacion"],
                    registrado_por=current_user.id,
                )
            )
        processed += 1

    await db.commit()
    return {"detail": f"Asistencia registrada para {processed} estudiantes"}


@router.get("/materia/{materia_id}/historial/{estudiante_id}")
async def get_student_attendance(
    materia_id: str,
    estudiante_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Get attendance history for a specific student in a materia."""
    await _assert_materia_access(db, materia_id, current_user)

    enrolled_result = await db.execute(
        select(Matricula.id).where(
            Matricula.materia_id == materia_id,
            Matricula.estudiante_id == estudiante_id,
        )
    )
    if not enrolled_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="El estudiante no está inscrito en esta materia")

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
    materia = await _assert_materia_access(db, materia_id, current_user)

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


@router.get("/materia/{materia_id}/export-estudiantes-pdf")
async def export_students_pdf(
    materia_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("profesor", "admin")),
):
    """Export a printable student roster to use together with attendance sheets."""
    materia = await _assert_materia_access(db, materia_id, current_user)

    est_result = await db.execute(
        select(User).join(Matricula).where(Matricula.materia_id == materia_id).order_by(User.apellido)
    )
    students = est_result.scalars().all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=40, bottomMargin=30)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"Lista de Estudiantes - {materia.nombre}", styles["Title"]))
    elements.append(Paragraph(f"Código: {materia.codigo}", styles["Normal"]))
    elements.append(Paragraph(f"Total inscritos: {len(students)}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    header = ["N°", "Nombre Completo", "Documento", "Correo", "Celular", "Firma"]
    data = [header]

    for idx, est in enumerate(students, 1):
        data.append([
            str(idx),
            f"{est.apellido} {est.nombre}",
            est.documento or "",
            est.correo or "",
            est.celular or "",
            "",
        ])

    col_widths = [24, 150, 72, 140, 66, 90]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E0E7FF")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ]))

    elements.append(table)
    doc.build(elements)

    return StreamingResponse(
        io.BytesIO(buffer.getvalue()),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lista_estudiantes_{materia.codigo}.pdf"'},
    )
