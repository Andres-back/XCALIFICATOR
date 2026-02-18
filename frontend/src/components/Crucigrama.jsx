import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';

/**
 * Interactive Crossword (Crucigrama) component.
 * Props:
 *   crucigrama: { grid, pistas_horizontal, pistas_vertical, size }
 *   onComplete: (answers: object) => void
 */
export default function Crucigrama({ crucigrama, onComplete }) {
  const grid = crucigrama?.grid || [];
  const size = crucigrama?.size || grid.length;
  const horizontales = crucigrama?.pistas_horizontal || [];
  const verticales = crucigrama?.pistas_vertical || [];

  // Answers grid: user-typed letters
  const [userGrid, setUserGrid] = useState(() => {
    return grid.map(row =>
      row.map(cell => (cell && cell.trim() ? '' : null)) // null = blocked, '' = empty editable
    );
  });

  const [selectedCell, setSelectedCell] = useState(null);
  const [direction, setDirection] = useState('horizontal'); // 'horizontal' | 'vertical'

  const isBlocked = (r, c) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return true;
    const cell = grid[r]?.[c];
    return !cell || !cell.trim();
  };

  const handleCellClick = (r, c) => {
    if (isBlocked(r, c)) return;
    if (selectedCell?.r === r && selectedCell?.c === c) {
      setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal');
    }
    setSelectedCell({ r, c });
  };

  const handleKeyDown = useCallback((e) => {
    if (!selectedCell) return;
    const { r, c } = selectedCell;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setUserGrid(prev => {
        const copy = prev.map(row => [...row]);
        copy[r][c] = '';
        return copy;
      });
      // Move back
      const dr = direction === 'vertical' ? -1 : 0;
      const dc = direction === 'horizontal' ? -1 : 0;
      const nr = r + dr, nc = c + dc;
      if (!isBlocked(nr, nc)) setSelectedCell({ r: nr, c: nc });
      return;
    }

    if (e.key === 'ArrowUp' && !isBlocked(r - 1, c)) {
      setSelectedCell({ r: r - 1, c });
      setDirection('vertical');
      return;
    }
    if (e.key === 'ArrowDown' && !isBlocked(r + 1, c)) {
      setSelectedCell({ r: r + 1, c });
      setDirection('vertical');
      return;
    }
    if (e.key === 'ArrowLeft' && !isBlocked(r, c - 1)) {
      setSelectedCell({ r, c: c - 1 });
      setDirection('horizontal');
      return;
    }
    if (e.key === 'ArrowRight' && !isBlocked(r, c + 1)) {
      setSelectedCell({ r, c: c + 1 });
      setDirection('horizontal');
      return;
    }

    if (/^[a-zA-ZáéíóúñÁÉÍÓÚÑ]$/.test(e.key)) {
      e.preventDefault();
      const letter = e.key.toUpperCase();
      setUserGrid(prev => {
        const copy = prev.map(row => [...row]);
        copy[r][c] = letter;
        return copy;
      });
      // Advance
      const dr = direction === 'vertical' ? 1 : 0;
      const dc = direction === 'horizontal' ? 1 : 0;
      const nr = r + dr, nc = c + dc;
      if (!isBlocked(nr, nc)) setSelectedCell({ r: nr, c: nc });
    }
  }, [selectedCell, direction, isBlocked]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Check completion
  useEffect(() => {
    let allFilled = true;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isBlocked(r, c) && !userGrid[r]?.[c]) {
          allFilled = false;
          break;
        }
      }
      if (!allFilled) break;
    }
    if (allFilled && onComplete) {
      onComplete(userGrid);
    }
  }, [userGrid]);

  const isInCurrentWord = (r, c) => {
    if (!selectedCell) return false;
    const { r: sr, c: sc } = selectedCell;
    if (direction === 'horizontal') {
      if (r !== sr) return false;
      // Find start/end of word
      let start = sc;
      while (start > 0 && !isBlocked(r, start - 1)) start--;
      let end = sc;
      while (end < size - 1 && !isBlocked(r, end + 1)) end++;
      return c >= start && c <= end;
    } else {
      if (c !== sc) return false;
      let start = sr;
      while (start > 0 && !isBlocked(start - 1, c)) start--;
      let end = sr;
      while (end < size - 1 && !isBlocked(end + 1, c)) end++;
      return r >= start && r <= end;
    }
  };

  const reset = () => {
    setUserGrid(grid.map(row =>
      row.map(cell => (cell && cell.trim() ? '' : null))
    ));
    setSelectedCell(null);
  };

  // Number labels on cells (first cell of each word)
  const cellNumbers = {};
  for (const pista of horizontales) {
    if (typeof pista === 'object' && pista.fila !== undefined && pista.columna !== undefined) {
      cellNumbers[`${pista.fila}-${pista.columna}`] = pista.numero;
    }
  }
  for (const pista of verticales) {
    if (typeof pista === 'object' && pista.fila !== undefined && pista.columna !== undefined) {
      const key = `${pista.fila}-${pista.columna}`;
      if (!cellNumbers[key]) cellNumbers[key] = pista.numero;
    }
  }

  if (!grid || grid.length === 0) return <p className="text-gray-400 text-sm">Sin crucigrama disponible</p>;

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div className="inline-block border-2 border-indigo-200 rounded-xl overflow-hidden bg-white shadow-sm"
        tabIndex={0}>
        {grid.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => {
              const blocked = isBlocked(r, c);
              const isSelected = selectedCell?.r === r && selectedCell?.c === c;
              const inWord = isInCurrentWord(r, c);
              const num = cellNumbers[`${r}-${c}`];

              return (
                <div
                  key={`${r}-${c}`}
                  className={`relative w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-sm font-bold
                    border border-gray-200 transition-all cursor-pointer
                    ${blocked
                      ? 'bg-gray-700'
                      : isSelected
                        ? 'bg-indigo-400 text-white ring-2 ring-indigo-500'
                        : inWord
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                  onClick={() => handleCellClick(r, c)}
                >
                  {num && !blocked && (
                    <span className="absolute top-0 left-0.5 text-[8px] text-indigo-500 font-normal">
                      {num}
                    </span>
                  )}
                  {!blocked && (userGrid[r]?.[c] || '')}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Clues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {horizontales.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-2">➡️ Horizontales</h4>
            <div className="space-y-1">
              {horizontales.map((pista, i) => (
                <p key={i} className="text-xs text-gray-600">
                  <span className="font-bold text-indigo-600">
                    {typeof pista === 'object' ? pista.numero : i + 1}.
                  </span>{' '}
                  {typeof pista === 'object' ? pista.pista : pista}
                </p>
              ))}
            </div>
          </div>
        )}
        {verticales.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-700 text-sm mb-2">⬇️ Verticales</h4>
            <div className="space-y-1">
              {verticales.map((pista, i) => (
                <p key={i} className="text-xs text-gray-600">
                  <span className="font-bold text-indigo-600">
                    {typeof pista === 'object' ? pista.numero : i + 1}.
                  </span>{' '}
                  {typeof pista === 'object' ? pista.pista : pista}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <button onClick={reset}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
        <RotateCcw className="w-3 h-3" /> Reiniciar
      </button>
    </div>
  );
}
