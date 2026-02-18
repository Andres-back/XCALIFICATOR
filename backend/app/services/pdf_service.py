import io
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.colors import HexColor

# Brand colors
PRIMARY = HexColor("#4F46E5")       # Indigo
PRIMARY_LIGHT = HexColor("#E0E7FF") # Indigo-100
ACCENT = HexColor("#7C3AED")        # Violet
SUCCESS = HexColor("#059669")       # Green
GRAY_700 = HexColor("#374151")
GRAY_500 = HexColor("#6B7280")
GRAY_300 = HexColor("#D1D5DB")
GRAY_100 = HexColor("#F3F4F6")
WHITE = colors.white
BLACK = colors.black


def _header_footer(canvas, doc, titulo):
    """Draw page header and footer on each page."""
    canvas.saveState()

    # Header bar
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, doc.pagesize[1] - 42, doc.pagesize[0], 42, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(doc.leftMargin, doc.pagesize[1] - 30, f"📝 {titulo}")
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, doc.pagesize[1] - 30, "Xalificator — Plataforma Educativa IA")

    # Footer
    canvas.setFillColor(GRAY_300)
    canvas.rect(0, 0, doc.pagesize[0], 28, fill=1, stroke=0)
    canvas.setFillColor(GRAY_700)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(doc.leftMargin, 10, "Generado por Xalificator")
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 10, f"Página {canvas.getPageNumber()}")

    canvas.restoreState()


