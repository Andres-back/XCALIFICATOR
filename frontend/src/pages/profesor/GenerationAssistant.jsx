import { ChevronDown, CheckCircle } from 'lucide-react';

export function WizardSteps({ step, steps }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((label, index) => {
        const n = index + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div
            key={label}
            className={`rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
              active
                ? 'border-profesor-300 bg-profesor-50 text-profesor-700'
                : done
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-gray-50 text-gray-500'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {done ? <CheckCircle className="w-3.5 h-3.5" /> : <span>{n}</span>}
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AdvancedAccordion({ title = 'Opciones avanzadas', children, defaultOpen = false }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-gray-50" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-700">
        <span>{title}</span>
        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-gray-200 bg-white p-4">
        {children}
      </div>
    </details>
  );
}

export function PresetButton({ selected, title, description, meta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-profesor-300 bg-profesor-50 text-profesor-800'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-1 block text-xs text-gray-500">{description}</span>
      {meta && <span className="mt-2 block text-xs font-semibold text-profesor-600">{meta}</span>}
    </button>
  );
}
