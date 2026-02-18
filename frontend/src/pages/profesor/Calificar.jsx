import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Upload, Loader2, CheckCircle, Monitor, Camera,
  User, Clock, Award, ChevronRight, RefreshCw,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';

/* ─── Tab Button ─── */
function Tab({ active, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl border-b-2 transition-all
        ${active
          ? 'border-indigo-600 text-indigo-700 bg-white shadow-sm'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

/* ─── Grading Result Card ─── */
function ResultCard({ result }) {
  if (!result) return null;
  return (
    <div className="card mt-6 animate-fadeIn">
      <h2 className="font-semibold text-gray-900 mb-4">Resultado</h2>
      <div className="flex items-center gap-4 mb-4">
        <div className="text-4xl font-extrabold text-indigo-600">{result.nota}</div>
        <div className="text-sm text-gray-400">/ {result.detalle_json?.nota_maxima || 5.0}</div>
      </div>

      {result.detalle_json?.preguntas && (
        <div className="space-y-2">
          {result.detalle_json.preguntas.map((p, i) => (
            <div key={i} className={`p-3 rounded-lg border ${p.correcto
              ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Pregunta {p.numero}</span>
                <span className={`text-sm font-bold ${p.correcto ? 'text-emerald-700' : 'text-red-700'}`}>
                  {p.nota}/{p.nota_maxima}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{p.retroalimentacion}</p>
            </div>
          ))}
        </div>
      )}

      {result.retroalimentacion && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-blue-800 mb-1">Retroalimentación General</h3>
          <p className="text-xs text-blue-700 whitespace-pre-line">{result.retroalimentacion}</p>
        </div>
      )}
    </div>
  );
}

/* ═════════════  MAIN COMPONENT  ═════════════ */
export default function Calificar() {
  const { examenId } = useParams();
  const [tab, setTab] = useState('online');       // 'online' | 'ocr'
  const [students, setStudents] = useState([]);
  const [examTitle, setExamTitle] = useState('');

  // OCR state
  const [selectedStudent, setSelectedStudent] = useState('');
  const [file, setFile] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);

  // Online grading state
  const [submissions, setSubmissions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [gradingId, setGradingId] = useState(null);   // currently grading student id
  const [onlineResult, setOnlineResult] = useState(null);

  /* Load exam info + students */
  useEffect(() => {
    api.get(`/examenes/${examenId}`).then(async (res) => {
      setExamTitle(res.data.titulo);
      const materiaId = res.data.materia_id;
      const sRes = await api.get(`/materias/${materiaId}/estudiantes`);
      setStudents(sRes.data);
    }).catch(() => toast.error('Error cargando información del examen'));
  }, [examenId]);

  /* Load online submissions */
  const loadSubmissions = useCallback(async () => {
    setSubsLoading(true);
    try {
      const res = await api.get(`/examenes/${examenId}/respuestas-online`);
      setSubmissions(res.data);
    } catch {
      toast.error('Error cargando envíos online');
    } finally {
      setSubsLoading(false);
    }
  }, [examenId]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  /* ─── OCR Upload ─── */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDrop: (files) => setFile(files[0]),
  });

  const handleOcrSubmit = async () => {
    if (!selectedStudent || !file) {
      toast.error('Selecciona un estudiante y sube un archivo');
      return;
    }
    setOcrLoading(true);
    setOcrResult(null);
    try {
      const fd = new FormData();
      fd.append('examen_id', examenId);
      fd.append('estudiante_id', selectedStudent);
      fd.append('file', file);
      const res = await api.post('/grading/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setOcrResult(res.data);
      toast.success('Examen calificado exitosamente');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error calificando');
    } finally {
      setOcrLoading(false);
    }
  };

  /* ─── Online Grading ─── */
  const handleGradeOnline = async (estudianteId) => {
    setGradingId(estudianteId);
    setOnlineResult(null);
    try {
      const res = await api.post(`/grading/grade-online/${examenId}/${estudianteId}`);
      setOnlineResult(res.data);
      toast.success('Respuesta calificada con IA');
      loadSubmissions();  // refresh graded status
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al calificar');
    } finally {
      setGradingId(null);
    }
  };

  const handleGradeAll = async () => {
    const pending = submissions.filter(s => !s.ya_calificado);
    if (!pending.length) { toast.error('Todas las respuestas ya están calificadas'); return; }
    for (const sub of pending) {
      setGradingId(sub.estudiante_id);
      try {
        await api.post(`/grading/grade-online/${examenId}/${sub.estudiante_id}`);
      } catch { /* continue */ }
    }
    setGradingId(null);
    toast.success(`${pending.length} respuestas calificadas`);
    loadSubmissions();
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  };

  /* ═════════ RENDER ═════════ */
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calificación Automática</h1>
        {examTitle && <p className="text-sm text-gray-500 mt-1">{examTitle}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <Tab active={tab === 'online'} icon={Monitor} label="Envíos Online" onClick={() => setTab('online')} />
        <Tab active={tab === 'ocr'} icon={Camera} label="OCR (Imagen)" onClick={() => setTab('ocr')} />
      </div>

      {/* ──── TAB: Online Submissions ──── */}
      {tab === 'online' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">{submissions.length}</span> respuestas recibidas
              {submissions.filter(s => s.ya_calificado).length > 0 && (
                <span className="ml-2 text-emerald-600 font-medium">
                  ({submissions.filter(s => s.ya_calificado).length} calificadas)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={loadSubmissions} disabled={subsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                <RefreshCw className={`w-3.5 h-3.5 ${subsLoading ? 'animate-spin' : ''}`} /> Actualizar
              </button>
              {submissions.some(s => !s.ya_calificado) && (<>
                <button onClick={handleGradeAll} disabled={!!gradingId}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition disabled:opacity-60">
                  <Award className="w-3.5 h-3.5" /> Calificar Todas
                </button>
                <span className="text-[10px] text-gray-400 hidden md:inline self-center">Obj. automáticas · Abiertas con IA</span>
              </>)}
            </div>
          </div>

          {/* Submissions list */}
          {subsLoading && !submissions.length ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando envíos...
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aún no hay envíos online para este examen</p>
              <p className="text-xs mt-1">Los estudiantes pueden responder si el examen está activo online</p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => (
                <div key={sub.id}
                  className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:shadow-sm transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      ${sub.ya_calificado ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{sub.estudiante_nombre}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span>{sub.estudiante_documento}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {fmtDate(sub.enviado_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    {sub.ya_calificado ? (
                      <div className="flex items-center gap-2">
                        {sub.nota != null && (
                          <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">
                            {sub.nota}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {sub.tiene_preguntas_abiertas ? 'Parcial' : 'Calificado'}
                        </span>
                        {sub.tiene_preguntas_abiertas && (
                          <button onClick={() => handleGradeOnline(sub.estudiante_id)}
                            disabled={!!gradingId}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 rounded-lg border border-violet-200 hover:bg-violet-100 transition disabled:opacity-60">
                            <ChevronRight className="w-3 h-3" /> Re-calificar con IA
                          </button>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => handleGradeOnline(sub.estudiante_id)}
                        disabled={!!gradingId}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition disabled:opacity-60">
                        {gradingId === sub.estudiante_id ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calificando...</>
                        ) : (
                          <><ChevronRight className="w-3.5 h-3.5" /> Calificar</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Online result */}
          <ResultCard result={onlineResult} />
        </div>
      )}

      {/* ──── TAB: OCR (Image Upload) ──── */}
      {tab === 'ocr' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estudiante</label>
              <select className="input-field" value={selectedStudent}
                onChange={e => setSelectedStudent(e.target.value)}>
                <option value="">Seleccionar estudiante...</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre} {s.apellido} - {s.documento}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imagen del examen</label>
              <div {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'}`}>
                <input {...getInputProps()} />
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                {file ? (
                  <p className="text-sm text-indigo-600 font-medium">{file.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">
                    Arrastra una imagen o haz clic para seleccionar
                    <br /><span className="text-xs">JPG, PNG o PDF (máx 10MB)</span>
                  </p>
                )}
              </div>
            </div>

            <button onClick={handleOcrSubmit} disabled={ocrLoading || !selectedStudent || !file}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {ocrLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Procesando OCR + Calificación...</>
              ) : (
                <><CheckCircle className="w-5 h-5" /> Calificar</>
              )}
            </button>
          </div>

          <ResultCard result={ocrResult} />
        </div>
      )}
    </div>
  );
}
