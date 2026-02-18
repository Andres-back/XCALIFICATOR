import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import useAuthStore from '../store';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn, Sparkles } from 'lucide-react';

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, googleLogin, loading, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user?.rol) {
      const routes = { admin: '/admin', profesor: '/profesor/materias', estudiante: '/estudiante' };
      navigate(routes[user.rol] || '/', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const user = await googleLogin(credentialResponse.credential);
      toast.success(`¡Bienvenido, ${user.nombre}! 🎉`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error con Google');
    }
  };

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
    <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Left Panel - Mascot & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800">
        {/* Animated background shapes */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-blue-300/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '4s' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12">
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
            <p className="text-primary-100 text-lg font-medium mb-2">Plataforma Educativa con IA</p>
            <p className="text-primary-200/80 text-sm max-w-sm leading-relaxed">
              Genera exámenes, califica automáticamente y obtén retroalimentación inteligente.
            </p>
          </div>

          {/* Features pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Exámenes con IA', 'Calificación OCR', 'Chat Inteligente'].map((feature) => (
              <span key={feature} className="px-4 py-1.5 bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium rounded-full border border-white/20">
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
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
              <h1 className="text-2xl font-bold text-gray-900">XCalificator</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1">Plataforma Educativa con IA</p>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="hidden lg:block w-10 h-10 rounded-xl overflow-hidden ring-2 ring-primary-100">
                <img src="/icono.png" alt="XCalificator" className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Iniciar Sesión</h2>
                <p className="text-sm text-gray-500">Ingresa a tu cuenta</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Correo electrónico</label>
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
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contraseña</label>
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
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-indigo-600 
                           text-white px-4 py-3 rounded-xl font-semibold hover:from-primary-700 hover:to-indigo-700 
                           transition-all duration-200 shadow-lg shadow-primary-500/25 
                           disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
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

            {/* Divider */}
            <div className="flex items-center my-6">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-4 text-xs text-gray-400 font-medium">O CONTINÚA CON</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Google button */}
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => toast.error('Error al iniciar con Google')}
                shape="rectangular"
                size="large"
                width="100%"
                text="continue_with"
                locale="es"
              />
            </div>

            {/* Register link */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                ¿No tienes cuenta?{' '}
                <Link to="/register" className="text-primary-600 font-semibold hover:text-primary-700 hover:underline transition-colors">
                  Regístrate aquí
                </Link>
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-6">
            © 2026 XCalificator · Plataforma Educativa con Inteligencia Artificial
          </p>
        </div>
      </div>
    </div>
  );
}
