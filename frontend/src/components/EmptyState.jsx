/**
 * Standardized empty state component with illustration, text, and optional CTA.
 * @param {object} props
 * @param {React.ReactNode} props.icon - Lucide icon component
 * @param {string} props.title - Main message
 * @param {string} [props.description] - Secondary text
 * @param {React.ReactNode} [props.action] - CTA button element
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
        {Icon && <Icon className="w-10 h-10 text-gray-300" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-700 text-center">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 mt-2 text-center max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
