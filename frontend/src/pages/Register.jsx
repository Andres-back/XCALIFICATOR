import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store';
import toast from 'react-hot-toast';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';

export default function Register() {
  const [form, setForm] = useState({
    nombre: '', apellido: '', documento: '', correo: '',
    celular: '', password: '', confirmPassword: '', acepta_whatsapp: false,
  });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});
  const { register, loading } = useAuthStore();
  const navigate = useNavigate();

  const validate = () => {
    const errs = {};
    if (form.nombre.trim().length < 2) errs.nombre = 'Mínimo 2 caracteres';
    if (!/^[a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s]+$/.test(form.nombre)) errs.nombre = 'Solo letras';
    if (form.apellido.trim().length < 2) errs.apellido = 'Mínimo 2 caracteres';
    if (!/^[a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s]+$/.test(form.apellido)) errs.apellido = 'Solo letras';
    if (!/^\d+$/.test(form.documento)) errs.documento = 'Solo números';
    const pwErrors = [];
    if (form.password.length < 8) pwErrors.push('Mínimo 8 caracteres');
    if (!/[A-Z]/.test(form.password)) pwErrors.push('1 mayúscula');
    if (!/\d/.test(form.password)) pwErrors.push('1 número');
    if (pwErrors.length) errs.password = pwErrors.join(', ');
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Las contraseñas no coinciden';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const { confirmPassword, ...data } = form;
      const user = await register(data);
      toast.success(`Bienvenido, ${user.nombre}`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrarse');
    }
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Crear Cuenta</h1>
          <p className="text-gray-500 mt-1">Únete a XCalificator</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text" value={form.nombre}
                  onChange={(e) => update('nombre', e.target.value)}
                  className={`input-field ${errors.nombre ? 'border-red-400' : ''}`}
                  required
                />
                {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
                <input
                  type="text" value={form.apellido}
                  onChange={(e) => update('apellido', e.target.value)}
                  className={`input-field ${errors.apellido ? 'border-red-400' : ''}`}
                  required
                />
                {errors.apellido && <p className="text-red-500 text-xs mt-1">{errors.apellido}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Documento *</label>
              <input
                type="text" value={form.documento}
                onChange={(e) => update('documento', e.target.value)}
                className={`input-field ${errors.documento ? 'border-red-400' : ''}`}
                placeholder="Solo números"
                required
              />
              {errors.documento && <p className="text-red-500 text-xs mt-1">{errors.documento}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo *</label>
              <input
                type="email" value={form.correo}
                onChange={(e) => update('correo', e.target.value)}
                className="input-field" required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
              <input
                type="text" value={form.celular}
                onChange={(e) => update('celular', e.target.value)}
                className="input-field"
                placeholder="+57 300 000 0000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className={`input-field pr-10 ${errors.password ? 'border-red-400' : ''}`}
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-2.5 text-gray-400">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              <p className="text-xs text-gray-400 mt-1">Mínimo 8 caracteres, 1 mayúscula, 1 número</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Contraseña *</label>
              <input
                type="password" value={form.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                className={`input-field ${errors.confirmPassword ? 'border-red-400' : ''}`}
                autoComplete="new-password"
                required
              />
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
            </div>

            {form.celular && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox" checked={form.acepta_whatsapp}
                  onChange={(e) => update('acepta_whatsapp', e.target.checked)}
                  className="rounded border-gray-300"
                />
                ¿Deseas recibir notificaciones por WhatsApp?
              </label>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-primary-600 font-medium hover:underline">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
