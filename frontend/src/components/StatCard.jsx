import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * Reusable stat/metric card.
 * @param {object} props
 * @param {React.ReactNode} props.icon - Lucide icon element
 * @param {string} props.label - Metric label
 * @param {string|number} props.value - Metric value
 * @param {string} [props.trend] - 'up' | 'down' | null
 * @param {string} [props.trendText] - e.g. '+12%'
 * @param {string} [props.color] - 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'indigo'
 * @param {string} [props.subtitle] - secondary text below value
 */
const COLORS = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   ring: 'ring-blue-100' },
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  ring: 'ring-green-100' },
  red:    { bg: 'bg-red-50',    icon: 'text-red-600',    ring: 'ring-red-100' },
  amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  ring: 'ring-amber-100' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', ring: 'ring-purple-100' },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', ring: 'ring-indigo-100' },
};

export default function StatCard({ icon: Icon, label, value, trend, trendText, color = 'blue', subtitle }) {
  const c = COLORS[color] || COLORS.blue;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl ${c.bg} ring-1 ${c.ring}`}>
          {Icon && <Icon className={`w-5 h-5 ${c.icon}`} />}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendText}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
