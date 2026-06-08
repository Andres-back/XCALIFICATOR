import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Breadcrumb navigation component.
 */
export default function Breadcrumb({ items = [] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4 overflow-x-auto">
      <Link to="/" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 shrink-0">
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
          {item.to && i < items.length - 1 ? (
            <Link to={item.to} className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 dark:text-gray-200 font-medium truncate max-w-[200px]">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
