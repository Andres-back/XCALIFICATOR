import { useState, useCallback, useRef } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';

/**
 * Interactive Word Search (Sopa de Letras) component.
 * Props:
 *   grid: string[][] - Letter grid
 *   palabras: string[] - Words to find
 *   onComplete: (foundWords: string[]) => void
 */
export default function SopaLetras({ grid, palabras = [], onComplete }) {
  const [found, setFound] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [highlighted, setHighlighted] = useState([]); // [{r,c}] cells of found words
  const gridRef = useRef(null);

  const rows = grid?.length || 0;
  const cols = grid?.[0]?.length || 0;

  // Get cells between start and end (line only: horiz, vert, or diag)
  const getCellsBetween = useCallback((start, end) => {
    if (!start || !end) return [];
    const dr = Math.sign(end.r - start.r);
    const dc = Math.sign(end.c - start.c);
    const dist = Math.max(Math.abs(end.r - start.r), Math.abs(end.c - start.c));

    // Must be a straight line
    if (end.r - start.r !== 0 && end.c - start.c !== 0 &&
        Math.abs(end.r - start.r) !== Math.abs(end.c - start.c)) {
      return [];
    }

    const cells = [];
    for (let i = 0; i <= dist; i++) {
      cells.push({ r: start.r + dr * i, c: start.c + dc * i });
    }
    return cells;
  }, []);

  const getWordFromCells = useCallback((cells) => {
    return cells.map(({ r, c }) => (grid[r]?.[c] || '').toUpperCase()).join('');
  }, [grid]);

  const handleMouseDown = (r, c) => {
    setSelecting(true);
    setSelStart({ r, c });
    setSelEnd({ r, c });
  };

  const handleMouseEnter = (r, c) => {
    if (selecting) setSelEnd({ r, c });
  };

  const handleMouseUp = () => {
    if (!selecting || !selStart || !selEnd) {
      setSelecting(false);
      return;
    }

    const cells = getCellsBetween(selStart, selEnd);
    if (cells.length > 1) {
      const word = getWordFromCells(cells);
      const wordReverse = word.split('').reverse().join('');

      const match = palabras.find(p => {
        const normalized = p.toUpperCase().replace(/[^A-Z]/g, '');
        return normalized === word || normalized === wordReverse;
      });

      if (match && !found.includes(match.toUpperCase())) {
        const newFound = [...found, match.toUpperCase()];
        setFound(newFound);
        setHighlighted(prev => [...prev, ...cells]);
        if (onComplete && newFound.length === palabras.length) {
          onComplete(newFound);
        }
      }
    }

    setSelecting(false);
    setSelStart(null);
    setSelEnd(null);
  };

  const currentSelection = selecting ? getCellsBetween(selStart, selEnd) : [];
  const isInSelection = (r, c) => currentSelection.some(s => s.r === r && s.c === c);
  const isHighlighted = (r, c) => highlighted.some(h => h.r === r && h.c === c);

  const reset = () => {
    setFound([]);
    setHighlighted([]);
  };

  if (!grid || rows === 0) return <p className="text-gray-400 text-sm">Sin cuadrícula disponible</p>;

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div
        ref={gridRef}
        className="inline-block select-none border-2 border-indigo-200 rounded-xl overflow-hidden bg-white shadow-sm"
        onMouseLeave={() => { if (selecting) handleMouseUp(); }}
      >
        {grid.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => (
              <div
                key={`${r}-${c}`}
                className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xs sm:text-sm font-bold cursor-pointer transition-all
                  border border-gray-100
                  ${isHighlighted(r, c)
                    ? 'bg-green-200 text-green-800'
                    : isInSelection(r, c)
                      ? 'bg-indigo-300 text-white scale-105'
                      : 'hover:bg-indigo-50 text-gray-700'
                  }`}
                onMouseDown={() => handleMouseDown(r, c)}
                onMouseEnter={() => handleMouseEnter(r, c)}
                onMouseUp={handleMouseUp}
              >
                {(cell || '').toUpperCase()}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Words list */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">
          Palabras ({found.length}/{palabras.length})
        </h4>
        <div className="flex flex-wrap gap-2">
          {palabras.map(word => {
            const isFound = found.includes(word.toUpperCase());
            return (
              <span
                key={word}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all
                  ${isFound
                    ? 'bg-green-100 text-green-700 line-through border border-green-200'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}
              >
                {isFound && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                {word.toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>

      {found.length > 0 && (
        <button onClick={reset}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <RotateCcw className="w-3 h-3" /> Reiniciar
        </button>
      )}
    </div>
  );
}
