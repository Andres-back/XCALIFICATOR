import { useMemo, useState, useRef, useCallback } from 'react';
import { Printer, RotateCcw, Puzzle } from 'lucide-react';

/**
 * Custom Crossword component — direction-aware navigation, iframe print.
 * Props:
 *  - crucigrama: { grid, pistas_horizontal, pistas_vertical }
 *  - onChange(answers): called on every keystroke (continuous sync for student)
 *  - onComplete(answers): legacy callback (optional)
 */

function buildCrosswordData(crucigrama) {
  const grid = crucigrama?.grid || [];
  if (!grid.length) return null;

  let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      if (grid[r][c] && grid[r][c].trim()) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < minR) return null;

  const numMap = {};
  for (const p of (crucigrama?.pistas_horizontal || [])) {
    if (typeof p === 'object' && p.numero != null) numMap[`${p.fila},${p.columna}`] = p.numero;
  }
  for (const p of (crucigrama?.pistas_vertical || [])) {
    if (typeof p === 'object' && p.numero != null) {
      const key = `${p.fila},${p.columna}`;
      if (!numMap[key]) numMap[key] = p.numero;
    }
  }

  const answerMap = {};
  for (const p of (crucigrama?.pistas_horizontal || [])) {
    if (typeof p !== 'object') continue;
    const word = (p.respuesta || '').toUpperCase();
    for (let k = 0; k < word.length; k++) answerMap[`${p.fila},${p.columna + k}`] = word[k];
  }
  for (const p of (crucigrama?.pistas_vertical || [])) {
    if (typeof p !== 'object') continue;
    const word = (p.respuesta || '').toUpperCase();
    for (let k = 0; k < word.length; k++) answerMap[`${p.fila + k},${p.columna}`] = word[k];
  }

  const words = [];
  for (const p of (crucigrama?.pistas_horizontal || [])) {
    if (typeof p !== 'object') continue;
    const w = (p.respuesta || '').toUpperCase();
    const cells = [];
    for (let k = 0; k < w.length; k++) cells.push(`${p.fila},${p.columna + k}`);
    words.push({ dir: 'h', cells, numero: p.numero });
  }
  for (const p of (crucigrama?.pistas_vertical || [])) {
    if (typeof p !== 'object') continue;
    const w = (p.respuesta || '').toUpperCase();
    const cells = [];
    for (let k = 0; k < w.length; k++) cells.push(`${p.fila + k},${p.columna}`);
    words.push({ dir: 'v', cells, numero: p.numero });
  }

  const cellToWords = {};
  words.forEach((w, wi) => {
    w.cells.forEach((key, pos) => {
      if (!cellToWords[key]) cellToWords[key] = [];
      cellToWords[key].push({ wordIdx: wi, pos });
    });
  });

  const rows = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) {
      const letter = grid[r]?.[c]?.trim() || '';
      row.push({ active: !!letter, num: numMap[`${r},${c}`] || null, answer: answerMap[`${r},${c}`] || '', r, c });
    }
    rows.push(row);
  }

  return { rows, words, cellToWords, answerMap };
}