def generate_exam_pdf(exam_data: dict, include_answers: bool = False) -> bytes:
    """Generate a professional PDF from exam JSON data."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=58,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ExamTitle",
        parent=styles["Heading1"],
        fontSize=22,
        textColor=PRIMARY,
        alignment=TA_CENTER,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "ExamSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=GRAY_500,
        alignment=TA_CENTER,
        spaceAfter=16,
    )
    section_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=ACCENT,
        spaceBefore=18,
        spaceAfter=8,
        fontName="Helvetica-Bold",
        borderPadding=(0, 0, 4, 0),
    )
    question_style = ParagraphStyle(
        "Question",
        parent=styles["Normal"],
        fontSize=11,
        spaceBefore=4,
        spaceAfter=6,
        fontName="Helvetica-Bold",
        textColor=GRAY_700,
        leading=14,
    )
    option_style = ParagraphStyle(
        "Option",
        parent=styles["Normal"],
        fontSize=10,
        leftIndent=24,
        spaceBefore=3,
        spaceAfter=1,
        textColor=GRAY_700,
        leading=13,
    )
    answer_style = ParagraphStyle(
        "Answer",
        parent=styles["Normal"],
        fontSize=10,
        leftIndent=24,
        spaceBefore=4,
        fontName="Helvetica-BoldOblique",
        textColor=SUCCESS,
        leading=13,
    )
    pts_style = ParagraphStyle(
        "Points",
        parent=styles["Normal"],
        fontSize=9,
        textColor=ACCENT,
        fontName="Helvetica-Bold",
    )
    line_style = ParagraphStyle(
        "Line",
        parent=styles["Normal"],
        fontSize=10,
        leftIndent=24,
        spaceBefore=4,
        textColor=GRAY_300,
    )

    elements = []
    titulo = exam_data.get("titulo", "Examen")

    # ─── Title Block ───
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(titulo, title_style))
    elements.append(Paragraph("Plataforma Educativa Xalificator — Evaluación Generada por IA", subtitle_style))

    # ─── Student Info Box ───
    info_data = [
        ["Nombre Completo:", "", "Fecha:", ""],
        ["Documento:", "", "Grupo / Sección:", ""],
    ]
    info_table = Table(info_data, colWidths=[100, 180, 100, 130])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, -1), GRAY_700),
        ("LINEBELOW", (1, 0), (1, -1), 0.8, GRAY_300),
        ("LINEBELOW", (3, 0), (3, -1), 0.8, GRAY_300),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, -1), GRAY_100),
        ("BOX", (0, 0), (-1, -1), 0.5, GRAY_300),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 16))

    # ─── Instructions Box ───
    instr_data = [[
        "📋  Instrucciones: Lea cuidadosamente cada pregunta antes de responder. "
        "Marque claramente sus respuestas. No se permiten tachones en selección múltiple."
    ]]
    instr_table = Table(instr_data, colWidths=[doc.width])
    instr_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), PRIMARY),
        ("BACKGROUND", (0, 0), (-1, -1), PRIMARY_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ]))
    elements.append(instr_table)
    elements.append(Spacer(1, 12))

    # Divider
    elements.append(HRFlowable(width="100%", thickness=1, color=GRAY_300, spaceAfter=8))

    preguntas = exam_data.get("preguntas", [])

    # Group questions by type for section headers
    current_type = None
    type_labels = {
        "seleccion_multiple": "SELECCIÓN MÚLTIPLE",
        "verdadero_falso": "VERDADERO O FALSO",
        "respuesta_corta": "RESPUESTA CORTA",
        "desarrollo": "PREGUNTAS DE DESARROLLO",
        "completar": "COMPLETAR",
    }

    for p in preguntas:
        tipo = p.get("tipo", "")
        numero = p.get("numero", "")
        enunciado = p.get("enunciado", "")
        puntos = p.get("puntos", 1.0)

        # Section header if type changed
        if tipo != current_type:
            current_type = tipo
            label = type_labels.get(tipo, tipo.upper().replace("_", " "))
            elements.append(Spacer(1, 6))
            sec_data = [[f"▸  {label}"]]
            sec_table = Table(sec_data, colWidths=[doc.width])
            sec_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
                ("BACKGROUND", (0, 0), (-1, -1), ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ]))
            elements.append(sec_table)
            elements.append(Spacer(1, 8))

        # Question block
        q_elements = []

        # Points badge + question
        badge = f'<font color="{ACCENT.hexval()}" size="9"><b>[{puntos} pts]</b></font>'
        q_elements.append(Paragraph(
            f'<font color="{GRAY_700.hexval()}"><b>{numero}.</b></font>  {enunciado}  {badge}',
            question_style
        ))

        if tipo == "seleccion_multiple":
            opciones = p.get("opciones", [])
            letters = "A B C D E F G H".split()
            for j, opt in enumerate(opciones):
                letter = letters[j] if j < len(letters) else str(j + 1)
                q_elements.append(Paragraph(
                    f'<font color="{PRIMARY.hexval()}"><b>○</b></font>  '
                    f'<font color="{GRAY_500.hexval()}"><b>{letter})</b></font>  {opt}',
                    option_style
                ))
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ Respuesta correcta: {resp}", answer_style))

        elif tipo == "verdadero_falso":
            vf_data = [["○  Verdadero", "○  Falso"]]
            vf_table = Table(vf_data, colWidths=[150, 150])
            vf_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (-1, -1), GRAY_700),
                ("LEFTPADDING", (0, 0), (-1, -1), 24),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            q_elements.append(vf_table)
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ Respuesta correcta: {resp}", answer_style))

        elif tipo == "respuesta_corta":
            q_elements.append(Paragraph("Respuesta: " + "·" * 80, line_style))
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ {resp}", answer_style))

        elif tipo == "desarrollo":
            for _ in range(6):
                q_elements.append(Paragraph("_" * 85, line_style))
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ {resp}", answer_style))

        else:
            # Generic fallback
            q_elements.append(Paragraph("Respuesta: " + "·" * 80, line_style))
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ {resp}", answer_style))

        q_elements.append(Spacer(1, 6))

        # Light divider between questions
        q_elements.append(HRFlowable(width="100%", thickness=0.3, color=GRAY_300, spaceAfter=4))

        elements.append(KeepTogether(q_elements))

    # ─── Crossword Section ───
    if "crucigrama" in exam_data and exam_data["crucigrama"]:
        elements.append(PageBreak())
        sec_data = [["🧩  CRUCIGRAMA"]]
        sec_table = Table(sec_data, colWidths=[doc.width])
        sec_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 14),
            ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
            ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        elements.append(sec_table)
        elements.append(Spacer(1, 12))

        crucigrama = exam_data["crucigrama"]
        if "pistas_horizontal" in crucigrama:
            elements.append(Paragraph("<b>➡️ Horizontales:</b>", styles["Normal"]))
            for pista in crucigrama["pistas_horizontal"]:
                elements.append(Paragraph(f"  • {pista}", option_style))
            elements.append(Spacer(1, 8))
        if "pistas_vertical" in crucigrama:
            elements.append(Paragraph("<b>⬇️ Verticales:</b>", styles["Normal"]))
            for pista in crucigrama["pistas_vertical"]:
                elements.append(Paragraph(f"  • {pista}", option_style))

    # ─── Word Search Section ───
    if "sopa_letras" in exam_data and exam_data["sopa_letras"]:
        elements.append(PageBreak())
        sec_data = [["🔍  SOPA DE LETRAS"]]
        sec_table = Table(sec_data, colWidths=[doc.width])
        sec_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 14),
            ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
            ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        elements.append(sec_table)
        elements.append(Spacer(1, 12))

        sopa = exam_data["sopa_letras"]
        if "grid" in sopa:
            grid_data = [[str(c) for c in row] for row in sopa["grid"]]
            if grid_data:
                cell_size = 22
                t = Table(grid_data, colWidths=[cell_size] * len(grid_data[0]),
                          rowHeights=[cell_size] * len(grid_data))
                t.setStyle(TableStyle([
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("FONTSIZE", (0, 0), (-1, -1), 11),
                    ("FONTNAME", (0, 0), (-1, -1), "Courier-Bold"),
                    ("TEXTCOLOR", (0, 0), (-1, -1), GRAY_700),
                    ("GRID", (0, 0), (-1, -1), 0.5, GRAY_300),
                    ("BACKGROUND", (0, 0), (-1, -1), GRAY_100),
                ]))
                elements.append(t)
        if "palabras" in sopa:
            elements.append(Spacer(1, 12))
            words = ", ".join(f"<b>{w}</b>" for w in sopa["palabras"])
            elements.append(Paragraph(f"📌 Palabras a encontrar: {words}", styles["Normal"]))

    # Build with header/footer
    doc.build(
        elements,
        onFirstPage=lambda c, d: _header_footer(c, d, titulo),
        onLaterPages=lambda c, d: _header_footer(c, d, titulo),
    )
    return buffer.getvalue()
