"""
Builds PresentationLayoutModel directly from the Next.js template .tsx files.
This replaces the old /api/template?group=<name> Next.js route which no longer exists.
"""

import json
import re
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

from templates.presentation_layout import PresentationLayoutModel, SlideLayoutModel

TEMPLATE_BASE_DIR = Path("/app/servers/nextjs/app/presentation-templates")

# ── Hardcoded schemas for special imported types ────────────────────────────

IMAGE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "__image_url__": {"type": "string", "description": "URL to image"},
        "__image_prompt__": {
            "type": "string",
            "description": "Prompt used to generate the image",
            "minLength": 10,
            "maxLength": 50,
        },
    },
    "required": ["__image_url__", "__image_prompt__"],
}

ICON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "__icon_url__": {"type": "string", "description": "URL to icon"},
        "__icon_query__": {
            "type": "string",
            "description": "Query used to search the icon",
            "minLength": 5,
            "maxLength": 20,
        },
    },
    "required": ["__icon_url__", "__icon_query__"],
}

CHART_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["bar", "line", "pie", "donut"]},
        "data": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "number"},
                },
            },
        },
    },
}

TABLE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "headers": {"type": "array", "items": {"type": "string"}},
        "rows": {
            "type": "array",
            "items": {"type": "array", "items": {"type": "string"}},
        },
    },
}


# ── Balanced-delimiter helpers ──────────────────────────────────────────────

def _find_matching(s: str, start: int, open_ch: str, close_ch: str) -> int:
    """Return the index of the character that closes open_ch at position start."""
    depth = 0
    in_str = False
    str_ch = ""
    escape = False
    for i in range(start, len(s)):
        ch = s[i]
        if escape:
            escape = False
            continue
        if ch == "\\" and in_str:
            escape = True
            continue
        if in_str:
            if ch == str_ch:
                in_str = False
        else:
            if ch in "\"'`":
                in_str = True
                str_ch = ch
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return i
    return -1


def _strip_modifiers(s: str) -> str:
    """
    Remove trailing Zod chainable modifiers (.min, .max, .default, .meta,
    .optional, .nullable, .describe, .url, .email, .regex, .trim, etc.)
    while preserving the base type expression.
    """
    result = s.strip()
    changed = True
    simple_no_arg = (
        "optional", "nullable", "trim", "url", "email", "uuid", "cuid",
        "ip", "datetime", "date", "time", "base64", "toLowerCase",
        "toUpperCase", "nonempty",
    )
    single_arg = (
        "min", "max", "length", "step", "gte", "lte", "gt", "lt", "int",
        "finite", "multipleOf", "positive", "negative", "nonnegative",
        "nonpositive",
    )
    balanced_methods = ("describe", "meta", "catch", "default", "refine", "transform", "pipe")

    while changed:
        changed = False

        for method in simple_no_arg:
            suffix = f".{method}()"
            if result.endswith(suffix):
                result = result[: -len(suffix)].strip()
                changed = True
                break

        if changed:
            continue

        for method in single_arg:
            pat = rf"^([\s\S]+?)\.{method}\([^)]*\)$"
            mm = re.match(pat, result, re.DOTALL)
            if mm:
                result = mm.group(1).strip()
                changed = True
                break

        if changed:
            continue

        for method in balanced_methods:
            if not result.endswith(")"):
                continue
            suffix = f".{method}("
            idx = result.rfind(suffix)
            if idx == -1:
                continue
            open_idx = idx + len(suffix) - 1
            close_idx = _find_matching(result, open_idx, "(", ")")
            if close_idx == len(result) - 1:
                result = result[:idx].strip()
                changed = True
                break

    return result


# ── Schema type parser ──────────────────────────────────────────────────────

