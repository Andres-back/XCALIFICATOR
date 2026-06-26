import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  FileText, ToggleLeft, ToggleRight, Trash2, Download, Award, X,
  FileSearch, Edit3, ClipboardCheck, BookOpen, Calendar, ChevronDown,
  ChevronUp, Plus, Minus, Save, Loader2, Camera,
} from 'lucide-react';
import { format } from 'date-fns';
import MathText from '../../components/MathText';

const TIPO_LABELS = {
  examen:       'Examen',
  crucigrama:   'Crucigrama',
  sopa_letras:  'Sopa de Letras',
  emparejar:    'Emparejar',
  cuento:       'Cuento',
  para_colorear:'Para Colorear',
  tarea_registrada: 'Tarea registrada',
};

const TIPO_COLORS = {
  examen:       { border: 'border-l-indigo-500',  badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  crucigrama:   { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  sopa_letras:  { border: 'border-l-violet-500',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  emparejar:    { border: 'border-l-orange-500',  badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  cuento:       { border: 'border-l-pink-500',    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  para_colorear:{ border: 'border-l-yellow-500',  badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  tarea_registrada: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
};

export default function ProfesorExamenes({ materiaId: propMateriaId, embedded = false }) {
  const params = useParams();
  const materiaId = propMateriaId || params.materiaId;
  const [examenes, setExamenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState({ show: false, url: null, title: '', withAnswers: false, examenId: null });
  const [answersModal, setAnswersModal] = useState({ show: false, data: null, titulo: '' });
  const [editModal, setEditModal] = useState({ show: false, examen: null, saving: false });
  const [downloadMenu, setDownloadMenu] = useState(null);
  const [registerModal, setRegisterModal] = useState({ show: false, titulo: '', notaMaxima: '5.0', criterios: '', saving: false });

  const fetchExamenes = () => {
    api.get(`/examenes/materia/${materiaId}`)
      .then(res => setExamenes(res.data))
      .catch(() => toast.error('Error cargando exámenes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchExamenes(); }, [materiaId]);

  /* Close download menu on outside click */
  useEffect(() => {
    if (!downloadMenu) return;
    const handler = () => setDownloadMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [downloadMenu]);

  const toggleOnline = async (examenId) => {
    try {
      const res = await api.patch(`/examenes/${examenId}/toggle-online`);
      toast.success(res.data.activo_online ? 'Examen activado online' : 'Examen desactivado');
      fetchExamenes();
    } catch { toast.error('Error'); }
  };

  const deleteExamen = async (examenId) => {
    if (!confirm('¿Eliminar este examen?')) return;
    try {
      await api.delete(`/examenes/${examenId}`);
      toast.success('Examen eliminado');
      fetchExamenes();
    } catch { toast.error('Error'); }
  };

  const registrarExamen = async () => {
    if (!registerModal.titulo.trim() || !registerModal.criterios.trim()) {
      toast.error('Escribe nombre y criterios');
      return;
    }
    const notaMaxima = parseFloat(registerModal.notaMaxima);
    if (!Number.isFinite(notaMaxima) || notaMaxima <= 0 || notaMaxima > 10) {
      toast.error('La nota maxima debe estar entre 0.1 y 10');
      return;
    }
    setRegisterModal((prev) => ({ ...prev, saving: true }));
    try {
      await api.post(`/examenes/registrar?materia_id=${materiaId}`, {
        titulo: registerModal.titulo.trim(),
        nota_maxima: notaMaxima,
        criterios: registerModal.criterios.trim(),
      });
      toast.success('Examen registrado');
      setRegisterModal({ show: false, titulo: '', notaMaxima: '5.0', criterios: '', saving: false });
      fetchExamenes();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error registrando examen');
      setRegisterModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const downloadPdf = async (examenId, withAnswers) => {
    setDownloadMenu(null);
    try {
      const url = withAnswers
        ? `/generate/exam/${examenId}/pdf?include_answers=true`
        : `/generate/exam/${examenId}/pdf-student`;
      const res = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `examen_${examenId}${withAnswers ? '_respuestas' : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch { toast.error('Error descargando PDF'); }
  };

  const openPreview = async (examenId, titulo, withAnswers = false) => {
    try {
      const url = `/generate/exam/${examenId}/preview?include_answers=${withAnswers}`;
      const res = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPreview({ show: true, url: blobUrl, title: titulo, withAnswers, examenId });
    } catch { toast.error('Error cargando vista previa'); }
  };

  const closePreview = () => {
    if (preview.url) URL.revokeObjectURL(preview.url);
    setPreview({ show: false, url: null, title: '', withAnswers: false, examenId: null });
  };

  const openAnswers = async (examenId, titulo) => {
    try {
      const res = await api.get(`/generate/exam/${examenId}/answers`);
      setAnswersModal({ show: true, data: res.data, titulo });
    } catch { toast.error('Error cargando respuestas'); }
  };

  /* ── Full‑content edit: load contenido_json + clave_respuestas ── */
  const openEdit = async (examen) => {
    try {
      const res = await api.get(`/generate/exam/${examen.id}/answers`);
      const d = res.data;
      const preguntas = (d.contenido_json?.preguntas || []).map(p => {
        const c = (d.clave_respuestas?.preguntas || []).find(c => c.numero === p.numero);
        return {
          ...p,
          enunciado: p.enunciado || p.pregunta || p.texto || p.statement || '',
          respuesta_correcta: c?.respuesta_correcta || '',
          puntos: c?.puntos || 1.0,
        };
      });
      setEditModal({
        show: true, saving: false,
        examen: { id: examen.id, titulo: examen.titulo, fecha_limite: examen.fecha_limite,
          fecha_activacion: examen.fecha_activacion || null, activo_online: examen.activo_online,
          preguntas, sopa_letras: d.contenido_json?.sopa_letras || null,
          crucigrama: d.contenido_json?.crucigrama || null },
      });
    } catch {
      setEditModal({
        show: true, saving: false,
        examen: { id: examen.id, titulo: examen.titulo, fecha_limite: examen.fecha_limite,
          fecha_activacion: examen.fecha_activacion || null, activo_online: examen.activo_online,
          preguntas: [], sopa_letras: null, crucigrama: null },
      });
    }
  };

  /* Edit helpers */
  const updatePregunta = (idx, field, value) => {
    setEditModal(prev => {
      const preguntas = [...prev.examen.preguntas];
      preguntas[idx] = { ...preguntas[idx], [field]: value };
      return { ...prev, examen: { ...prev.examen, preguntas } };
    });
  };
  const updateOpcion = (pIdx, oIdx, value) => {
    setEditModal(prev => {
      const preguntas = [...prev.examen.preguntas];
      const opciones = [...(preguntas[pIdx].opciones || [])];
      opciones[oIdx] = value;
      preguntas[pIdx] = { ...preguntas[pIdx], opciones };
      return { ...prev, examen: { ...prev.examen, preguntas } };
    });
  };
  const addOpcion = (pIdx) => {
    setEditModal(prev => {
      const preguntas = [...prev.examen.preguntas];
      preguntas[pIdx] = { ...preguntas[pIdx], opciones: [...(preguntas[pIdx].opciones || []), ''] };
      return { ...prev, examen: { ...prev.examen, preguntas } };
    });
  };
  const removeOpcion = (pIdx, oIdx) => {
    setEditModal(prev => {
      const preguntas = [...prev.examen.preguntas];
      preguntas[pIdx] = { ...preguntas[pIdx], opciones: (preguntas[pIdx].opciones || []).filter((_, i) => i !== oIdx) };
      return { ...prev, examen: { ...prev.examen, preguntas } };
    });
  };
  const setPreguntaImage = (pIdx, asset) => {
    setEditModal(prev => {
      const preguntas = [...prev.examen.preguntas];
      preguntas[pIdx] = {
        ...preguntas[pIdx],
        image_url: asset?.url || '',
        image_prompt: asset?.image_prompt || preguntas[pIdx].image_prompt || '',
        image_type: asset?.image_type || '',
        image_alt: asset?.image_alt || '',
      };
      return { ...prev, examen: { ...prev.examen, preguntas } };
    });
  };
  const uploadPreguntaImage = async (pIdx, file) => {
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await api.post('/uploads/question-image', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreguntaImage(pIdx, res.data);
      toast.success('Imagen agregada a la pregunta');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo subir la imagen');
    }
  };
  const generatePreguntaImage = async (pIdx, mode) => {
    const p = editModal.examen.preguntas[pIdx];
    const prompt = window.prompt(
      mode === 'illustration'
        ? 'Describe la ilustración educativa que quieres crear'
        : 'Describe la gráfica, figura o diagrama que quieres crear',
      p.image_prompt || p.enunciado || p.pregunta || ''
    );
    if (!prompt) return;
    try {
      const res = await api.post('/ai/images/generate', { prompt, mode });
      setPreguntaImage(pIdx, res.data);
      toast.success(mode === 'illustration' ? 'Ilustración generada' : 'Diagrama generado');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo generar la imagen');
    }
  };
  const updateSopaPalabra = (idx, value) => {
    setEditModal(prev => {
      const palabras = [...(prev.examen.sopa_letras?.palabras || [])];
      palabras[idx] = value.toUpperCase();
      return { ...prev, examen: { ...prev.examen, sopa_letras: { ...prev.examen.sopa_letras, palabras } } };
    });
  };

  const saveEdit = async () => {
    const ex = editModal.examen;
    setEditModal(prev => ({ ...prev, saving: true }));
    try {
      const preguntas_limpio = ex.preguntas.map(({ respuesta_correcta, puntos, ...rest }) => {
        const enunciado = (rest.enunciado || rest.pregunta || '').trim();
        return {
          ...rest,
          enunciado,
          pregunta: enunciado,
        };
      });
      const clave_preguntas = ex.preguntas.map(p => ({
        numero: p.numero, respuesta_correcta: p.respuesta_correcta || '', puntos: parseFloat(p.puntos) || 1.0,
      }));
      const contenido_json = { preguntas: preguntas_limpio };
      if (ex.sopa_letras) contenido_json.sopa_letras = ex.sopa_letras;
      if (ex.crucigrama) contenido_json.crucigrama = ex.crucigrama;

      await api.patch(`/examenes/${ex.id}`, {
        titulo: ex.titulo, activo_online: ex.activo_online,
        fecha_limite: ex.fecha_limite || null,
        fecha_activacion: ex.fecha_activacion || null,
        contenido_json, clave_respuestas: { preguntas: clave_preguntas },
      });
      toast.success('Examen actualizado');
      setEditModal({ show: false, examen: null, saving: false });
      fetchExamenes();
    } catch {
      toast.error('Error actualizando examen');
      setEditModal(prev => ({ ...prev, saving: false }));
    }
  };

  if (loading) return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="skeleton h-7 w-32 rounded-lg" />
          <div className="skeleton h-9 w-36 rounded-lg" />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-5 w-48 rounded" />
                <div className="skeleton h-3 w-32 rounded" />
              </div>
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
            <div className="skeleton h-px w-full" />
            <div className="flex gap-2">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="skeleton h-8 w-20 rounded-lg" />
              <div className="skeleton h-8 w-20 rounded-lg" />
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
      {/* Header — hidden when embedded */}
      {!embedded && (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Exámenes</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRegisterModal((prev) => ({ ...prev, show: true }))}
            className="btn-secondary flex items-center gap-2 text-sm">
            <ClipboardCheck className="w-4 h-4" /> Registrar Examen
          </button>
          <Link to={`/profesor/generar/${materiaId}`} className="btn-primary flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4" /> Generar Examen
          </Link>
        </div>
      </div>
      )}

      {embedded && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button type="button" onClick={() => setRegisterModal((prev) => ({ ...prev, show: true }))}
            className="btn-secondary flex items-center gap-2 text-sm">
            <ClipboardCheck className="w-4 h-4" /> Registrar Examen
          </button>
          <Link to={`/profesor/generar/${materiaId}`} className="btn-primary flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4" /> Generar Examen
          </Link>
        </div>
      )}

      {examenes.length === 0 ? (
        <div className="card text-center py-14">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="font-semibold text-gray-700 mb-1">No hay exámenes todavía</p>
          <p className="text-sm text-gray-500 mb-5">Genera tu primer examen con inteligencia artificial en segundos</p>
          <div className="flex justify-center gap-2 flex-wrap">
            <button type="button" onClick={() => setRegisterModal((prev) => ({ ...prev, show: true }))}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-50 transition shadow-sm">
              <ClipboardCheck className="w-4 h-4" /> Registrar Examen
            </button>
            <Link to={`/profesor/generar/${materiaId}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-sm">
              <FileText className="w-4 h-4" /> Generar Examen con IA
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {examenes.map(ex => {
            const tc = TIPO_COLORS[ex.tipo] || TIPO_COLORS.examen;
            return (
              <div key={ex.id} className={`card hover:shadow-xl transition-all duration-200 overflow-hidden border-l-4 ${tc.border}`}>

                {/* Header: título + toggle online */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-snug">{ex.titulo}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold ${tc.badge}`}>
                        {TIPO_LABELS[ex.tipo] || ex.tipo || 'Generado'}
                      </span>
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        Creado el {format(new Date(ex.created_at), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  </div>
                  {/* Toggle online — botón con texto */}
                  <button onClick={() => toggleOnline(ex.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition shrink-0
                      ${ex.activo_online
                        ? 'text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
                        : 'text-gray-500 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}>
                    {ex.activo_online ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    <span className="hidden sm:inline">{ex.activo_online ? 'Online ✓' : 'Activar'}</span>
                  </button>
                </div>

                {/* Fechas */}
                {(ex.fecha_limite || (ex.fecha_activacion && new Date(ex.fecha_activacion) > new Date())) && (
                  <div className="flex flex-wrap gap-2 mb-3 text-sm">
                    {ex.fecha_limite && (
                      <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg font-semibold">
                        <Calendar className="w-4 h-4 shrink-0" /> Límite: {format(new Date(ex.fecha_limite), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                    {ex.fecha_activacion && new Date(ex.fecha_activacion) > new Date() && (
                      <span className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-lg font-semibold">
                        Programado: {format(new Date(ex.fecha_activacion), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                  </div>
                )}

                {/* Botones de acción — 2 cols en móvil, 3 en tablet+ */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={() => openPreview(ex.id, ex.titulo, false)}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40 transition active:scale-95">
                    <FileSearch className="w-6 h-6" />
                    <span className="text-sm font-bold">Ver PDF</span>
                  </button>

                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setDownloadMenu(downloadMenu === ex.id ? null : ex.id); }}
                      className="w-full flex flex-col items-center gap-2 py-4 rounded-xl text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40 transition active:scale-95">
                      <Download className="w-6 h-6" />
                      <span className="text-sm font-bold">Descargar</span>
                    </button>
                    {downloadMenu === ex.id && (
                      <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-30 py-1">
                        <button onClick={() => downloadPdf(ex.id, false)}
                          className="w-full text-left px-4 py-3 text-base text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" /> Sin respuestas
                        </button>
                        <button onClick={() => downloadPdf(ex.id, true)}
                          className="w-full text-left px-4 py-3 text-base text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-gray-400" /> Con respuestas
                        </button>
                      </div>
                    )}
                  </div>

                  <button onClick={() => openEdit(ex)}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/40 transition active:scale-95">
                    <Edit3 className="w-6 h-6" />
                    <span className="text-sm font-bold">Editar</span>
                  </button>

                  <Link to={`/profesor/calificar/${ex.id}`}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40 transition active:scale-95">
                    <ClipboardCheck className="w-6 h-6" />
                    <span className="text-sm font-bold">Calificar</span>
                  </Link>

                  <Link to={`/profesor/calificar/imagenes/${ex.id}`}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl text-cyan-600 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/40 transition active:scale-95">
                    <Camera className="w-6 h-6" />
                    <span className="text-sm font-bold">Por foto</span>
                  </Link>

                  <Link to={`/profesor/notas/${ex.id}`}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40 transition active:scale-95">
                    <Award className="w-6 h-6" />
                    <span className="text-sm font-bold">Ver notas</span>
                  </Link>
                </div>

                {/* Eliminar — zona peligrosa al fondo */}
                <button onClick={() => deleteExamen(ex.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 mt-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-red-400 transition text-base font-semibold border border-transparent hover:border-red-200 dark:hover:border-red-800/40">
                  <Trash2 className="w-5 h-5" />
                  Eliminar examen
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ PDF Preview Modal ═══ */}
      {registerModal.show && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Registrar Examen</h2>
                <p className="text-xs text-gray-500">Crea una actividad para calificar luego por foto.</p>
              </div>
              <button onClick={() => setRegisterModal({ show: false, titulo: '', notaMaxima: '5.0', criterios: '', saving: false })}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del examen o tarea</label>
                <input className="input-field" value={registerModal.titulo}
                  onChange={(e) => setRegisterModal((prev) => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Taller estados de la materia" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nota maxima</label>
                <input type="number" min="0.1" max="10" step="0.1" className="input-field w-32"
                  value={registerModal.notaMaxima}
                  onChange={(e) => setRegisterModal((prev) => ({ ...prev, notaMaxima: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Que se evalua / criterios</label>
                <textarea rows={5} className="input-field resize-none" value={registerModal.criterios}
                  onChange={(e) => setRegisterModal((prev) => ({ ...prev, criterios: e.target.value }))}
                  placeholder="Describe que debe revisar la IA: procedimiento, respuestas correctas, orden, explicacion, ortografia, etc." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRegisterModal({ show: false, titulo: '', notaMaxima: '5.0', criterios: '', saving: false })}>Cancelar</button>
              <button type="button" className="btn-primary flex items-center gap-2" disabled={registerModal.saving} onClick={registrarExamen}>
                {registerModal.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {preview.show && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[95vh] sm:h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-violet-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <FileSearch className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{preview.title}</h2>
                  <p className="text-xs text-gray-500">{preview.withAnswers ? 'Con respuestas' : 'Versión estudiante'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { closePreview(); openPreview(preview.examenId, preview.title, !preview.withAnswers); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition hidden sm:block">
                  {preview.withAnswers ? 'Sin respuestas' : 'Con respuestas'}
                </button>
                <button onClick={closePreview} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100">
              <iframe src={preview.url} className="w-full h-full border-0" title="Vista previa" />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Answers Modal (improved) ═══ */}
      {answersModal.show && answersModal.data && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-cyan-50 to-blue-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Clave de Respuestas</h2>
                  <p className="text-xs text-gray-500">{answersModal.titulo}</p>
                </div>
              </div>
              <button onClick={() => setAnswersModal({ show: false, data: null, titulo: '' })}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {(() => {
                const preguntas = answersModal.data.contenido_json?.preguntas || [];
                const clave = answersModal.data.clave_respuestas;
                const claveList = clave?.preguntas || (Array.isArray(clave) ? clave : []);
                const claveMap = {};
                claveList.forEach(c => { if (c?.numero) claveMap[c.numero] = c; });

                if (preguntas.length === 0 && claveList.length === 0) {
                  return <p className="text-gray-500 text-center py-8">No hay respuestas disponibles.</p>;
                }

                return preguntas.length > 0 ? preguntas.map((p, i) => {
                  const c = claveMap[p.numero];
                  return (
                    <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-start gap-3 p-4 bg-gray-50">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                          {p.numero}
                        </span>
                        <div className="flex-1 min-w-0">
                          <MathText text={p.enunciado || p.pregunta || 'Sin enunciado'} className="text-sm text-gray-800 font-medium" />
                          <span className="text-xs text-gray-400 mt-1">{p.tipo} · {c?.puntos || p.puntos || 1} pts</span>
                        </div>
                      </div>
                      <div className="px-4 py-3 bg-green-50 border-t border-green-100">
                        <p className="text-xs font-semibold text-green-700 mb-0.5">Respuesta correcta:</p>
                        <MathText text={c?.respuesta_correcta || '—'} className="text-sm text-green-800" />
                      </div>
                      {p.opciones && p.opciones.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 space-y-1">
                          {p.opciones.map((opt, j) => (
                            <MathText key={j} text={opt} className={`text-xs ${c?.respuesta_correcta && opt.includes(c.respuesta_correcta) ? 'text-green-700 font-semibold' : 'text-gray-600'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }) : claveList.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">{c.numero}</span>
                    <div>
                      <MathText text={c.respuesta_correcta} className="text-sm text-gray-800" />
                      <p className="text-xs text-gray-400">{c.puntos} pts</p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Edit Modal (full content editing) ═══ */}
      {editModal.show && editModal.examen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Edit3 className="w-5 h-5 text-orange-600" />
                </div>
                <h2 className="font-semibold text-gray-900">Editar Examen</h2>
              </div>
              <button onClick={() => setEditModal({ show: false, examen: null, saving: false })}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input type="text" value={editModal.examen.titulo}
                    onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, titulo: e.target.value } }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
                  <input type="datetime-local"
                    value={editModal.examen.fecha_limite ? editModal.examen.fecha_limite.slice(0, 16) : ''}
                    onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, fecha_limite: e.target.value || null } }))}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de activación</label>
                  <input type="datetime-local"
                    value={editModal.examen.fecha_activacion ? editModal.examen.fecha_activacion.slice(0, 16) : ''}
                    onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, fecha_activacion: e.target.value || null } }))}
                    className="input-field" />
                  <p className="text-xs text-gray-400 mt-1">El examen se activará automáticamente en esta fecha.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="editOnline" checked={editModal.examen.activo_online || false}
                  onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, activo_online: e.target.checked } }))}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="editOnline" className="text-sm font-medium text-gray-700">Activo online</label>
              </div>

              {/* Questions */}
              {editModal.examen.preguntas.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Preguntas ({editModal.examen.preguntas.length})</h3>
                  <div className="space-y-4">
                    {editModal.examen.preguntas.map((p, i) => (
                      <EditPreguntaCard key={p.numero || i} pregunta={p} index={i}
                        updatePregunta={updatePregunta} updateOpcion={updateOpcion}
                        addOpcion={addOpcion} removeOpcion={removeOpcion}
                        uploadPreguntaImage={uploadPreguntaImage}
                        generatePreguntaImage={generatePreguntaImage}
                        setPreguntaImage={setPreguntaImage} />
                    ))}
                  </div>
                </div>
              )}

              {/* Sopa de letras */}
              {editModal.examen.sopa_letras && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Sopa de Letras - Palabras</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(editModal.examen.sopa_letras.palabras || []).map((w, i) => (
                      <input key={i} type="text" value={w}
                        onChange={e => updateSopaPalabra(i, e.target.value)}
                        className="input-field text-sm font-mono" />
                    ))}
                  </div>
                </div>
              )}

              {/* Crucigrama */}
              {editModal.examen.crucigrama && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Crucigrama - Pistas</h3>
                  {['pistas_horizontal', 'pistas_vertical'].map(key => {
                    const pistas = editModal.examen.crucigrama[key] || [];
                    if (!pistas.length) return null;
                    return (
                      <div key={key} className="mb-3">
                        <p className="text-xs font-medium text-gray-600 mb-1">
                          {key === 'pistas_horizontal' ? 'Horizontales' : 'Verticales'}
                        </p>
                        <div className="space-y-1">
                          {pistas.map((pista, pi) => (
                            <div key={pi} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-indigo-600 w-6">
                                {typeof pista === 'object' ? pista.numero : pi + 1}.
                              </span>
                              <input type="text"
                                value={typeof pista === 'object' ? pista.pista : pista}
                                onChange={e => {
                                  setEditModal(prev => {
                                    const crucigrama = { ...prev.examen.crucigrama };
                                    const arr = [...crucigrama[key]];
                                    arr[pi] = typeof arr[pi] === 'object'
                                      ? { ...arr[pi], pista: e.target.value } : e.target.value;
                                    crucigrama[key] = arr;
                                    return { ...prev, examen: { ...prev.examen, crucigrama } };
                                  });
                                }}
                                className="input-field text-xs flex-1" />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex justify-end gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
              <button onClick={() => setEditModal({ show: false, examen: null, saving: false })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={editModal.saving}
                className="btn-md bg-profesor-600 text-white hover:bg-profesor-700 disabled:opacity-50">
                {editModal.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Pregunta edit sub-component ── */
function EditPreguntaCard({
  pregunta,
  index,
  updatePregunta,
  updateOpcion,
  addOpcion,
  removeOpcion,
  uploadPreguntaImage,
  generatePreguntaImage,
  setPreguntaImage,
}) {
  const [open, setOpen] = useState(false);
  const p = pregunta;
  const enunciado = p.enunciado || p.pregunta || '';
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 text-left hover:bg-gray-100 transition">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
            {p.numero}
          </span>
          <span className="text-sm text-gray-800 truncate">{enunciado.slice(0, 80) || 'Sin enunciado'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{p.tipo} · {p.puntos} pts</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Enunciado</label>
            <textarea value={enunciado}
              onChange={e => updatePregunta(index, 'enunciado', e.target.value)}
              className="input-field text-sm h-20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Puntos</label>
              <input type="number" step="0.1" value={p.puntos}
                onChange={e => updatePregunta(index, 'puntos', parseFloat(e.target.value) || 0)}
                className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Respuesta correcta</label>
              <input type="text" value={p.respuesta_correcta || ''}
                onChange={e => updatePregunta(index, 'respuesta_correcta', e.target.value)}
                className="input-field text-sm w-full" />
            </div>
          </div>
          <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-xs font-bold text-blue-900">Imagen de apoyo</p>
                <p className="text-xs text-blue-700">Sube una imagen o crea un diagrama para que el estudiante entienda mejor.</p>
              </div>
              {p.image_url && (
                <button
                  type="button"
                  onClick={() => setPreguntaImage(index, null)}
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Quitar imagen
                </button>
              )}
            </div>
            {p.image_url && (
              <div className="mb-3">
                <img src={p.image_url} alt={p.image_alt || 'Imagen de pregunta'} className="max-h-44 rounded-lg border border-blue-100 bg-white object-contain" />
                <input
                  type="text"
                  value={p.image_alt || ''}
                  onChange={(e) => updatePregunta(index, 'image_alt', e.target.value)}
                  className="input-field text-xs mt-2"
                  placeholder="Descripción breve de la imagen"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="btn-secondary cursor-pointer text-xs">
                <Camera className="w-4 h-4" />
                Subir imagen
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => uploadPreguntaImage(index, e.target.files?.[0])}
                />
              </label>
              <button type="button" onClick={() => generatePreguntaImage(index, 'diagram')} className="btn-secondary text-xs">
                Crear figura
              </button>
              <button type="button" onClick={() => generatePreguntaImage(index, 'graph')} className="btn-secondary text-xs">
                Crear gráfica
              </button>
              <button type="button" onClick={() => generatePreguntaImage(index, 'illustration')} className="btn-secondary text-xs">
                Ilustración IA
              </button>
            </div>
          </div>
          {p.tipo === 'seleccion_multiple' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opciones</label>
              <div className="space-y-1.5">
                {(p.opciones || []).map((opt, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input type="text" value={opt}
                      onChange={e => updateOpcion(index, j, e.target.value)}
                      className="input-field text-sm flex-1" />
                    <button onClick={() => removeOpcion(index, j)}
                      className="p-1 text-red-400 hover:text-red-600"><Minus className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => addOpcion(index)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                  <Plus className="w-3 h-3" /> Agregar opción
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
