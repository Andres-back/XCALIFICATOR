import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Reusable confirmation dialog.
 * @param {object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {function} props.onClose - Close handler
 * @param {function} props.onConfirm - Confirm handler
 * @param {string} props.title - Dialog title
 * @param {string} props.message - Dialog message
 * @param {string} [props.confirmText='Confirmar'] - Confirm button text
 * @param {'danger'|'warning'|'primary'} [props.variant='danger'] - Button color
 * @param {boolean} [props.loading=false] - Loading state
 */
export default function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmText = 'Confirmar', variant = 'danger', loading = false
}) {
  if (!open) return null;

  const btnClass = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
  }[variant] || 'bg-red-600 hover:bg-red-700 text-white';

  const iconClass = {
    danger: 'bg-red-100 text-red-600',
    warning: 'bg-amber-100 text-amber-600',
    primary: 'bg-primary-100 text-primary-600',
  }[variant] || 'bg-red-100 text-red-600';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-xl ${iconClass} shrink-0`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">{message}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex gap-3 p-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${btnClass}`}>
            {loading ? 'Procesando...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
