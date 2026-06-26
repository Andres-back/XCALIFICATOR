import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Cloud,
  Cpu,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Presentation,
  RefreshCw,
  Save,
  ScanText,
  Search,
  Upload,
} from 'lucide-react';

const GRADING_PROVIDER_OPTIONS = [
  { value: 'open_code', label: 'Open Code' },
  { value: 'groq', label: 'Groq Cloud' },
  { value: 'ollama', label: 'Ollama' },
];

const CONTENT_PROVIDER_OPTIONS = [
  { value: 'open_code', label: 'Open Code' },
  { value: 'groq', label: 'Groq Cloud' },
  { value: 'ollama', label: 'Ollama' },
];

const OCR_PROVIDER_OPTIONS = [
  { value: 'open_code_vision', label: 'Open Code Vision' },
  { value: 'groq_vision', label: 'Groq Vision' },
  { value: 'ollama_vision', label: 'Ollama Vision' },
];

const DEFAULT_GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DEFAULT_GRADING_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OLLAMA_URL = 'http://host.docker.internal:11434';
const DEFAULT_OPEN_CODE_CONTENT_MODEL = 'Qwen3.7 Plus';
const DEFAULT_OPEN_CODE_VISION_MODEL = 'Qwen3.7 Plus';
const DEFAULT_OPEN_CODE_FEEDBACK_MODEL = 'DeepSeek V4 Pro';
const DEFAULT_OPEN_CODE_FALLBACK_MODEL = 'DeepSeek V4 Flash';
const DEFAULT_OPEN_CODE_CHAT_MODEL = 'MiMo-V2.5';

const FALLBACK_OPEN_CODE_MODEL_GROUPS = {
  all_models: [
    'GLM-5.1',
    'GLM-5',
    'Kimi K2.6',
    'Kimi K2.7 Code',
    'MiMo-V2.5',
    'MiMo-V2.5-Pro',
    'MiniMax M3',
    'MiniMax M2.7',
    'Qwen3.7 Max',
    'Qwen3.7 Plus',
    'Qwen3.6 Plus',
    'DeepSeek V4 Pro',
    'DeepSeek V4 Flash',
  ],
  content_models: [
    DEFAULT_OPEN_CODE_CONTENT_MODEL,
    'DeepSeek V4 Pro',
    'MiniMax M2.7',
    DEFAULT_OPEN_CODE_FALLBACK_MODEL,
  ],
  vision_models: [
    DEFAULT_OPEN_CODE_VISION_MODEL,
    'Qwen3.7 Max',
    'GLM-5.1',
  ],
  feedback_models: [
    DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
    'Qwen3.7 Plus',
    DEFAULT_OPEN_CODE_FALLBACK_MODEL,
  ],
  recommended: {
    content: DEFAULT_OPEN_CODE_CONTENT_MODEL,
    vision: DEFAULT_OPEN_CODE_VISION_MODEL,
    feedback: DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
    fallback: DEFAULT_OPEN_CODE_FALLBACK_MODEL,
  },
};

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
    content_provider: row.content_provider || 'groq',
    content_model: row.content_model || '',
    content_fallback_provider: row.content_fallback_provider || '',
    content_fallback_model: row.content_fallback_model || '',
    grading_provider: row.grading_provider || 'groq',
    grading_model: row.grading_model || '',
    grading_fallback_provider: row.grading_fallback_provider || '',
    grading_fallback_model: row.grading_fallback_model || '',
    ocr_provider: row.ocr_provider || 'open_code_vision',
    ocr_model: row.ocr_model || DEFAULT_OPEN_CODE_VISION_MODEL,
    ocr_fallback_provider: row.ocr_fallback_provider || '',
    ocr_fallback_model: row.ocr_fallback_model || '',
    chat_model: row.chat_model || DEFAULT_OPEN_CODE_CHAT_MODEL,
    groq_api_key: row.groq_api_key || '',
    ollama_url: row.ollama_url || DEFAULT_OLLAMA_URL,
    ollama_api_key: row.ollama_api_key || '',
    open_code_base_url: row.open_code_base_url || '',
    open_code_api_key: row.open_code_api_key || '',
    open_code_content_model: row.open_code_content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL,
    open_code_vision_model: row.open_code_vision_model || DEFAULT_OPEN_CODE_VISION_MODEL,
    open_code_feedback_model: row.open_code_feedback_model || DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
    presenton_api_key: row.presenton_api_key || '',
    openai_api_key: row.openai_api_key || '',
    cloudflare_account_id: row.cloudflare_account_id || '',
    cloudflare_api_token: row.cloudflare_api_token || '',
  };
}

function normalizeConfig(cfg) {
  return {
    content_provider: cfg.content_provider || 'groq',
    content_model: cfg.content_model || '',
    content_fallback_provider: cfg.content_fallback_provider || '',
    content_fallback_model: cfg.content_fallback_model || '',
    grading_provider: cfg.grading_provider || 'groq',
    grading_model: cfg.grading_model || '',
    grading_fallback_provider: cfg.grading_fallback_provider || '',
    grading_fallback_model: cfg.grading_fallback_model || '',
    ocr_provider: cfg.ocr_provider || 'open_code_vision',
    ocr_model: cfg.ocr_model || DEFAULT_OPEN_CODE_VISION_MODEL,
    ocr_fallback_provider: cfg.ocr_fallback_provider || '',
    ocr_fallback_model: cfg.ocr_fallback_model || '',
    chat_model: cfg.chat_model || DEFAULT_OPEN_CODE_CHAT_MODEL,
    groq_api_key: cfg.groq_api_key || '',
    ollama_url: cfg.ollama_url || DEFAULT_OLLAMA_URL,
    ollama_api_key: cfg.ollama_api_key || '',
    open_code_base_url: cfg.open_code_base_url || '',
    open_code_api_key: cfg.open_code_api_key || '',
    open_code_content_model: cfg.open_code_content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL,
    open_code_vision_model: cfg.open_code_vision_model || DEFAULT_OPEN_CODE_VISION_MODEL,
    open_code_feedback_model: cfg.open_code_feedback_model || DEFAULT_OPEN_CODE_FEEDBACK_MODEL,
    presenton_api_key: cfg.presenton_api_key || '',
    openai_api_key: cfg.openai_api_key || '',
    cloudflare_account_id: cfg.cloudflare_account_id || '',
    cloudflare_api_token: cfg.cloudflare_api_token || '',
    updated_at: cfg.updated_at || null,
    updated_by: cfg.updated_by || null,
  };
}

