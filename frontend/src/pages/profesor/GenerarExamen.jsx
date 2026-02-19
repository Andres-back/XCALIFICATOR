import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { Wand2, Loader2, Clock, AlertCircle } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';

const TIPOS_PREGUNTA = [
  { key: 'seleccion_multiple', label: 'Selección Múltiple', desc: 'Preguntas con opciones A, B, C, D' },
  { key: 'verdadero_falso', label: 'Verdadero / Falso', desc: 'Evalúa si un enunciado es correcto' },
  { key: 'respuesta_corta', label: 'Respuesta Corta', desc: 'Respuesta breve de una o pocas palabras' },
  { key: 'desarrollo', label: 'Desarrollo / Ensayo', desc: 'Respuesta abierta y elaborada' },
];

const GRADOS_COLOMBIA = [
  { group: 'Preescolar', options: [{ value: 'preescolar', label: 'Preescolar (Transición)' }] },
  { group: 'Primaria', options: [
    { value: 'primaria_1', label: '1° Primaria' },
    { value: 'primaria_2', label: '2° Primaria' },
    { value: 'primaria_3', label: '3° Primaria' },
    { value: 'primaria_4', label: '4° Primaria' },
    { value: 'primaria_5', label: '5° Primaria' },
  ]},
  { group: 'Secundaria', options: [
    { value: 'secundaria_6', label: '6° (Sexto)' },
    { value: 'secundaria_7', label: '7° (Séptimo)' },
    { value: 'secundaria_8', label: '8° (Octavo)' },
    { value: 'secundaria_9', label: '9° (Noveno)' },
    { value: 'secundaria_10', label: '10° (Décimo)' },
    { value: 'secundaria_11', label: '11° (Undécimo)' },
  ]},
];

// --- Autocomplete helpers ---
const AC_KEY = 'xCalificator_autocomplete';
function loadSuggestions(field) {
  try {
    const data = JSON.parse(localStorage.getItem(AC_KEY) || '{}');
    return [...new Set(data[field] || [])].slice(0, 10);
  } catch { return []; }
}
function saveSuggestion(field, value) {
  if (!value?.trim()) return;
  try {
    const data = JSON.parse(localStorage.getItem(AC_KEY) || '{}');
    const arr = data[field] || [];
    if (!arr.includes(value.trim())) arr.unshift(value.trim());
    data[field] = arr.slice(0, 20);
    localStorage.setItem(AC_KEY, JSON.stringify(data));
  } catch {}
}

