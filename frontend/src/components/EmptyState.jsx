/**
 * EmptyState: estado vacío contextual con ilustración, ícono o variantes.
 * Variantes: default | search | error | celebration | upload
 * Acepta illustration (imagen), icon (Lucide), title, description, action, list (bullets).
 */
import { Link } from 'react-router-dom';
import { ArrowRight, SearchX, FilePlus, Inbox, PartyPopper, AlertCircle } from 'lucide-react';

const VARIANTS = {
  default:      { Icon: Inbox,        accent: 'text-gray-400 dark:text-gray-500',   bg: 'bg-gray-50 dark:bg-gray-800/50',   border: 'border-gray-200 dark:border-gray-700' },
  search:       { Icon: SearchX,      accent: 'text-gray-400 dark:text-gray-500',   bg: 'bg-gray-50 dark:bg-gray-800/50',   border: 'border-gray-200 dark:border-gray-700' },
  error:        { Icon: AlertCircle,  accent: 'text-red-500 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-800' },
  celebration:  { Icon: PartyPopper,  accent: 'text-emerald-500 dark:text-emerald-400',bg: 'bg-emerald-50 dark:bg-emerald-900/20',border: 'border-emerald-200 dark:border-emerald-800' },
  upload:       { Icon: FilePlus,     accent: 'text-brand-500 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-900/20',  border: 'border-brand-200 dark:border-brand-800' },
};

export default function EmptyState({
  icon: CustomIcon,
  illustration,
  variant = 'default',
  title,
  description,
  action,
  list = [],
  compact = false,
}) {
  const cfg = VARIANTS[variant] || VARIANTS.default;
  const Icon = CustomIcon || cfg.Icon;

  return (
    <div className={`flex flex-col items-center justify-center ${compact ? 'py-8' : 'py-16'} px-4 text-center`}>
      {illustration ? (
        <img
          src={illustration}
          alt=""
          className={`${compact ? 'w-32 h-32' : 'w-44 h-44'} object-contain mb-5 animate-fade-up`}
        />
      ) : (
        <div className={`w-20 h-20 rounded-2xl ${cfg.bg} ${cfg.border} border flex items-center justify-center mb-5 animate-scale-in`}>
          <Icon className={`w-10 h-10 ${cfg.accent}`} strokeWidth={1.5} />
        </div>
      )}

      {title && (
        <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-gray-800 dark:text-gray-100 max-w-md text-balance`}>
          {title}
        </h3>
      )}

      {description && (
        <p className={`text-sm text-gray-500 dark:text-gray-400 ${compact ? 'mt-1' : 'mt-2'} max-w-md leading-relaxed`}>
          {description}
        </p>
      )}

      {list.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-300 text-left max-w-sm">
          {list.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
