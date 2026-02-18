import { useState, useEffect } from 'react';
import useAuthStore from '../store';
import api from '../api';
import toast from 'react-hot-toast';
import { User, Bell, Pencil, Save, Lock, X } from 'lucide-react';

export default function Perfil() {
  const { user, updateUser } = useAuthStore();
  const [prefs, setPrefs] = useState({ acepta_email: true, acepta_whatsapp: false });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', celular: '' });
  const [saving, setSaving] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [pw, setPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences').then(res => setPrefs(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setForm({ nombre: user.nombre || '', apellido: user.apellido || '', celular: user.celular || '' });
    }
  }, [user]);

  const updatePrefs = async (field, value) => {
    try {
      const res = await api.patch('/notifications/preferences', { [field]: value });
      setPrefs(res.data);
      toast.success('Preferencias actualizadas');
    } catch {
      toast.error('Error actualizando preferencias');
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/auth/me', form);
      if (updateUser) updateUser(res.data);
      toast.success('Perfil actualizado');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error actualizando perfil');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { toast.error('Mínimo 8 caracteres'); return; }
    setPwLoading(true);
    try {
      await api.post('/auth/me/password', { new_password: pw });
      toast.success('Contraseña actualizada');
      setPw('');
      setShowPwForm(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error cambiando contraseña');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>

      {/* Info */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Información Personal</h2>
          </div>
          {!editing ? (
            <button onClick={() => setEditing(true)}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Pencil className="w-4 h-4" /> Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={saveProfile} disabled={saving}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium">
                <Save className="w-4 h-4" /> Guardar
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre</label>
              <input type="text" className="input-field" value={form.nombre}
                onChange={e => setForm(p => ({...p, nombre: e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Apellido</label>
              <input type="text" className="input-field" value={form.apellido}
                onChange={e => setForm(p => ({...p, apellido: e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Celular</label>
              <input type="text" className="input-field" value={form.celular}
                onChange={e => setForm(p => ({...p, celular: e.target.value}))}
                placeholder="Número de celular" />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm pt-2">
              <div><span className="text-gray-500">Documento:</span> <span className="font-medium">{user?.documento}</span></div>
              <div><span className="text-gray-500">Correo:</span> <span className="font-medium">{user?.correo}</span></div>
              <div><span className="text-gray-500">Rol:</span> <span className="font-medium capitalize">{user?.rol}</span></div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Nombre:</span> <span className="font-medium">{user?.nombre} {user?.apellido}</span></div>
            <div><span className="text-gray-500">Documento:</span> <span className="font-medium">{user?.documento}</span></div>
            <div><span className="text-gray-500">Correo:</span> <span className="font-medium">{user?.correo}</span></div>
            <div><span className="text-gray-500">Celular:</span> <span className="font-medium">{user?.celular || 'No registrado'}</span></div>
            <div><span className="text-gray-500">Rol:</span> <span className="font-medium capitalize">{user?.rol}</span></div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Seguridad</h2>
        </div>
        {showPwForm ? (
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nueva contraseña</label>
              <input type="password" className="input-field" value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="Mínimo 8 caracteres, 1 mayúscula, 1 número" required minLength={8} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={pwLoading}
                className="btn-primary text-sm px-4 py-2">Cambiar Contraseña</button>
              <button type="button" onClick={() => { setShowPwForm(false); setPw(''); }}
                className="btn-secondary text-sm px-4 py-2">Cancelar</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowPwForm(true)}
            className="btn-secondary text-sm flex items-center gap-2">
            <Lock className="w-4 h-4" /> Cambiar Contraseña
          </button>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Notificaciones</h2>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Notificaciones por Email</span>
            <input
              type="checkbox" checked={prefs.acepta_email}
              onChange={(e) => updatePrefs('acepta_email', e.target.checked)}
              className="rounded border-gray-300 text-primary-600"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Notificaciones por WhatsApp</span>
            <input
              type="checkbox" checked={prefs.acepta_whatsapp}
              onChange={(e) => updatePrefs('acepta_whatsapp', e.target.checked)}
              className="rounded border-gray-300 text-primary-600"
            />
          </label>
          {prefs.acepta_whatsapp && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              Las notificaciones WhatsApp se enviarán al número registrado en tu perfil.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
