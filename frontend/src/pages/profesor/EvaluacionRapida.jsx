import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import api from '../../api';
import {
  Camera, X, FileText, Loader2, CheckCircle,
  Save, ArrowLeft, Brain, Zap, AlertCircle,
  ChevronDown, ChevronUp, Upload, RefreshCw,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────

const TIPO_BADGE = {
  seleccion_multiple: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  verdadero_falso:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  respuesta_corta:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  desarrollo:         'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};
const TIPO_LABEL = {
  seleccion_multiple: 'Selección Múltiple',
  verdadero_falso:    'V / F',
  respuesta_corta:    'Resp. Corta',
  desarrollo:         'Desarrollo',
};

function readAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ── Step Indicator ────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Subir fotos' },
  { n: 2, label: 'Analizar' },
  { n: 3, label: 'Revisar y guardar' },
];

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, idx) => (
        <div key={s.n} className="flex items-center flex-1 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              current > s.n
                ? 'bg-profesor-600 text-white'
                : current === s.n
                ? 'bg-profesor-600 text-white ring-4 ring-profesor-100 dark:ring-profesor-900/30'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
            }`}>
              {current > s.n
                ? <CheckCircle className="w-3.5 h-3.5" />
                : s.n}
            </div>
            <span className={`text-xs font-medium hidden sm:block transition-colors ${
              current >= s.n ? 'text-profesor-600 dark:text-profesor-400' : 'text-gray-400'
            }`}>{s.label}</span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 transition-colors ${
              current > s.n ? 'bg-profesor-400' : 'bg-gray-200 dark:bg-gray-700'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── File Preview Card ─────────────────────────────────────────────────────

function FileCard({ file, preview, onRemove }) {
  const isImg = file.type.startsWith('image/');
  return (
    <div className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm animate-scale-in">
      {isImg && preview
        ? <img src={preview} alt={file.name} className="w-full h-28 object-cover" />
        : (
          <div className="w-full h-28 flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20 gap-2">
            <FileText className="w-8 h-8 text-red-400" />
            <span className="text-xs text-red-500 font-medium">PDF</span>
          </div>
        )}
      <div className="px-2 py-1.5 border-t border-gray-100 dark:border-gray-700/60">
        <p className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium">{file.name}</p>
        <p className="text-[10px] text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/90 dark:bg-gray-900/90 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30"
      >
        <X className="w-3.5 h-3.5 text-gray-500 hover:text-red-500" />
      </button>
    </div>
  );
}

// ── Question Card ─────────────────────────────────────────────────────────

function QuestionCard({ p, idx }) {
  const [open, setOpen] = useState(false);
  const tipo  = p.tipo || 'respuesta_corta';
  const badge = TIPO_BADGE[tipo] || 'bg-gray-100 text-gray-600';
  const label = TIPO_LABEL[tipo] || tipo;
  const enunciado = p.enunciado || p.pregunta || '';
  const correcta  = p.respuesta_correcta;
  const hasOpts   = Array.isArray(p.opciones) && p.opciones.length > 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="shrink-0 w-7 h-7 rounded-lg bg-profesor-100 dark:bg-profesor-900/30 flex items-center justify-center text-xs font-bold text-profesor-700 dark:text-profesor-300 mt-0.5">
          {p.numero ?? idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
            {p.puntos != null && (
              <span className="text-[10px] text-gray-400">{p.puntos} pt{p.puntos !== 1 ? 's' : ''}</span>
            )}
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">{enunciado}</p>
        </div>
        <span className="shrink-0 text-gray-400 pt-1">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 dark:border-gray-800 pt-3 space-y-2">
          {hasOpts && (
            <div className="space-y-1">
              {p.opciones.map((op, i) => {
                const isCorrect = op === correcta ||
                  String.fromCharCode(65 + i) === correcta ||
                  (correcta && op?.toString().trim() === correcta?.toString().trim());
                return (
                  <div key={i} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${
                    isCorrect
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    <span className="font-mono w-4 shrink-0">{String.fromCharCode(65 + i)}.</span>
                    <span className="flex-1">{op}</span>
                    {isCorrect && <CheckCircle className="w-3 h-3 shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
          {correcta && !hasOpts && (
            <div className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg px-3 py-2 flex gap-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span><strong>Respuesta:</strong> {correcta}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Loading Overlay ───────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Leyendo la imagen…',
  'Identificando preguntas…',
  'Estructurando el examen…',
  'Casi listo…',
];

function LoadingPhase() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-8 animate-fade-in">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-profesor-gradient flex items-center justify-center shadow-glow-indigo">
          <Brain className="w-9 h-9 text-white" />
        </div>
        <div className="absolute -right-1.5 -bottom-1.5 w-8 h-8 rounded-full bg-white dark:bg-gray-900 border-2 border-profesor-200 dark:border-profesor-800 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-profesor-600 animate-spin" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="font-semibold text-gray-900 dark:text-gray-100">Analizando con IA</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 min-h-[20px] transition-all">
          {LOADING_MESSAGES[msgIdx]}
        </p>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-profesor-400 animate-bounce"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function EvaluacionRapida() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const initMateria = new URLSearchParams(location.search).get('materia') || '';

  const [files,    setFiles]    = useState([]);
  const [previews, setPreviews] = useState({});
  const [titulo,   setTitulo]   = useState('');
  const [materiaId,setMateriaId] = useState(initMateria);
  const [materias, setMaterias] = useState([]);
  const [phase,    setPhase]    = useState('upload'); // upload | loading | review
  const [result,   setResult]   = useState(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    api.get('/materias/').then(r => setMaterias(r.data)).catch(() => {});
  }, []);

  const addFiles = useCallback(async (incoming) => {
    const combined = [...files, ...incoming].slice(0, 3);
    setFiles(combined);
    const newPreviews = { ...previews };
    await Promise.all(combined.map(async (f, i) => {
      if (f.type.startsWith('image/') && !newPreviews[i]) {
        newPreviews[i] = await readAsDataURL(f);
      }
    }));
    setPreviews(newPreviews);
  }, [files, previews]);

  const removeFile = useCallback(async (idx) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    const nextPreviews = {};
    await Promise.all(next.map(async (f, i) => {
      if (f.type.startsWith('image/')) {
        nextPreviews[i] = await readAsDataURL(f);
      }
    }));
    setPreviews(nextPreviews);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    accept: { 'image/*': [], 'application/pdf': ['.pdf'] },
    maxFiles: 3,
    disabled: files.length >= 3,
    onDrop: (accepted) => addFiles(accepted),
    noClick: files.length > 0,
  });

  const handleExtract = async () => {
    if (!files.length) { toast.error('Sube al menos una imagen o PDF'); return; }
    setPhase('loading');
    const form = new FormData();
    form.append('titulo', titulo.trim() || 'Evaluación rápida');
    if (materiaId) form.append('materia_id', materiaId);
    files.forEach(f => form.append('fotos', f));
    try {
      const { data } = await api.post('/generate/evaluacion-rapida', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setPhase('review');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al procesar las imágenes');
      setPhase('upload');
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      if (result.saved && result.examen_id) {
        toast.success(`Examen guardado — ${result.n_preguntas} preguntas`);
        navigate(materiaId ? `/profesor/examenes/${materiaId}` : '/profesor/herramientas');
        return;
      }
      await api.post('/herramientas/', {
        tipo: 'examen',
        titulo: result.titulo || titulo || 'Evaluación rápida',
        contenido_json: result.contenido_json,
        clave_respuestas: result.clave_respuestas,
      });
      toast.success('Guardado como borrador en Herramientas');
      navigate('/profesor/herramientas');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setPhase('upload'); setResult(null); setFiles([]); setPreviews({}); };

  const stepNum = { upload: 1, loading: 2, review: 3 }[phase];
  const preguntas = result?.contenido_json?.preguntas || [];

  return (
    <div className="max-w-2xl mx-auto pb-10 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-0.5 p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 font-display">
              Digitalizar evaluación
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full px-2.5 py-0.5">
              <Zap className="w-3 h-3" /> Rápida
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Fotografía tu examen escrito y la IA extrae las preguntas automáticamente
          </p>
        </div>
      </div>

      {/* ── Steps ── */}
      <StepBar current={stepNum} />

      {/* ══════════════ PHASE: UPLOAD ══════════════ */}
      {phase === 'upload' && (
        <>
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={`
              rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
              ${isDragActive
                ? 'border-profesor-500 bg-profesor-50 dark:bg-profesor-900/20 scale-[1.01]'
                : files.length >= 3
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 cursor-default'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-profesor-400 dark:hover:border-profesor-600 hover:bg-profesor-50/20 dark:hover:bg-profesor-900/10'
              }
            `}
          >
            <input {...getInputProps()} />

            {files.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center gap-4 py-12 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-profesor-100 dark:bg-profesor-900/30 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-profesor-600 dark:text-profesor-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Arrastra las fotos aquí
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    o haz clic para seleccionar · máx. 3 archivos · JPG, PNG, PDF
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {['Foto del tablero', 'Hoja de examen', 'PDF escaneado'].map(t => (
                    <span key={t} className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-1">
                      <Camera className="w-3 h-3" /> {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* Files grid */
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {files.map((f, i) => (
                    <FileCard key={i} file={f} preview={previews[i]} onRemove={() => removeFile(i)} />
                  ))}
                  {files.length < 3 && (
                    <div className="h-28 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1.5 text-gray-400 cursor-pointer hover:border-profesor-300 dark:hover:border-profesor-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); openPicker(); }}
                    >
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px] text-center leading-tight">Agregar<br/>foto</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-center text-gray-400">{files.length}/3 archivos cargados</p>
              </div>
            )}
          </div>

          {/* Tip */}
          <div className="flex gap-3 p-3.5 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <strong>Consejo:</strong> Fotografía con buena iluminación y asegúrate de que el texto sea
              legible. Si el examen tiene varias hojas, sube cada página como foto separada.
            </p>
          </div>

          {/* Config panel */}
          <div className="card space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Configurar examen</h3>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Título del examen
              </label>
              <input
                type="text"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ej: Evaluación de Ciencias — Unidad 2"
                className="input-field !py-2.5 !text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Guardar en materia{' '}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select
                value={materiaId}
                onChange={e => setMateriaId(e.target.value)}
                className="input-field !py-2.5 !text-sm"
              >
                <option value="">Sin materia — guardar como borrador</option>
                {materias.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}{m.grado ? ` — ${m.grado}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleExtract}
            disabled={!files.length}
            className="w-full flex items-center justify-center gap-2.5 bg-profesor-600 hover:bg-profesor-700 active:scale-[0.98] text-white rounded-2xl py-3.5 font-semibold text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Brain className="w-4.5 h-4.5" />
            Extraer preguntas con IA
          </button>
        </>
      )}

      {/* ══════════════ PHASE: LOADING ══════════════ */}
      {phase === 'loading' && <LoadingPhase />}

      {/* ══════════════ PHASE: REVIEW ══════════════ */}
      {phase === 'review' && result && (
        <>
          {/* Summary */}
          <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl animate-fade-up">
            <div className="w-11 h-11 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                {result.n_preguntas} pregunta{result.n_preguntas !== 1 ? 's' : ''} extraída{result.n_preguntas !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 truncate">{result.titulo}</p>
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Preguntas extraídas
              <span className="ml-2 text-xs font-normal text-gray-400">
                (haz clic para ver opciones y respuesta correcta)
              </span>
            </h3>
            {preguntas.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-sm text-gray-500">No se encontraron preguntas en las imágenes.</p>
                <p className="text-xs text-gray-400 mt-1">Intenta con fotos de mejor calidad o más iluminación.</p>
              </div>
            ) : (
              preguntas.map((p, i) => <QuestionCard key={i} p={p} idx={i} />)
            )}
          </div>

          {/* Save panel */}
          <div className="card space-y-4 !p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Guardar examen</h3>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={handleSave}
                disabled={saving || preguntas.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-profesor-600 hover:bg-profesor-700 active:scale-[0.98] text-white rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {saving
                  ? 'Guardando…'
                  : materiaId ? 'Guardar en materia' : 'Guardar como borrador'}
              </button>
              <button
                onClick={reset}
                disabled={saving}
                className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Digitalizar otro
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
