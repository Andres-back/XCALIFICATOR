import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { FileText, Upload, ToggleLeft, ToggleRight, Trash2, Download, Eye, Award, X, FileSearch } from 'lucide-react';
import { format } from 'date-fns';

export default function ProfesorExamenes() {
  const { materiaId } = useParams();
  const [examenes, setExamenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState({ show: false, url: null, title: '', withAnswers: false });

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
              <div className="flex items-center gap-2">
                <button onClick={() => toggleOnline(ex.id)} title="Activar/Desactivar online"
                  className={`p-2 rounded-lg ${ex.activo_online ? 'text-green-600 bg-green-50' : 'text-gray-400 bg-gray-50'}`}>
                  {ex.activo_online ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => openPreview(ex.id, ex.titulo, true)}
                  title="Vista previa"
                  className="p-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition">
                  <FileSearch className="w-5 h-5" />
                </button>
                <button onClick={() => downloadPdf(ex.id, true)} title="Descargar PDF con respuestas"
                  className="p-2 rounded-lg text-blue-600 bg-blue-50">
                  <Download className="w-5 h-5" />
                </button>
                <button onClick={() => downloadPdf(ex.id, false)} title="Descargar PDF estudiante"
                  className="p-2 rounded-lg text-purple-600 bg-purple-50">
                  <Eye className="w-5 h-5" />
                </button>
                <Link to={`/profesor/calificar/${ex.id}`} title="Calificar"
                  className="p-2 rounded-lg text-amber-600 bg-amber-50">
                  <Upload className="w-5 h-5" />
                </Link>
                <Link to={`/profesor/notas/${ex.id}`} title="Ver notas"
                  className="p-2 rounded-lg text-emerald-600 bg-emerald-50">
                  <Award className="w-5 h-5" />
                </Link>
                <button onClick={() => deleteExamen(ex.id)} title="Eliminar"
                  className="p-2 rounded-lg text-red-600 bg-red-50">
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
            {/* Modal Header */}
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
            {/* PDF Embed */}
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
    </div>
  );
}
