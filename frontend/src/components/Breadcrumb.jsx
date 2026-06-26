import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Breadcrumb navigation component.
 */
export default function Breadcrumb({ items = [] }) {
  return (
    <nav className="flex items-center gap-2 text-base mb-5 overflow-x-auto scrollbar-hide">
      <Link to="/" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
        <Home className="w-5 h-5" />
      </Link>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 shrink-0">
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          {item.to && i < items.length - 1 ? (
            <Link to={item.to} className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors font-medium">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-800 dark:text-gray-100 font-bold truncate max-w-[240px]">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
