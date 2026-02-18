import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { Wand2, Loader2, Clock } from 'lucide-react';

const TIPOS_PREGUNTA = [
  { key: 'seleccion_multiple', label: 'Selección Múltiple' },
  { key: 'verdadero_falso', label: 'Verdadero / Falso' },
  { key: 'respuesta_corta', label: 'Respuesta Corta' },
  { key: 'desarrollo', label: 'Desarrollo / Ensayo' },
  { key: 'crucigrama', label: 'Crucigrama' },
  { key: 'sopa_letras', label: 'Sopa de Letras' },
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
const AC_KEY = 'xalificator_autocomplete';
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

function AutocompleteInput({ label, field, value, onChange, placeholder, required, type = 'text', ...rest }) {
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

export default function GenerarExamen() {
  const { materiaId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    tema: '',
    nivel: 'intermedio',
    grado: '',
    contenido_base: '',
    distribucion: {},
    fecha_limite: '',
    activo_online: true,
  });

  const updateDistribucion = (key, value) => {
    setForm(prev => ({
      ...prev,
      distribucion: { ...prev.distribucion, [key]: parseInt(value) || 0 },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const total = Object.values(form.distribucion).reduce((a, b) => a + b, 0);
    if (total === 0) {
      toast.error('Selecciona al menos un tipo de pregunta');
      return;
    }

    // Save values for autocomplete
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
      // If fecha_limite is set, include it and update exam after generation
      const res = await api.post('/generate/exam', payload);

      // If fecha_limite set, update the generated exam with it
      if (form.fecha_limite) {
        try {
          // Get latest exam for this materia to update its fecha_limite
          const examsRes = await api.get(`/examenes/materia/${materiaId}`);
          const latest = examsRes.data?.[0];
          if (latest) {
            await api.patch(`/examenes/${latest.id}`, {
              activo_online: form.activo_online,
              fecha_limite: new Date(form.fecha_limite).toISOString(),
            });
          }
        } catch {}
      }

      toast.success('Examen generado exitosamente');
      navigate(`/profesor/examenes/${materiaId}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando examen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Generar Examen con IA</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Información General</h2>
          <div className="space-y-4">
            <AutocompleteInput label="Título del examen" field="titulo"
              value={form.titulo} onChange={v => setForm(p => ({...p, titulo: v}))}
              required />
            <AutocompleteInput label="Tema / Contenido" field="tema" type="textarea"
              value={form.tema} onChange={v => setForm(p => ({...p, tema: v}))}
              placeholder="Describe el tema o contenido a evaluar..." required />
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
              <p className="text-xs text-gray-400 mt-1">Las preguntas se adaptarán al nivel cognitivo del grado seleccionado.</p>
            </div>
            <AutocompleteInput label="Contenido base (opcional)" field="contenido_base" type="textarea"
              value={form.contenido_base} onChange={v => setForm(p => ({...p, contenido_base: v}))}
              placeholder="Pega aquí texto adicional como base para generar las preguntas..." />
          </div>
        </div>

        {/* Fecha límite & Online */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-600" /> Configuración Online
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={form.activo_online}
                onChange={e => setForm(p => ({...p, activo_online: e.target.checked}))}
                className="rounded border-gray-300 text-primary-600" />
              <span className="text-sm text-gray-700">Activar para resolución online por estudiantes</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha límite de entrega (opcional)
              </label>
              <input type="datetime-local" className="input-field" value={form.fecha_limite}
                onChange={e => setForm(p => ({...p, fecha_limite: e.target.value}))} />
              <p className="text-xs text-gray-400 mt-1">Los estudiantes no podrán responder después de esta fecha.</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Distribución de Preguntas</h2>
          <p className="text-sm text-gray-500 mb-4">Indica cuántas preguntas de cada tipo deseas incluir.</p>
          <div className="grid grid-cols-2 gap-4">
            {TIPOS_PREGUNTA.map(tipo => (
              <div key={tipo.key} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <label className="text-sm font-medium text-gray-700">{tipo.label}</label>
                <input
                  type="number" min="0" max="20"
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                  value={form.distribucion[tipo.key] || ''}
                  onChange={e => updateDistribucion(tipo.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generando con IA...</>
          ) : (
            <><Wand2 className="w-5 h-5" /> Generar Examen</>
          )}
        </button>
      </form>
    </div>
  );
}
