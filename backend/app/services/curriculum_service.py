import io
import re
from typing import Any

import fitz
import pdfplumber
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Materia, MateriaCurriculoDocumento
from app.services.ocr_service import normalize_image_to_png
from app.services.open_code_service import OPEN_CODE_RECOMMENDED_MODELS, open_code_vision_text


STOP_WORDS = {
    "para", "como", "este", "esta", "estos", "estas", "que", "con", "por", "una", "uno",
    "del", "las", "los", "sus", "sobre", "entre", "desde", "hacia", "tema", "grado",
    "de", "la", "el", "y", "en", "a", "un", "al", "se", "es", "o",
}


def tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]{3,}", (text or "").lower())
    return {w for w in words if w not in STOP_WORDS}


def chunk_text(text: str, *, max_chars: int = 1200, overlap: int = 160) -> list[dict[str, Any]]:
    clean = re.sub(r"\s+", " ", (text or "").strip())
    if not clean:
        return []
    chunks = []
    start = 0
    idx = 1
    while start < len(clean):
        end = min(len(clean), start + max_chars)
        if end < len(clean):
            boundary = clean.rfind(". ", start, end)
            if boundary > start + 400:
                end = boundary + 1
        body = clean[start:end].strip()
        if body:
            chunks.append({"index": idx, "text": body, "keywords": sorted(tokenize(body))[:80]})
            idx += 1
        if end >= len(clean):
            break
        start = max(0, end - overlap)
    return chunks


def extract_text_from_pdf(file_bytes: bytes) -> str:
    parts: list[str] = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for page in doc:
            page_text = page.get_text()
            if page_text:
                parts.append(page_text)
        doc.close()
    except Exception:
        pass

    if not any(p.strip() for p in parts):
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        parts.append(page_text)
        except Exception:
            pass
    return "\n".join(parts).strip()


async def extract_curriculum_text(
    *,
    file_bytes: bytes,
    content_type: str,
    ai_config: dict | None = None,
) -> str:
    ctype = (content_type or "").lower()
    if ctype == "application/pdf":
        return extract_text_from_pdf(file_bytes)
    if ctype.startswith("text/") or ctype in {"application/json"}:
        return file_bytes.decode("utf-8", errors="ignore").strip()
    if ctype in {"image/jpeg", "image/jpg", "image/png", "image/webp"}:
        cfg = ai_config or {}
        base_url = str(cfg.get("open_code_base_url") or "").strip()
        api_key = str(cfg.get("open_code_api_key") or "").strip()
        model = str(cfg.get("open_code_vision_model") or cfg.get("ocr_model") or OPEN_CODE_RECOMMENDED_MODELS["vision"]).strip()
        if not base_url or not api_key:
            raise HTTPException(
                status_code=400,
                detail="Para leer DBA desde imagen debes configurar Open Code Vision en IA y OCR.",
            )
        image_png = normalize_image_to_png(file_bytes)
        return await open_code_vision_text(
            image_bytes=image_png,
            prompt=(
                "Extrae literalmente el texto curricular visible en este documento escolar. "
                "Preserva listas, DBA, desempeños, metas y evidencias. Devuelve solo texto plano."
            ),
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=0.0,
            max_tokens=4096,
        )
    raise HTTPException(status_code=400, detail="Formato curricular no soportado. Usa PDF, TXT, JPG o PNG.")


async def retrieve_curriculum_context(
    db: AsyncSession,
    materia: Materia,
    query: str,
    *,
    max_chunks: int = 5,
) -> str:
    result = await db.execute(
        select(MateriaCurriculoDocumento)
        .where(MateriaCurriculoDocumento.materia_id == materia.id)
        .order_by(MateriaCurriculoDocumento.created_at.desc())
        .limit(20)
    )
    docs = result.scalars().all()
    if not docs:
        return ""

    query_terms = tokenize(query)
    ranked: list[tuple[int, str, str]] = []
    for doc in docs:
        chunks = doc.chunks_json if isinstance(doc.chunks_json, list) else []
        for chunk in chunks:
            if not isinstance(chunk, dict):
                continue
            text = str(chunk.get("text") or "").strip()
            if not text:
                continue
            chunk_terms = set(chunk.get("keywords") or []) or tokenize(text)
            score = len(query_terms & chunk_terms)
            if score == 0 and query_terms:
                score = 1 if any(term in text.lower() for term in query_terms) else 0
            ranked.append((score, doc.titulo, text))

    ranked.sort(key=lambda item: item[0], reverse=True)
    selected = [(title, text) for score, title, text in ranked if score > 0][:max_chunks]
    if not selected:
        selected = [(title, text) for _score, title, text in ranked[:max_chunks]]
    if not selected:
        return ""

    blocks = []
    for idx, (title, text) in enumerate(selected, start=1):
        blocks.append(f"Fragmento curricular {idx} ({title}):\n{text}")
    return "\n\n".join(blocks)

