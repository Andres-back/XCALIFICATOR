import { useMemo } from 'react';
import katex from 'katex';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';

const LATEX_COMMANDS = [
  'frac', 'dfrac', 'sqrt', 'times', 'cdot', 'pm', 'neq', 'leq', 'geq',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'int', 'sum',
  'theta', 'pi', 'alpha', 'beta', 'gamma', 'delta', 'lambda', 'mu', 'sigma', 'omega',
  'left', 'right', 'text', 'begin', 'end', 'overline', 'underline',
];


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tupleToPmatrix(content) {
  const tokens = String(content)
    .trim()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length !== 4 && tokens.length !== 9) {
    return null;
  }

  const size = Math.sqrt(tokens.length);
  const rows = [];
  for (let i = 0; i < tokens.length; i += size) {
    rows.push(tokens.slice(i, i + size).join(' & '));
  }
  return `\\begin{pmatrix}${rows.join(' \\\\ ')}\\end{pmatrix}`;
}

export function normalizePlainMathText(input) {
  if (input == null) return '';

  let value = String(input);

  // Convert plain matrix assignments like A = (1 2 3 4) into LaTeX matrices.
  value = value.replace(/\b([A-Z])\s*=\s*\(([^()]+)\)/g, (match, name, tuple) => {
    const matrix = tupleToPmatrix(tuple);
    if (!matrix) return match;
    return `${name} = $${matrix}$`;
  });

  // Convert "matriz (1 0 0 1)" style mentions.
  value = value.replace(/\bmatriz\s*\(([^()]+)\)/gi, (match, tuple) => {
    const matrix = tupleToPmatrix(tuple);
    if (!matrix) return match;
    return `matriz $${matrix}$`;
  });

  // Normalize plain logarithm notation: log_2(8), log2(8), log10(100).
  value = value.replace(/(^|[^\\$])\blog_?(\d+)\s*\(\s*([^()]+?)\s*\)/gi, (_, prefix, base, arg) => {
    return `${prefix}$\\log_{${base}}(${arg.trim()})$`;
  });

  return value;
}

export function normalizeLatexFormula(formula) {
  if (formula == null) return '';

  let value = String(formula);
  const commandPattern = `(?:${LATEX_COMMANDS.join('|')})`;

  // Recover commands broken by JSON escapes (e.g. "\frac" decoded as form-feed + "rac").
  value = value.replace(/\f(?=rac\b)/g, () => '\\f');
  value = value.replace(/\t(?=(?:imes|heta|ext|au)\b)/g, () => '\\t');
  value = value.replace(/\n(?=(?:eq|abla|u)\b)/g, () => '\\n');
  value = value.replace(/\r(?=(?:ight|ho)\b)/g, () => '\\r');
  value = value.replace(/\x08(?=eta\b)/g, () => '\\b');


    // Normalize command prefixes like "\\ begin" or "\\\\begin" into "\begin".
    const spacedCommandRegex = new RegExp(`(?:\\\\\\s*)+(?=${commandPattern}\\b)`, 'g');
    value = value.replace(spacedCommandRegex, '\\');

    // Collapse repeated slashes before known commands (e.g. "\\begin" -> "\begin").
    const repeatedCommandSlashRegex = new RegExp(`\\\\{2,}\\s*(?=${commandPattern}\\b)`, 'g');
    value = value.replace(repeatedCommandSlashRegex, '\\');

    // Collapse repeated slashes before TeX inline/display delimiters.
    value = value.replace(/\\{2,}(?=[()\[\]])/g, '\\');

  // Recover matrix environments written without backslash by the model.
  value = value.replace(/(^|[^\\])begin\{([a-zA-Z]+matrix)\}/g, (_, prefix, env) => `${prefix}\\begin{${env}}`);
  value = value.replace(/(^|[^\\])end\{([a-zA-Z]+matrix)\}/g, (_, prefix, env) => `${prefix}\\end{${env}}`);

  // Normalize broken row separators inside matrix environments ("\ 1" -> "\\ 1").
  value = value.replace(/\\begin\{([a-zA-Z]+matrix)\}([\s\S]*?)\\end\{\1\}/g, (_, env, body) => {
    const fixedBody = String(body)
      .replace(/\\\s*\\+/g, '\\\\')
      .replace(/(^|[^\\])\\\s+(?=[^\\\s])/g, '$1\\\\ ')
      .replace(/\s*\\\\\s*/g, ' \\\\ ')
      .replace(/(?:\s*\\\\\s*){2,}/g, ' \\\\ ')
      .replace(/^\\\\\s*/, '')
      .replace(/\\\\\s*$/, '')
      .trim();
    return `\\begin{${env}}${fixedBody}\\end{${env}}`;
  });

  const commandRegex = new RegExp(`\\\\(?=${commandPattern}\\b)`, 'g');
  value = value.replace(commandRegex, () => '\\');

  // Normalize common Spanish function aliases.
  value = value.replace(/\\sen\b/g, '\\sin');

  return value;
}

