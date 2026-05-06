import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Cloud,
  Cpu,
  HardDrive,
  Loader2,
  RefreshCw,
  Save,
  ScanText,
  Search,
} from 'lucide-react';

const GRADING_PROVIDER_OPTIONS = [
  { value: 'groq', label: 'Groq Cloud (API pagada)' },
  { value: 'ollama', label: 'Ollama (local o cloud)' },
];

const OCR_PROVIDER_OPTIONS = [
  { value: 'paddleocr', label: 'PaddleOCR (motor OCR dedicado)' },
  { value: 'groq_vision', label: 'Groq Vision (modelo multimodal)' },
  { value: 'ollama_vision', label: 'Ollama Vision (local o cloud)' },
];

const DEFAULT_GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DEFAULT_GRADING_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OLLAMA_URL = 'http://host.docker.internal:11434';

const FALLBACK_GROQ_MODEL_GROUPS = {
  all_models: [
    'allam-2-7b',
    'groq/compound',
    'groq/compound-mini',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-prompt-guard-2-22m',
    'meta-llama/llama-prompt-guard-2-86m',
    'moonshotai/kimi-k2-instruct',
    'moonshotai/kimi-k2-instruct-0905',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-safeguard-20b',
    'qwen/qwen3-32b',
  ],
  vision_models: [
    DEFAULT_GROQ_VISION_MODEL,
  ],
  grading_models: [
    'allam-2-7b',
    'groq/compound',
    'groq/compound-mini',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'moonshotai/kimi-k2-instruct',
    'moonshotai/kimi-k2-instruct-0905',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-safeguard-20b',
    'qwen/qwen3-32b',
  ],
  chatbot_models: [
    'allam-2-7b',
    'groq/compound',
    'groq/compound-mini',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'moonshotai/kimi-k2-instruct',
    'moonshotai/kimi-k2-instruct-0905',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-safeguard-20b',
    'qwen/qwen3-32b',
  ],
};

function toModelOptions(models) {
  return (models || []).map((id) => ({ value: id, label: id }));
}

function withCurrentOption(options, currentValue) {
  const base = [...options];
  const hasEmpty = base.some((opt) => opt.value === '');
  if (!hasEmpty) {
    base.unshift({ value: '', label: 'Selecciona modelo' });
  }

  const current = String(currentValue || '').trim();
  if (current && !base.some((opt) => opt.value === current)) {
    base.push({ value: current, label: `Personalizado: ${current}` });
  }

  return base;
}

function normalizeRow(row) {
  return {
    ...row,
    uses_global: Boolean(row.uses_global),
    grading_model: row.grading_model || '',
    grading_fallback_provider: row.grading_fallback_provider || '',
    grading_fallback_model: row.grading_fallback_model || '',
    ocr_model: row.ocr_model || '',
    ocr_fallback_provider: row.ocr_fallback_provider || '',
    ocr_fallback_model: row.ocr_fallback_model || '',
    chat_model: row.chat_model || DEFAULT_GROQ_VISION_MODEL,
    ollama_url: row.ollama_url || DEFAULT_OLLAMA_URL,
    ollama_api_key: row.ollama_api_key || '',
  };
}

function normalizeConfig(cfg) {
  return {
    grading_provider: cfg.grading_provider || 'groq',
    grading_model: cfg.grading_model || '',
    grading_fallback_provider: cfg.grading_fallback_provider || '',
    grading_fallback_model: cfg.grading_fallback_model || '',
    ocr_provider: cfg.ocr_provider || 'groq_vision',
    ocr_model: cfg.ocr_model || '',
    ocr_fallback_provider: cfg.ocr_fallback_provider || '',
    ocr_fallback_model: cfg.ocr_fallback_model || '',
    chat_model: cfg.chat_model || DEFAULT_GROQ_VISION_MODEL,
    ollama_url: cfg.ollama_url || DEFAULT_OLLAMA_URL,
    ollama_api_key: cfg.ollama_api_key || '',
    updated_at: cfg.updated_at || null,
    updated_by: cfg.updated_by || null,
  };
}

function toPayload(cfg) {
  return {
    grading_provider: cfg.grading_provider,
    grading_model: cfg.grading_model || null,
    grading_fallback_provider: cfg.grading_fallback_provider || null,
    grading_fallback_model: cfg.grading_fallback_model || null,
    ocr_provider: cfg.ocr_provider,
    ocr_model: cfg.ocr_model || null,
    ocr_fallback_provider: cfg.ocr_fallback_provider || null,
    ocr_fallback_model: cfg.ocr_fallback_model || null,
    chat_model: cfg.chat_model || null,
    ollama_url: cfg.ollama_url || null,
    ollama_api_key: cfg.ollama_api_key || null,
  };
}

