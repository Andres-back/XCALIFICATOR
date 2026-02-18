import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  FileText, ToggleLeft, ToggleRight, Trash2, Download, Award, X,
  FileSearch, Edit3, ClipboardCheck, BookOpen, Calendar, ChevronDown,
  ChevronUp, Plus, Minus, Save, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';

export default function ProfesorExamenes() {
  const { materiaId } = useParams();
  const [examenes, setExamenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState({ show: false, url: null, title: '', withAnswers: false, examenId: null });
  const [answersModal, setAnswersModal] = useState({ show: false, data: null, titulo: '' });
  const [editModal, setEditModal] = useState({ show: false, examen: null, saving: false });
  const [downloadMenu, setDownloadMenu] = useState(null);

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
        return { ...p, respuesta_correcta: c?.respuesta_correcta || '', puntos: c?.puntos || 1.0 };
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
      const preguntas_limpio = ex.preguntas.map(({ respuesta_correcta, puntos, ...rest }) => rest);
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

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Exámenes</h1>
        <Link to={`/profesor/generar/${materiaId}`} className="btn-primary flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4" /> Generar Examen
        </Link>
      </div>

      {examenes.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay exámenes. ¡Genera tu primer examen con IA!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {examenes.map(ex => (
            <div key={ex.id} className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{ex.titulo}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                    <span className="px-2 py-0.5 rounded bg-gray-100 font-medium">{ex.tipo || 'Generado'}</span>
                    <span>{format(new Date(ex.created_at), 'dd/MM/yyyy')}</span>
                    {ex.fecha_limite && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Límite: {format(new Date(ex.fecha_limite), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                    {ex.fecha_activacion && new Date(ex.fecha_activacion) > new Date() && (
                      <span className="text-amber-600 font-medium">
                        Programado: {format(new Date(ex.fecha_activacion), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ex.activo_online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {ex.activo_online ? 'Online' : 'Inactivo'}
                    </span>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-wrap shrink-0">
                  <button onClick={() => toggleOnline(ex.id)} title={ex.activo_online ? 'Desactivar online' : 'Activar online'}
                    className={`p-2 rounded-lg transition ${ex.activo_online ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 bg-gray-50 hover:bg-gray-100'}`}>
                    {ex.activo_online ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => openPreview(ex.id, ex.titulo, false)} title="Vista previa PDF"
                    className="p-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition">
                    <FileSearch className="w-5 h-5" />
                  </button>
                  {/* Single download button with dropdown */}
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setDownloadMenu(downloadMenu === ex.id ? null : ex.id); }}
                      title="Descargar PDF" className="p-2 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition">
                      <Download className="w-5 h-5" />
                    </button>
                    {downloadMenu === ex.id && (
                      <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-xl border border-gray-200 z-30 py-1 animate-in fade-in">
                        <button onClick={() => downloadPdf(ex.id, false)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" /> Sin respuestas
                        </button>
                        <button onClick={() => downloadPdf(ex.id, true)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-gray-400" /> Con respuestas
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => openEdit(ex)} title="Editar examen"
                    className="p-2 rounded-lg text-orange-600 bg-orange-50 hover:bg-orange-100 transition">
                    <Edit3 className="w-5 h-5" />
                  </button>
                  <Link to={`/profesor/calificar/${ex.id}`} title="Calificar entregas"
                    className="p-2 rounded-lg text-amber-600 bg-amber-50 hover:bg-amber-100 transition">
                    <ClipboardCheck className="w-5 h-5" />
                  </Link>
                  <Link to={`/profesor/notas/${ex.id}`} title="Ver notas y métricas"
                    className="p-2 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition">
                    <Award className="w-5 h-5" />
                  </Link>
                  <button onClick={() => deleteExamen(ex.id)} title="Eliminar examen"
                    className="p-2 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PDF Preview Modal ═══ */}
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
                          <p className="text-sm text-gray-800 font-medium">{p.enunciado}</p>
                          <span className="text-xs text-gray-400 mt-1">{p.tipo} · {c?.puntos || p.puntos || 1} pts</span>
                        </div>
                      </div>
                      <div className="px-4 py-3 bg-green-50 border-t border-green-100">
                        <p className="text-xs font-semibold text-green-700 mb-0.5">Respuesta correcta:</p>
                        <p className="text-sm text-green-800">{c?.respuesta_correcta || '—'}</p>
                      </div>
                      {p.opciones && p.opciones.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 space-y-1">
                          {p.opciones.map((opt, j) => (
                            <p key={j} className={`text-xs ${c?.respuesta_correcta && opt.includes(c.respuesta_correcta) ? 'text-green-700 font-semibold' : 'text-gray-600'}`}>
                              {opt}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }) : claveList.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">{c.numero}</span>
                    <div>
                      <p className="text-sm text-gray-800">{c.respuesta_correcta}</p>
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
                        addOpcion={addOpcion} removeOpcion={removeOpcion} />
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
                className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2">
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
function EditPreguntaCard({ pregunta, index, updatePregunta, updateOpcion, addOpcion, removeOpcion }) {
  const [open, setOpen] = useState(false);
  const p = pregunta;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 text-left hover:bg-gray-100 transition">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
            {p.numero}
          </span>
          <span className="text-sm text-gray-800 truncate">{p.enunciado?.slice(0, 80) || 'Sin enunciado'}</span>
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
            <textarea value={p.enunciado || ''}
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
