import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

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
  try {
    return katex.renderToString(formula.trim(), {
      displayMode,
      throwOnError: false,
      trust: true,
    });
  } catch {
    const delim = displayMode ? '$$' : '$';
    return `<span class="text-red-500 font-mono text-sm">${delim}${formula}${delim}</span>`;
  }
}

function renderMathAndMarkdown(input) {
  // Use placeholder approach: extract math blocks first, then process text
  const placeholders = [];
  let result = input;

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
  result = result.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, f) => hold(renderKatex(f, false)));

  // 4. Inline math \(...\)
  result = result.replace(/\\\((.+?)\\\)/g, (_, f) => hold(renderKatex(f, false)));

  // 5. Bold markdown **...**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // 6. Newlines to <br>
  result = result.replace(/\n/g, '<br/>');

  // Restore placeholders
  result = result.replace(/\x00MATH(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

  return result;
}

/**
 * Lightweight wrapper for rendering just a single math formula.
 * Usage: <MathFormula formula="x^2 + 1" display={false} />
 */
export function MathFormula({ formula, display = false, className = '' }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(formula, {
        displayMode: display,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `<span class="text-red-500 font-mono text-sm">${formula}</span>`;
    }
  }, [formula, display]);

  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
