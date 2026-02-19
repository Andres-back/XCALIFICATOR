import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Breadcrumb navigation component.
 * @param {object} props
 * @param {Array<{label: string, to?: string}>} props.items - Breadcrumb items
 */
export default function Breadcrumb({ items = [] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4 overflow-x-auto">
      <Link to="/" className="text-gray-400 hover:text-gray-600 shrink-0">
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 shrink-0">
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          {item.to && i < items.length - 1 ? (
            <Link to={item.to} className="text-gray-500 hover:text-primary-600 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 font-medium truncate max-w-[200px]">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
