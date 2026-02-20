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

function renderMathAndMarkdown(input) {
  // First handle display math ($$...$$) then inline math ($...$), then bold
  // Use a placeholder approach to avoid double-processing

  let result = input;

  // 1. Display math $$...$$
  result = result.replace(/\$\$([^$]+?)\$\$/g, (_, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `<span class="text-red-500 font-mono text-sm">$$${formula}$$</span>`;
    }
  });

  // 2. Inline math $...$  (but avoid matching already-processed KaTeX output)
  result = result.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, formula) => {
    try {
      return katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `<span class="text-red-500 font-mono text-sm">$${formula}$</span>`;
    }
  });

  // 3. Bold markdown **...**
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // 4. Newlines to <br>
  result = result.replace(/\n/g, '<br/>');

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