/* Print via hidden iframe (avoids popup blockers) */
function printCrossword(data, horizontales, verticales) {
  if (!data) return;
  const trs = data.rows.map(row =>
    '<tr>' + row.map(cell => {
      if (!cell.active) return '<td class="blk"></td>';
      return `<td class="cell">${cell.num ? `<span class="num">${cell.num}</span>` : ''}</td>`;
    }).join('') + '</tr>'
  ).join('');

  const html = `<!DOCTYPE html><html><head><title>Crucigrama</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Poppins',sans-serif;max-width:860px;margin:16px auto;padding:16px;color:#202020;background:#efefef}
  .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
  h1{text-align:left;font-size:28px;margin-bottom:0;color:#3e3e3e;font-weight:700}
  .meta{font-size:12px;color:#555;line-height:1.5}
  .line{display:inline-block;min-width:180px;border-bottom:1px dotted #4b5563;margin-left:4px;transform:translateY(-2px)}
  .subtitle{font-size:24px;color:#11a6b5;font-weight:700}
  .rule{height:3px;background:#2bb6c2;border-radius:99px;margin:8px 0 14px}
  table{border-collapse:collapse;margin:0 auto 20px}
  td{width:36px;height:36px;text-align:center;vertical-align:middle;position:relative;font-size:14px;padding:0}
  .blk{background:transparent;border:1px solid transparent}
  .cell{background:#e8e8e8;border:1px solid #3f3f46;box-shadow:inset 0 0 0 3px #88d4db}
  .num{position:absolute;top:1px;left:3px;font-size:10px;font-weight:700;color:#111827;line-height:1}
  .cols{display:flex;gap:36px;justify-content:center;margin-top:18px}
  .col{flex:1;max-width:360px;background:#f6f6f6;border:1px solid #d1d5db;border-radius:10px;padding:10px}
  .col h3{font-size:14px;margin-bottom:8px;color:#0f766e;border-bottom:2px solid #99e2e7;padding-bottom:4px}
  .col p{font-size:12px;margin:5px 0;line-height:1.5}
  .col .n{font-weight:700;color:#0f766e;margin-right:2px}
  @media print{body{margin:8px;padding:8px}}
</style></head><body>
  <div class="top">
    <div class="meta">
      <div>Mi nombre:<span class="line"></span></div>
      <div>Fecha:<span class="line"></span> Hora:<span class="line" style="min-width:120px"></span></div>
    </div>
    <h1 class="subtitle">Crucigrama</h1>
  </div>
  <div class="rule"></div>
  <table>${trs}</table>
  <div class="cols">
    ${horizontales.length ? `<div class="col"><h3>\u2192 Horizontales</h3>${horizontales.map(p => `<p><span class="n">${typeof p==='object'?p.numero:''}.</span> ${typeof p==='object'?p.pista:p}</p>`).join('')}</div>` : ''}
    ${verticales.length ? `<div class="col"><h3>\u2193 Verticales</h3>${verticales.map(p => `<p><span class="n">${typeof p==='object'?p.numero:''}.</span> ${typeof p==='object'?p.pista:p}</p>`).join('')}</div>` : ''}
  </div>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:900px;height:700px';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* fallback */ }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
  }, 600);
}

export default function Crucigrama({ crucigrama, onChange, onComplete }) {
  const data = useMemo(() => buildCrosswordData(crucigrama), [crucigrama]);
  const horizontales = crucigrama?.pistas_horizontal || [];
  const verticales = crucigrama?.pistas_vertical || [];
  const interactive = typeof onChange === 'function' || typeof onComplete === 'function';

  const [answers, setAnswers] = useState({});
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  const inputRefs = useRef({});

  const activeWord = data && activeWordIdx >= 0 ? data.words[activeWordIdx] : null;
  const highlightSet = useMemo(() => new Set(activeWord?.cells || []), [activeWord]);

  const reportAnswers = useCallback((newAns) => {
    if (typeof onChange === 'function') onChange(newAns);
  }, [onChange]);

  const focusCell = useCallback((key) => {
    inputRefs.current[key]?.focus();
  }, []);

  const selectWord = useCallback((wordIdx) => {
    if (!data || wordIdx < 0 || wordIdx >= data.words.length) return;
    setActiveWordIdx(wordIdx);
    const word = data.words[wordIdx];
    const firstEmpty = word.cells.find(k => !answers[k]);
    focusCell(firstEmpty || word.cells[0]);
  }, [data, answers, focusCell]);

  const handleCellFocus = useCallback((r, c) => {
    if (!data) return;
    const key = `${r},${c}`;
    const cws = data.cellToWords[key] || [];
    if (!cws.length) return;
    const curDir = activeWord?.dir;
    let pick = cws[0];
    if (cws.length > 1) {
      const sameAsActive = cws.find(w => w.wordIdx === activeWordIdx);
      if (sameAsActive) pick = sameAsActive;
      else if (curDir) pick = cws.find(w => data.words[w.wordIdx].dir === curDir) || cws[0];
    }
    setActiveWordIdx(pick.wordIdx);
  }, [data, activeWordIdx, activeWord]);

  const handleCellClick = useCallback((r, c) => {
    if (!data) return;
    const key = `${r},${c}`;
    const cws = data.cellToWords[key] || [];
    if (!cws.length) return;
    const el = document.activeElement;
    if (inputRefs.current[key] === el && cws.length > 1) {
      const curDir = activeWord?.dir;
      const other = cws.find(w => data.words[w.wordIdx].dir !== curDir);
      if (other) { setActiveWordIdx(other.wordIdx); return; }
    }
    handleCellFocus(r, c);
    focusCell(key);
  }, [data, activeWordIdx, activeWord, handleCellFocus, focusCell]);

  const handleInput = useCallback((r, c, value) => {
    const ch = value.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚ]/g, '').slice(0, 1);
    const key = `${r},${c}`;
    const newAns = { ...answers, [key]: ch };
    setAnswers(newAns);
    reportAnswers(newAns);
    if (ch && activeWord) {
      const idx = activeWord.cells.indexOf(key);
      if (idx >= 0 && idx < activeWord.cells.length - 1) focusCell(activeWord.cells[idx + 1]);
    }
  }, [answers, activeWord, focusCell, reportAnswers]);

  const handleKeyDown = useCallback((e, r, c) => {
    if (!data) return;
    const key = `${r},${c}`;

    if (e.key === 'Backspace') {
      if (!answers[key] && activeWord) {
        const idx = activeWord.cells.indexOf(key);
        if (idx > 0) {
          const prev = activeWord.cells[idx - 1];
          const newAns = { ...answers, [prev]: '' };
          setAnswers(newAns);
          reportAnswers(newAns);
          focusCell(prev);
          e.preventDefault();
        }
      }
      return;
    }

    const arrows = { ArrowRight: 'h', ArrowLeft: 'h', ArrowDown: 'v', ArrowUp: 'v' };
    const arrowDir = arrows[e.key];
    if (!arrowDir) return;
    e.preventDefault();
    const cws = data.cellToWords[key] || [];
    const wordEntry = cws.find(w => data.words[w.wordIdx].dir === arrowDir);
    if (!wordEntry) return;
    const word = data.words[wordEntry.wordIdx];
    setActiveWordIdx(wordEntry.wordIdx);
    const idx = word.cells.indexOf(key);
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (forward && idx < word.cells.length - 1) focusCell(word.cells[idx + 1]);
    if (!forward && idx > 0) focusCell(word.cells[idx - 1]);
  }, [data, answers, activeWord, focusCell, reportAnswers]);

  if (!data || !data.rows.length) {
    return (
      <div className="text-center py-6">
        <Puzzle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-gray-400 text-sm">Sin crucigrama disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
            <Puzzle className="w-4 h-4 text-cyan-700" />
          </div>
          <span className="text-sm font-semibold text-cyan-800">Crucigrama</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => printCrossword(data, horizontales, verticales)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>
          {interactive && (
            <button onClick={() => { setAnswers({}); setActiveWordIdx(-1); reportAnswers({}); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
              <RotateCcw className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto flex justify-center bg-[#e7e7ea] rounded-xl border border-cyan-200 p-3 sm:p-4">
        <table className="border-collapse" style={{ borderSpacing: 0 }}>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => {
                  const key = `${cell.r},${cell.c}`;
                  const isHL = highlightSet.has(key);
                  const cellStyle = cell.active
                    ? (isHL && interactive
                      ? {
                          minWidth: 36,
                          minHeight: 36,
                          background: '#f7fcff',
                          border: '1px solid #374151',
                          boxShadow: 'inset 0 0 0 3px #38bdf8',
                        }
                      : {
                          minWidth: 36,
                          minHeight: 36,
                          background: '#e7e7e7',
                          border: '1px solid #3f3f46',
                          boxShadow: 'inset 0 0 0 3px #88d4db',
                        })
                    : {
                        minWidth: 36,
                        minHeight: 36,
                        background: 'transparent',
                        border: '1px solid transparent',
                      };

                  return (
                    <td key={ci}
                      className="w-9 h-9 sm:w-10 sm:h-10 text-center relative"
                      style={cellStyle}
                      onClick={() => cell.active && interactive && handleCellClick(cell.r, cell.c)}
                    >
                      {cell.active && cell.num && (
                        <span className="absolute top-0.5 left-1 text-[9px] font-bold text-gray-900 leading-none select-none z-10">
                          {cell.num}
                        </span>
                      )}
                      {cell.active && interactive && (
                        <input
                          ref={el => { if (el) inputRefs.current[key] = el; }}
                          className="absolute inset-0 w-full h-full text-center font-bold text-sm uppercase bg-transparent outline-none caret-cyan-700 text-gray-900 z-20 cursor-pointer"
                          maxLength={1}
                          value={answers[key] || ''}
                          onChange={e => handleInput(cell.r, cell.c, e.target.value)}
                          onKeyDown={e => handleKeyDown(e, cell.r, cell.c)}
                          onFocus={() => handleCellFocus(cell.r, cell.c)}
                          autoComplete="off"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {horizontales.length > 0 && (
          <div className="flex-1 bg-white rounded-xl border border-cyan-100 p-3">
            <h4 className="text-xs font-bold text-cyan-800 mb-2 border-b border-cyan-100 pb-1">→ Horizontales</h4>
            <div className="space-y-1">
              {horizontales.map((p, i) => {
                const num = typeof p === 'object' ? p.numero : i + 1;
                const wIdx = data.words.findIndex(w => w.dir === 'h' && w.numero === num);
                const isActive = wIdx === activeWordIdx;
                return (
                  <p key={i}
                    className={`text-[11px] leading-relaxed rounded px-1.5 py-0.5 transition-colors ${
                      isActive ? 'bg-cyan-100 text-cyan-900 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    } ${interactive ? 'cursor-pointer' : ''}`}
                    onClick={() => interactive && wIdx >= 0 && selectWord(wIdx)}>
                    <span className="font-bold text-cyan-700">{num}.</span>{' '}
                    {typeof p === 'object' ? p.pista : p}
                  </p>
                );
              })}
            </div>
          </div>
        )}
        {verticales.length > 0 && (
          <div className="flex-1 bg-white rounded-xl border border-cyan-100 p-3">
            <h4 className="text-xs font-bold text-cyan-800 mb-2 border-b border-cyan-100 pb-1">↓ Verticales</h4>
            <div className="space-y-1">
              {verticales.map((p, i) => {
                const num = typeof p === 'object' ? p.numero : i + 1;
                const wIdx = data.words.findIndex(w => w.dir === 'v' && w.numero === num);
                const isActive = wIdx === activeWordIdx;
                return (
                  <p key={i}
                    className={`text-[11px] leading-relaxed rounded px-1.5 py-0.5 transition-colors ${
                      isActive ? 'bg-cyan-100 text-cyan-900 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    } ${interactive ? 'cursor-pointer' : ''}`}
                    onClick={() => interactive && wIdx >= 0 && selectWord(wIdx)}>
                    <span className="font-bold text-cyan-700">{num}.</span>{' '}
                    {typeof p === 'object' ? p.pista : p}
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {interactive && (
        <p className="text-center text-[10px] text-gray-400">
          Haz clic en una pista o celda · Clic de nuevo para cambiar dirección · Flechas para navegar
        </p>
      )}
    </div>
  );
}