def _parse_zod_type(raw: str) -> dict:  # noqa: C901
    s = _strip_modifiers(raw.strip())
    # Some templates format chained zod calls as:
    # z
    #   .array(...)
    # The parser expects z.array(...). Normalize whitespace around the dot so
    # array/object schemas are not downgraded to strings.
    s = re.sub(r"\bz\s*\.\s*", "z.", s)

    if s.startswith("ImageSchema"):
        return IMAGE_SCHEMA

    if s.startswith("IconSchema"):
        return ICON_SCHEMA

    if "ChartSchema" in s or "chartSchema" in s:
        return CHART_SCHEMA

    if "TableSchema" in s or "tableSchema" in s:
        return TABLE_SCHEMA

    # ── z.object({...}) ────────────────────────────────────────────────────
    if s.startswith("z.object("):
        paren_open = s.index("(")
        content_start = paren_open + 1
        while content_start < len(s) and s[content_start] in " \t\n\r":
            content_start += 1
        if content_start < len(s) and s[content_start] == "{":
            brace_close = _find_matching(s, content_start, "{", "}")
            if brace_close != -1:
                inner = s[content_start + 1: brace_close]
                props = _parse_properties(inner)
                return {
                    "type": "object",
                    "properties": props,
                    "required": list(props.keys()),
                }
        return {"type": "object", "properties": {}}

    # ── z.array(X) ─────────────────────────────────────────────────────────
    if s.startswith("z.array("):
        paren_open = s.index("(")
        paren_close = _find_matching(s, paren_open, "(", ")")
        if paren_close != -1:
            inner = s[paren_open + 1: paren_close].strip()
            items_schema = _parse_zod_type(inner)
            return {"type": "array", "items": items_schema}
        return {"type": "array"}

    # ── z.string() ─────────────────────────────────────────────────────────
    if s.startswith("z.string("):
        return {"type": "string"}

    # ── z.number() / z.int() ───────────────────────────────────────────────
    if s.startswith("z.number(") or s.startswith("z.int("):
        return {"type": "number"}

    # ── z.boolean() ────────────────────────────────────────────────────────
    if s.startswith("z.boolean("):
        return {"type": "boolean"}

    # ── z.enum([...]) ──────────────────────────────────────────────────────
    if s.startswith("z.enum("):
        paren_open = s.index("(")
        paren_close = _find_matching(s, paren_open, "(", ")")
        if paren_close != -1:
            inner = s[paren_open + 1: paren_close].strip()
            values = re.findall(r'["\'`]([^"\'`]+)["\'`]', inner)
            if values:
                return {"type": "string", "enum": values}
        return {"type": "string"}

    # ── z.literal(...) ─────────────────────────────────────────────────────
    if s.startswith("z.literal("):
        m = re.search(r'z\.literal\(["\'`]([^"\'`]*)["\'`]\)', s)
        if m:
            return {"type": "string", "const": m.group(1)}
        m2 = re.search(r"z\.literal\((\d+(?:\.\d+)?)\)", s)
        if m2:
            return {"type": "number", "const": float(m2.group(1))}
        return {"type": "string"}

    # ── z.union([...]) / z.discriminatedUnion ──────────────────────────────
    if s.startswith("z.union(") or s.startswith("z.discriminatedUnion("):
        return {"type": "string"}

    # ── z.record(...) ──────────────────────────────────────────────────────
    if s.startswith("z.record("):
        return {"type": "object", "additionalProperties": True}

    # ── z.tuple([...]) ─────────────────────────────────────────────────────
    if s.startswith("z.tuple("):
        return {"type": "array"}

    # ── z.any() / z.unknown() ──────────────────────────────────────────────
    if s.startswith("z.any(") or s.startswith("z.unknown("):
        return {}

    # ── z.null() / z.undefined() / z.void() ───────────────────────────────
    if s.startswith("z.null(") or s.startswith("z.undefined(") or s.startswith("z.void("):
        return {"type": "null"}

    # Fallback
    return {"type": "string"}


def _parse_properties(inner: str) -> dict:  # noqa: C901
    """Parse the key-value pairs inside z.object({...})."""
    props: dict = {}
    i = 0
    n = len(inner)

    while i < n:
        # skip whitespace / commas
        while i < n and inner[i] in " \t\n\r,":
            i += 1
        if i >= n:
            break

        # Skip line comments // …
        if inner[i: i + 2] == "//":
            nl = inner.find("\n", i)
            i = nl + 1 if nl != -1 else n
            continue
        # Skip block comments /* … */
        if inner[i: i + 2] == "/*":
            end = inner.find("*/", i)
            i = end + 2 if end != -1 else n
            continue

        # Parse property name
        if inner[i] in "\"'`":
            quote = inner[i]
            end_q = inner.find(quote, i + 1)
            if end_q == -1:
                break
            prop_name = inner[i + 1: end_q]
            i = end_q + 1
        else:
            m = re.match(r"(\w+)", inner[i:])
            if not m:
                i += 1
                continue
            prop_name = m.group(1)
            i += m.end()

        # Skip optional '?' and ':'
        while i < n and inner[i] in " \t\n\r?":
            i += 1
        if i < n and inner[i] == ":":
            i += 1
        else:
            comma = inner.find(",", i)
            i = comma + 1 if comma != -1 else n
            continue

        while i < n and inner[i] in " \t\n\r":
            i += 1

        # Extract value: scan until top-level comma
        depth_p = depth_b = depth_sq = 0
        in_str = False
        str_ch = ""
        escape = False
        j = i
        while j < n:
            ch = inner[j]
            if escape:
                escape = False
                j += 1
                continue
            if ch == "\\" and in_str:
                escape = True
                j += 1
                continue
            if in_str:
                if ch == str_ch:
                    in_str = False
                j += 1
                continue
            if ch in "\"'`":
                in_str = True
                str_ch = ch
                j += 1
                continue
            if ch == "(":
                depth_p += 1
            elif ch == ")":
                depth_p -= 1
            elif ch == "{":
                depth_b += 1
            elif ch == "}":
                depth_b -= 1
            elif ch == "[":
                depth_sq += 1
            elif ch == "]":
                depth_sq -= 1
            # Stop at top-level comma or exiting the object
            if ch == "," and depth_p == 0 and depth_b == 0 and depth_sq == 0:
                break
            if depth_b < 0:
                break
            j += 1

        value_str = inner[i:j].strip()
        i = j

        if prop_name and value_str:
            try:
                props[prop_name] = _parse_zod_type(value_str)
            except Exception:
                props[prop_name] = {"type": "string"}

    return props


