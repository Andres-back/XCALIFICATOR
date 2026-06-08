import { Sun, Moon } from 'lucide-react';
import useTheme from '../hooks/useTheme';

/**
 * ThemeToggle: botón sol/luna. No incluye clases de color — el consumidor
 * las provee vía className (evita colisión de utilidades CSS de Tailwind).
 * Convención: el padre siempre incluye variantes light + dark explícitas.
 */
export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className={`
        relative w-10 h-10 rounded-xl flex items-center justify-center
        transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40
        ${className}
      `}
    >
      {isDark ? (
        <Sun className="w-5 h-5" strokeWidth={2} />
      ) : (
        <Moon className="w-5 h-5" strokeWidth={2} />
      )}
    </button>
  );
}
