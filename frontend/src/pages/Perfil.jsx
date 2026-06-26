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
  Cloud,
  HardDrive,
  RefreshCw,
  ScanText,
} from 'lucide-react';
import PageGuide from '../components/GuidedTour';

const DEFAULT_OLLAMA_URL = 'http://host.docker.internal:11434';
const DEFAULT_OPEN_CODE_CONTENT_MODEL = 'Qwen3.7 Plus';
const DEFAULT_OPEN_CODE_VISION_MODEL = 'Qwen3.7 Plus';
const DEFAULT_OPEN_CODE_FEEDBACK_MODEL = 'DeepSeek V4 Pro';
const FALLBACK_GROQ_MODELS = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];
const FALLBACK_OPEN_CODE_MODELS = [
  'Qwen3.7 Plus',
  'DeepSeek V4 Pro',
  'DeepSeek V4 Flash',
  'Qwen3.7 Max',
  'GLM-5.1',
  'MiniMax M2.7',
];

export default function Perfil() {
  const { user, updateUser } = useAuthStore();
  const [prefs, setPrefs] = useState({ acepta_email: true, acepta_telegram: false, telegram_chat_id: null });
  const [tgLink, setTgLink] = useState({ loading: false, code: null, expiresAt: null, error: null });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', celular: '' });
  const [saving, setSaving] = useState(false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [localAI, setLocalAI] = useState({
    content_provider: 'open_code',
    grading_provider: 'open_code',
    ocr_provider: 'open_code_vision',
    groq_api_key: '',
    ollama_url: DEFAULT_OLLAMA_URL,
    ollama_api_key: '',
    open_code_base_url: '',
    open_code_api_key: '',
    content_model: DEFAULT_OPEN_CODE_CONTENT_MODEL,
    grading_local_model: '',
    ocr_local_model: DEFAULT_OPEN_CODE_VISION_MODEL,
    open_code_content_model: DEFAULT_OPEN_CODE_CONTENT_MODEL,
    open_code_vision_model: DEFAULT_OPEN_CODE_VISION_MODEL,
    open_code_feedback_model: DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
  });
  const [localModels, setLocalModels] = useState([]);
  const [localGroqModels, setLocalGroqModels] = useState(FALLBACK_GROQ_MODELS);
  const [localOpenCodeModels, setLocalOpenCodeModels] = useState(FALLBACK_OPEN_CODE_MODELS);
  const [localLoading, setLocalLoading] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [detectingModels, setDetectingModels] = useState(false);
  const [detectingGroqModels, setDetectingGroqModels] = useState(false);
  const [detectingOpenCodeModels, setDetectingOpenCodeModels] = useState(false);

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
        content_provider: res.data?.content_provider || 'open_code',
        grading_provider: res.data?.grading_provider || 'open_code',
        ocr_provider: res.data?.ocr_provider || 'open_code_vision',
        groq_api_key: res.data?.groq_api_key || '',
        ollama_url: res.data?.ollama_url || DEFAULT_OLLAMA_URL,
        ollama_api_key: res.data?.ollama_api_key || '',
        open_code_base_url: res.data?.open_code_base_url || '',
        open_code_api_key: res.data?.open_code_api_key || '',
        content_model: res.data?.content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL,
        grading_local_model: res.data?.grading_local_model || '',
        ocr_local_model: res.data?.ocr_local_model || DEFAULT_OPEN_CODE_VISION_MODEL,
        open_code_content_model: res.data?.open_code_content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL,
        open_code_vision_model: res.data?.open_code_vision_model || DEFAULT_OPEN_CODE_VISION_MODEL,
        open_code_feedback_model: res.data?.open_code_feedback_model || DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
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

  const detectGroq = async () => {
    setDetectingGroqModels(true);
    try {
      const res = await api.get('/auth/me/groq-models');
      const models = Array.isArray(res.data?.grading_models) && res.data.grading_models.length
        ? res.data.grading_models
        : FALLBACK_GROQ_MODELS;
      setLocalGroqModels(models);
      toast.success(`Modelos Groq detectados: ${models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Groq Cloud');
    } finally {
      setDetectingGroqModels(false);
    }
  };

  const detectOpenCode = async () => {
    setDetectingOpenCodeModels(true);
    try {
      const res = await api.get('/auth/me/open-code-models');
      const models = Array.isArray(res.data?.all_models) && res.data.all_models.length
        ? res.data.all_models
        : FALLBACK_OPEN_CODE_MODELS;
      setLocalOpenCodeModels(models);
      toast.success(`Modelos Open Code detectados: ${models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Open Code');
    } finally {
      setDetectingOpenCodeModels(false);
    }
  };

  const saveLocalAIConfig = async () => {
    setLocalSaving(true);
    try {
      const payload = {
        ollama_url: localAI.ollama_url || null,
        ollama_api_key: localAI.ollama_api_key || null,
        content_provider: localAI.content_provider || null,
        grading_provider: localAI.grading_provider || null,
        ocr_provider: localAI.ocr_provider || null,
        groq_api_key: localAI.groq_api_key || null,
        open_code_base_url: localAI.open_code_base_url || null,
        open_code_api_key: localAI.open_code_api_key || null,
        content_model: localAI.content_model || null,
        grading_local_model: localAI.grading_local_model || null,
        ocr_local_model: localAI.ocr_local_model || null,
        open_code_content_model: localAI.open_code_content_model || null,
        open_code_vision_model: localAI.open_code_vision_model || null,
        open_code_feedback_model: localAI.open_code_feedback_model || null,
      };
      const res = await api.put('/auth/me/local-ai-config', payload);
      setLocalAI({
        content_provider: res.data?.content_provider || 'open_code',
        grading_provider: res.data?.grading_provider || 'open_code',
        ocr_provider: res.data?.ocr_provider || 'open_code_vision',
        groq_api_key: res.data?.groq_api_key || '',
        ollama_url: res.data?.ollama_url || DEFAULT_OLLAMA_URL,
        ollama_api_key: res.data?.ollama_api_key || '',
        open_code_base_url: res.data?.open_code_base_url || '',
        open_code_api_key: res.data?.open_code_api_key || '',
        content_model: res.data?.content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL,
        grading_local_model: res.data?.grading_local_model || '',
        ocr_local_model: res.data?.ocr_local_model || DEFAULT_OPEN_CODE_VISION_MODEL,
        open_code_content_model: res.data?.open_code_content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL,
        open_code_vision_model: res.data?.open_code_vision_model || DEFAULT_OPEN_CODE_VISION_MODEL,
        open_code_feedback_model: res.data?.open_code_feedback_model || DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
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

  const contentModelOptions = localAI.content_provider === 'open_code'
    ? localOpenCodeModels
    : localAI.content_provider === 'groq'
      ? localGroqModels
      : localModels;
  const gradingModelOptions = localAI.grading_provider === 'open_code'
    ? localOpenCodeModels
    : localAI.grading_provider === 'groq'
      ? localGroqModels
      : localModels;
  const ocrModelOptions = localAI.ocr_provider === 'open_code_vision'
    ? localOpenCodeModels
    : localAI.ocr_provider === 'groq_vision'
      ? localGroqModels
      : localModels;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
        <PageGuide
          storageKey="guide-perfil"
          steps={[
            { title: 'Tus datos de cuenta', body: 'Aquí ves tu nombre, correo y teléfono. Toca Editar para actualizarlos o cambiar tu contraseña; revisa bien antes de guardar.', selector: '[data-guide="perfil-info"]' },
            { title: 'Tu IA personal', body: 'Como profesor puedes revisar los modelos de IA de tu cuenta. Si lo dejas vacío, se usa la configuración del administrador. No compartas tus llaves ni las copies en chats.', selector: '[data-guide="perfil-ia"]' },
          ]}
        />
      </div>

      {/* Info */}
      <div data-guide="perfil-info" className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Información personal</h2>
          </div>
          {!editing ? (
            <button data-guide="perfil-editar" onClick={() => setEditing(true)}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Pencil className="w-4 h-4" /> Editar
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
              <div><span className="text-gray-500">Documento:</span> <span className="font-medium">{user?.documento}</span></div>
              <div><span className="text-gray-500">Correo:</span> <span className="font-medium">{user?.correo}</span></div>
              <div><span className="text-gray-500">Rol:</span> <span className="font-medium capitalize">{user?.rol}</span></div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pwLoading}
                className="btn-primary text-sm px-4 py-2">Cambiar contraseña</button>
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
            <Lock className="w-4 h-4" /> Cambiar contraseña
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
            <span className="text-sm text-gray-700">Notificaciones por Telegram</span>
            <input
              type="checkbox"
              checked={prefs.acepta_telegram}
              onChange={(e) => updatePrefs('acepta_telegram', e.target.checked)}
              disabled={!prefs.telegram_chat_id}
              className="rounded border-gray-300 text-primary-600 disabled:opacity-50"
            />
          </label>
          {prefs.acepta_telegram && !prefs.telegram_chat_id && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              Vincula tu cuenta de Telegram abajo para activar las notificaciones.
            </p>
          )}
        </div>

        {/* Telegram linking */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Vincular Telegram</h3>
          {prefs.telegram_chat_id ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              Telegram vinculado. Recibirás notificaciones en tu cuenta.
            </div>
          ) : tgLink.code ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-sm">
              <p className="text-gray-700">
                Envía este código al bot desde Telegram. Expira{' '}
                <span className="font-mono font-semibold">
                  {new Date(tgLink.expiresAt).toLocaleTimeString()}
                </span>.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-2 font-mono text-center text-lg font-bold tracking-widest">
                  {tgLink.code}
                </code>
                <a
                  href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'xcalificator_bot'}?start=${tgLink.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm px-3 py-2 whitespace-nowrap"
                >
                  Abrir Telegram
                </a>
              </div>
              <p className="text-xs text-gray-500">
                Si Telegram no se abre, busca el bot manualmente y envía: <code>/start {tgLink.code}</code>
              </p>
              {tgLink.error && <p className="text-xs text-red-600">{tgLink.error}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={async () => {
                  setTgLink({ loading: true, code: null, expiresAt: null, error: null });
                  try {
                    const res = await api.post('/notifications/telegram/request-code');
                    setTgLink({
                      loading: false,
                      code: res.data.code,
                      expiresAt: res.data.expires_at,
                      error: null,
                    });
                  } catch (err) {
                    setTgLink({ loading: false, code: null, expiresAt: null, error: err.response?.data?.detail || 'Error' });
                  }
                }}
                disabled={tgLink.loading || !form.celular}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {tgLink.loading ? 'Generando...' : 'Generar código de vinculación'}
              </button>
              {!form.celular && (
                <p className="text-xs text-gray-500">Agrega tu celular arriba primero.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {user?.rol === 'profesor' && (
        <div data-guide="perfil-ia" className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-primary-600" />
              <div>
                <h2 className="text-lg font-semibold">IA y OCR</h2>
                <p className="text-xs text-gray-500">
                  Configura tus propias claves y modelos. Si dejas campos vacios se usa la configuracion global.
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="border border-gray-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold">Groq Cloud</h3>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API key</label>
                <input
                  type="password"
                  className="input-field"
                  value={localAI.groq_api_key}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, groq_api_key: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <button type="button" onClick={detectGroq} className="btn-secondary text-sm flex items-center gap-2" disabled={detectingGroqModels}>
                <RefreshCw className={`w-4 h-4 ${detectingGroqModels ? 'animate-spin' : ''}`} />
                Detectar Groq
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold">Ollama</h3>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL</label>
                <input
                  type="text"
                  className="input-field"
                  value={localAI.ollama_url}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, ollama_url: e.target.value }))}
                  placeholder={DEFAULT_OLLAMA_URL}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API key</label>
                <input
                  type="password"
                  className="input-field"
                  value={localAI.ollama_api_key}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, ollama_api_key: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <button type="button" onClick={detectModels} className="btn-secondary text-sm flex items-center gap-2" disabled={detectingModels}>
                <ScanText className={`w-4 h-4 ${detectingModels ? 'animate-spin' : ''}`} />
                Detectar Ollama
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <ScanText className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-semibold">Open Code</h3>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL base</label>
                <input
                  type="text"
                  className="input-field"
                  value={localAI.open_code_base_url}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, open_code_base_url: e.target.value }))}
                  placeholder="Gateway OpenAI-compatible"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API key</label>
                <input
                  type="password"
                  className="input-field"
                  value={localAI.open_code_api_key}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, open_code_api_key: e.target.value }))}
                  placeholder="Open Code API key"
                />
              </div>
              <button type="button" onClick={detectOpenCode} className="btn-secondary text-sm flex items-center gap-2" disabled={detectingOpenCodeModels}>
                <RefreshCw className={`w-4 h-4 ${detectingOpenCodeModels ? 'animate-spin' : ''}`} />
                Detectar Open Code
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-3 space-y-3">
            <h3 className="text-sm font-semibold">Que usa mi cuenta</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Generacion</label>
                <select
                  className="input-field"
                  value={localAI.content_provider}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, content_provider: e.target.value }))}
                >
                  <option value="open_code">Open Code</option>
                  <option value="groq">Groq Cloud</option>
                  <option value="ollama">Ollama</option>
                </select>
                <select
                  className="input-field mt-2"
                  value={localAI.content_model}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, content_model: e.target.value }))}
                >
                  <option value="">Selecciona modelo</option>
                  {contentModelOptions.map((model) => <option key={`content-${model}`} value={model}>{model}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Retroalimentacion</label>
                <select
                  className="input-field"
                  value={localAI.grading_provider}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, grading_provider: e.target.value }))}
                >
                  <option value="open_code">Open Code</option>
                  <option value="groq">Groq Cloud</option>
                  <option value="ollama">Ollama</option>
                </select>
                <select
                  className="input-field mt-2"
                  value={localAI.grading_local_model}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, grading_local_model: e.target.value }))}
                >
                  <option value="">Selecciona modelo</option>
                  {gradingModelOptions.map((model) => <option key={`grading-${model}`} value={model}>{model}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">OCR / Vision</label>
                <select
                  className="input-field"
                  value={localAI.ocr_provider}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, ocr_provider: e.target.value }))}
                >
                  <option value="open_code_vision">Open Code Vision</option>
                  <option value="groq_vision">Groq Vision</option>
                  <option value="ollama_vision">Ollama Vision</option>
                </select>
                <select
                  className="input-field mt-2"
                  value={localAI.ocr_local_model}
                  onChange={(e) => setLocalAI((prev) => ({ ...prev, ocr_local_model: e.target.value }))}
                >
                  <option value="">Selecciona modelo</option>
                  {ocrModelOptions.map((model) => <option key={`ocr-${model}`} value={model}>{model}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={saveLocalAIConfig}
            className="btn-primary text-sm flex items-center gap-2"
            disabled={localSaving}
          >
            {localSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar IA y OCR
          </button>
        </div>
      )}
    </div>
  );
}