function AutocompleteInput({ label, field, value, onChange, placeholder, required, type = 'text', hint, ...rest }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const filtered = suggestions.filter(s => s.toLowerCase().includes((value || '').toLowerCase()) && s !== value);

  useEffect(() => { setSuggestions(loadSuggestions(field)); }, [field]);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea className="input-field h-24" value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setShowSugg(true)} onBlur={() => setTimeout(() => setShowSugg(false), 200)}
          required={required} {...rest} />
      ) : (
        <input type="text" className="input-field" value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setShowSugg(true)} onBlur={() => setTimeout(() => setShowSugg(false), 200)}
          required={required} {...rest} />
      )}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {showSugg && filtered.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((s, i) => (
            <button key={i} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 text-gray-700 truncate"
              onMouseDown={() => { onChange(s); setShowSugg(false); }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GenerarExamen({ materiaId: propMateriaId, embedded = false, onSuccess }) {
  const params = useParams();
  const navigate = useNavigate();
  const materiaId = propMateriaId || params.materiaId;
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    tema: '',
    nivel: 'intermedio',
    grado: '',
    contenido_base: '',
    distribucion: {},
    fecha_limite: '',
    fecha_activacion: '',
    activo_online: true,
  });

  const totalPreguntas = Object.values(form.distribucion).reduce((a, b) => a + b, 0);

  const updateDistribucion = (key, value) => {
    setForm(prev => ({
      ...prev,
      distribucion: { ...prev.distribucion, [key]: parseInt(value) || 0 },
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (totalPreguntas === 0) {
      toast.error('Selecciona al menos un tipo de pregunta');
      return;
    }
    setShowConfirm(true);
  };

  const doGenerate = async () => {
    setShowConfirm(false);
    saveSuggestion('titulo', form.titulo);
    saveSuggestion('tema', form.tema);
    if (form.contenido_base) saveSuggestion('contenido_base', form.contenido_base.slice(0, 200));

    setLoading(true);
    try {
      const payload = {
        materia_id: materiaId,
        titulo: form.titulo,
        tema: form.tema,
        nivel: form.nivel,
        grado: form.grado || null,
        distribucion: form.distribucion,
        contenido_base: form.contenido_base || null,
      };
      await api.post('/generate/exam', payload);

      // Set dates if configured
      if (form.fecha_limite || form.fecha_activacion) {
        try {
          const examsRes = await api.get(`/examenes/materia/${materiaId}`);
          const latest = examsRes.data?.[0];
          if (latest) {
            const updatePayload = { activo_online: form.activo_online };
            if (form.fecha_limite) updatePayload.fecha_limite = new Date(form.fecha_limite).toISOString();
            if (form.fecha_activacion) updatePayload.fecha_activacion = new Date(form.fecha_activacion).toISOString();
            await api.patch(`/examenes/${latest.id}`, updatePayload);
          }
        } catch {}
      }

      toast.success('¡Examen generado exitosamente!');
      if (onSuccess) {
        onSuccess();
      } else {
        navigate(`/profesor/examenes/${materiaId}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando examen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={embedded ? '' : 'max-w-2xl mx-auto'}>
      {!embedded && (
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Generar Examen con IA</h1>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800 font-medium">Generación con Inteligencia Artificial</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Las preguntas serán generadas automáticamente según el tema y nivel. 
            Para crucigramas y sopas de letras, usa las pestañas correspondientes.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: General Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">1</span>
            Información General
          </h2>
          <div className="space-y-4">
            <AutocompleteInput label="Título del examen" field="titulo"
              value={form.titulo} onChange={v => setForm(p => ({...p, titulo: v}))}
              placeholder="Ej: Evaluación de Matemáticas - Fracciones"
              required />
            <AutocompleteInput label="Tema / Contenido" field="tema" type="textarea"
              value={form.tema} onChange={v => setForm(p => ({...p, tema: v}))}
              placeholder="Describe el tema o contenido a evaluar..."
              hint="Sé lo más específico posible para mejores resultados"
              required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nivel de dificultad</label>
                <select className="input-field" value={form.nivel}
                  onChange={e => setForm(p => ({ ...p, nivel: e.target.value }))}>
                  <option value="basico">Básico</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzado">Avanzado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grado escolar</label>
                <select className="input-field" value={form.grado}
                  onChange={e => setForm(p => ({ ...p, grado: e.target.value }))}>
                  <option value="">Seleccionar grado...</option>
                  {GRADOS_COLOMBIA.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <AutocompleteInput label="Contenido base (opcional)" field="contenido_base" type="textarea"
              value={form.contenido_base} onChange={v => setForm(p => ({...p, contenido_base: v}))}
              placeholder="Pega aquí texto adicional como base para generar las preguntas..."
              hint="Puedes pegar apuntes, texto del libro o temas clave" />
          </div>
        </div>

        {/* Section 2: Question Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">2</span>
            Distribución de Preguntas
          </h2>
          <p className="text-sm text-gray-500 mb-4 ml-8">
            Selecciona cuántas preguntas de cada tipo. Total: <span className="font-bold text-primary-600">{totalPreguntas}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TIPOS_PREGUNTA.map(tipo => (
              <div key={tipo.key}
                className={`flex items-center justify-between rounded-xl p-4 border transition-colors ${
                  (form.distribucion[tipo.key] || 0) > 0
                    ? 'bg-primary-50 border-primary-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                <div className="min-w-0">
                  <label className="text-sm font-medium text-gray-800">{tipo.label}</label>
                  <p className="text-xs text-gray-400 mt-0.5">{tipo.desc}</p>
                </div>
                <input
                  type="number" min="0" max="20"
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  value={form.distribucion[tipo.key] || ''}
                  onChange={e => updateDistribucion(tipo.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Online Config */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">3</span>
            <Clock className="w-4 h-4 text-primary-600" /> Configuración Online
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={form.activo_online}
                onChange={e => setForm(p => ({...p, activo_online: e.target.checked}))}
                className="rounded border-gray-300 text-primary-600 w-4 h-4" />
              <div>
                <span className="text-sm font-medium text-gray-700">Activar para resolución online</span>
                <p className="text-xs text-gray-400">Los estudiantes podrán resolver este examen desde la plataforma</p>
              </div>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de activación</label>
                <input type="datetime-local" className="input-field" value={form.fecha_activacion}
                  onChange={e => setForm(p => ({...p, fecha_activacion: e.target.value}))} />
                <p className="text-xs text-gray-400 mt-1">Se mostrará a estudiantes a partir de esta fecha.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
                <input type="datetime-local" className="input-field" value={form.fecha_limite}
                  onChange={e => setForm(p => ({...p, fecha_limite: e.target.value}))} />
                <p className="text-xs text-gray-400 mt-1">No podrán responder después de esta fecha.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading || totalPreguntas === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base">
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Generando con IA... Esto puede tardar unos segundos</span>
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              <span>Generar Examen ({totalPreguntas} preguntas)</span>
            </>
          )}
        </button>
      </form>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={doGenerate}
        title="¿Generar examen?"
        message={`Se generarán ${totalPreguntas} preguntas sobre "${form.tema}" con nivel ${form.nivel}. Esta operación usa inteligencia artificial y puede tardar unos segundos.`}
        confirmText="Sí, generar"
        variant="primary"
        loading={loading}
      />
    </div>
  );
}
