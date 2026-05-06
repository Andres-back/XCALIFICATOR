from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Nota


async def upsert_nota(
    db: AsyncSession,
    *,
    estudiante_id,
    examen_id,
    nota_val,
    detalle_json=None,
    retroalimentacion=None,
    imagen_procesada_url=None,
    texto_extraido=None,
) -> Nota:
    """Keep exactly one Nota row per (estudiante_id, examen_id)."""
    result = await db.execute(
        select(Nota).where(
            Nota.estudiante_id == estudiante_id,
            Nota.examen_id == examen_id,
        ).order_by(Nota.created_at.desc())
    )
    existing = result.scalars().all()

    nota = existing[0] if existing else None
    for duplicate in existing[1:]:
        await db.delete(duplicate)

    if nota is None:
        nota = Nota(
            estudiante_id=estudiante_id,
            examen_id=examen_id,
            nota=nota_val,
            detalle_json=detalle_json,
            retroalimentacion=retroalimentacion,
            imagen_procesada_url=imagen_procesada_url,
            texto_extraido=texto_extraido,
        )
        db.add(nota)
        return nota

    nota.nota = nota_val
    nota.detalle_json = detalle_json
    nota.retroalimentacion = retroalimentacion
    if imagen_procesada_url is not None:
        nota.imagen_procesada_url = imagen_procesada_url
    if texto_extraido is not None:
        nota.texto_extraido = texto_extraido
    return nota
