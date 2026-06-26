import io
import html
import os
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, Image
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.colors import HexColor
from app.core.config import get_settings

settings = get_settings()

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

LATEX_SYMBOLS = {
    "\\times": "×",
    "\\cdot": "·",
    "\\pm": "±",
    "\\neq": "≠",
    "\\leq": "≤",
    "\\geq": "≥",
    "\\approx": "≈",
    "\\infty": "∞",
    "\\degree": "°",
    "\\pi": "π",
    "\\alpha": "α",
    "\\beta": "β",
    "\\gamma": "γ",
    "\\delta": "δ",
    "\\theta": "θ",
    "\\lambda": "λ",
    "\\mu": "μ",
    "\\sigma": "σ",
    "\\omega": "ω",
}

LATEX_COMMANDS = (
    "frac", "dfrac", "sqrt", "times", "cdot", "pm", "neq", "leq", "geq",
    "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "int", "sum",
    "theta", "pi", "alpha", "beta", "gamma", "delta", "lambda", "mu", "sigma", "omega",
    "left", "right", "text", "begin", "end", "overline", "underline",
)


def _normalize_latex_formula(formula: str) -> str:
    """Recover malformed LaTeX escapes commonly broken during JSON decoding."""
    if formula is None:
        return ""

    value = str(formula)

    # Recover commands broken by JSON escape decoding (e.g. "\\frac" -> form-feed + "rac").
    value = re.sub(r"\f(?=rac\b)", lambda _: r"\f", value)
    value = re.sub(r"\t(?=(?:imes|heta|ext|au)\b)", lambda _: r"\t", value)
    value = re.sub(r"\n(?=(?:eq|abla|u)\b)", lambda _: r"\n", value)
    value = re.sub(r"\r(?=(?:ight|ho)\b)", lambda _: r"\r", value)
    value = re.sub("\x08(?=eta\\b)", lambda _: r"\b", value)

    # Recover matrix environments written without backslash.
    value = re.sub(r"\bbegin\{([a-zA-Z]+matrix)\}", lambda m: rf"\begin{{{m.group(1)}}}", value)
    value = re.sub(r"\bend\{([a-zA-Z]+matrix)\}", lambda m: rf"\end{{{m.group(1)}}}", value)

    cmd_pattern = r"\\\\(?=(?:" + "|".join(LATEX_COMMANDS) + r")\b)"
    value = re.sub(cmd_pattern, r"\\", value)

    # Normalize common Spanish function alias.
    value = re.sub(r"\\sen\b", r"\\sin", value)

    return value


def _latex_formula_to_markup(formula: str) -> str:
    """Convert common LaTeX math into ReportLab-friendly paragraph markup."""
    if formula is None:
        return ""

    text = _normalize_latex_formula(formula).strip()
    if not text:
        return ""

    text = text.replace("\\left", "").replace("\\right", "")
    placeholders: list[str] = []

    def hold(markup: str) -> str:
        idx = len(placeholders)
        placeholders.append(markup)
        return f"@@RL_{idx}@@"

    frac_pattern = re.compile(r"\\(?:d?frac)\{([^{}]+)\}\{([^{}]+)\}")
    for _ in range(10):
        text, count = frac_pattern.subn(
            lambda m: hold(
                f"<super>{_latex_formula_to_markup(m.group(1))}</super>⁄<sub>{_latex_formula_to_markup(m.group(2))}</sub>"
            ),
            text,
        )
        if count == 0:
            break

    sqrt_pattern = re.compile(r"\\sqrt\{([^{}]+)\}")
    for _ in range(10):
        text, count = sqrt_pattern.subn(
            lambda m: hold(f"√({_latex_formula_to_markup(m.group(1))})"),
            text,
        )
        if count == 0:
            break

    for cmd, symbol in LATEX_SYMBOLS.items():
        text = text.replace(cmd, symbol)

    text = re.sub(
        r"\\(?:sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min)\b",
        lambda m: m.group(0)[1:],
        text,
    )

    text = re.sub(
        r"([A-Za-z0-9\)\]])\^\{([^{}]+)\}",
        lambda m: hold(f"{html.escape(m.group(1))}<super>{_latex_formula_to_markup(m.group(2))}</super>"),
        text,
    )
    text = re.sub(
        r"([A-Za-z0-9\)\]])\^([A-Za-z0-9+\-*/=]+)",
        lambda m: hold(f"{html.escape(m.group(1))}<super>{_latex_formula_to_markup(m.group(2))}</super>"),
        text,
    )
    text = re.sub(
        r"([A-Za-z0-9\)\]])_\{([^{}]+)\}",
        lambda m: hold(f"{html.escape(m.group(1))}<sub>{_latex_formula_to_markup(m.group(2))}</sub>"),
        text,
    )
    text = re.sub(
        r"([A-Za-z0-9\)\]])_([A-Za-z0-9+\-*/=]+)",
        lambda m: hold(f"{html.escape(m.group(1))}<sub>{_latex_formula_to_markup(m.group(2))}</sub>"),
        text,
    )

    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"\\([A-Za-z]+)", r"\1", text)
    text = text.replace("\\", "")

    safe = html.escape(text).replace("\n", "<br/>")
    return re.sub(r"@@RL_(\d+)@@", lambda m: placeholders[int(m.group(1))], safe)


