import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { FileText, ToggleLeft, ToggleRight, Trash2, Download, Eye, Award, X, FileSearch, Edit3, ClipboardCheck, BookOpen } from 'lucide-react';
import { format } from 'date-fns';

export default function ProfesorExamenes() {
  const { materiaId } = useParams();
  const [examenes, setExamenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState({ show: false, url: null, title: '', withAnswers: false });
  const [answersModal, setAnswersModal] = useState({ show: false, data: null, titulo: '' });
  const [editModal, setEditModal] = useState({ show: false, examen: null });

  const fetchExamenes = () => {
    api.get(`/examenes/materia/${materiaId}`)
      .then(res => setExamenes(res.data))
      .catch(() => toast.error('Error cargando exámenes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchExamenes(); }, [materiaId]);

  const toggleOnline = async (examenId) => {
    try {
      const res = await api.patch(`/examenes/${examenId}/toggle-online`);
      toast.success(res.data.activo_online ? 'Examen activado online' : 'Examen desactivado');
      fetchExamenes();
    } catch {
      toast.error('Error');
    }
  };

  const deleteExamen = async (examenId) => {
    if (!confirm('¿Eliminar este examen?')) return;
    try {
      await api.delete(`/examenes/${examenId}`);
      toast.success('Examen eliminado');
      fetchExamenes();
    } catch {
      toast.error('Error');
    }
  };

  const downloadPdf = async (examenId, withAnswers) => {
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
    } catch {
      toast.error('Error descargando PDF');
    }
  };

  const openPreview = async (examenId, titulo, withAnswers = false) => {
    try {
      const url = `/generate/exam/${examenId}/preview?include_answers=${withAnswers}`;
      const res = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPreview({ show: true, url: blobUrl, title: titulo, withAnswers });
    } catch {
      toast.error('Error cargando vista previa');
    }
  };

  const closePreview = () => {
    if (preview.url) URL.revokeObjectURL(preview.url);
    setPreview({ show: false, url: null, title: '', withAnswers: false });
  };

  const openAnswers = async (examenId, titulo) => {
    try {
      const res = await api.get(`/generate/exam/${examenId}/answers`);
      setAnswersModal({ show: true, data: res.data, titulo });
    } catch {
      toast.error('Error cargando respuestas');
    }
  };

  const openEdit = (examen) => {
    setEditModal({ show: true, examen: { ...examen } });
  };

  const saveEdit = async () => {
    const ex = editModal.examen;
    try {
      await api.patch(`/examenes/${ex.id}`, {
        titulo: ex.titulo,
        activo_online: ex.activo_online,
        fecha_limite: ex.fecha_limite,
      });
      toast.success('Examen actualizado');
      setEditModal({ show: false, examen: null });
      fetchExamenes();
    } catch {
      toast.error('Error actualizando examen');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Exámenes</h1>
        <Link to={`/profesor/generar/${materiaId}`} className="btn-primary flex items-center gap-2">
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
            <div key={ex.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{ex.titulo}</h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                  <span>{ex.tipo || 'Generado'}</span>
                  <span>•</span>
                  <span>{format(new Date(ex.created_at), 'dd/MM/yyyy')}</span>
                  {ex.fecha_limite && (
                    <>
                      <span>•</span>
                      <span>Límite: {format(new Date(ex.fecha_limite), 'dd/MM/yyyy HH:mm')}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {/* Toggle online */}
                <button onClick={() => toggleOnline(ex.id)} title={ex.activo_online ? 'Desactivar online' : 'Activar online'}
                  className={`p-2 rounded-lg transition ${ex.activo_online ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 bg-gray-50 hover:bg-gray-100'}`}>
                  {ex.activo_online ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                {/* Vista previa PDF */}
                <button onClick={() => openPreview(ex.id, ex.titulo, true)}
                  title="Vista previa PDF"
                  className="p-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition">
                  <FileSearch className="w-5 h-5" />
                </button>
                {/* Ver respuestas */}
                <button onClick={() => openAnswers(ex.id, ex.titulo)}
                  title="Ver respuestas"
                  className="p-2 rounded-lg text-cyan-600 bg-cyan-50 hover:bg-cyan-100 transition">
                  <BookOpen className="w-5 h-5" />
                </button>
                {/* Descargar PDF completo */}
                <button onClick={() => downloadPdf(ex.id, true)} title="Descargar PDF (con respuestas)"
                  className="p-2 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 transition">
                  <Download className="w-5 h-5" />
                </button>
                {/* Descargar PDF estudiante */}
                <button onClick={() => downloadPdf(ex.id, false)} title="Descargar PDF estudiante"
                  className="p-2 rounded-lg text-purple-600 bg-purple-50 hover:bg-purple-100 transition">
                  <Eye className="w-5 h-5" />
                </button>
                {/* Editar examen */}
                <button onClick={() => openEdit(ex)} title="Editar examen"
                  className="p-2 rounded-lg text-orange-600 bg-orange-50 hover:bg-orange-100 transition">
                  <Edit3 className="w-5 h-5" />
                </button>
                {/* Calificar */}
                <Link to={`/profesor/calificar/${ex.id}`} title="Calificar entregas"
                  className="p-2 rounded-lg text-amber-600 bg-amber-50 hover:bg-amber-100 transition">
                  <ClipboardCheck className="w-5 h-5" />
                </Link>
                {/* Ver notas */}
                <Link to={`/profesor/notas/${ex.id}`} title="Ver notas y métricas"
                  className="p-2 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition">
                  <Award className="w-5 h-5" />
                </Link>
                {/* Eliminar */}
                <button onClick={() => deleteExamen(ex.id)} title="Eliminar examen"
                  className="p-2 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF Preview Modal */}
      {preview.show && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-violet-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <FileSearch className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{preview.title}</h2>
                  <p className="text-xs text-gray-500">
                    Vista previa del documento {preview.withAnswers ? '(con respuestas)' : '(versión estudiante)'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    closePreview();
                    openPreview(
                      examenes.find(e => e.titulo === preview.title)?.id,
                      preview.title,
                      !preview.withAnswers
                    );
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition">
                  {preview.withAnswers ? 'Ver sin respuestas' : 'Ver con respuestas'}
                </button>
                <button onClick={closePreview}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-gray-100">
              <iframe
                src={preview.url}
                className="w-full h-full border-0"
                title="Vista previa del examen"
              />
            </div>
          </div>
        </div>
      )}

      {/* Answers Modal */}
      {answersModal.show && answersModal.data && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-cyan-50 to-blue-50">
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
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {answersModal.data.clave_respuestas && Object.entries(answersModal.data.clave_respuestas).length > 0 ? (
                Object.entries(answersModal.data.clave_respuestas).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                      {key}
                    </span>
                    <span className="text-gray-800 pt-1">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No hay clave de respuestas disponible para este examen.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal.show && editModal.examen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Edit3 className="w-5 h-5 text-orange-600" />
                </div>
                <h2 className="font-semibold text-gray-900">Editar Examen</h2>
              </div>
              <button onClick={() => setEditModal({ show: false, examen: null })}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input type="text" value={editModal.examen.titulo}
                  onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, titulo: e.target.value } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite</label>
                <input type="datetime-local" value={editModal.examen.fecha_limite ? editModal.examen.fecha_limite.slice(0, 16) : ''}
                  onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, fecha_limite: e.target.value || null } }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="editOnline" checked={editModal.examen.activo_online || false}
                  onChange={e => setEditModal(prev => ({ ...prev, examen: { ...prev.examen, activo_online: e.target.checked } }))}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="editOnline" className="text-sm font-medium text-gray-700">Activo online</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditModal({ show: false, examen: null })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                  Cancelar
                </button>
                <button onClick={saveEdit}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
