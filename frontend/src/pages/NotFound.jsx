/**
 * NotFound: 404 ilustrado con la mascota, mensaje claro y CTA de regreso.
 */
import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import usePageMotion from '../hooks/usePageMotion';

export default function NotFound() {
  const pageRef = useRef(null);
  usePageMotion(pageRef, []);

  return (
    <div ref={pageRef} className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-accent-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="bg-white/80 border border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" />
      </div>
      <div className="max-w-lg w-full text-center">
        {/* Big 404 */}
        <div className="relative inline-block mb-6">
          <h1 className="text-[10rem] sm:text-[14rem] font-display font-extrabold leading-none bg-gradient-to-br from-brand-300 to-accent-300 dark:from-brand-600 dark:to-accent-600 bg-clip-text text-transparent select-none">
            404
          </h1>
          <img
            src="/xali/mascota-principal.png"
            alt="Xali confundida"
            className="absolute -right-8 -bottom-2 w-24 sm:w-32 drop-shadow-xl animate-fade-up"
          />
        </div>

        <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 dark:text-white mb-3">
          Esta página se perdió en el aula
        </h2>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-8 max-w-md mx-auto">
          No encontramos lo que buscabas. Puede que el enlace haya cambiado o que la página ya no exista.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          <Link to="/" className="btn-primary text-sm">
            <Home className="w-4 h-4" />
            Volver al inicio
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn-secondary text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Página anterior
          </button>
        </div>

        <div className="mt-10 text-xs text-gray-400 dark:text-gray-500">
          ¿Buscas algo específico?{' '}
          <a href="mailto:contacto@xcalificator.app" className="text-brand-600 dark:text-brand-400 hover:underline">
            Contáctanos
          </a>
        </div>
      </div>
    </div>
  );
}
