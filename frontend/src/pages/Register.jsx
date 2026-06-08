import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store';
import toast from 'react-hot-toast';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function Register() {
  const [form, setForm] = useState({
    nombre: '', apellido: '', documento: '', correo: '',
    celular: '', password: '', confirmPassword: '', acepta_telegram: false,
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
    if (!/^\d{5,20}$/.test(form.documento)) errs.documento = 'Solo números (5-20 dígitos)';
    const correoDomain = (form.correo.split('@')[1] || '').toLowerCase();
    if (form.correo && !['gmail.com', 'hotmail.com'].includes(correoDomain)) {
      errs.correo = 'Solo se aceptan correos @gmail.com o @hotmail.com';
    }
    if (form.celular && !/^\d{7,15}$/.test(form.celular)) {
      errs.celular = 'Solo números, 7-15 dígitos (sin espacios ni guiones)';
    }
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 dark:from-gray-950 dark:to-gray-900 px-4 py-8 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="bg-white/80 border border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800/80 dark:border-gray-700 dark:text-gray-300" />
      </div>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 dark:bg-accent-600 mb-4">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Crear Cuenta</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Únete a XCalificator</p>
        </div>

        <div className="card bg-white dark:bg-gray-900 border border-surface-border dark:border-gray-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Nombre *</label>
                <input
                  type="text" value={form.nombre}
                  onChange={(e) => update('nombre', e.target.value)}
                  className={`input-field ${errors.nombre ? 'input-field-error' : ''}`}
                  required
                />
                {errors.nombre && <p className="input-error">{errors.nombre}</p>}
              </div>
              <div>
                <label className="input-label">Apellido *</label>
                <input
                  type="text" value={form.apellido}
                  onChange={(e) => update('apellido', e.target.value)}
                  className={`input-field ${errors.apellido ? 'input-field-error' : ''}`}
                  required
                />
                {errors.apellido && <p className="input-error">{errors.apellido}</p>}
              </div>
            </div>

            <div>
              <label className="input-label">Documento *</label>
              <input
                type="text" value={form.documento}
                onChange={(e) => update('documento', e.target.value.replace(/\D/g, ''))}
                className={`input-field ${errors.documento ? 'input-field-error' : ''}`}
                placeholder="Solo números (5-20 dígitos)"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={20}
                required
              />
              {errors.documento && <p className="input-error">{errors.documento}</p>}
            </div>

            <div>
              <label className="input-label">Correo *</label>
              <input
                type="email" value={form.correo}
                onChange={(e) => update('correo', e.target.value)}
                className={`input-field ${errors.correo ? 'input-field-error' : ''}`}
                placeholder="tunombre@gmail.com o @hotmail.com"
                required
              />
              {errors.correo && <p className="input-error">{errors.correo}</p>}
            </div>

            <div>
              <label className="input-label">Celular</label>
              <input
                type="tel" value={form.celular}
                onChange={(e) => update('celular', e.target.value.replace(/\D/g, ''))}
                className={`input-field ${errors.celular ? 'input-field-error' : ''}`}
                placeholder="573001234567 (solo números, con código de país)"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={15}
              />
              {errors.celular && <p className="input-error">{errors.celular}</p>}
            </div>

            <div>
              <label className="input-label">Contraseña *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className={`input-field pr-10 ${errors.password ? 'input-field-error' : ''}`}
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-2.5 text-gray-400 dark:text-gray-500">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="input-error">{errors.password}</p>}
              <p className="input-hint">Mínimo 8 caracteres, 1 mayúscula, 1 número</p>
            </div>

            <div>
              <label className="input-label">Confirmar Contraseña *</label>
              <input
                type="password" value={form.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                className={`input-field ${errors.confirmPassword ? 'input-field-error' : ''}`}
                autoComplete="new-password"
                required
              />
              {errors.confirmPassword && <p className="input-error">{errors.confirmPassword}</p>}
            </div>

            {form.celular && (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox" checked={form.acepta_telegram}
                  onChange={(e) => update('acepta_telegram', e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                ¿Deseas recibir notificaciones por Telegram? (lo vincularás desde tu perfil)
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
