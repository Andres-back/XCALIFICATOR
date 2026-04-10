"""Normalize legacy LaTeX payloads and fix deterministic math answer keys.

Usage (inside backend container):
  python backend/db/migrations/2026_04_09_fix_latex_math_payloads.py
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.latex_utils import normalize_latex_payload
from app.core.math_exam_validator import infer_correct_option_for_math_question
from app.models.models import Examen, Herramienta


@dataclass
class Counters:
    examenes_scanned: int = 0
    examenes_updated: int = 0
    herramientas_scanned: int = 0
    herramientas_updated: int = 0
    question_keys_fixed: int = 0


def _normalize_question(question: Any) -> tuple[Any, bool, str | None, Any]:
    """Normalize one question payload and infer corrected answer key when possible.

    Returns:
      normalized_question, changed, inferred_correct, numero
    """
    if not isinstance(question, dict):
        return question, False, None, None

    original = question
    q_any = normalize_latex_payload(dict(question))
    changed = q_any != original

    if not isinstance(q_any, dict):
        return q_any, changed, None, None

    q: dict[str, Any] = q_any

    enunciado = q.get("enunciado") or q.get("pregunta") or q.get("texto") or q.get("statement")
    if isinstance(enunciado, str) and enunciado.strip():
        if q.get("enunciado") != enunciado:
            q["enunciado"] = enunciado
            changed = True
        if q.get("pregunta") != enunciado:
            q["pregunta"] = enunciado
            changed = True

    inferred = infer_correct_option_for_math_question(q)
    return q, changed, inferred, q.get("numero")


def _apply_inferred_to_key(clave: Any, inferred_map: dict[Any, str]) -> tuple[Any, int]:
    """Patch answer keys by question number using inferred correct options."""
    if not inferred_map:
        return clave, 0

    fixed = 0
    normalized = normalize_latex_payload(clave)

    if isinstance(normalized, dict) and isinstance(normalized.get("preguntas"), list):
        patched = []
        for item in normalized["preguntas"]:
            if not isinstance(item, dict):
                patched.append(item)
                continue
            row = dict(item)
            numero = row.get("numero")
            inferred = inferred_map.get(numero)
            if inferred and row.get("respuesta_correcta") != inferred:
                row["respuesta_correcta"] = inferred
                fixed += 1
            patched.append(row)
        normalized["preguntas"] = patched
        return normalized, fixed

    if isinstance(normalized, list):
        patched = []
        for item in normalized:
            if not isinstance(item, dict):
                patched.append(item)
                continue
            row = dict(item)
            numero = row.get("numero")
            inferred = inferred_map.get(numero)
            if inferred and row.get("respuesta_correcta") != inferred:
                row["respuesta_correcta"] = inferred
                fixed += 1
            patched.append(row)
        return patched, fixed

    return normalized, 0


def _normalize_content_and_collect_inferred(content: Any) -> tuple[Any, bool, dict[Any, str]]:
    """Normalize content payload and infer corrected keys for deterministic math questions."""
    normalized = normalize_latex_payload(content)
    changed = normalized != content
    inferred_map: dict[Any, str] = {}

    if not isinstance(normalized, dict):
        return normalized, changed, inferred_map

    preguntas = normalized.get("preguntas")
    if not isinstance(preguntas, list):
        return normalized, changed, inferred_map

    patched_questions = []
    for q in preguntas:
        q_new, q_changed, inferred, numero = _normalize_question(q)
        if q_changed:
            changed = True
        if inferred and numero is not None:
            inferred_map[numero] = inferred
        patched_questions.append(q_new)

    normalized["preguntas"] = patched_questions
    return normalized, changed, inferred_map


async def run_migration() -> Counters:
    counters = Counters()

    async with AsyncSessionLocal() as session:
        # Examenes
        examenes = (await session.execute(select(Examen))).scalars().all()
        counters.examenes_scanned = len(examenes)

        for ex in examenes:
            content_new, content_changed, inferred_map = _normalize_content_and_collect_inferred(ex.contenido_json)
            key_new, fixed = _apply_inferred_to_key(ex.clave_respuestas, inferred_map)

            key_changed = key_new != ex.clave_respuestas
            if content_changed or key_changed:
                ex.contenido_json = content_new
                ex.clave_respuestas = key_new
                counters.examenes_updated += 1
            counters.question_keys_fixed += fixed

        # Herramientas
        herramientas = (await session.execute(select(Herramienta))).scalars().all()
        counters.herramientas_scanned = len(herramientas)

        for h in herramientas:
            content_new, content_changed, inferred_map = _normalize_content_and_collect_inferred(h.contenido_json)
            key_new, fixed = _apply_inferred_to_key(h.clave_respuestas, inferred_map)

            key_changed = key_new != h.clave_respuestas
            if content_changed or key_changed:
                h.contenido_json = content_new
                h.clave_respuestas = key_new
                counters.herramientas_updated += 1
            counters.question_keys_fixed += fixed

        await session.commit()

    return counters


def main() -> None:
    counters = asyncio.run(run_migration())
    print("[OK] Migration completed")
    print(f"Examenes scanned: {counters.examenes_scanned}")
    print(f"Examenes updated: {counters.examenes_updated}")
    print(f"Herramientas scanned: {counters.herramientas_scanned}")
    print(f"Herramientas updated: {counters.herramientas_updated}")
    print(f"Question keys fixed: {counters.question_keys_fixed}")


if __name__ == "__main__":
    main()