function applyFieldDefaults(cfg, field, value, defaults) {
  const next = { ...cfg, [field]: value };

  if (field === 'grading_provider' && value === 'groq' && !next.grading_model) {
    next.grading_model = defaults.firstGradingModel || DEFAULT_GRADING_MODEL;
  }
  if (field === 'ocr_provider' && value === 'groq_vision' && !next.ocr_model) {
    next.ocr_model = defaults.firstVisionModel || DEFAULT_GROQ_VISION_MODEL;
  }
  if (field === 'ocr_fallback_provider' && value === 'groq_vision' && !next.ocr_fallback_model) {
    next.ocr_fallback_model = defaults.firstVisionModel || DEFAULT_GROQ_VISION_MODEL;
  }
  if (field === 'chat_model' && !value) {
    next.chat_model = defaults.firstChatModel || DEFAULT_GROQ_VISION_MODEL;
  }

  return next;
}

function ConfigEditor({
  cfg,
  onFieldChange,
  groqModels,
  ollamaModels,
  onDetectOllama,
  detectingOllama,
  disabled,
}) {
  const firstVisionModel = (groqModels.vision_models && groqModels.vision_models[0]) || DEFAULT_GROQ_VISION_MODEL;
  const firstChatModel = (groqModels.chatbot_models && groqModels.chatbot_models[0]) || DEFAULT_GROQ_VISION_MODEL;

  const gradingGroqOptions = withCurrentOption(
    toModelOptions(groqModels.grading_models),
    cfg.grading_model,
  );

  const chatbotGroqOptions = withCurrentOption(
    toModelOptions(groqModels.chatbot_models),
    cfg.chat_model,
  );

  const ocrMainVisionOptions = withCurrentOption(
    toModelOptions(groqModels.vision_models),
    cfg.ocr_model,
  );

  const ocrFallbackVisionOptions = withCurrentOption(
    toModelOptions(groqModels.vision_models),
    cfg.ocr_fallback_model,
  );

  const ocrMainOllamaOptions = withCurrentOption(
    toModelOptions(ollamaModels || []),
    cfg.ocr_model,
  );

  const ocrFallbackOllamaOptions = withCurrentOption(
    toModelOptions(ollamaModels || []),
    cfg.ocr_fallback_model,
  );

  const ollamaMainModelOptions = withCurrentOption(
    toModelOptions(ollamaModels || []),
    cfg.grading_model,
  );

  const ollamaFallbackModelOptions = withCurrentOption(
    toModelOptions(ollamaModels || []),
    cfg.grading_fallback_model,
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-indigo-600" /> Calificacion de respuestas abiertas
          </h3>

          <div>
            <label className="text-xs text-gray-500">Proveedor principal</label>
            <select
              className="input-field mt-1"
              value={cfg.grading_provider}
              onChange={(e) => onFieldChange('grading_provider', e.target.value)}
              disabled={disabled}
            >
              {GRADING_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Modelo principal</label>
            {cfg.grading_provider === 'groq' ? (
              <select
                className="input-field mt-1"
                value={cfg.grading_model || ''}
                onChange={(e) => onFieldChange('grading_model', e.target.value)}
                disabled={disabled}
              >
                {gradingGroqOptions.map((opt) => (
                  <option key={`grading-main-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (ollamaModels || []).length > 0 ? (
              <select
                className="input-field mt-1"
                value={cfg.grading_model || ''}
                onChange={(e) => onFieldChange('grading_model', e.target.value)}
                disabled={disabled}
              >
                {ollamaMainModelOptions.map((opt) => (
                  <option key={`grading-main-ollama-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field mt-1"
                value={cfg.grading_model}
                onChange={(e) => onFieldChange('grading_model', e.target.value)}
                placeholder="Detecta modelos de Ollama o escribe uno"
                disabled={disabled}
              />
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500">Proveedor fallback</label>
            <select
              className="input-field mt-1"
              value={cfg.grading_fallback_provider}
              onChange={(e) => onFieldChange('grading_fallback_provider', e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin fallback</option>
              {GRADING_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Modelo fallback</label>
            {cfg.grading_fallback_provider === 'groq' ? (
              <select
                className="input-field mt-1"
                value={cfg.grading_fallback_model || ''}
                onChange={(e) => onFieldChange('grading_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {withCurrentOption(toModelOptions(groqModels.grading_models), cfg.grading_fallback_model).map((opt) => (
                  <option key={`grading-fallback-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : cfg.grading_fallback_provider === 'ollama' && (ollamaModels || []).length > 0 ? (
              <select
                className="input-field mt-1"
                value={cfg.grading_fallback_model || ''}
                onChange={(e) => onFieldChange('grading_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {ollamaFallbackModelOptions.map((opt) => (
                  <option key={`grading-fallback-ollama-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field mt-1"
                value={cfg.grading_fallback_model}
                onChange={(e) => onFieldChange('grading_fallback_model', e.target.value)}
                placeholder="Modelo fallback"
                disabled={disabled}
              />
            )}
          </div>
        </div>

        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <ScanText className="w-4 h-4 text-emerald-600" /> OCR y extraccion de texto
          </h3>

          <div>
            <label className="text-xs text-gray-500">Proveedor OCR principal</label>
            <select
              className="input-field mt-1"
              value={cfg.ocr_provider}
              onChange={(e) => onFieldChange('ocr_provider', e.target.value)}
              disabled={disabled}
            >
              {OCR_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Modelo OCR principal (si aplica)</label>
            {cfg.ocr_provider === 'groq_vision' ? (
              <select
                className="input-field mt-1"
                value={cfg.ocr_model || firstVisionModel}
                onChange={(e) => onFieldChange('ocr_model', e.target.value)}
                disabled={disabled}
              >
                {ocrMainVisionOptions.map((opt) => (
                  <option key={`ocr-main-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : cfg.ocr_provider === 'ollama_vision' && (ollamaModels || []).length > 0 ? (
              <select
                className="input-field mt-1"
                value={cfg.ocr_model || ''}
                onChange={(e) => onFieldChange('ocr_model', e.target.value)}
                disabled={disabled}
              >
                {ocrMainOllamaOptions.map((opt) => (
                  <option key={`ocr-main-ollama-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field mt-1"
                value={cfg.ocr_model}
                onChange={(e) => onFieldChange('ocr_model', e.target.value)}
                placeholder="qwen3-vl"
                disabled={disabled}
              />
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500">Proveedor OCR fallback</label>
            <select
              className="input-field mt-1"
              value={cfg.ocr_fallback_provider}
              onChange={(e) => onFieldChange('ocr_fallback_provider', e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin fallback</option>
              {OCR_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Modelo OCR fallback</label>
            {cfg.ocr_fallback_provider === 'groq_vision' ? (
              <select
                className="input-field mt-1"
                value={cfg.ocr_fallback_model || firstVisionModel}
                onChange={(e) => onFieldChange('ocr_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {ocrFallbackVisionOptions.map((opt) => (
                  <option key={`ocr-fallback-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : cfg.ocr_fallback_provider === 'ollama_vision' && (ollamaModels || []).length > 0 ? (
              <select
                className="input-field mt-1"
                value={cfg.ocr_fallback_model || ''}
                onChange={(e) => onFieldChange('ocr_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {ocrFallbackOllamaOptions.map((opt) => (
                  <option key={`ocr-fallback-ollama-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field mt-1"
                value={cfg.ocr_fallback_model}
                onChange={(e) => onFieldChange('ocr_fallback_model', e.target.value)}
                placeholder="paddleocr o qwen3-vl"
                disabled={disabled}
              />
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500">Modelo del chatbot IA (Xali)</label>
            <select
              className="input-field mt-1"
              value={cfg.chat_model || firstChatModel}
              onChange={(e) => onFieldChange('chat_model', e.target.value)}
              disabled={disabled}
            >
              {chatbotGroqOptions.map((opt) => (
                <option key={`chat-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Este modelo se usa en el chat pedagogico del estudiante para explicar sus resultados.
            </p>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-700" /> Ollama local / cloud
        </h3>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500">URL base de Ollama</label>
            <input
              className="input-field mt-1"
              value={cfg.ollama_url}
              onChange={(e) => onFieldChange('ollama_url', e.target.value)}
              placeholder={DEFAULT_OLLAMA_URL}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">API Key (opcional)</label>
            <input
              className="input-field mt-1"
              type="password"
              value={cfg.ollama_api_key}
              onChange={(e) => onFieldChange('ollama_api_key', e.target.value)}
              placeholder="Bearer token si aplica"
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={onDetectOllama}
            disabled={disabled || detectingOllama}
          >
            {detectingOllama ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            Detectar modelos
          </button>
        </div>

        {(ollamaModels || []).length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Modelos detectados en Ollama:</p>
            <div className="flex flex-wrap gap-2">
              {(ollamaModels || []).map((model) => (
                <button
                  key={model}
                  type="button"
                  className="px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  onClick={() => onFieldChange('grading_fallback_model', model)}
                  title="Clic para usar como modelo fallback de calificacion"
                  disabled={disabled}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function AdminAIConfig() {
  const [rows, setRows] = useState([]);
  const [globalConfig, setGlobalConfig] = useState(normalizeConfig({}));
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [detectingId, setDetectingId] = useState(null);
  const [detectingGlobal, setDetectingGlobal] = useState(false);
  const [detectedModels, setDetectedModels] = useState({});
  const [globalDetectedModels, setGlobalDetectedModels] = useState([]);
  const [groqModels, setGroqModels] = useState(FALLBACK_GROQ_MODEL_GROUPS);

  const fetchGroqModels = async () => {
    try {
      const res = await api.get('/admin/groq-models');
      const payload = res?.data || {};
      setGroqModels({
        all_models: Array.isArray(payload.all_models) && payload.all_models.length ? payload.all_models : FALLBACK_GROQ_MODEL_GROUPS.all_models,
        vision_models: Array.isArray(payload.vision_models) && payload.vision_models.length ? payload.vision_models : FALLBACK_GROQ_MODEL_GROUPS.vision_models,
        grading_models: Array.isArray(payload.grading_models) && payload.grading_models.length ? payload.grading_models : FALLBACK_GROQ_MODEL_GROUPS.grading_models,
        chatbot_models: Array.isArray(payload.chatbot_models) && payload.chatbot_models.length ? payload.chatbot_models : FALLBACK_GROQ_MODEL_GROUPS.chatbot_models,
      });
    } catch {
      setGroqModels(FALLBACK_GROQ_MODEL_GROUPS);
    }
  };

  const fetchRowsData = async () => {
    const res = await api.get('/admin/ai-configs');
    const normalized = Array.isArray(res.data) ? res.data.map(normalizeRow) : [];
    setRows(normalized);
  };

  const fetchGlobalData = async () => {
    const res = await api.get('/admin/ai-configs/global');
    setGlobalConfig(normalizeConfig(res.data || {}));
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchRowsData(),
        fetchGlobalData(),
        fetchGroqModels(),
      ]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cargar la configuracion IA/OCR');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const firstVisionModel = useMemo(
    () => (groqModels.vision_models && groqModels.vision_models[0]) || DEFAULT_GROQ_VISION_MODEL,
    [groqModels],
  );

  const firstGradingModel = useMemo(
    () => (groqModels.grading_models && groqModels.grading_models[0]) || DEFAULT_GRADING_MODEL,
    [groqModels],
  );

  const firstChatModel = useMemo(
    () => (groqModels.chatbot_models && groqModels.chatbot_models[0]) || DEFAULT_GROQ_VISION_MODEL,
    [groqModels],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (
      `${r.profesor_nombre} ${r.profesor_correo}`.toLowerCase().includes(q)
    ));
  }, [rows, search]);

  const defaults = useMemo(() => ({
    firstVisionModel,
    firstGradingModel,
    firstChatModel,
  }), [firstVisionModel, firstGradingModel, firstChatModel]);

  const updateGlobalField = (field, value) => {
    setGlobalConfig((prev) => applyFieldDefaults(prev, field, value, defaults));
  };

  const updateField = (profesorId, field, value) => {
    setRows((prev) => prev.map((row) => (
      row.profesor_id === profesorId
        ? applyFieldDefaults(row, field, value, defaults)
        : row
    )));
  };

  const enableIndividualOverride = (row) => {
    setRows((prev) => prev.map((item) => {
      if (item.profesor_id !== row.profesor_id) return item;
      return {
        ...item,
        ...normalizeConfig(globalConfig),
        uses_global: false,
      };
    }));
  };

  const saveGlobalConfig = async () => {
    setSavingGlobal(true);
    try {
      const payload = toPayload(globalConfig);
      const res = await api.put('/admin/ai-configs/global', payload);
      setGlobalConfig(normalizeConfig(res.data || {}));
      await fetchRowsData();
      toast.success('Configuracion global guardada');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar la configuracion global');
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveConfig = async (row) => {
    setSavingId(row.profesor_id);
    try {
      const payload = toPayload(row);

      const res = await api.put(`/admin/ai-configs/${row.profesor_id}`, payload);
      const saved = normalizeRow(res.data);
      setRows((prev) => prev.map((item) => (
        item.profesor_id === row.profesor_id ? saved : item
      )));
      toast.success(`Configuracion individual guardada para ${row.profesor_nombre}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar la configuracion individual');
    } finally {
      setSavingId(null);
    }
  };

  const clearOverride = async (row) => {
    setSavingId(row.profesor_id);
    try {
      const res = await api.delete(`/admin/ai-configs/${row.profesor_id}/override`);
      const updated = normalizeRow(res.data);
      setRows((prev) => prev.map((item) => (
        item.profesor_id === row.profesor_id ? updated : item
      )));
      toast.success(`${row.profesor_nombre} ahora usa configuracion global`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo quitar el override individual');
    } finally {
      setSavingId(null);
    }
  };

  const detectGlobalOllamaModels = async () => {
    setDetectingGlobal(true);
    try {
      const res = await api.get('/admin/ai-configs/global/ollama-models');
      const models = Array.isArray(res.data?.models) ? res.data.models : [];
      setGlobalDetectedModels(models);
      toast.success(`Modelos detectados (global): ${models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Ollama para la configuracion global');
    } finally {
      setDetectingGlobal(false);
    }
  };

  const detectOllamaModels = async (row) => {
    setDetectingId(row.profesor_id);
    try {
      const res = await api.get(`/admin/ai-configs/${row.profesor_id}/ollama-models`);
      const models = Array.isArray(res.data?.models) ? res.data.models : [];
      setDetectedModels((prev) => ({ ...prev, [row.profesor_id]: models }));
      toast.success(`Modelos detectados: ${models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Ollama');
    } finally {
      setDetectingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración IA y OCR</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define configuración global y, si hace falta, ajustes por profesor.
          </p>
        </div>
        <button
          onClick={fetchInitialData}
          className="btn-secondary flex items-center gap-2"
          type="button"
        >
          <RefreshCw className="w-4 h-4" /> Recargar
        </button>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Configuracion global (preferida)</h2>
            <p className="text-xs text-gray-500">Aplica por defecto a todos los profesores que no tengan override individual.</p>
          </div>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={saveGlobalConfig}
            disabled={savingGlobal}
          >
            {savingGlobal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar global
          </button>
        </div>

        <ConfigEditor
          cfg={globalConfig}
          onFieldChange={updateGlobalField}
          groqModels={groqModels}
          ollamaModels={globalDetectedModels}
          onDetectOllama={detectGlobalOllamaModels}
          detectingOllama={detectingGlobal}
          disabled={false}
        />
      </div>

      <div className="card">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="input-field pl-10"
            placeholder="Buscar profesor por nombre o correo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="card text-center text-gray-500 py-10">No hay profesores para configurar.</div>
      ) : (
        <div className="space-y-4">
          {filteredRows.map((row) => {
            const models = detectedModels[row.profesor_id] || [];
            const isSaving = savingId === row.profesor_id;
            const isDetecting = detectingId === row.profesor_id;

            return (
              <div key={row.profesor_id} className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">{row.profesor_nombre}</h2>
                    <p className="text-xs text-gray-500">{row.profesor_correo}</p>
                    <div className="mt-1">
                      {row.uses_global ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 text-emerald-700">
                          Usando configuracion global
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700">
                          Configuracion individual
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.uses_global ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => enableIndividualOverride(row)}
                      >
                        Configurar individual
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => clearOverride(row)}
                          disabled={isSaving}
                        >
                          Usar global
                        </button>
                        <button
                          type="button"
                          className="btn-primary flex items-center gap-2"
                          onClick={() => saveConfig(row)}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Guardar individual
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <ConfigEditor
                  cfg={row}
                  onFieldChange={(field, value) => updateField(row.profesor_id, field, value)}
                  groqModels={groqModels}
                  ollamaModels={models}
                  onDetectOllama={() => detectOllamaModels(row)}
                  detectingOllama={isDetecting}
                  disabled={row.uses_global}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
