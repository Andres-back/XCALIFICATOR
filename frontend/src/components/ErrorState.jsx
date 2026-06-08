/**
 * ErrorState: estado de error con ilustración, mensaje, código HTTP y acción de reintento.
 * Usar para: errores de carga de API, 5xx del servidor, timeouts, sin conexión.
 */
import { WifiOff, ServerCrash, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';

const SCENARIOS = {
  network: {
    Icon: WifiOff,
    title: 'Sin conexión a internet',
    description: 'Verifica tu red y vuelve a intentarlo. Tus datos están guardados.',
    accent: 'text-amber-500 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  server: {
    Icon: ServerCrash,
    title: 'El servidor tuvo un problema',
    description: 'Estamos trabajando para solucionarlo. Intenta de nuevo en un momento.',
    accent: 'text-red-500 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  forbidden: {
    Icon: ShieldAlert,
    title: 'No tienes permisos para esto',
    description: 'Si crees que es un error, contacta al administrador de tu institución.',
    accent: 'text-violet-500 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
  },
  generic: {
    Icon: AlertTriangle,
    title: 'Algo salió mal',
    description: 'Ocurrió un error inesperado. Intenta de nuevo.',
    accent: 'text-gray-500 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
  },
};

export default function ErrorState({
  scenario = 'generic',
  title,
  description,
  statusCode,
  onRetry,
  retryLabel = 'Reintentar',
  showHome = true,
}) {
  const cfg = SCENARIOS[scenario] || SCENARIOS.generic;
  const Icon = cfg.Icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
      <div className={`w-20 h-20 rounded-2xl ${cfg.bg} flex items-center justify-center mb-5 animate-scale-in`}>
        <Icon className={`w-10 h-10 ${cfg.accent}`} strokeWidth={1.5} />
      </div>

      {statusCode && (
        <span className="text-xs font-mono font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full mb-3">
          Error {statusCode}
        </span>
      )}

      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
        {title || cfg.title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
        {description || cfg.description}
      </p>

      <div className="flex items-center gap-2 mt-6">
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-primary text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {retryLabel}
          </button>
        )}
        {showHome && (
          <a href="/" className="btn-secondary text-sm">
            Volver al inicio
          </a>
        )}
      </div>
    </div>
  );
}
