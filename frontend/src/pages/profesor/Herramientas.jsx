import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Wrench, Plus, Wand2, Loader2, Edit3, Trash2, Send,
  FileText, Grid3X3, Search, Eye, EyeOff, X, BookOpen,
  CheckCircle, Clock, AlertCircle, Link2, BookMarked,
} from 'lucide-react';
import Crucigrama from '../../components/Crucigrama';
import SopaLetras from '../../components/SopaLetras';
import Emparejar from '../../components/Emparejar';
import Cuento from '../../components/Cuento';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

const TIPOS = [
  { value: 'examen', label: 'Examen', icon: FileText, color: 'blue' },
  { value: 'crucigrama', label: 'Crucigrama', icon: Grid3X3, color: 'purple' },
  { value: 'sopa_letras', label: 'Sopa de Letras', icon: Search, color: 'emerald' },
  { value: 'emparejar', label: 'Emparejar', icon: Link2, color: 'amber' },
  { value: 'cuento', label: 'Cuento', icon: BookMarked, color: 'rose' },
];

const TIPO_COLORS = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
};

const ESTADO_BADGES = {
  borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: Edit3 },
  generado: { label: 'Generado', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  listo: { label: 'Listo', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  asignado: { label: 'Asignado', color: 'bg-green-100 text-green-700', icon: Send },
};

const TIPOS_PREGUNTA = [
  { key: 'seleccion_multiple', label: 'Selección Múltiple', desc: 'Preguntas con opciones A, B, C, D' },
  { key: 'verdadero_falso', label: 'Verdadero / Falso', desc: 'Evalúa si un enunciado es correcto' },
  { key: 'respuesta_corta', label: 'Respuesta Corta', desc: 'Respuesta breve de pocas palabras' },
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

export default function ProfesorHerramientas() {
  const [herramientas, setHerramientas] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showAssign, setShowAssign] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filter, setFilter] = useState('all');

  const [genForm, setGenForm] = useState({
    tipo: 'examen',
    titulo: '',
    tema: '',
    nivel: 'intermedio',
    grado: '',
    contenido_base: '',
    distribucion: {},
    // Sopa de letras
    num_palabras: 8,
    palabras_obligatorias: [],
    nueva_palabra: '',
    // Crucigrama
    num_horizontales: 5,
    num_verticales: 5,
    palabras_obligatorias_cruc: [],
    nueva_palabra_cruc: '',
    // Emparejar
    num_pares: 6,
    // Cuento
    moraleja_tema: '',
  });

  const [assignForm, setAssignForm] = useState({
    materia_id: '',
    activo_online: true,
  });

  const fetchData = async () => {
    try {
      const [hRes, mRes] = await Promise.all([
        api.get('/herramientas/'),
        api.get('/materias/mis-materias'),
      ]);
      setHerramientas(hRes.data);
      setMaterias(mRes.data);
    } catch {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const payload = {
        tipo: genForm.tipo,
        titulo: genForm.titulo,
        tema: genForm.tema,
        nivel: genForm.nivel,
        grado: genForm.grado || '',
        contenido_base: genForm.contenido_base || '',
      };

      if (genForm.tipo === 'examen') {
        payload.distribucion = genForm.distribucion;
      } else if (genForm.tipo === 'sopa_letras') {
        payload.num_palabras = genForm.num_palabras;
        payload.palabras_obligatorias = genForm.palabras_obligatorias.length > 0
          ? genForm.palabras_obligatorias : null;
      } else if (genForm.tipo === 'crucigrama') {
        payload.num_horizontales = genForm.num_horizontales;
        payload.num_verticales = genForm.num_verticales;
        payload.palabras_obligatorias = genForm.palabras_obligatorias_cruc.length > 0
          ? genForm.palabras_obligatorias_cruc : null;
      } else if (genForm.tipo === 'emparejar') {
        payload.num_pares = genForm.num_pares;
      } else if (genForm.tipo === 'cuento') {
        payload.moraleja_tema = genForm.moraleja_tema || '';
      }

      await api.post('/herramientas/generate', payload);
      toast.success('¡Herramienta generada con IA!');
      setShowGenerate(false);
      setGenForm({
        tipo: 'examen', titulo: '', tema: '', nivel: 'intermedio', grado: '', contenido_base: '',
        distribucion: {}, num_palabras: 8, palabras_obligatorias: [], nueva_palabra: '',
        num_horizontales: 5, num_verticales: 5, palabras_obligatorias_cruc: [], nueva_palabra_cruc: '',
        num_pares: 6, moraleja_tema: '',
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando');
    } finally {
      setGenerating(false);
    }
  };

  const handleAssign = async (herramientaId) => {
    if (!assignForm.materia_id) {
      toast.error('Selecciona una materia');
      return;
    }
    try {
      await api.post(`/herramientas/${herramientaId}/assign`, {
        materia_id: assignForm.materia_id,
        activo_online: assignForm.activo_online,
      });
      toast.success('Herramienta asignada a la materia');
      setShowAssign(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error asignando');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/herramientas/${id}`);
      toast.success('Herramienta eliminada');
      setDeleteConfirm(null);
      fetchData();
    } catch {
      toast.error('Error eliminando');
      setDeleteConfirm(null);
    }
  };

  const filtered = filter === 'all'
    ? herramientas
    : herramientas.filter(h => h.tipo === filter);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Herramientas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Genera exámenes, crucigramas, sopas de letras, actividades de emparejar y cuentos con IA. Asígnalas cuando estés listo.
          </p>
        </div>
        <button onClick={() => setShowGenerate(true)}
          className="btn-primary flex items-center gap-2 shrink-0">
          <Wand2 className="w-4 h-4" /> Generar con IA
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
        <Wrench className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-indigo-800 font-medium">Flujo de trabajo</p>
          <p className="text-xs text-indigo-600 mt-0.5">
            1. Genera la herramienta con IA → 2. Revisa y edita si es necesario → 3. Asigna a una materia cuando esté lista.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      {herramientas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          <button onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            Todas ({herramientas.length})
          </button>
          {TIPOS.map(t => {
            const count = herramientas.filter(h => h.tipo === t.value).length;
            if (count === 0) return null;
            const Icon = t.icon;
            return (
              <button key={t.value} onClick={() => setFilter(t.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                  filter === t.value ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Tools list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={filter !== 'all' ? 'Sin herramientas de este tipo' : 'No has generado herramientas aún'}
          description="Genera exámenes, crucigramas, sopas de letras, actividades de emparejar y cuentos con IA."
          action={
            <button onClick={() => setShowGenerate(true)} className="btn-primary flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Generar primera herramienta
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(h => {
            const tipo = TIPOS.find(t => t.value === h.tipo) || TIPOS[0];
            const estado = ESTADO_BADGES[h.estado] || ESTADO_BADGES.borrador;
            const Icon = tipo.icon;
            const EstadoIcon = estado.icon;

            return (
              <div key={h.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${TIPO_COLORS[tipo.color]?.bg || 'bg-gray-50'} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${TIPO_COLORS[tipo.color]?.text || 'text-gray-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate text-sm">{h.titulo}</h3>
                      <p className="text-xs text-gray-400 capitalize">{tipo.label}</p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${estado.color}`}>
                    <EstadoIcon className="w-3 h-3" />
                    {estado.label}
                  </span>
                </div>

                {h.tema && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">Tema: {h.tema}</p>
                )}

                <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                  <Clock className="w-3 h-3" />
                  {new Date(h.created_at).toLocaleDateString('es-CO')}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {h.estado !== 'asignado' && (
                    <button onClick={() => { setShowAssign(h.id); setAssignForm({ materia_id: '', activo_online: true }); }}
                      className="btn-primary text-xs flex items-center gap-1">
                      <Send className="w-3 h-3" /> Asignar
                    </button>
                  )}
                  <button onClick={() => setPreview(preview === h.id ? null : h.id)}
                    className="btn-secondary text-xs flex items-center gap-1">
                    {preview === h.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {preview === h.id ? 'Ocultar' : 'Vista previa'}
                  </button>
                  {h.estado !== 'asignado' && (
                    <button onClick={() => setDeleteConfirm(h.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Preview panel */}
                {preview === h.id && h.contenido_json && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {h.tipo === 'crucigrama' && h.contenido_json.crucigrama && (
                      <div className="overflow-x-auto">
                        <Crucigrama crucigrama={h.contenido_json.crucigrama} />
                      </div>
                    )}
                    {h.tipo === 'sopa_letras' && h.contenido_json.sopa_letras && (
                      <div className="overflow-x-auto">
                        <SopaLetras grid={h.contenido_json.sopa_letras.grid} palabras={h.contenido_json.sopa_letras.palabras} />
                      </div>
                    )}
                    {h.tipo === 'emparejar' && h.contenido_json.emparejar && (
                      <div className="overflow-x-auto">
                        <Emparejar emparejar={h.contenido_json.emparejar} />
                      </div>
                    )}
                    {h.tipo === 'cuento' && h.contenido_json.cuento && (
                      <div className="overflow-y-auto max-h-[500px]">
                        <Cuento cuento={h.contenido_json.cuento} titulo={h.contenido_json.titulo || h.titulo} />
                      </div>
                    )}
                    {h.tipo === 'examen' && h.contenido_json.preguntas && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {h.contenido_json.preguntas.map((p, i) => (
                          <div key={i} className="p-2 bg-gray-50 rounded-lg text-xs">
                            <p className="font-medium text-gray-700">{p.numero}. {p.enunciado}</p>
                            {p.opciones && (
                              <div className="mt-1 space-y-0.5 ml-3">
                                {p.opciones.map((o, j) => (
                                  <p key={j} className="text-gray-500">{o}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary-50">
                    <Wand2 className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Generar Herramienta con IA</h3>
                    <p className="text-xs text-gray-500">Configura los detalles y genera automáticamente</p>
                  </div>
                </div>
                <button onClick={() => setShowGenerate(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleGenerate} className="space-y-5">
                {/* Type selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de herramienta</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {TIPOS.map(t => {
                      const Icon = t.icon;
                      return (
                        <button key={t.value} type="button"
                          onClick={() => setGenForm(p => ({ ...p, tipo: t.value }))}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors ${
                            genForm.tipo === t.value
                              ? 'bg-primary-50 border-primary-300 text-primary-700'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}>
                          <Icon className="w-5 h-5" />
                          <span className="text-xs font-medium">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input type="text" className="input-field" required
                    value={genForm.titulo}
                    onChange={e => setGenForm(p => ({ ...p, titulo: e.target.value }))}
                    placeholder="Ej: Evaluación de fracciones" />
                </div>

                {/* Tema */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tema / Contenido</label>
                  <textarea className="input-field h-20" required
                    value={genForm.tema}
                    onChange={e => setGenForm(p => ({ ...p, tema: e.target.value }))}
                    placeholder="Describe el tema o contenido a evaluar..." />
                  <p className="text-xs text-gray-400 mt-1">Sé lo más específico posible para mejores resultados</p>
                </div>

                {/* Level + Grade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nivel de dificultad</label>
                    <select className="input-field" value={genForm.nivel}
                      onChange={e => setGenForm(p => ({ ...p, nivel: e.target.value }))}>
                      <option value="basico">Básico</option>
                      <option value="intermedio">Intermedio</option>
                      <option value="avanzado">Avanzado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Grado escolar</label>
                    <select className="input-field" value={genForm.grado}
                      onChange={e => setGenForm(p => ({ ...p, grado: e.target.value }))}>
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

                {/* Contenido base */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contenido base (opcional)</label>
                  <textarea className="input-field h-20"
                    value={genForm.contenido_base}
                    onChange={e => setGenForm(p => ({ ...p, contenido_base: e.target.value }))}
                    placeholder="Pega aquí texto adicional como base para la generación..." />
                  <p className="text-xs text-gray-400 mt-1">Puedes pegar apuntes, texto del libro o temas clave</p>
                </div>

                {/* ===== EXAMEN: Question distribution ===== */}
                {genForm.tipo === 'examen' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Distribución de preguntas</label>
                    <p className="text-xs text-gray-500 mb-3">
                      Total: <span className="font-bold text-primary-600">
                        {Object.values(genForm.distribucion).reduce((a, b) => a + b, 0)}
                      </span> preguntas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {TIPOS_PREGUNTA.map(t => (
                        <div key={t.key}
                          className={`flex items-center justify-between rounded-xl p-3 border transition-colors ${
                            (genForm.distribucion[t.key] || 0) > 0
                              ? 'bg-primary-50 border-primary-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-gray-800">{t.label}</span>
                            <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                          </div>
                          <input type="number" min="0" max="20"
                            className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ml-3 shrink-0"
                            value={genForm.distribucion[t.key] || ''}
                            onChange={e => setGenForm(p => ({
                              ...p,
                              distribucion: { ...p.distribucion, [t.key]: parseInt(e.target.value) || 0 }
                            }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ===== SOPA DE LETRAS: Customization ===== */}
                {genForm.tipo === 'sopa_letras' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de palabras</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min="4" max="15" value={genForm.num_palabras}
                          onChange={e => setGenForm(p => ({ ...p, num_palabras: parseInt(e.target.value) }))}
                          className="flex-1 accent-emerald-500" />
                        <span className="text-lg font-bold text-emerald-600 w-8 text-center">{genForm.num_palabras}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">La IA generará {genForm.num_palabras} palabras relacionadas con el tema</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Palabras obligatorias <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-2">Estas palabras aparecerán sí o sí en la sopa. El resto las genera la IA.</p>
                      <div className="flex gap-2 mb-2">
                        <input type="text" className="input-field flex-1"
                          value={genForm.nueva_palabra}
                          onChange={e => setGenForm(p => ({ ...p, nueva_palabra: e.target.value.toUpperCase() }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const w = genForm.nueva_palabra.trim();
                              if (w && !genForm.palabras_obligatorias.includes(w)) {
                                setGenForm(p => ({
                                  ...p,
                                  palabras_obligatorias: [...p.palabras_obligatorias, w],
                                  nueva_palabra: '',
                                }));
                              }
                            }
                          }}
                          placeholder="Escribe y presiona Enter o +" />
                        <button type="button"
                          onClick={() => {
                            const w = genForm.nueva_palabra.trim();
                            if (w && !genForm.palabras_obligatorias.includes(w)) {
                              setGenForm(p => ({
                                ...p,
                                palabras_obligatorias: [...p.palabras_obligatorias, w],
                                nueva_palabra: '',
                              }));
                            }
                          }}
                          className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition font-bold">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {genForm.palabras_obligatorias.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {genForm.palabras_obligatorias.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-semibold text-emerald-700">
                              {w}
                              <button type="button" onClick={() => setGenForm(p => ({
                                ...p,
                                palabras_obligatorias: p.palabras_obligatorias.filter((_, j) => j !== i),
                              }))} className="hover:text-red-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== CRUCIGRAMA: Customization ===== */}
                {genForm.tipo === 'crucigrama' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Palabras horizontales</label>
                        <div className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_horizontales: Math.max(1, p.num_horizontales - 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-bold">−</button>
                          <span className="text-lg font-bold text-purple-600 w-8 text-center">{genForm.num_horizontales}</span>
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_horizontales: Math.min(12, p.num_horizontales + 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-bold">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Palabras verticales</label>
                        <div className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_verticales: Math.max(1, p.num_verticales - 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-bold">−</button>
                          <span className="text-lg font-bold text-purple-600 w-8 text-center">{genForm.num_verticales}</span>
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_verticales: Math.min(12, p.num_verticales + 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-bold">+</button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Total: <span className="font-bold text-purple-600">{genForm.num_horizontales + genForm.num_verticales}</span> palabras en el crucigrama
                    </p>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Palabras obligatorias <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-2">Estas palabras aparecerán sí o sí en el crucigrama. El resto las genera la IA.</p>
                      <div className="flex gap-2 mb-2">
                        <input type="text" className="input-field flex-1"
                          value={genForm.nueva_palabra_cruc}
                          onChange={e => setGenForm(p => ({ ...p, nueva_palabra_cruc: e.target.value.toUpperCase() }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const w = genForm.nueva_palabra_cruc.trim();
                              if (w && !genForm.palabras_obligatorias_cruc.includes(w)) {
                                setGenForm(p => ({
                                  ...p,
                                  palabras_obligatorias_cruc: [...p.palabras_obligatorias_cruc, w],
                                  nueva_palabra_cruc: '',
                                }));
                              }
                            }
                          }}
                          placeholder="Escribe y presiona Enter o +" />
                        <button type="button"
                          onClick={() => {
                            const w = genForm.nueva_palabra_cruc.trim();
                            if (w && !genForm.palabras_obligatorias_cruc.includes(w)) {
                              setGenForm(p => ({
                                ...p,
                                palabras_obligatorias_cruc: [...p.palabras_obligatorias_cruc, w],
                                nueva_palabra_cruc: '',
                              }));
                            }
                          }}
                          className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition font-bold">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {genForm.palabras_obligatorias_cruc.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {genForm.palabras_obligatorias_cruc.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-full text-xs font-semibold text-purple-700">
                              {w}
                              <button type="button" onClick={() => setGenForm(p => ({
                                ...p,
                                palabras_obligatorias_cruc: p.palabras_obligatorias_cruc.filter((_, j) => j !== i),
                              }))} className="hover:text-red-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== EMPAREJAR: Customization ===== */}
                {genForm.tipo === 'emparejar' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de pares</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min="3" max="12" value={genForm.num_pares}
                          onChange={e => setGenForm(p => ({ ...p, num_pares: parseInt(e.target.value) }))}
                          className="flex-1 accent-amber-500" />
                        <span className="text-lg font-bold text-amber-600 w-8 text-center">{genForm.num_pares}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">La IA generará {genForm.num_pares} pares de conceptos para emparejar</p>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs text-amber-700">
                        <span className="font-semibold">🔗 Actividad de emparejar:</span> Se generan 2 columnas con conceptos desordenados.
                        El estudiante debe conectar cada elemento de la columna A con su correspondiente en la columna B.
                      </p>
                    </div>
                  </div>
                )}

                {/* ===== CUENTO: Customization ===== */}
                {genForm.tipo === 'cuento' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Enfoque de la moraleja <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <input type="text" className="input-field"
                        value={genForm.moraleja_tema}
                        onChange={e => setGenForm(p => ({ ...p, moraleja_tema: e.target.value }))}
                        placeholder="Ej: respeto, trabajo en equipo, honestidad, cuidado del medio ambiente..." />
                      <p className="text-xs text-gray-400 mt-1">Si lo dejas vacío, la IA elegirá una moraleja acorde al tema</p>
                    </div>
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                      <p className="text-xs text-rose-700">
                        <span className="font-semibold">📖 Generador de cuentos:</span> Se genera un cuento educativo con moraleja, personajes y
                        una ilustración generada por IA (Pollinations) que puede usarse como página para colorear.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowGenerate(false)}
                    className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={generating || !genForm.tema.trim() || (genForm.tipo === 'examen' && Object.values(genForm.distribucion).reduce((a, b) => a + b, 0) === 0)}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {generating ? 'Generando...' : 'Generar con IA'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-green-50">
                    <Send className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Asignar a Materia</h3>
                </div>
                <button onClick={() => setShowAssign(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Materia</label>
                  <select className="input-field" value={assignForm.materia_id}
                    onChange={e => setAssignForm(p => ({ ...p, materia_id: e.target.value }))}>
                    <option value="">Seleccionar materia...</option>
                    {materias.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={assignForm.activo_online}
                    onChange={e => setAssignForm(p => ({ ...p, activo_online: e.target.checked }))}
                    className="rounded border-gray-300 text-primary-600 w-4 h-4" />
                  <span className="text-sm text-gray-700">Activar para resolución online</span>
                </label>

                <div className="flex gap-3">
                  <button onClick={() => setShowAssign(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={() => handleAssign(showAssign)}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" /> Asignar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar herramienta?"
        message="Se eliminará permanentemente esta herramienta generada."
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