function isLikelyMixedProseAndMatrix(formula) {
  const normalized = normalizeLatexFormula(formula);
  if (!/\\begin\{[a-zA-Z]+matrix\}/.test(normalized)) return false;
  if (/\\text\s*\{/.test(normalized)) return false;

  return /[¿¡]|[áéíóúñ]/i.test(normalized)
    || /\b(?:si|cual|cuál|resultado|propiedad|siempre|verdadero|falso|matriz)\b/i.test(normalized);
}

/**
 * Renders text with inline ($...$) and display ($$...$$) LaTeX math formulas.
 * Falls back gracefully on invalid LaTeX, showing the raw formula.
 * Also handles **bold** markdown.
 *
 * Usage: <MathText text="La fórmula es $x^2 + y^2 = r^2$" />
 */
export default function MathText({ text, className = '' }) {
  const rendered = useMemo(() => {
    if (!text) return '';
    return renderMathAndMarkdown(text);
  }, [text]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function renderKatex(formula, displayMode) {
  const normalized = normalizeLatexFormula(formula);
    const render = (candidate) => katex.renderToString(candidate, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
    });

    try {
      let html = render(normalized);

      // Retry once after aggressively collapsing duplicated command slashes.
      if (html.includes('katex-error')) {
        const repaired = normalizeLatexFormula(
          normalized
            .replace(/\\{2,}\\s*(?=[a-zA-Z]+)/g, '\\')
            .replace(/\\{2,}(?=[()\[\]])/g, '\\')
        ).trim();

        if (repaired && repaired !== normalized) {
          html = render(repaired);
        }
      }

      if (html.includes('katex-error')) {
        throw new Error('KaTeX parse error');
      }

      return html;
  } catch {
    const delim = displayMode ? '$$' : '$';
    return `<span class="text-red-500 font-mono text-sm">${escapeHtml(`${delim}${normalized}${delim}`)}</span>`;
  }
}

function renderMathAndMarkdown(input) {
  const normalizedInput = normalizePlainMathText(input);

  // Use placeholder approach: extract math blocks first, then process text
  const placeholders = [];
  let result = normalizedInput;

  const hold = (html) => {
    const idx = placeholders.length;
    placeholders.push(html);
    return `\x00MATH${idx}\x00`;
  };

  // 1. Display math $$...$$ (greedy-safe)
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => hold(renderKatex(f, true)));

  // 2. Display math \[...\]
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => hold(renderKatex(f, true)));

  // 3. Inline math $...$ (single line)
  result = result.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, f) => {
    if (isLikelyMixedProseAndMatrix(f)) {
      return normalizeLatexFormula(f);
    }
    return hold(renderKatex(f, false));
  });

  // 4. Inline math \(...\)
  result = result.replace(/\\\((.+?)\\\)/g, (_, f) => {
    if (isLikelyMixedProseAndMatrix(f)) {
      return normalizeLatexFormula(f);
    }
    return hold(renderKatex(f, false));
  });

  // 5. Bare matrix environments without delimiters.
  result = result.replace(/(?:\\\s*)+begin\{([a-zA-Z]+matrix)\}([\s\S]*?)(?:\\\s*)+end\{\1\}/g, (_, env, body) => {
    return hold(renderKatex(`\\begin{${env}}${body}\\end{${env}}`, false));
  });

  // 6. Bold markdown **...**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // 7. Newlines to <br>
  result = result.replace(/\n/g, '<br/>');

  // Restore placeholders
  result = result.replace(/\x00MATH(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

  return DOMPurify.sanitize(result, {
    USE_PROFILES: {
      html: true,
      mathMl: true,
      svg: true,
    },
  });
}

/**
 * Lightweight wrapper for rendering just a single math formula.
 * Usage: <MathFormula formula="x^2 + 1" display={false} />
 */
export function MathFormula({ formula, display = false, className = '' }) {
  const html = useMemo(() => {
    const normalized = normalizeLatexFormula(formula);
    try {
      const rendered = katex.renderToString(normalized, {
        displayMode: display,
        throwOnError: false,
        trust: false,
      });
      return DOMPurify.sanitize(rendered, {
        USE_PROFILES: {
          html: true,
          mathMl: true,
          svg: true,
        },
      });
    } catch {
      return `<span class="text-red-500 font-mono text-sm">${escapeHtml(normalized)}</span>`;
    }
  }, [formula, display]);

  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
