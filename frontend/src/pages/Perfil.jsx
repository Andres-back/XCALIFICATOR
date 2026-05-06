import { useState, useEffect } from 'react';
import useAuthStore from '../store';
import api from '../api';
import toast from 'react-hot-toast';
import {
  User,
  Bell,
  Pencil,
  Save,
  Lock,
  X,
  Cpu,
  RefreshCw,
  ScanText,
} from 'lucide-react';

export default function Perfil() {
  const { user, updateUser } = useAuthStore();
  const [prefs, setPrefs] = useState({ acepta_email: true, acepta_whatsapp: false });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', celular: '' });
  const [saving, setSaving] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [localAI, setLocalAI] = useState({
    ollama_url: 'http://host.docker.internal:11434',
    ollama_api_key: '',
    grading_local_model: '',
    ocr_local_model: '',
  });
  const [localModels, setLocalModels] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [detectingModels, setDetectingModels] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences').then(res => setPrefs(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setForm({ nombre: user.nombre || '', apellido: user.apellido || '', celular: user.celular || '' });
    }
  }, [user]);

  const fetchLocalAIConfig = async () => {
    if (user?.rol !== 'profesor') return;
    setLocalLoading(true);
    try {
      const res = await api.get('/auth/me/local-ai-config');
      setLocalAI({
        ollama_url: res.data?.ollama_url || 'http://host.docker.internal:11434',
        ollama_api_key: res.data?.ollama_api_key || '',
        grading_local_model: res.data?.grading_local_model || '',
        ocr_local_model: res.data?.ocr_local_model || '',
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cargar configuración local IA');
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    fetchLocalAIConfig();
  }, [user?.rol]);

  const detectModels = async () => {
    setDetectingModels(true);
    try {
      const res = await api.get('/auth/me/ollama-models');
      const models = Array.isArray(res.data?.models) ? res.data.models : [];
      setLocalModels(models);
      if (models.length === 0) {
        toast.error('No se detectaron modelos en Ollama');
      } else {
        toast.success(`Modelos detectados: ${models.length}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Ollama local');
    } finally {
      setDetectingModels(false);
    }
  };

  const saveLocalAIConfig = async () => {
    setLocalSaving(true);
    try {
      const payload = {
        ollama_url: localAI.ollama_url || null,
        ollama_api_key: localAI.ollama_api_key || null,
        grading_local_model: localAI.grading_local_model || null,
        ocr_local_model: localAI.ocr_local_model || null,
      };
      const res = await api.put('/auth/me/local-ai-config', payload);
      setLocalAI({
        ollama_url: res.data?.ollama_url || 'http://host.docker.internal:11434',
        ollama_api_key: res.data?.ollama_api_key || '',
        grading_local_model: res.data?.grading_local_model || '',
        ocr_local_model: res.data?.ocr_local_model || '',
      });
      toast.success('Configuración local guardada');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar configuración local');
    } finally {
      setLocalSaving(false);
    }
  };

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
    if (!pwForm.current_password) {
      toast.error('Debes ingresar tu contraseña actual');
      return;
    }
    if (pwForm.new_password.length < 8) {
      toast.error('Mínimo 8 caracteres');
      return;
    }
    if (pwForm.current_password === pwForm.new_password) {
      toast.error('La nueva contraseña debe ser diferente a la actual');
      return;
    }
    setPwLoading(true);
    try {
      await api.post('/auth/me/password', pwForm);
      toast.success('Contraseña actualizada');
      setPwForm({ current_password: '', new_password: '' });
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
              <label className="block text-xs text-gray-500 mb-1">Contraseña actual</label>
              <input
                type="password"
                className="input-field"
                value={pwForm.current_password}
                onChange={e => setPwForm((prev) => ({ ...prev, current_password: e.target.value }))}
                placeholder="Ingresa tu contraseña actual"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nueva contraseña</label>
              <input
                type="password"
                className="input-field"
                value={pwForm.new_password}
                onChange={e => setPwForm((prev) => ({ ...prev, new_password: e.target.value }))}
                placeholder="Mínimo 8 caracteres, 1 mayúscula, 1 número"
                required
                minLength={8}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={pwLoading}
                className="btn-primary text-sm px-4 py-2">Cambiar Contraseña</button>
              <button
                type="button"
                onClick={() => {
                  setShowPwForm(false);
                  setPwForm({ current_password: '', new_password: '' });
                }}
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

      {user?.rol === 'profesor' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-primary-600" />
              <div>
                <h2 className="text-lg font-semibold">IA Ollama (local o cloud)</h2>
                <p className="text-xs text-gray-500">
                  Selecciona tus modelos Ollama para usar en modo local o cloud.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchLocalAIConfig}
              className="btn-secondary text-sm flex items-center gap-2"
              disabled={localLoading}
            >
              <RefreshCw className={`w-4 h-4 ${localLoading ? 'animate-spin' : ''}`} /> Recargar
            </button>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">URL de Ollama</label>
            <input
              type="text"
              className="input-field"
              value={localAI.ollama_url}
              onChange={(e) => setLocalAI((prev) => ({ ...prev, ollama_url: e.target.value }))}
              placeholder="http://host.docker.internal:11434"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key (opcional)</label>
            <input
              type="password"
              className="input-field"
              value={localAI.ollama_api_key}
              onChange={(e) => setLocalAI((prev) => ({ ...prev, ollama_api_key: e.target.value }))}
              placeholder="Bearer token si aplica"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={detectModels}
              className="btn-secondary text-sm flex items-center gap-2"
              disabled={detectingModels}
            >
              <ScanText className={`w-4 h-4 ${detectingModels ? 'animate-spin' : ''}`} />
              Detectar modelos (ollama list)
            </button>
            <button
              type="button"
              onClick={saveLocalAIConfig}
              className="btn-primary text-sm flex items-center gap-2"
              disabled={localSaving}
            >
              {localSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar IA local
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Modelo local para calificación</label>
              <select
                className="input-field"
                value={localAI.grading_local_model}
                onChange={(e) => setLocalAI((prev) => ({ ...prev, grading_local_model: e.target.value }))}
              >
                <option value="">Sin modelo seleccionado</option>
                {localModels.map((model) => (
                  <option key={`g-${model}`} value={model}>{model}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Modelo local para OCR</label>
              <select
                className="input-field"
                value={localAI.ocr_local_model}
                onChange={(e) => setLocalAI((prev) => ({ ...prev, ocr_local_model: e.target.value }))}
              >
                <option value="">Sin modelo seleccionado</option>
                {localModels.map((model) => (
                  <option key={`o-${model}`} value={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
            La configuración de Groq Cloud la administra el equipo de administración. Esta sección controla solo el uso de Ollama.
          </p>
        </div>
      )}
    </div>
  );
}