function toPayload(cfg) {
  // Send every field as an explicit string ('' when empty) — never null.
  // The backend merges partial updates over the existing config, so an empty
  // string means "clear this field" while an omitted field means "leave as-is".
  // Sending the full set here keeps a UI save a full, predictable replace.
  return {
    content_provider: cfg.content_provider,
    content_model: cfg.content_model || '',
    content_fallback_provider: cfg.content_fallback_provider || '',
    content_fallback_model: cfg.content_fallback_model || '',
    grading_provider: cfg.grading_provider,
    grading_model: cfg.grading_model || '',
    grading_fallback_provider: cfg.grading_fallback_provider || '',
    grading_fallback_model: cfg.grading_fallback_model || '',
    ocr_provider: cfg.ocr_provider,
    ocr_model: cfg.ocr_model || '',
    ocr_fallback_provider: cfg.ocr_fallback_provider || '',
    ocr_fallback_model: cfg.ocr_fallback_model || '',
    chat_model: cfg.chat_model || DEFAULT_OPEN_CODE_CHAT_MODEL,
    groq_api_key: cfg.groq_api_key || '',
    ollama_url: cfg.ollama_url || '',
    ollama_api_key: cfg.ollama_api_key || '',
    open_code_base_url: cfg.open_code_base_url || '',
    open_code_api_key: cfg.open_code_api_key || '',
    open_code_content_model: cfg.open_code_content_model || '',
    open_code_vision_model: cfg.open_code_vision_model || '',
    open_code_feedback_model: cfg.open_code_feedback_model || '',
    presenton_api_key: cfg.presenton_api_key || '',
    openai_api_key: cfg.openai_api_key || '',
    cloudflare_account_id: cfg.cloudflare_account_id || '',
    cloudflare_api_token: cfg.cloudflare_api_token || '',
  };
}

function applyFieldDefaults(cfg, field, value, defaults) {
  const next = { ...cfg, [field]: value };

  if (field === 'grading_provider' && value === 'groq' && !next.grading_model) {
    next.grading_model = defaults.firstGradingModel || DEFAULT_GRADING_MODEL;
  }
  if (field === 'grading_provider' && value === 'open_code' && !next.grading_model) {
    next.grading_model = next.open_code_feedback_model || DEFAULT_OPEN_CODE_FEEDBACK_MODEL;
  }
  if (field === 'grading_fallback_provider' && value === 'open_code' && !next.grading_fallback_model) {
    next.grading_fallback_model = next.open_code_feedback_model || DEFAULT_OPEN_CODE_FEEDBACK_MODEL;
  }
  if (field === 'content_provider' && value === 'open_code' && !next.content_model) {
    next.content_model = next.open_code_content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL;
  }
  if (field === 'content_fallback_provider' && value === 'open_code' && !next.content_fallback_model) {
    next.content_fallback_model = next.open_code_content_model || DEFAULT_OPEN_CODE_CONTENT_MODEL;
  }
  if (field === 'content_provider' && value === 'groq' && !next.content_model) {
    next.content_model = defaults.firstGradingModel || DEFAULT_GRADING_MODEL;
  }
  if (field === 'open_code_content_model' && next.content_provider === 'open_code') {
    next.content_model = value || DEFAULT_OPEN_CODE_CONTENT_MODEL;
  }
  if (field === 'open_code_feedback_model' && next.grading_provider === 'open_code') {
    next.grading_model = value || DEFAULT_OPEN_CODE_FEEDBACK_MODEL;
  }
  if (field === 'open_code_vision_model' && next.ocr_provider === 'open_code_vision') {
    next.ocr_model = value || DEFAULT_OPEN_CODE_VISION_MODEL;
  }
  if (field === 'ocr_provider' && value === 'groq_vision' && !next.ocr_model) {
    next.ocr_model = defaults.firstVisionModel || DEFAULT_GROQ_VISION_MODEL;
  }
  if (field === 'ocr_provider' && value === 'open_code_vision' && !next.ocr_model) {
    next.ocr_model = next.open_code_vision_model || DEFAULT_OPEN_CODE_VISION_MODEL;
  }
  if (field === 'ocr_fallback_provider' && value === 'groq_vision' && !next.ocr_fallback_model) {
    next.ocr_fallback_model = defaults.firstVisionModel || DEFAULT_GROQ_VISION_MODEL;
  }
  if (field === 'ocr_fallback_provider' && value === 'open_code_vision' && !next.ocr_fallback_model) {
    next.ocr_fallback_model = next.open_code_vision_model || DEFAULT_OPEN_CODE_VISION_MODEL;
  }
  if (field === 'chat_model' && !value) {
    next.chat_model = DEFAULT_OPEN_CODE_CHAT_MODEL;
  }

  return next;
}

