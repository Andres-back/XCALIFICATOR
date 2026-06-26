from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

TOOL_TYPE_LABELS: dict[str, str] = {
    "examen": "Examen",
    "crucigrama": "Crucigrama",
    "sopa_letras": "Sopa de Letras",
    "emparejar": "Emparejar",
    "unir_columnas": "Unir Columnas",
    "cuento": "Cuento",
    "para_colorear": "Para Colorear",
    "presentacion": "Presentación",
}

SUPPORTED_TOOL_TYPES = tuple(TOOL_TYPE_LABELS.keys())


async def ensure_tool_flags_table(db: AsyncSession) -> None:
    await db.execute(text(
        """
        CREATE TABLE IF NOT EXISTS tool_feature_flags (
            tipo VARCHAR(50) PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
        """
    ))


def get_tool_label(tipo: str) -> str:
    return TOOL_TYPE_LABELS.get(tipo, tipo)


async def list_tool_flags(db: AsyncSession) -> list[dict]:
    await ensure_tool_flags_table(db)
    result = await db.execute(text(
        "SELECT tipo, enabled, updated_at, updated_by FROM tool_feature_flags"
    ))
    rows = result.mappings().all()
    rows_by_tipo = {str(row["tipo"]): row for row in rows}

    flags = []
    for tipo, label in TOOL_TYPE_LABELS.items():
        row = rows_by_tipo.get(tipo)
        flags.append({
            "tipo": tipo,
            "label": label,
            "enabled": bool(row["enabled"]) if row else True,
            "updated_at": row["updated_at"] if row else None,
            "updated_by": row["updated_by"] if row else None,
        })
    return flags


async def is_tool_enabled(db: AsyncSession, tipo: str) -> bool:
    if tipo not in SUPPORTED_TOOL_TYPES:
        return False

    await ensure_tool_flags_table(db)
    result = await db.execute(
        text("SELECT enabled FROM tool_feature_flags WHERE tipo = :tipo"),
        {"tipo": tipo},
    )
    value = result.scalar_one_or_none()
    if value is None:
        return True
    return bool(value)


async def set_tool_flag(db: AsyncSession, tipo: str, enabled: bool, updated_by: str | None) -> None:
    if tipo not in SUPPORTED_TOOL_TYPES:
        raise ValueError(f"Tipo de herramienta no soportado: {tipo}")

    await ensure_tool_flags_table(db)
    await db.execute(
        text(
            """
            INSERT INTO tool_feature_flags (tipo, enabled, updated_at, updated_by)
            VALUES (:tipo, :enabled, NOW(), :updated_by)
            ON CONFLICT (tipo) DO UPDATE
            SET enabled = EXCLUDED.enabled,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            """
        ),
        {
            "tipo": tipo,
            "enabled": bool(enabled),
            "updated_by": updated_by,
        },
    )
