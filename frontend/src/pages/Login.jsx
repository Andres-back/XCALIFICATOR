import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn, Sparkles } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, loading, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user?.rol) {
      const routes = { admin: '/admin', profesor: '/profesor/materias', estudiante: '/estudiante' };
      navigate(routes[user.rol] || '/', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const user = await login(correo, password);
      toast.success(`¡Bienvenido, ${user.nombre}! 🎉`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900">
      {/* Left Panel - Mascot & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 dark:from-accent-800 dark:via-accent-900 dark:to-gray-900">
        {/* Animated background shapes */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-blue-300/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '4s' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12">
          {/* Theme toggle en login split */}
          <div className="absolute top-4 right-4">
            <ThemeToggle className="bg-white/10 border-white/20 text-white hover:bg-white/20" />
          </div>

          {/* Mascot Video */}
          <div className="w-72 h-72 rounded-3xl overflow-hidden shadow-2xl mb-8 ring-4 ring-white/20 bg-white/10 backdrop-blur-sm">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            >
              <source src="/login.mp4" type="video/mp4" />
            </video>
          </div>

          {/* Branding */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles className="w-6 h-6 text-yellow-300" />
              <h1 className="text-4xl font-extrabold text-white tracking-tight">XCalificator</h1>
              <Sparkles className="w-6 h-6 text-yellow-300" />
            </div>
            <p className="text-primary-100 dark:text-accent-100 text-lg font-semibold mb-2">Aprender hoy, liderar mañana</p>
            <p className="text-primary-200/80 dark:text-accent-200/80 text-sm max-w-sm leading-relaxed">
              Cada esfuerzo cuenta: estudia con propósito, mejora con evidencia y avanza con confianza.
            </p>
          </div>

          {/* Study motto pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Disciplina', 'Claridad', 'Progreso'].map((feature) => (
              <span key={feature} className="px-4 py-1.5 bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium rounded-full border border-white/20">
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative">
        {/* Theme toggle en mobile */}
        <div className="absolute top-4 right-4 lg:hidden">
          <ThemeToggle className="bg-white/80 border border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-300" />
        </div>
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden shadow-lg mb-4 ring-2 ring-primary-200">
              <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                <source src="/login.mp4" type="video/mp4" />
              </video>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <img src="/icono.png" alt="XCalificator" className="w-8 h-8 rounded-lg" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">XCalificator</h1>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Plataforma Educativa con IA</p>
          </div>

          {/* Form Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="hidden lg:block w-10 h-10 rounded-xl overflow-hidden ring-2 ring-primary-100 dark:ring-primary-800">
                <img src="/icono.png" alt="XCalificator" className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Iniciar Sesión</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ingresa a tu cuenta</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="input-label">Correo electrónico</label>
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="input-field"
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="input-label">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-2.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-gradient w-full justify-center py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Ingresar
                  </>
                )}
              </button>
            </form>

            {/* Register link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ¿No tienes cuenta?{' '}
                <Link to="/register" className="text-brand-600 dark:text-brand-400 font-semibold hover:text-brand-700 dark:hover:text-brand-300 hover:underline transition-colors">
                  Regístrate aquí
                </Link>
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
            © 2026 XCalificator · Plataforma Educativa con Inteligencia Artificial
          </p>
        </div>
      </div>
    </div>
  );
}