function ConfigEditor({
  cfg,
  onFieldChange,
  groqModels,
  ollamaModels,
  openCodeModels,
  onDetectOllama,
  onDetectOpenCode,
  detectingOllama,
  detectingOpenCode,
  disabled,
}) {
  const firstVisionModel = (groqModels.vision_models && groqModels.vision_models[0]) || DEFAULT_GROQ_VISION_MODEL;
  const firstChatModel = (groqModels.chatbot_models && groqModels.chatbot_models[0]) || DEFAULT_GROQ_VISION_MODEL;
  const openCodeRecommended = openCodeModels.recommended || FALLBACK_OPEN_CODE_MODEL_GROUPS.recommended;

  const gradingGroqOptions = withCurrentOption(
    toModelOptions(groqModels.grading_models),
    cfg.grading_model,
  );

  const chatbotGroqOptions = withCurrentOption(
    toModelOptions(groqModels.chatbot_models),
    cfg.chat_model,
  );

  const contentGroqOptions = withCurrentOption(
    toModelOptions(groqModels.grading_models),
    cfg.content_model,
  );

  const contentOpenCodeOptions = withCurrentOption(
    toModelOptions(openCodeModels.content_models),
    cfg.content_model,
  );

  const contentFallbackOpenCodeOptions = withCurrentOption(
    toModelOptions(openCodeModels.content_models),
    cfg.content_fallback_model,
  );

  const feedbackOpenCodeOptions = withCurrentOption(
    toModelOptions(openCodeModels.feedback_models),
    cfg.grading_model,
  );

  const feedbackFallbackOpenCodeOptions = withCurrentOption(
    toModelOptions(openCodeModels.feedback_models),
    cfg.grading_fallback_model,
  );

  const ocrMainOpenCodeOptions = withCurrentOption(
    toModelOptions(openCodeModels.vision_models),
    cfg.ocr_model,
  );

  const ocrFallbackOpenCodeOptions = withCurrentOption(
    toModelOptions(openCodeModels.vision_models),
    cfg.ocr_fallback_model,
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
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-600" /> Generacion de contenido
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Proveedor principal</label>
            <select
              className="input-field mt-1"
              value={cfg.content_provider}
              onChange={(e) => onFieldChange('content_provider', e.target.value)}
              disabled={disabled}
            >
              {CONTENT_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Modelo principal</label>
            {cfg.content_provider === 'open_code' ? (
              <select
                className="input-field mt-1"
                value={cfg.content_model || openCodeRecommended.content}
                onChange={(e) => onFieldChange('content_model', e.target.value)}
                disabled={disabled}
              >
                {contentOpenCodeOptions.map((opt) => (
                  <option key={`content-open-code-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <select
                className="input-field mt-1"
                value={cfg.content_model || DEFAULT_GRADING_MODEL}
                onChange={(e) => onFieldChange('content_model', e.target.value)}
                disabled={disabled}
              >
                {contentGroqOptions.map((opt) => (
                  <option key={`content-groq-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500">Proveedor fallback</label>
            <select
              className="input-field mt-1"
              value={cfg.content_fallback_provider}
              onChange={(e) => onFieldChange('content_fallback_provider', e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin fallback</option>
              {CONTENT_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Modelo fallback</label>
            {cfg.content_fallback_provider === 'open_code' ? (
              <select
                className="input-field mt-1"
                value={cfg.content_fallback_model || openCodeRecommended.fallback}
                onChange={(e) => onFieldChange('content_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {contentFallbackOpenCodeOptions.map((opt) => (
                  <option key={`content-fallback-open-code-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="input-field mt-1"
                value={cfg.content_fallback_model}
                onChange={(e) => onFieldChange('content_fallback_model', e.target.value)}
                placeholder="Modelo fallback"
                disabled={disabled}
              />
            )}
          </div>
        </div>
      </div>

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
            ) : cfg.grading_provider === 'open_code' ? (
              <select
                className="input-field mt-1"
                value={cfg.grading_model || openCodeRecommended.feedback}
                onChange={(e) => onFieldChange('grading_model', e.target.value)}
                disabled={disabled}
              >
                {feedbackOpenCodeOptions.map((opt) => (
                  <option key={`grading-main-open-code-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
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
            ) : cfg.grading_fallback_provider === 'open_code' ? (
              <select
                className="input-field mt-1"
                value={cfg.grading_fallback_model || openCodeRecommended.feedback}
                onChange={(e) => onFieldChange('grading_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {feedbackFallbackOpenCodeOptions.map((opt) => (
                  <option key={`grading-fallback-open-code-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
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
            <ScanText className="w-4 h-4 text-emerald-600" /> Visión y calificación de imágenes
          </h3>

          <div>
            <label className="text-xs text-gray-500">Proveedor Visión principal</label>
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
            <label className="text-xs text-gray-500">Modelo Visión principal (si aplica)</label>
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
            ) : cfg.ocr_provider === 'open_code_vision' ? (
              <select
                className="input-field mt-1"
                value={cfg.ocr_model || openCodeRecommended.vision}
                onChange={(e) => onFieldChange('ocr_model', e.target.value)}
                disabled={disabled}
              >
                {ocrMainOpenCodeOptions.map((opt) => (
                  <option key={`ocr-main-open-code-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
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
            <label className="text-xs text-gray-500">Proveedor Visión fallback</label>
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
            <label className="text-xs text-gray-500">Modelo Visión fallback</label>
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
            ) : cfg.ocr_fallback_provider === 'open_code_vision' ? (
              <select
                className="input-field mt-1"
                value={cfg.ocr_fallback_model || openCodeRecommended.vision}
                onChange={(e) => onFieldChange('ocr_fallback_model', e.target.value)}
                disabled={disabled}
              >
                {ocrFallbackOpenCodeOptions.map((opt) => (
                  <option key={`ocr-fallback-open-code-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
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
                placeholder="Modelo de vision"
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
          <Cloud className="w-4 h-4 text-violet-600" /> Open Code API
        </h3>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500">URL base Open Code</label>
            <input
              className="input-field mt-1"
              value={cfg.open_code_base_url}
              onChange={(e) => onFieldChange('open_code_base_url', e.target.value)}
              placeholder="https://.../v1"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">API Key Open Code</label>
            <input
              className="input-field mt-1"
              type="password"
              value={cfg.open_code_api_key}
              onChange={(e) => onFieldChange('open_code_api_key', e.target.value)}
              placeholder="Bearer token"
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={onDetectOpenCode}
            disabled={disabled || detectingOpenCode}
          >
            {detectingOpenCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            Detectar modelos
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Modelo recomendado contenido</label>
            <input
              className="input-field mt-1"
              value={cfg.open_code_content_model}
              onChange={(e) => onFieldChange('open_code_content_model', e.target.value)}
              placeholder={DEFAULT_OPEN_CODE_CONTENT_MODEL}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Modelo recomendado vision</label>
            <input
              className="input-field mt-1"
              value={cfg.open_code_vision_model}
              onChange={(e) => onFieldChange('open_code_vision_model', e.target.value)}
              placeholder={DEFAULT_OPEN_CODE_VISION_MODEL}
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Modelo recomendado retroalimentacion</label>
            <input
              className="input-field mt-1"
              value={cfg.open_code_feedback_model}
              onChange={(e) => onFieldChange('open_code_feedback_model', e.target.value)}
              placeholder={DEFAULT_OPEN_CODE_FEEDBACK_MODEL}
              disabled={disabled}
            />
          </div>
        </div>

        <p className="text-[11px] text-gray-500">
          Recomendado: contenido con {openCodeRecommended.content}, vision costo-controlada con {openCodeRecommended.vision}, usar Qwen3.7 Max solo para examenes manuscritos dificiles, retroalimentacion con {openCodeRecommended.feedback}, fallback de alto cupo con {openCodeRecommended.fallback}.
        </p>
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

function SimplifiedConfigEditor({
  cfg,
  onFieldChange,
  groqModels,
  ollamaModels,
  openCodeModels,
  onDetectGroq,
  onDetectOllama,
  onDetectOpenCode,
  detectingGroq,
  detectingOllama,
  detectingOpenCode,
  disabled,
}) {
  const openCodeRecommended = openCodeModels.recommended || FALLBACK_OPEN_CODE_MODEL_GROUPS.recommended;
  const groqTextOptions = withCurrentOption(toModelOptions(groqModels.grading_models), '');
  const groqVisionOptions = withCurrentOption(toModelOptions(groqModels.vision_models), '');
  const ollamaOptions = withCurrentOption(toModelOptions(ollamaModels || []), '');
  const openCodeContentOptions = withCurrentOption(toModelOptions(openCodeModels.content_models), cfg.open_code_content_model);
  const openCodeVisionOptions = withCurrentOption(toModelOptions(openCodeModels.vision_models), cfg.open_code_vision_model);
  const openCodeFeedbackOptions = withCurrentOption(toModelOptions(openCodeModels.feedback_models), cfg.open_code_feedback_model);
  const openCodeChatOptions = withCurrentOption(
    toModelOptions(openCodeModels.feedback_models || openCodeModels.content_models || openCodeModels.all_models),
    cfg.chat_model || DEFAULT_OPEN_CODE_CHAT_MODEL,
  );

  const setFields = (entries) => {
    entries.forEach(([field, value]) => onFieldChange(field, value));
  };

  const modelOptionsForTask = (task) => {
    if (task === 'content') {
      if (cfg.content_provider === 'open_code') return withCurrentOption(toModelOptions(openCodeModels.content_models), cfg.content_model);
      if (cfg.content_provider === 'ollama') return withCurrentOption(toModelOptions(ollamaModels || []), cfg.content_model);
      return withCurrentOption(toModelOptions(groqModels.grading_models), cfg.content_model);
    }
    if (task === 'grading') {
      if (cfg.grading_provider === 'open_code') return withCurrentOption(toModelOptions(openCodeModels.feedback_models), cfg.grading_model);
      if (cfg.grading_provider === 'ollama') return withCurrentOption(toModelOptions(ollamaModels || []), cfg.grading_model);
      return withCurrentOption(toModelOptions(groqModels.grading_models), cfg.grading_model);
    }
    if (cfg.ocr_provider === 'open_code_vision') return withCurrentOption(toModelOptions(openCodeModels.vision_models), cfg.ocr_model);
    if (cfg.ocr_provider === 'ollama_vision') return withCurrentOption(toModelOptions(ollamaModels || []), cfg.ocr_model);
    return withCurrentOption(toModelOptions(groqModels.vision_models), cfg.ocr_model);
  };

  const handleProviderChange = (field, value) => {
    if (field === 'content_provider') {
      const model = value === 'open_code'
        ? (cfg.open_code_content_model || openCodeRecommended.content)
        : value === 'groq'
          ? (cfg.content_model || DEFAULT_GRADING_MODEL)
          : cfg.content_model;
      setFields([[field, value], ['content_model', model || '']]);
      return;
    }
    if (field === 'grading_provider') {
      const model = value === 'open_code'
        ? (cfg.open_code_feedback_model || openCodeRecommended.feedback)
        : value === 'groq'
          ? (cfg.grading_model || DEFAULT_GRADING_MODEL)
          : cfg.grading_model;
      setFields([[field, value], ['grading_model', model || '']]);
      return;
    }
    if (field === 'ocr_provider') {
      const model = value === 'open_code_vision'
        ? (cfg.open_code_vision_model || openCodeRecommended.vision)
        : value === 'groq_vision'
          ? (cfg.ocr_model || DEFAULT_GROQ_VISION_MODEL)
          : cfg.ocr_model;
      setFields([[field, value], ['ocr_model', model || '']]);
      return;
    }
    onFieldChange(field, value);
  };

  const ProviderHeader = ({ icon: Icon, title, subtitle }) => (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-primary-600 mt-0.5" />
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );

  const SelectField = ({ label, value, options, onChange }) => (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <select
        className="input-field mt-1"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={`${label}-${opt.value || 'empty'}`} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  const InputField = ({ label, value, onChange, placeholder, type = 'text' }) => (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        className="input-field mt-1"
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="border border-gray-200 rounded-xl p-4 space-y-4">
          <ProviderHeader
            icon={Cloud}
            title="Groq Cloud"
            subtitle="Clave y modelos cloud rápidos."
          />
          <InputField
            label="API key"
            type="password"
            value={cfg.groq_api_key}
            onChange={(value) => onFieldChange('groq_api_key', value)}
            placeholder="Si se deja vacía usa la global del servidor"
          />
          <button
            type="button"
            className="btn-secondary text-sm flex items-center gap-2"
            onClick={onDetectGroq}
            disabled={disabled || detectingGroq}
          >
            {detectingGroq ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Detectar modelos
          </button>
          <SelectField
            label="Modelo generación"
            value={cfg.content_provider === 'groq' ? cfg.content_model : ''}
            options={groqTextOptions}
            onChange={(value) => setFields([['content_provider', 'groq'], ['content_model', value]])}
          />
          <SelectField
            label="Modelo retroalimentación"
            value={cfg.grading_provider === 'groq' ? cfg.grading_model : ''}
            options={groqTextOptions}
            onChange={(value) => setFields([['grading_provider', 'groq'], ['grading_model', value]])}
          />
          <SelectField
            label="Modelo visión / OCR"
            value={cfg.ocr_provider === 'groq_vision' ? cfg.ocr_model : ''}
            options={groqVisionOptions}
            onChange={(value) => setFields([['ocr_provider', 'groq_vision'], ['ocr_model', value]])}
          />
        </div>

        <div className="border border-gray-200 rounded-xl p-4 space-y-4">
          <ProviderHeader
            icon={HardDrive}
            title="Ollama"
            subtitle="Local, red privada o Ollama Cloud."
          />
          <InputField
            label="URL"
            value={cfg.ollama_url}
            onChange={(value) => onFieldChange('ollama_url', value)}
            placeholder={DEFAULT_OLLAMA_URL}
          />
          <InputField
            label="API key"
            type="password"
            value={cfg.ollama_api_key}
            onChange={(value) => onFieldChange('ollama_api_key', value)}
            placeholder="Opcional"
          />
          <button
            type="button"
            className="btn-secondary text-sm flex items-center gap-2"
            onClick={onDetectOllama}
            disabled={disabled || detectingOllama}
          >
            {detectingOllama ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            Detectar modelos
          </button>
          <SelectField
            label="Modelo generación"
            value={cfg.content_provider === 'ollama' ? cfg.content_model : ''}
            options={ollamaOptions}
            onChange={(value) => setFields([['content_provider', 'ollama'], ['content_model', value]])}
          />
          <SelectField
            label="Modelo retroalimentación"
            value={cfg.grading_provider === 'ollama' ? cfg.grading_model : ''}
            options={ollamaOptions}
            onChange={(value) => setFields([['grading_provider', 'ollama'], ['grading_model', value]])}
          />
          <SelectField
            label="Modelo visión / OCR"
            value={cfg.ocr_provider === 'ollama_vision' ? cfg.ocr_model : ''}
            options={ollamaOptions}
            onChange={(value) => setFields([['ocr_provider', 'ollama_vision'], ['ocr_model', value]])}
          />
        </div>

        <div className="border border-gray-200 rounded-xl p-4 space-y-4">
          <ProviderHeader
            icon={ScanText}
            title="Open Code"
            subtitle="Recomendado para OCR/visión de exámenes."
          />
          <InputField
            label="URL base"
            value={cfg.open_code_base_url}
            onChange={(value) => onFieldChange('open_code_base_url', value)}
            placeholder="Gateway OpenAI-compatible"
          />
          <InputField
            label="API key"
            type="password"
            value={cfg.open_code_api_key}
            onChange={(value) => onFieldChange('open_code_api_key', value)}
            placeholder="Open Code API key"
          />
          <button
            type="button"
            className="btn-secondary text-sm flex items-center gap-2"
            onClick={onDetectOpenCode}
            disabled={disabled || detectingOpenCode}
          >
            {detectingOpenCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Detectar modelos
          </button>
          <SelectField
            label="Modelo generación"
            value={cfg.open_code_content_model}
            options={openCodeContentOptions}
            onChange={(value) => setFields([
              ['open_code_content_model', value],
              ['content_provider', 'open_code'],
              ['content_model', value],
            ])}
          />
          <SelectField
            label="Modelo retroalimentación"
            value={cfg.open_code_feedback_model}
            options={openCodeFeedbackOptions}
            onChange={(value) => setFields([
              ['open_code_feedback_model', value],
              ['grading_provider', 'open_code'],
              ['grading_model', value],
            ])}
          />
          <SelectField
            label="Modelo chat Xali Master / estudiante"
            value={cfg.chat_model || DEFAULT_OPEN_CODE_CHAT_MODEL}
            options={openCodeChatOptions}
            onChange={(value) => onFieldChange('chat_model', value || DEFAULT_OPEN_CODE_CHAT_MODEL)}
          />
          <SelectField
            label="Modelo visión / OCR"
            value={cfg.open_code_vision_model}
            options={openCodeVisionOptions}
            onChange={(value) => setFields([
              ['open_code_vision_model', value],
              ['ocr_provider', 'open_code_vision'],
              ['ocr_model', value],
            ])}
          />
        </div>
      </div>

      <div className="border border-emerald-100 bg-emerald-50/40 rounded-xl p-4 space-y-3">
        <ProviderHeader
          icon={Cloud}
          title="OpenAI (ChatGPT / DALL-E)"
          subtitle="Clave OpenAI para generacion de presentaciones (primario) e imagenes para colorear (DALL-E, primario sobre Cloudflare)."
        />
        <InputField
          label="API Key OpenAI"
          type="password"
          value={cfg.openai_api_key}
          onChange={(value) => onFieldChange('openai_api_key', value)}
          placeholder="sk-..."
        />
        <p className="text-xs text-emerald-700 leading-relaxed">
          Con esta clave, <strong>gpt-4o</strong> se usa como proveedor primario para planificacion de presentaciones y <strong>dall-e-3</strong> para la herramienta Para Colorear. Cloudflare queda como respaldo de imagenes.
        </p>
      </div>

      <div className="border border-sky-100 bg-sky-50/40 rounded-xl p-4 space-y-3">
        <ProviderHeader
          icon={Cloud}
          title="Cloudflare Workers AI (imágenes)"
          subtitle="Respaldo de generación de imágenes (Para Colorear e ilustraciones) cuando OpenAI no está disponible."
        />
        <InputField
          label="Account ID"
          value={cfg.cloudflare_account_id}
          onChange={(value) => onFieldChange('cloudflare_account_id', value)}
          placeholder="Cloudflare Account ID"
        />
        <InputField
          label="API Token"
          type="password"
          value={cfg.cloudflare_api_token}
          onChange={(value) => onFieldChange('cloudflare_api_token', value)}
          placeholder="Cloudflare API Token"
        />
        <p className="text-xs text-sky-700 leading-relaxed">
          Usa modelos <strong>Stable Diffusion XL</strong> (Workers AI). Se aplica como respaldo de DALL-E para imágenes. El profesor puede sobrescribir estas credenciales con las suyas.
        </p>
      </div>

      <div className="border border-amber-100 bg-amber-50/40 rounded-xl p-4 space-y-3">
        <ProviderHeader
          icon={Presentation}
          title="Presentaciones (Presenton)"
          subtitle="Clave Open Code que Presenton usa para generar diapositivas con IA."
        />
        <InputField
          label="API Key Presenton (PRESENTON_CUSTOM_LLM_API_KEY)"
          type="password"
          value={cfg.presenton_api_key}
          onChange={(value) => onFieldChange('presenton_api_key', value)}
          placeholder="Pega aqui la misma clave Open Code"
        />
        <p className="text-xs text-amber-700 leading-relaxed">
          Esta clave debe coincidir exactamente con <code className="font-mono bg-amber-100 px-1 rounded">PRESENTON_CUSTOM_LLM_API_KEY</code> en <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code>. Despues de guardarla aqui, actualiza tambien el archivo y reinicia el contenedor Presenton para que tome efecto.
        </p>
      </div>

      <div className="border border-gray-200 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Uso actual del sistema</h3>
          <p className="text-xs text-gray-500">Esta matriz decide qué proveedor se usa para cada tarea.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <SelectField
              label="Generación de contenido"
              value={cfg.content_provider}
              options={CONTENT_PROVIDER_OPTIONS}
              onChange={(value) => handleProviderChange('content_provider', value)}
            />
            <SelectField
              label="Modelo activo"
              value={cfg.content_model}
              options={modelOptionsForTask('content')}
              onChange={(value) => onFieldChange('content_model', value)}
            />
          </div>
          <div className="space-y-3">
            <SelectField
              label="Retroalimentación / calificación"
              value={cfg.grading_provider}
              options={GRADING_PROVIDER_OPTIONS}
              onChange={(value) => handleProviderChange('grading_provider', value)}
            />
            <SelectField
              label="Modelo activo"
              value={cfg.grading_model}
              options={modelOptionsForTask('grading')}
              onChange={(value) => onFieldChange('grading_model', value)}
            />
          </div>
          <div className="space-y-3">
            <SelectField
              label="OCR / visión"
              value={cfg.ocr_provider}
              options={OCR_PROVIDER_OPTIONS}
              onChange={(value) => handleProviderChange('ocr_provider', value)}
            />
            <SelectField
              label="Modelo activo"
              value={cfg.ocr_model}
              options={modelOptionsForTask('ocr')}
              onChange={(value) => onFieldChange('ocr_model', value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs text-gray-500">Fallback generación</label>
            <select
              className="input-field mt-1"
              value={cfg.content_fallback_provider || ''}
              onChange={(e) => onFieldChange('content_fallback_provider', e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin fallback</option>
              {CONTENT_PROVIDER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Fallback retroalimentación</label>
            <select
              className="input-field mt-1"
              value={cfg.grading_fallback_provider || ''}
              onChange={(e) => onFieldChange('grading_fallback_provider', e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin fallback</option>
              {GRADING_PROVIDER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Fallback OCR / visión</label>
            <select
              className="input-field mt-1"
              value={cfg.ocr_fallback_provider || ''}
              onChange={(e) => onFieldChange('ocr_fallback_provider', e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin fallback</option>
              {OCR_PROVIDER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ===== Proveedores de imágenes (OpenAI gpt-image low + Cloudflare) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-emerald-100 bg-emerald-50/40 rounded-xl p-4 space-y-3">
          <ProviderHeader
            icon={Cloud}
            title="OpenAI — solo imágenes (gpt-image, low)"
            subtitle="Proveedor primario de imágenes (Para Colorear, cuentos) en calidad low por economía. NO se usa para texto/planeación."
          />
          <InputField
            label="API Key OpenAI"
            type="password"
            value={cfg.openai_api_key}
            onChange={(value) => onFieldChange('openai_api_key', value)}
            placeholder="sk-..."
          />
        </div>

        <div className="border border-sky-100 bg-sky-50/40 rounded-xl p-4 space-y-3">
          <ProviderHeader
            icon={Cloud}
            title="Cloudflare Workers AI (imágenes)"
            subtitle="Respaldo de imágenes si OpenAI falla (Stable Diffusion XL, 1024px, muy económico)."
          />
          <InputField
            label="Account ID"
            value={cfg.cloudflare_account_id}
            onChange={(value) => onFieldChange('cloudflare_account_id', value)}
            placeholder="Cloudflare Account ID"
          />
          <InputField
            label="API Token"
            type="password"
            value={cfg.cloudflare_api_token}
            onChange={(value) => onFieldChange('cloudflare_api_token', value)}
            placeholder="Cloudflare API Token"
          />
        </div>
      </div>
    </div>
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
  const [globalGroqModels, setGlobalGroqModels] = useState(FALLBACK_GROQ_MODEL_GROUPS);
  const [detectedGroqModels, setDetectedGroqModels] = useState({});
  const [detectingGlobalGroq, setDetectingGlobalGroq] = useState(false);
  const [detectingGroqId, setDetectingGroqId] = useState(null);
  const [openCodeModels, setOpenCodeModels] = useState(FALLBACK_OPEN_CODE_MODEL_GROUPS);
  const [detectedOpenCodeModels, setDetectedOpenCodeModels] = useState({});
  const [globalOpenCodeModels, setGlobalOpenCodeModels] = useState(FALLBACK_OPEN_CODE_MODEL_GROUPS);
  const [detectingOpenCodeId, setDetectingOpenCodeId] = useState(null);
  const [detectingGlobalOpenCode, setDetectingGlobalOpenCode] = useState(false);
  const [xaliSettings, setXaliSettings] = useState({
    profesor_mascot_url: '/xali/mascota-principal.png',
    estudiante_mascot_url: '/xali/mascota-principal.png',
  });
  const [uploadingMascot, setUploadingMascot] = useState(null);

  const normalizeGroqModelGroups = (payload = {}) => ({
    all_models: Array.isArray(payload.all_models) && payload.all_models.length ? payload.all_models : FALLBACK_GROQ_MODEL_GROUPS.all_models,
    vision_models: Array.isArray(payload.vision_models) && payload.vision_models.length ? payload.vision_models : FALLBACK_GROQ_MODEL_GROUPS.vision_models,
    grading_models: Array.isArray(payload.grading_models) && payload.grading_models.length ? payload.grading_models : FALLBACK_GROQ_MODEL_GROUPS.grading_models,
    chatbot_models: Array.isArray(payload.chatbot_models) && payload.chatbot_models.length ? payload.chatbot_models : FALLBACK_GROQ_MODEL_GROUPS.chatbot_models,
  });

  const fetchGroqModels = async () => {
    try {
      const res = await api.get('/admin/groq-models');
      const groups = normalizeGroqModelGroups(res?.data || {});
      setGroqModels(groups);
      setGlobalGroqModels(groups);
    } catch {
      setGroqModels(FALLBACK_GROQ_MODEL_GROUPS);
      setGlobalGroqModels(FALLBACK_GROQ_MODEL_GROUPS);
    }
  };

  const normalizeOpenCodeModelGroups = (payload = {}) => ({
    all_models: Array.isArray(payload.all_models) && payload.all_models.length ? payload.all_models : FALLBACK_OPEN_CODE_MODEL_GROUPS.all_models,
    content_models: Array.isArray(payload.content_models) && payload.content_models.length ? payload.content_models : FALLBACK_OPEN_CODE_MODEL_GROUPS.content_models,
    vision_models: Array.isArray(payload.vision_models) && payload.vision_models.length ? payload.vision_models : FALLBACK_OPEN_CODE_MODEL_GROUPS.vision_models,
    feedback_models: Array.isArray(payload.feedback_models) && payload.feedback_models.length ? payload.feedback_models : FALLBACK_OPEN_CODE_MODEL_GROUPS.feedback_models,
    recommended: payload.recommended || FALLBACK_OPEN_CODE_MODEL_GROUPS.recommended,
  });

  const fetchOpenCodeModels = async () => {
    try {
      const res = await api.get('/admin/open-code-models');
      const groups = normalizeOpenCodeModelGroups(res?.data || {});
      setOpenCodeModels(groups);
      setGlobalOpenCodeModels(groups);
    } catch {
      setOpenCodeModels(FALLBACK_OPEN_CODE_MODEL_GROUPS);
      setGlobalOpenCodeModels(FALLBACK_OPEN_CODE_MODEL_GROUPS);
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

  const fetchXaliSettings = async () => {
    const res = await api.get('/admin/xali-settings');
    setXaliSettings({
      profesor_mascot_url: res.data?.profesor_mascot_url || '/xali/mascota-principal.png',
      estudiante_mascot_url: res.data?.estudiante_mascot_url || '/xali/mascota-principal.png',
    });
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchRowsData(),
        fetchGlobalData(),
        fetchGroqModels(),
        fetchOpenCodeModels(),
        fetchXaliSettings(),
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

  const detectGlobalGroqModels = async () => {
    setDetectingGlobalGroq(true);
    try {
      const res = await api.get('/admin/groq-models', {
        params: {
          api_key: globalConfig.groq_api_key || undefined,
        },
      });
      const groups = normalizeGroqModelGroups(res?.data || {});
      setGlobalGroqModels(groups);
      setGroqModels(groups);
      toast.success(`Modelos Groq detectados: ${groups.all_models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Groq Cloud');
    } finally {
      setDetectingGlobalGroq(false);
    }
  };

  const detectGroqModelsForRow = async (row) => {
    setDetectingGroqId(row.profesor_id);
    try {
      const res = await api.get('/admin/groq-models', {
        params: {
          api_key: row.groq_api_key || globalConfig.groq_api_key || undefined,
        },
      });
      const groups = normalizeGroqModelGroups(res?.data || {});
      setDetectedGroqModels((prev) => ({ ...prev, [row.profesor_id]: groups }));
      toast.success(`Modelos Groq detectados: ${groups.all_models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Groq Cloud');
    } finally {
      setDetectingGroqId(null);
    }
  };

  const detectGlobalOpenCodeModels = async () => {
    setDetectingGlobalOpenCode(true);
    try {
      const res = await api.get('/admin/open-code-models', {
        params: {
          base_url: globalConfig.open_code_base_url || undefined,
          api_key: globalConfig.open_code_api_key || undefined,
        },
      });
      const groups = normalizeOpenCodeModelGroups(res?.data || {});
      setGlobalOpenCodeModels(groups);
      setOpenCodeModels(groups);
      toast.success(`Modelos Open Code detectados: ${groups.all_models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Open Code');
    } finally {
      setDetectingGlobalOpenCode(false);
    }
  };

  const detectOpenCodeModelsForRow = async (row) => {
    setDetectingOpenCodeId(row.profesor_id);
    try {
      const res = await api.get('/admin/open-code-models', {
        params: {
          base_url: row.open_code_base_url || globalConfig.open_code_base_url || undefined,
          api_key: row.open_code_api_key || globalConfig.open_code_api_key || undefined,
        },
      });
      const groups = normalizeOpenCodeModelGroups(res?.data || {});
      setDetectedOpenCodeModels((prev) => ({ ...prev, [row.profesor_id]: groups }));
      toast.success(`Modelos Open Code detectados: ${groups.all_models.length}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo consultar Open Code');
    } finally {
      setDetectingOpenCodeId(null);
    }
  };

  const uploadMascot = async (role, file) => {
    if (!file) return;
    setUploadingMascot(role);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/admin/xali-settings/mascot/${role}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setXaliSettings({
        profesor_mascot_url: res.data?.profesor_mascot_url || '/xali/mascota-principal.png',
        estudiante_mascot_url: res.data?.estudiante_mascot_url || '/xali/mascota-principal.png',
      });
      toast.success(`Mascota de ${role === 'profesor' ? 'profesor' : 'estudiante'} actualizada`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo subir la mascota de Xali');
    } finally {
      setUploadingMascot(null);
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
          <h1 className="text-2xl font-bold text-gray-900">Configuración IA y Visión</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define configuraciÃ³n global y, si hace falta, ajustes por profesor.
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

        <SimplifiedConfigEditor
          cfg={globalConfig}
          onFieldChange={updateGlobalField}
          groqModels={globalGroqModels}
          ollamaModels={globalDetectedModels}
          openCodeModels={globalOpenCodeModels}
          onDetectGroq={detectGlobalGroqModels}
          onDetectOllama={detectGlobalOllamaModels}
          onDetectOpenCode={detectGlobalOpenCodeModels}
          detectingGroq={detectingGlobalGroq}
          detectingOllama={detectingGlobal}
          detectingOpenCode={detectingGlobalOpenCode}
          disabled={false}
        />
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-profesor-50 text-profesor-700 flex items-center justify-center">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Mascotas de Xali</h2>
            <p className="text-xs text-gray-500">
              Imagen visible para el chatbot del profesor y el asistente del estudiante.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { role: 'profesor', label: 'Profesor', url: xaliSettings.profesor_mascot_url },
            { role: 'estudiante', label: 'Estudiante', url: xaliSettings.estudiante_mascot_url },
          ].map((item) => (
            <div key={item.role} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                  {item.url ? (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-7 h-7 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Mascota para {item.label}</p>
                  <p className="text-xs text-gray-500 truncate">{item.url || 'Sin imagen personalizada'}</p>
                </div>
              </div>
              <label className="mt-4 inline-flex items-center gap-2 btn-secondary cursor-pointer">
                {uploadingMascot === item.role ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Subir imagen
                <input
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadingMascot === item.role}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    uploadMascot(item.role, file);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
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
            const rowGroqModels = detectedGroqModels[row.profesor_id] || groqModels;
            const rowOpenCodeModels = detectedOpenCodeModels[row.profesor_id] || openCodeModels;
            const isSaving = savingId === row.profesor_id;
            const isDetecting = detectingId === row.profesor_id;
            const isDetectingGroq = detectingGroqId === row.profesor_id;
            const isDetectingOpenCode = detectingOpenCodeId === row.profesor_id;

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

                <SimplifiedConfigEditor
                  cfg={row}
                  onFieldChange={(field, value) => updateField(row.profesor_id, field, value)}
                  groqModels={rowGroqModels}
                  ollamaModels={models}
                  openCodeModels={rowOpenCodeModels}
                  onDetectGroq={() => detectGroqModelsForRow(row)}
                  onDetectOllama={() => detectOllamaModels(row)}
                  onDetectOpenCode={() => detectOpenCodeModelsForRow(row)}
                  detectingGroq={isDetectingGroq}
                  detectingOllama={isDetecting}
                  detectingOpenCode={isDetectingOpenCode}
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


