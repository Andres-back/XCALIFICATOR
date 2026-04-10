import re

LATEX_COMMANDS = (
    "frac", "dfrac", "sqrt", "times", "cdot", "pm", "neq", "leq", "geq",
    "sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "int", "sum",
    "theta", "pi", "alpha", "beta", "gamma", "delta", "lambda", "mu", "sigma", "omega",
    "left", "right", "text", "begin", "end", "overline", "underline",
)


def normalize_latex_formula(formula: str) -> str:
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


def normalize_latex_payload(value):
    """Normalize LaTeX escapes recursively in strings, dicts and lists."""
    if isinstance(value, str):
        return normalize_latex_formula(value)

    if isinstance(value, list):
        return [normalize_latex_payload(item) for item in value]

    if isinstance(value, dict):
        return {k: normalize_latex_payload(v) for k, v in value.items()}

    return value
