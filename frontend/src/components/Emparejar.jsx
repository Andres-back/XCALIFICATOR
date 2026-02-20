import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { CheckCircle2, XCircle, RotateCcw, Trash2 } from 'lucide-react';

/* ─── colour palette for cables ─── */
const CABLE_COLORS = [
  '#6366F1', // indigo
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#EF4444', // red
  '#84CC16', // lime
  '#F97316', // orange
  '#14B8A6', // teal
];

/**
 * Interactive Matching (Emparejar) component with SVG cable connections.
 * Props:
 *   emparejar : { instrucciones, pares: [{ id, izquierda, derecha }] }
 *   onComplete: (results: { correct, total, matches }) => void
 *   readOnly  : boolean – show answers without interaction
 */
export default function Emparejar({ emparejar, onComplete, readOnly = false }) {
  const pares = emparejar?.pares || [];
  const instrucciones =
    emparejar?.instrucciones ||
    'Une cada elemento de la izquierda con su correspondiente de la derecha arrastrando o haciendo clic.';

  /* ── shuffled right column ── */
  const [shuffledRight, setShuffledRight] = useState([]);
  /* matches: { leftId: rightId } */
  const [matches, setMatches] = useState({});
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [checked, setChecked] = useState(false);

  /* refs for anchor positions */
  const containerRef = useRef(null);
  const leftRefs = useRef({});
  const rightRefs = useRef({});
  const [anchors, setAnchors] = useState({ left: {}, right: {} });

  /* ── shuffle on mount ── */
  useEffect(() => {
    if (pares.length > 0) {
      const shuffled = [...pares]
        .map(p => ({ id: p.id, derecha: p.derecha }))
        .sort(() => Math.random() - 0.5);
      setShuffledRight(shuffled);
    }
  }, [pares]);

  /* ── compute anchor positions for cables ── */
  const recalcAnchors = useCallback(() => {
    if (!containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const left = {};
    const right = {};
    Object.entries(leftRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      left[id] = { x: r.right - box.left, y: r.top + r.height / 2 - box.top };
    });
    Object.entries(rightRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      right[id] = { x: r.left - box.left, y: r.top + r.height / 2 - box.top };
    });
    setAnchors({ left, right });
  }, []);

  useLayoutEffect(() => {
    recalcAnchors();
  }, [shuffledRight, matches, showResults, recalcAnchors]);

  useEffect(() => {
    window.addEventListener('resize', recalcAnchors);
    return () => window.removeEventListener('resize', recalcAnchors);
  }, [recalcAnchors]);

  /* ── interaction handlers ── */
  const handleLeftClick = id => {
    if (readOnly || checked) return;
    if (selectedLeft === id) { setSelectedLeft(null); return; }
    setSelectedLeft(id);
    if (selectedRight !== null) {
      makeMatch(id, selectedRight);
    }
  };

  const handleRightClick = id => {
    if (readOnly || checked) return;
    if (selectedRight === id) { setSelectedRight(null); return; }
    setSelectedRight(id);
    if (selectedLeft !== null) {
      makeMatch(selectedLeft, id);
    }
  };

  const makeMatch = (leftId, rightId) => {
    setMatches(prev => {
      const n = { ...prev };
      // remove existing uses
      Object.keys(n).forEach(k => { if (parseInt(k) === leftId || n[k] === rightId) delete n[k]; });
      n[leftId] = rightId;
      return n;
    });
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const removeMatch = leftId => {
    if (readOnly || checked) return;
    setMatches(prev => {
      const n = { ...prev };
      delete n[leftId];
      return n;
    });
  };

  const handleCheck = () => {
    setChecked(true);
    setShowResults(true);
    if (onComplete) {
      const correct = pares.filter(p => matches[p.id] === p.id).length;
      onComplete({ correct, total: pares.length, matches });
    }
  };

  const reset = () => {
    setMatches({});
    setSelectedLeft(null);
    setSelectedRight(null);
    setShowResults(false);
    setChecked(false);
    const shuffled = [...pares]
      .map(p => ({ id: p.id, derecha: p.derecha }))
      .sort(() => Math.random() - 0.5);
    setShuffledRight(shuffled);
  };

  /* ── helpers ── */
  const isLeftMatched = id => id in matches;
  const isRightMatched = id => Object.values(matches).includes(id);

  const getColorIndex = leftId => {
    const sorted = Object.keys(matches).map(Number).sort((a, b) => a - b);
    return sorted.indexOf(leftId);
  };

  if (!pares || pares.length === 0)
    return <p className="text-gray-400 text-sm">Sin actividad de emparejar disponible</p>;

  /* ── build cable paths ── */
  const cables = Object.entries(matches).map(([lId, rId]) => {
    const leftId = parseInt(lId);
    const la = anchors.left[leftId];
    const ra = anchors.right[rId];
    if (!la || !ra) return null;
    const idx = getColorIndex(leftId);
    const color = CABLE_COLORS[idx % CABLE_COLORS.length];
    const isCorrect = leftId === rId;
    const dx = (ra.x - la.x) * 0.45;
    const d = `M${la.x},${la.y} C${la.x + dx},${la.y} ${ra.x - dx},${ra.y} ${ra.x},${ra.y}`;
    return { key: `${leftId}-${rId}`, d, color, isCorrect, leftId };
  }).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <span className="text-lg">🔗</span>
        <p className="text-sm text-amber-800">{instrucciones}</p>
      </div>

      {/* Matching area */}
      <div ref={containerRef} className="relative">
        {/* SVG cables layer – sits behind the cards */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {cables.map(c => (
            <g key={c.key}>
              {/* glow / wider stroke behind */}
              <path d={c.d} fill="none"
                stroke={showResults ? (c.isCorrect ? '#22C55E' : '#EF4444') : c.color}
                strokeWidth={6} strokeLinecap="round" opacity={0.18} />
              {/* main cable */}
              <path d={c.d} fill="none"
                stroke={showResults ? (c.isCorrect ? '#22C55E' : '#EF4444') : c.color}
                strokeWidth={3} strokeLinecap="round"
                strokeDasharray={showResults && !c.isCorrect ? '8 4' : 'none'} />
              {/* clickable (to remove) */}
              {!checked && (
                <path d={c.d} fill="none" stroke="transparent" strokeWidth={16}
                  className="cursor-pointer pointer-events-auto"
                  onClick={() => removeMatch(c.leftId)} />
              )}
            </g>
          ))}
        </svg>

        <div className="grid grid-cols-[1fr_80px_1fr] gap-0 items-start" style={{ position: 'relative', zIndex: 2 }}>
          {/* ── Left column ── */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 ml-1">Columna A</h4>
            {pares.map((p, idx) => {
              const matched = isLeftMatched(p.id);
              const ci = matched ? getColorIndex(p.id) : -1;
              const cableColor = ci >= 0 ? CABLE_COLORS[ci % CABLE_COLORS.length] : null;
              const isActive = selectedLeft === p.id;
              const resultOk = matched && matches[p.id] === p.id;

              return (
                <div
                  key={p.id}
                  ref={el => (leftRefs.current[p.id] = el)}
                  onClick={() => handleLeftClick(p.id)}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-medium select-none
                    ${isActive
                      ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-300 scale-[1.02]'
                      : matched && showResults
                        ? resultOk ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'
                        : matched
                          ? 'bg-white border-gray-300'
                          : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                    }`}
                  style={matched && !showResults && cableColor ? { borderColor: cableColor, borderWidth: 2 } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                      style={{ background: matched && cableColor ? cableColor : '#D1D5DB', color: matched ? '#fff' : '#4B5563' }}
                    >
                      {idx + 1}
                    </span>
                    <span className="flex-1">{p.izquierda}</span>
                    {showResults && matched && (
                      resultOk
                        ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        : <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Center gap (cables cross here) ── */}
          <div />

          {/* ── Right column ── */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 ml-1">Columna B</h4>
            {shuffledRight.map((p, idx) => {
              const matched = isRightMatched(p.id);
              const sourceEntry = Object.entries(matches).find(([, v]) => v === p.id);
              const sourceId = sourceEntry ? parseInt(sourceEntry[0]) : null;
              const ci = sourceId !== null ? getColorIndex(sourceId) : -1;
              const cableColor = ci >= 0 ? CABLE_COLORS[ci % CABLE_COLORS.length] : null;
              const isActive = selectedRight === p.id;
              const resultOk = sourceId === p.id;

              return (
                <div
                  key={p.id}
                  ref={el => (rightRefs.current[p.id] = el)}
                  onClick={() => handleRightClick(p.id)}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-medium select-none
                    ${isActive
                      ? 'bg-indigo-100 border-indigo-400 ring-2 ring-indigo-300 scale-[1.02]'
                      : matched && showResults
                        ? resultOk ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'
                        : matched
                          ? 'bg-white border-gray-300'
                          : 'bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                    }`}
                  style={matched && !showResults && cableColor ? { borderColor: cableColor, borderWidth: 2 } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
                      style={{ background: matched && cableColor ? cableColor : '#D1D5DB', color: matched ? '#fff' : '#4B5563' }}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1">{p.derecha}</span>
                    {showResults && matched && (
                      resultOk
                        ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        : <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hint: click cable to remove */}
      {!checked && Object.keys(matches).length > 0 && (
        <p className="text-center text-[11px] text-gray-400 -mt-1">
          Haz clic en un cable para eliminarlo
        </p>
      )}

      {/* Progress + buttons */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Parejas conectadas: <span className="font-bold text-indigo-600">{Object.keys(matches).length}/{pares.length}</span>
        </p>
        <div className="flex gap-2">
          {!checked && Object.keys(matches).length === pares.length && (
            <button
              onClick={handleCheck}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Verificar
            </button>
          )}
          {(Object.keys(matches).length > 0 || checked) && (
            <button
              onClick={reset}
              className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
            >
              <RotateCcw className="w-3 h-3" /> Reiniciar
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {showResults && (
        <div className={`p-4 rounded-xl border-2 ${
          pares.filter(p => matches[p.id] === p.id).length === pares.length
            ? 'bg-green-50 border-green-300'
            : 'bg-amber-50 border-amber-300'
        }`}>
          <p className="text-sm font-semibold">
            {pares.filter(p => matches[p.id] === p.id).length === pares.length
              ? '🎉 ¡Perfecto! Todas las parejas son correctas.'
              : `📝 Resultado: ${pares.filter(p => matches[p.id] === p.id).length} de ${pares.length} correctas.`}
          </p>
        </div>
      )}
    </div>
  );
}
