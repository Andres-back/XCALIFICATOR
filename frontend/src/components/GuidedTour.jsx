import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, HelpCircle, X } from 'lucide-react';

export function GuidedTour({ steps = [], storageKey, open, onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const current = steps[index] || null;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !current?.selector) {
      setRect(null);
      return;
    }

    const update = () => {
      const element = document.querySelector(current.selector);
      if (!element) {
        setRect(null);
        return;
      }
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const next = element.getBoundingClientRect();
      setRect({
        top: Math.max(8, next.top - 8),
        left: Math.max(8, next.left - 8),
        width: next.width + 16,
        height: next.height + 16,
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, current?.selector]);

  const finish = () => {
    if (storageKey) localStorage.setItem(storageKey, 'done');
    onClose?.();
  };

  if (!open || !current) return null;

  const last = index >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-gray-950/55" />
      {rect && (
        <div
          className="absolute rounded-2xl border-2 border-profesor-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] bg-transparent transition-all"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div className="absolute inset-x-3 bottom-4 max-h-[calc(100vh-2rem)] overflow-y-auto sm:left-auto sm:right-6 sm:bottom-6 sm:w-[420px] sm:inset-x-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-profesor-600 dark:text-profesor-300">
              Paso {index + 1} de {steps.length}
            </p>
            <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{current.title}</h2>
          </div>
          <button
            type="button"
            onClick={finish}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Omitir guia"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{current.body}</p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Omitir
          </button>
          <div className="flex w-full sm:w-auto gap-2">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              className="btn-outline inline-flex flex-1 sm:flex-none items-center justify-center gap-2 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Regresar
            </button>
            <button
              type="button"
              onClick={() => (last ? finish() : setIndex((value) => value + 1))}
              className="btn-primary inline-flex flex-1 sm:flex-none items-center justify-center gap-2"
            >
              {last ? 'Finalizar' : 'Avanzar'}
              {!last && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PageGuide({ steps, storageKey = '', className = '' }) {
  const [open, setOpen] = useState(false);
  const safeSteps = useMemo(() => steps.filter(Boolean), [steps]);

  useEffect(() => {
    if (!storageKey || !safeSteps.length) return;
    if (localStorage.getItem(storageKey) === 'done') return;
    const timer = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, [storageKey, safeSteps.length]);

  if (!safeSteps.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`btn-outline inline-flex items-center gap-2 ${className}`}
      >
        <HelpCircle className="h-4 w-4" />
        Cómo se usa
      </button>
      <GuidedTour
        steps={safeSteps}
        storageKey={storageKey}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