def _to_pdf_markup(value: str) -> str:
    """Render plain text + inline/display LaTeX into ReportLab paragraph markup."""
    if value is None:
        return ""

    text = str(value)
    placeholders: list[str] = []

    def hold(markup: str) -> str:
        idx = len(placeholders)
        placeholders.append(markup)
        return f"@@TXT_{idx}@@"

    text = re.sub(r"\$\$([\s\S]+?)\$\$", lambda m: hold(_latex_formula_to_markup(m.group(1))), text)
    text = re.sub(r"\\\[([\s\S]+?)\\\]", lambda m: hold(_latex_formula_to_markup(m.group(1))), text)
    text = re.sub(r"(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)", lambda m: hold(_latex_formula_to_markup(m.group(1))), text)
    text = re.sub(r"\\\((.+?)\\\)", lambda m: hold(_latex_formula_to_markup(m.group(1))), text)

    safe = html.escape(text)
    safe = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", safe)
    safe = safe.replace("\n", "<br/>")
    return re.sub(r"@@TXT_(\d+)@@", lambda m: placeholders[int(m.group(1))], safe)


def _local_upload_path(url: str | None) -> str:
    raw = str(url or "").strip()
    if not raw.startswith("/uploads/"):
        return ""
    rel = raw[len("/uploads/"):].lstrip("/").replace("\\", "/")
    root = os.path.abspath(settings.UPLOAD_DIR)
    candidate = os.path.abspath(os.path.join(root, rel))
    if not candidate.startswith(root):
        return ""
    if not os.path.exists(candidate):
        return ""
    if os.path.splitext(candidate)[1].lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        return ""
    return candidate


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
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, doc.pagesize[1] - 30, "XCalificator — Plataforma Educativa IA")

    # Footer
    canvas.setFillColor(GRAY_300)
    canvas.rect(0, 0, doc.pagesize[0], 28, fill=1, stroke=0)
    canvas.setFillColor(GRAY_700)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(doc.leftMargin, 10, "Generado por XCalificator")
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
    titulo_markup = _to_pdf_markup(titulo)

    # ─── Title Block ───
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(titulo_markup, title_style))
    elements.append(Paragraph("Plataforma Educativa XCalificator — Evaluación Generada por IA", subtitle_style))

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
    metadata = exam_data.get("metadata", {}) if isinstance(exam_data, dict) else {}
    # "vision" is the current key; "ocr" kept for backwards compat with older saved tools
    vision_cfg = metadata.get("vision", metadata.get("ocr", {})) if isinstance(metadata, dict) else {}
    ocr_enabled = bool(vision_cfg.get("enabled", True))
    ocr_prefix = str(vision_cfg.get("prefijo") or "R").strip().upper()[:4] or "R"
    ocr_answer_sheet = bool(vision_cfg.get("hoja_respuestas", True))
    ocr_open_lines = max(1, min(8, int(vision_cfg.get("lineas_abiertas", 3) or 3)))
    ocr_rows = []

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
        enunciado_markup = _to_pdf_markup(enunciado)
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
            f'<font color="{GRAY_700.hexval()}"><b>{html.escape(str(numero))}.</b></font>  {enunciado_markup}  {badge}',
            question_style
        ))

        image_path = _local_upload_path(p.get("image_url"))
        if image_path:
            try:
                q_img = Image(image_path)
                max_w = min(340, doc.width - 48)
                max_h = 180
                scale = min(max_w / max(q_img.imageWidth, 1), max_h / max(q_img.imageHeight, 1), 1)
                q_img.drawWidth = q_img.imageWidth * scale
                q_img.drawHeight = q_img.imageHeight * scale
                q_elements.append(q_img)
                if p.get("image_alt"):
                    q_elements.append(Paragraph(_to_pdf_markup(p.get("image_alt")), option_style))
            except Exception:
                q_elements.append(Paragraph("Imagen asociada no disponible para impresion.", option_style))

        if tipo == "seleccion_multiple":
            opciones = p.get("opciones", [])
            opt_letters = "A B C D E F G H".split()
            for j, opt in enumerate(opciones):
                opt_letter = opt_letters[j] if j < len(opt_letters) else str(j + 1)
                opt_text = re.sub(r"^[A-Ha-h]\)\s*", "", str(opt or ""))
                q_elements.append(Paragraph(
                    f'<font color="{PRIMARY.hexval()}"><b>○</b></font>  '
                    f'<font color="{GRAY_500.hexval()}"><b>{opt_letter})</b></font>  {_to_pdf_markup(opt_text)}',
                    option_style
                ))
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ Respuesta correcta: {_to_pdf_markup(resp)}", answer_style))
            elif ocr_enabled:
                q_elements.append(Paragraph(f"{ocr_prefix}{numero}: ______________________________________", line_style))
                ocr_rows.append([str(numero), "A/B/C/D", f"{ocr_prefix}{numero}: ______________________"])

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
                q_elements.append(Paragraph(f"✓ Respuesta correcta: {_to_pdf_markup(resp)}", answer_style))
            elif ocr_enabled:
                q_elements.append(Paragraph(f"{ocr_prefix}{numero}: ______________________________________", line_style))
                ocr_rows.append([str(numero), "V/F", f"{ocr_prefix}{numero}: ______________________"])

        elif tipo == "respuesta_corta":
            for idx in range(2):
                label = f"{ocr_prefix}{numero}: " if (ocr_enabled and idx == 0) else ""
                q_elements.append(Paragraph(label + "·" * 80, line_style))
            if ocr_enabled:
                ocr_rows.append([str(numero), "Texto corto", f"{ocr_prefix}{numero}: ______________________"])
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ {_to_pdf_markup(resp)}", answer_style))

        elif tipo == "desarrollo":
            for idx in range(ocr_open_lines if ocr_enabled else 6):
                label = f"{ocr_prefix}{numero}: " if (ocr_enabled and idx == 0) else ""
                q_elements.append(Paragraph(label + "_" * 85, line_style))
            if ocr_enabled:
                ocr_rows.append([str(numero), "Texto largo", f"{ocr_prefix}{numero}: ______________________"])
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ {_to_pdf_markup(resp)}", answer_style))

        else:
            # Generic fallback
            q_elements.append(Paragraph(
                (f"{ocr_prefix}{numero}: " if ocr_enabled else "Respuesta: ") + "·" * 80,
                line_style,
            ))
            if ocr_enabled:
                ocr_rows.append([str(numero), "Texto", f"{ocr_prefix}{numero}: ______________________"])
            if include_answers:
                resp = p.get("respuesta_correcta", "")
                q_elements.append(Paragraph(f"✓ {_to_pdf_markup(resp)}", answer_style))

        q_elements.append(Spacer(1, 6))

        # Light divider between questions
        q_elements.append(HRFlowable(width="100%", thickness=0.3, color=GRAY_300, spaceAfter=4))

        elements.append(KeepTogether(q_elements))

    if preguntas and not include_answers and ocr_enabled and ocr_answer_sheet and ocr_rows:
        elements.append(PageBreak())
        sheet_title = Table([["🧾  HOJA DE RESPUESTAS OCR"]], colWidths=[doc.width])
        sheet_title.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 14),
            ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
            ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        elements.append(sheet_title)
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            f"Escribe una sola respuesta por fila usando el prefijo {ocr_prefix}. Ejemplo: {ocr_prefix}1: A",
            styles["Normal"],
        ))
        elements.append(Spacer(1, 6))

        answer_table = Table(
            [["#", "Formato", "Respuesta"]] + ocr_rows,
            colWidths=[42, 110, doc.width - 152],
        )
        answer_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_LIGHT),
            ("TEXTCOLOR", (0, 0), (-1, 0), PRIMARY),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("GRID", (0, 0), (-1, -1), 0.5, GRAY_300),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(answer_table)

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

        # Render crossword grid
        if "grid" in crucigrama and crucigrama["grid"]:
            grid_raw = crucigrama["grid"]
            # Show empty cells for student, filled for answers
            grid_data = []
            for row in grid_raw:
                grid_row = []
                for cell in row:
                    if cell and str(cell).strip():
                        if include_answers:
                            grid_row.append(str(cell).upper())
                        else:
                            grid_row.append("")  # Empty white cell for student to fill
                    else:
                        grid_row.append("■")  # Blocked cell
                grid_data.append(grid_row)

            if grid_data and len(grid_data[0]) > 0:
                cell_size = min(22, int((doc.width - 40) / max(len(grid_data[0]), 1)))
                t = Table(grid_data, colWidths=[cell_size] * len(grid_data[0]),
                          rowHeights=[cell_size] * len(grid_data))
                style_cmds = [
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("FONTNAME", (0, 0), (-1, -1), "Courier-Bold"),
                    ("TEXTCOLOR", (0, 0), (-1, -1), GRAY_700),
                    ("GRID", (0, 0), (-1, -1), 0.5, GRAY_300),
                ]
                # Color blocked cells
                for r_idx, row in enumerate(grid_data):
                    for c_idx, cell in enumerate(row):
                        if cell == "■":
                            style_cmds.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), GRAY_700))
                            style_cmds.append(("TEXTCOLOR", (c_idx, r_idx), (c_idx, r_idx), GRAY_700))
                        else:
                            style_cmds.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), WHITE))
                            style_cmds.append(("BOX", (c_idx, r_idx), (c_idx, r_idx), 1, GRAY_500))

                t.setStyle(TableStyle(style_cmds))
                elements.append(t)
                elements.append(Spacer(1, 12))

        if "pistas_horizontal" in crucigrama:
            elements.append(Paragraph("<b>➡️ Horizontales:</b>", styles["Normal"]))
            for pista in crucigrama["pistas_horizontal"]:
                if isinstance(pista, dict):
                    num = pista.get("numero", "")
                    texto = pista.get("pista", "")
                    elements.append(Paragraph(f"  {html.escape(str(num))}. {_to_pdf_markup(texto)}", option_style))
                else:
                    elements.append(Paragraph(f"  • {_to_pdf_markup(pista)}", option_style))
            elements.append(Spacer(1, 8))
        if "pistas_vertical" in crucigrama:
            elements.append(Paragraph("<b>⬇️ Verticales:</b>", styles["Normal"]))
            for pista in crucigrama["pistas_vertical"]:
                if isinstance(pista, dict):
                    num = pista.get("numero", "")
                    texto = pista.get("pista", "")
                    elements.append(Paragraph(f"  {html.escape(str(num))}. {_to_pdf_markup(texto)}", option_style))
                else:
                    elements.append(Paragraph(f"  • {_to_pdf_markup(pista)}", option_style))

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
            words = ", ".join(f"<b>{_to_pdf_markup(w)}</b>" for w in sopa["palabras"])
            elements.append(Paragraph(f"📌 Palabras a encontrar: {words}", styles["Normal"]))

    # Build with header/footer
    doc.build(
        elements,
        onFirstPage=lambda c, d: _header_footer(c, d, titulo),
        onLaterPages=lambda c, d: _header_footer(c, d, titulo),
    )
    return buffer.getvalue()
