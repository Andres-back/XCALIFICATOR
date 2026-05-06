import { TrendingUp, TrendingDown } from 'lucide-react';

const COLOR_MAP = {
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    ring: 'ring-blue-100',    gradient: 'from-blue-500 to-blue-600' },
  indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  ring: 'ring-indigo-100',  gradient: 'from-indigo-500 to-indigo-600' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  ring: 'ring-violet-100',  gradient: 'from-violet-500 to-violet-600' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-100', gradient: 'from-emerald-500 to-emerald-600' },
  green:   { bg: 'bg-green-50',   icon: 'text-green-600',   ring: 'ring-green-100',   gradient: 'from-green-500 to-green-600' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   ring: 'ring-amber-100',   gradient: 'from-amber-400 to-amber-500' },
  red:     { bg: 'bg-red-50',     icon: 'text-red-600',     ring: 'ring-red-100',     gradient: 'from-red-500 to-red-600' },
  purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  ring: 'ring-purple-100',  gradient: 'from-purple-500 to-purple-600' },
  cyan:    { bg: 'bg-cyan-50',    icon: 'text-cyan-600',    ring: 'ring-cyan-100',    gradient: 'from-cyan-500 to-cyan-600' },
  teal:    { bg: 'bg-teal-50',    icon: 'text-teal-600',    ring: 'ring-teal-100',    gradient: 'from-teal-500 to-teal-600' },
};

/**
 * StatCard — metric card with optional gradient variant.
 *
 * @param {object}  props
 * @param {React.ElementType} props.icon
 * @param {string}  props.label
 * @param {string|number} props.value
 * @param {'up'|'down'} [props.trend]
 * @param {string}  [props.trendText]   e.g. '+12%'
 * @param {keyof COLOR_MAP} [props.color='blue']
 * @param {string}  [props.subtitle]
 * @param {boolean} [props.gradient]    render icon bg as gradient stripe
 * @param {number}  [props.delay]       animation delay in ms (0–300)
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
      className="bg-white rounded-2xl border border-surface-border p-5
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
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-700 border border-red-100'
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
        <p className="text-2xl font-bold text-gray-900 font-display leading-none">
          {value ?? '—'}
        </p>
        <p className="text-sm text-gray-500 mt-1 leading-tight">{label}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-1.5 leading-tight">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
