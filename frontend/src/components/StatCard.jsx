import { TrendingUp, TrendingDown } from 'lucide-react';

const COLOR_MAP = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-900/30',    icon: 'text-blue-600 dark:text-blue-400',    ring: 'ring-blue-100 dark:ring-blue-800',    gradient: 'from-blue-500 to-blue-600' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-900/30',  icon: 'text-indigo-600 dark:text-indigo-400',  ring: 'ring-indigo-100 dark:ring-indigo-800',  gradient: 'from-indigo-500 to-indigo-600' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-900/30',  icon: 'text-violet-600 dark:text-violet-400',  ring: 'ring-violet-100 dark:ring-violet-800',  gradient: 'from-violet-500 to-violet-600' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-100 dark:ring-emerald-800', gradient: 'from-emerald-500 to-emerald-600' },
  green:   { bg: 'bg-green-50 dark:bg-green-900/30',   icon: 'text-green-600 dark:text-green-400',   ring: 'ring-green-100 dark:ring-green-800',   gradient: 'from-green-500 to-green-600' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30',   icon: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-100 dark:ring-amber-800',   gradient: 'from-amber-400 to-amber-500' },
  red:     { bg: 'bg-red-50 dark:bg-red-900/30',     icon: 'text-red-600 dark:text-red-400',     ring: 'ring-red-100 dark:ring-red-800',     gradient: 'from-red-500 to-red-600' },
  purple:  { bg: 'bg-purple-50 dark:bg-purple-900/30',  icon: 'text-purple-600 dark:text-purple-400',  ring: 'ring-purple-100 dark:ring-purple-800',  gradient: 'from-purple-500 to-purple-600' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-900/30',    icon: 'text-cyan-600 dark:text-cyan-400',    ring: 'ring-cyan-100 dark:ring-cyan-800',    gradient: 'from-cyan-500 to-cyan-600' },
  teal:    { bg: 'bg-teal-50 dark:bg-teal-900/30',    icon: 'text-teal-600 dark:text-teal-400',    ring: 'ring-teal-100 dark:ring-teal-800',    gradient: 'from-teal-500 to-teal-600' },
};

/**
 * StatCard — metric card with opcional gradient variant.
 */
export default function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendText,
  color = 'blue',
  subtitle,
  gradient = false,
  delay = 0,
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-2xl border border-surface-border dark:border-gray-800 p-5
                 shadow-card hover:shadow-card-md hover:-translate-y-0.5
                 transition-all duration-200
                 animate-fade-up animate-fill-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon */}
        {gradient ? (
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${c.gradient} shadow-sm`}>
            {Icon && <Icon className="w-5 h-5 text-white" />}
          </div>
        ) : (
          <div className={`p-2.5 rounded-xl ${c.bg} ring-1 ${c.ring}`}>
            {Icon && <Icon className={`w-5 h-5 ${c.icon}`} />}
          </div>
        )}

        {/* Trend badge */}
        {trend && (
          <div className={`flex items-center gap-1 text-2xs font-semibold px-2 py-1 rounded-full ${
            trend === 'up'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-700 border border-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
          }`}>
            {trend === 'up'
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
            }
            {trendText}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-display leading-none">
          {value ?? '—'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-tight">{label}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-tight">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