# ── Per-file extractor ──────────────────────────────────────────────────────

_EXPORT_RE_CONST = re.compile(
    r'export\s+(?:const|let|var)\s+(\w+)\s*=\s*[\'"`]([^\'"`]+)[\'"`]'
)


def _extract_layout_from_tsx(
    file_path: Path, template_name: str
) -> Optional[SlideLayoutModel]:
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        return None

    # Extract exported string constants
    consts: dict[str, str] = {}
    for m in _EXPORT_RE_CONST.finditer(content):
        consts[m.group(1)] = m.group(2)

    layout_id = (
        consts.get("layoutId")
        or consts.get("slideLayoutId")
        or consts.get("LAYOUT_ID")
        or file_path.stem.lower().replace(" ", "-")
    )
    layout_name = (
        consts.get("layoutName")
        or consts.get("slideLayoutName")
        or consts.get("LAYOUT_NAME")
        or file_path.stem
    )
    layout_desc = (
        consts.get("layoutDescription")
        or consts.get("slideLayoutDescription")
        or consts.get("LAYOUT_DESCRIPTION")
        or ""
    )

    # Find the main schema assignment: const <anything>Schema = z.object({...})
    # First, try to find the variable name from `export const Schema = <varName>`
    schema_var_match = re.search(
        r"export\s+const\s+Schema\s*=\s*(\w+)\s*\n",
        content,
        re.MULTILINE,
    )
    if schema_var_match:
        var_name = schema_var_match.group(1)
        schema_def = re.search(
            rf"const\s+{re.escape(var_name)}\s*=\s*(z\.object\()",
            content,
        )
        if schema_def:
            start = schema_def.start(1)
            # Find matching close paren for z.object(
            paren_open = content.index("(", start)
            paren_close = _find_matching(content, paren_open, "(", ")")
            if paren_close != -1:
                raw = content[start: paren_close + 1]
                try:
                    json_schema = _parse_zod_type(raw)
                except Exception:
                    json_schema = {"type": "object", "properties": {}}
            else:
                json_schema = {"type": "object", "properties": {}}
        else:
            json_schema = {"type": "object", "properties": {}}
    else:
        # Fallback: find any `const \w+Schema = z.object(`
        schema_def = re.search(
            r"const\s+\w+[Ss]chema\s*=\s*(z\.object\()",
            content,
        )
        if schema_def:
            start = schema_def.start(1)
            paren_open = content.index("(", start)
            paren_close = _find_matching(content, paren_open, "(", ")")
            if paren_close != -1:
                raw = content[start: paren_close + 1]
                try:
                    json_schema = _parse_zod_type(raw)
                except Exception:
                    json_schema = {"type": "object", "properties": {}}
            else:
                json_schema = {"type": "object", "properties": {}}
        else:
            json_schema = {"type": "object", "properties": {}}

    return SlideLayoutModel(
        id=f"{template_name}:{layout_id}",
        name=layout_name,
        description=layout_desc,
        json_schema=json_schema,
    )


# ── Cache ───────────────────────────────────────────────────────────────────

_CACHE: dict[str, PresentationLayoutModel] = {}


def _build_layout_model(template_name: str) -> PresentationLayoutModel:
    if template_name in _CACHE:
        return _CACHE[template_name]

    template_dir = TEMPLATE_BASE_DIR / template_name
    if not template_dir.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' not found",
        )

    # Load settings.json
    ordered = False
    settings_path = template_dir / "settings.json"
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text(encoding="utf-8"))
            ordered = bool(settings.get("ordered", False))
        except Exception:
            pass

    # Parse each .tsx file
    slides: list[SlideLayoutModel] = []
    tsx_files = sorted(
        f
        for f in template_dir.iterdir()
        if f.suffix == ".tsx"
        and not f.name.startswith(".")
        and "test" not in f.name.lower()
        and "spec" not in f.name.lower()
    )

    for tsx_file in tsx_files:
        layout = _extract_layout_from_tsx(tsx_file, template_name)
        if layout is not None:
            slides.append(layout)

    if not slides:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' has no slide layouts",
        )

    model = PresentationLayoutModel(
        name=template_name,
        ordered=ordered,
        slides=slides,
    )
    _CACHE[template_name] = model
    return model


# ── Public API ──────────────────────────────────────────────────────────────

async def get_layout_by_name(layout_name: str) -> PresentationLayoutModel:
    """
    Builds PresentationLayoutModel from the TypeScript template files on disk.
    Falls back gracefully if parsing fails.
    """
    try:
        return _build_layout_model(layout_name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{layout_name}' could not be loaded: {exc}",
        ) from exc
