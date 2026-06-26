import { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Upload, Loader2, CheckCircle, Monitor, Camera,
  User, Clock, Award, ChevronRight, RefreshCw, AlertTriangle,
  FileText,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import MathText from '../../components/MathText';

/* â"€â"€â"€ Tab Button â"€â"€â"€ */
function Tab({ active, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex shrink-0 items-center gap-2 px-4 sm:px-5 py-3 text-sm font-semibold rounded-t-xl border-b-2 transition-all
        ${active
          ? 'border-profesor-600 text-profesor-700 bg-white shadow-sm dark:bg-gray-900 dark:text-profesor-300'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

/* â"€â"€â"€ Grading Result Card â"€â"€â"€ */
function ResultCard({ result }) {
  if (!result) return null;

  const requiereRevision = result.detalle_json?.requiere_revision_profesor;
  const ocrQuality      = result.detalle_json?.ocr_quality;
  const ocrMotivo       = result.detalle_json?.motivo_revision || result.detalle_json?.ocr_motivo;
  const textoPreview    = result.detalle_json?.texto_extraido_preview || result.texto_extraido;

  return (
    <div className="card mt-6 animate-fade-up">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Resultado</h2>

      {/* â"€â"€ LOW confidence: review required â"€â"€ */}
      {requiereRevision && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex gap-3 dark:bg-amber-950/30 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Segunda valoración requerida</p>
            {ocrMotivo && (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{ocrMotivo}</p>
            )}
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
              La nota quedó <strong>pendiente</strong>. Revisa el texto extraído abajo y
              califica manualmente desde la pestaña <em>Notas</em>.
            </p>
          </div>
        </div>
      )}

      {/* â"€â"€ MEDIUM confidence: soft warning â"€â"€ */}
      {!requiereRevision && ocrQuality === 'media' && (
        <div className="mb-4 p-2.5 bg-yellow-50 border border-yellow-200 rounded-xl flex gap-2 dark:bg-yellow-950/30 dark:border-yellow-800">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            {ocrMotivo || 'Confianza OCR media — se recomienda verificar la calificación'}
          </p>
        </div>
      )}

      {/* â"€â"€ Grade display (only when not pending review) â"€â"€ */}
      {requiereRevision ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic mb-3">Nota pendiente de revisión manual</p>
      ) : (
        <div className="flex items-center gap-4 mb-4">
          <div className="text-4xl font-extrabold text-profesor-600 dark:text-profesor-400">{result.nota}</div>
          <div className="text-sm text-gray-400 dark:text-gray-500">/ {result.detalle_json?.nota_maxima || 5.0}</div>
        </div>
      )}

      {/* â"€â"€ Per-question breakdown â"€â"€ */}
      {!requiereRevision && result.detalle_json?.preguntas && (
        <div className="space-y-2">
          {result.detalle_json.preguntas.map((p, i) => (
            <div key={i} className={`p-3 rounded-lg border ${p.correcto
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
              : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Pregunta {p.numero}</span>
                <span className={`text-sm font-bold ${p.correcto ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                  {p.nota}/{p.nota_maxima}
                </span>
              </div>
              <MathText text={p.retroalimentacion} className="text-xs text-gray-600 dark:text-gray-300 mt-1" />
            </div>
          ))}
        </div>
      )}

      {/* â"€â"€ General feedback (only when graded) â"€â"€ */}
      {!requiereRevision && result.retroalimentacion && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Retroalimentación General</h3>
          <MathText text={result.retroalimentacion} className="text-xs text-blue-700 dark:text-blue-300 whitespace-pre-line" />
        </div>
      )}

      {/* â"€â"€ Extracted text preview (always shown so professor can verify) â"€â"€ */}
      {textoPreview && (
        <details className="mt-4">
          <summary className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200">
            Ver texto extraído por Visión
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-950 rounded-lg text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap border border-gray-200 dark:border-gray-800 max-h-48 overflow-y-auto">
            {textoPreview}
          </pre>
        </details>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•  MAIN COMPONENT  â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ResultCardV2({ result }) {
  const [resultTab, setResultTab] = useState('sheet');
  if (!result) return null;

  const requiereRevision = result.detalle_json?.requiere_revision_profesor;
  const ocrQuality = result.detalle_json?.ocr_quality;
  const ocrMotivo = result.detalle_json?.motivo_revision || result.detalle_json?.ocr_motivo;
  const textoPreview = result.texto_extraido || result.detalle_json?.texto_extraido_preview;
  const preguntas = result.detalle_json?.preguntas || [];
  const sheetUrl = result.imagen_procesada_url;
  const isPdf = String(sheetUrl || '').toLowerCase().endsWith('.pdf');

  return (
    <div className="card mt-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Resultado</h2>
        <div className="flex overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 p-1 bg-gray-50 dark:bg-gray-950">
          {[
            ['sheet', 'Hoja original'],
            ['answers', 'Respuestas detectadas'],
            ['grade', 'Calificación'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setResultTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                resultTab === key
                  ? 'bg-white dark:bg-gray-900 text-profesor-700 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {requiereRevision && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex gap-3 dark:bg-amber-950/30 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Segunda valoración requerida</p>
            {ocrMotivo && <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{ocrMotivo}</p>}
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
              La nota quedó pendiente. Revisa la hoja y califica manualmente desde Notas.
            </p>
          </div>
        </div>
      )}

      {!requiereRevision && ocrQuality === 'media' && (
        <div className="mb-4 p-2.5 bg-yellow-50 border border-yellow-200 rounded-xl flex gap-2 dark:bg-yellow-950/30 dark:border-yellow-800">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            {ocrMotivo || 'Confianza Visión media. Se recomienda verificar la calificación.'}
          </p>
        </div>
      )}

      {resultTab === 'sheet' && (
        <div className="space-y-3">
          {sheetUrl ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-950">
              {isPdf ? (
                <div className="p-4">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Archivo PDF subido</p>
                  <a href={sheetUrl} target="_blank" rel="noreferrer" className="text-sm text-profesor-600 underline">
                    Abrir hoja original
                  </a>
                </div>
              ) : (
                <a href={sheetUrl} target="_blank" rel="noreferrer" className="block">
                  <img src={sheetUrl} alt="Hoja original del estudiante" className="max-h-[520px] w-full object-contain bg-white" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay hoja original asociada al resultado.</p>
          )}
          {textoPreview && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Texto Visión</p>
              <pre className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap border border-gray-200 dark:border-gray-800 max-h-64 overflow-y-auto">
                {textoPreview}
              </pre>
            </div>
          )}
        </div>
      )}

      {resultTab === 'answers' && (
        <div className="space-y-2">
          {preguntas.length ? preguntas.map((p, i) => (
            <div key={i} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <p className="font-medium text-sm text-gray-900 dark:text-gray-100">Pregunta {p.numero}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                {p.respuesta_estudiante || p.respuesta || p.retroalimentacion || 'Sin respuesta detectada.'}
              </p>
            </div>
          )) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay respuestas detectadas en el resultado.</p>
          )}
        </div>
      )}

      {resultTab === 'grade' && (
        <div>
          {requiereRevision ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic mb-3">Nota pendiente de revisión manual</p>
          ) : (
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl font-extrabold text-profesor-600 dark:text-profesor-400">{result.nota}</div>
              <div className="text-sm text-gray-400 dark:text-gray-500">/ {result.detalle_json?.nota_maxima || 5.0}</div>
            </div>
          )}
          {preguntas.length > 0 && (
            <div className="space-y-2">
              {preguntas.map((p, i) => (
                <div key={i} className={`p-3 rounded-lg border ${p.correcto
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                  : p.pendiente
                    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                    : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Pregunta {p.numero}</span>
                    <span className={`text-sm font-bold ${p.correcto ? 'text-emerald-700 dark:text-emerald-400' : p.pendiente ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                      {p.nota}/{p.nota_maxima}
                    </span>
                  </div>
                  <MathText text={p.retroalimentacion} className="text-xs text-gray-600 dark:text-gray-300 mt-1" />
                </div>
              ))}
            </div>
          )}
          {!requiereRevision && result.retroalimentacion && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Retroalimentación General</h3>
              <MathText text={result.retroalimentacion} className="text-xs text-blue-700 dark:text-blue-300 whitespace-pre-line" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilePreview({ file, previewUrl }) {
  if (!file || !previewUrl) return (
    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
      Sube una imagen o PDF para ver la hoja original.
    </div>
  );
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return (
      <iframe
        src={previewUrl}
        title="Hoja original PDF"
        className="h-[520px] w-full rounded-xl border border-gray-200 bg-white"
      />
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <img src={previewUrl} alt="Hoja original" className="max-h-[520px] w-full object-contain rounded-lg" />
    </div>
  );
}

function DetectedAnswers({ result }) {
  const preguntas = result?.detalle_json?.preguntas || [];
  const texto = result?.texto_extraido || result?.detalle_json?.texto_extraido_preview;

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
        Procesa la hoja para ver las respuestas detectadas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {preguntas.length > 0 ? (
        <div className="space-y-2">
          {preguntas.map((p, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-800">Pregunta {p.numero}</span>
                <span className="text-xs font-bold text-profesor-700">{p.nota}/{p.nota_maxima}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
                {p.respuesta_estudiante || p.respuesta || p.retroalimentacion || 'Sin respuesta detectada.'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No se recibió desglose por pregunta. Revisa el texto extraído completo.
        </div>
      )}
      {texto && (
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Texto extraído (Visión)</p>
          <pre className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
            {texto}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Calificar() {
  const { examenId } = useParams();
  const location = useLocation();
  const defaultTab = location.pathname.includes('/calificar/imagenes') ? 'vision' : 'online';
  const [tab, setTab] = useState(defaultTab);       // 'online' | 'vision'
  const [students, setStudents] = useState([]);
  const [examTitle, setExamTitle] = useState('');

  // OCR state
  const [selectedStudent, setSelectedStudent] = useState('');
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [ocrPanelTab, setOcrPanelTab] = useState('original');
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrJobs, setOcrJobs] = useState([]);
  const ocrLoading = ocrJobs.some(job => job.status === 'queued' || job.status === 'processing');

  // Manual grade state
  const [selectedJobStudentId, setSelectedJobStudentId] = useState('');
  const [manualNota, setManualNota] = useState('');
  const [manualRetro, setManualRetro] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // Online grading state
  const [submissions, setSubmissions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [gradingId, setGradingId] = useState(null);   // currently grading student id
  const [onlineResult, setOnlineResult] = useState(null);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

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

  /* â"€â"€â"€ OCR Upload â"€â"€â"€ */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDrop: (files) => {
      setFile(files[0]);
      setOcrResult(null);
      setOcrPanelTab('original');
    },
  });

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const normalizeOcrJob = useCallback((job) => ({
    id: job.id,
    studentId: job.estudiante_id,
    studentName: job.estudiante_nombre || 'Estudiante',
    fileName: job.filename,
    status: job.estado,
    error: job.error_message,
    result: job.result_json?.nota || null,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  }), []);

  const loadOcrJobs = useCallback(async ({ silent = true } = {}) => {
    try {
      const res = await api.get(`/grading/jobs/${examenId}`);
      const jobs = res.data.map(normalizeOcrJob);
      setOcrJobs(jobs);
      const newestSuccess = jobs.find(job => job.status === 'success' && job.result);
      if (newestSuccess) {
        setOcrResult(newestSuccess.result);
        setSelectedJobStudentId(newestSuccess.studentId);
      }
      return jobs;
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.detail || 'Error cargando cola OCR');
      return [];
    }
  }, [examenId, normalizeOcrJob]);

  useEffect(() => {
    if (tab === 'vision') loadOcrJobs();
  }, [loadOcrJobs, tab]);

  useEffect(() => {
    if (tab !== 'vision' || !ocrJobs.some(job => job.status === 'queued' || job.status === 'processing')) {
      return undefined;
    }
    const timer = window.setInterval(async () => {
      const jobs = await loadOcrJobs();
      if (jobs.some(job => job.status === 'success' && job.result)) {
        setOcrPanelTab('detected');
        loadSubmissions();
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadOcrJobs, loadSubmissions, ocrJobs, tab]);

  const handleOcrSubmit = async () => {
    if (!selectedStudent || !file) {
      toast.error('Selecciona un estudiante y sube un archivo');
      return;
    }
    const student = students.find(s => s.id === selectedStudent);
    const studentName = student
      ? `${student.nombre || ''} ${student.apellido || ''}`.trim() || student.documento || 'Estudiante'
      : 'Estudiante';
    try {
      const fd = new FormData();
      fd.append('examen_id', examenId);
      fd.append('estudiante_id', selectedStudent);
      fd.append('file', file);
      const res = await api.post('/grading/upload-job', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setOcrJobs(prev => [normalizeOcrJob(res.data), ...prev.filter(job => job.id !== res.data.id)].slice(0, 50));
      setSelectedStudent('');
      setFile(null);
      setOcrResult(null);
      setOcrPanelTab('original');
      toast.success(`${studentName} agregado a la cola`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error agregando a cola OCR');
    }
  };

  const handleSaveManual = async () => {
    const notaVal = parseFloat(manualNota);
    if (isNaN(notaVal) || notaVal < 0 || notaVal > 5) {
      toast.error('Ingresa una nota entre 0 y 5');
      return;
    }
    if (!selectedJobStudentId) {
      toast.error('No hay estudiante asociado al resultado');
      return;
    }
    setSavingManual(true);
    try {
      await api.post('/grading/manual', {
        examen_id: examenId,
        estudiante_id: selectedJobStudentId,
        nota: notaVal,
        retroalimentacion: manualRetro,
      });
      toast.success('Nota manual guardada');
      setOcrResult(prev => ({
        ...prev,
        nota: notaVal,
        detalle_json: { ...prev?.detalle_json, requiere_revision_profesor: false },
      }));
      setManualNota('');
      setManualRetro('');
      loadSubmissions();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando nota');
    } finally {
      setSavingManual(false);
    }
  };

  const retryOcrJob = async (job) => {
    try {
      const res = await api.post(`/grading/jobs/${job.id}/retry`);
      setOcrJobs(prev => prev.map(item => item.id === job.id ? normalizeOcrJob(res.data) : item));
      toast.success(`${job.studentName} reintentado`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo reintentar');
    }
  };

  /* â"€â"€â"€ Online Grading â"€â"€â"€ */
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
    let ok = 0;
    const failed = [];
    for (const sub of pending) {
      setGradingId(sub.estudiante_id);
      try {
        await api.post(`/grading/grade-online/${examenId}/${sub.estudiante_id}`);
        ok++;
      } catch (err) {
        failed.push(sub.estudiante_nombre || sub.estudiante_id);
      }
    }
    setGradingId(null);
    if (failed.length === 0) {
      toast.success(`${ok} ${ok === 1 ? 'respuesta calificada' : 'respuestas calificadas'} ✓`);
    } else if (ok > 0) {
      toast(`${ok} calificadas, ${failed.length} con error: ${failed.join(', ')}`, { icon: '⚠️' });
    } else {
      toast.error(`No se pudo calificar ninguna respuesta`);
    }
    loadSubmissions();
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  };

  /* â•â•â•â•â•â•â•â•â• RENDER â•â•â•â•â•â•â•â•â• */
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Calificación Automática</h1>
        {examTitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{examTitle}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 mb-6">
        <Tab active={tab === 'online'} icon={Monitor} label="Envíos Online" onClick={() => setTab('online')} />
        <Tab active={tab === 'vision'} icon={Camera} label="Visión (Imagen)" onClick={() => setTab('vision')} />
      </div>

      {/* â"€â"€â"€â"€ TAB: Online Submissions â"€â"€â"€â"€ */}
      {tab === 'online' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold">{submissions.length}</span> respuestas recibidas
              {submissions.filter(s => s.ya_calificado).length > 0 && (
                <span className="ml-2 text-emerald-600 font-medium">
                  ({submissions.filter(s => s.ya_calificado).length} calificadas)
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={loadSubmissions} disabled={subsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                <RefreshCw className={`w-3.5 h-3.5 ${subsLoading ? 'animate-spin' : ''}`} /> Actualizar
              </button>
              {submissions.some(s => !s.ya_calificado) && (<>
                <button onClick={handleGradeAll} disabled={!!gradingId}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-profesor-600 rounded-lg hover:bg-profesor-700 transition disabled:opacity-60">
                  <Award className="w-3.5 h-3.5" /> Calificar Todas
                </button>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden md:inline self-center">Obj. automáticas · Abiertas con IA</span>
              </>)}
            </div>
          </div>

          {/* Submissions list */}
          {subsLoading && !submissions.length ? (
            <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando envíos...
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Aún no hay envíos online para este examen</p>
              <p className="text-xs mt-1">Los estudiantes pueden responder si el examen está activo online</p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => (
                <div key={sub.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                      ${sub.requiere_revision ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : sub.ya_calificado   ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'}`}>
                      {sub.requiere_revision ? <AlertTriangle className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{sub.estudiante_nombre}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>{sub.estudiante_documento}</span>
                        {sub.tipo_entrega === 'ocr_presencial' && (
                          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <Camera className="w-3 h-3" /> OCR presencial
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {fmtDate(sub.enviado_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex justify-end">
                    {sub.requiere_revision ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg border border-amber-300 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5" /> Revisar Visión
                      </span>
                    ) : sub.ya_calificado ? (
                      <div className="flex items-center gap-2">
                        {sub.nota != null && (
                          <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg dark:text-indigo-300 dark:bg-indigo-900/30">
                            {sub.nota}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {sub.tiene_preguntas_abiertas ? 'Parcial' : 'Calificado'}
                        </span>
                        {sub.tiene_preguntas_abiertas && (
                          <button onClick={() => handleGradeOnline(sub.estudiante_id)}
                            disabled={!!gradingId}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 rounded-lg border border-violet-200 hover:bg-violet-100 transition disabled:opacity-60 dark:text-violet-300 dark:bg-violet-900/30 dark:border-violet-800 dark:hover:bg-violet-900/50">
                            <ChevronRight className="w-3 h-3" /> Re-calificar con IA
                          </button>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => handleGradeOnline(sub.estudiante_id)}
                        disabled={!!gradingId}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-profesor-600 rounded-lg hover:bg-profesor-700 transition disabled:opacity-60">
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

      {/* TAB: Vision (Image Upload) */}
      {tab === 'vision' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200">
              Calificación por Visión: el modelo de visión analiza la imagen de la hoja y califica automáticamente.
              <br />
              Sube la foto de la hoja del estudiante. Puede incluir solo respuestas: <b>5 R/ B</b>, <b>5 R: B</b> o también pregunta + respuesta.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estudiante</label>
              <select className="input-field" value={selectedStudent}
                onChange={e => setSelectedStudent(e.target.value)}>
                <option value="">Seleccionar estudiante...</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre} {s.apellido} - {s.documento}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imagen del examen</label>
              <div {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}>
                <input {...getInputProps({ capture: 'environment' })} />
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                {file ? (
                  <p className="text-sm text-profesor-600 font-medium">{file.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">
                    Toma una foto, arrastra una imagen o haz clic para seleccionar
                    <br /><span className="text-xs">JPG, PNG o PDF (máx 10MB)</span>
                  </p>
                )}
              </div>
            </div>

            <button onClick={handleOcrSubmit} disabled={!selectedStudent || !file}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {ocrLoading ? (
                <><CheckCircle className="w-5 h-5" /> Agregar otra foto a la cola</>
              ) : (
                <><CheckCircle className="w-5 h-5" /> Agregar a cola y continuar</>
              )}
            </button>

            {ocrJobs.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Cola de calificación Visión</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Puedes cambiar de estudiante y tomar mas fotos mientras se procesan las anteriores.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOcrJobs(prev => prev.filter(job => job.status === 'queued' || job.status === 'processing'))}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Ocultar terminados
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {ocrJobs.map(job => {
                    const statusLabel = job.status === 'queued'
                      ? 'En cola'
                      : job.status === 'processing'
                        ? 'Procesando vision'
                        : job.status === 'success'
                          ? 'Calificado'
                          : 'Error';
                    return (
                      <div
                        key={job.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/60"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (job.result) {
                              setOcrResult(job.result);
                              setSelectedJobStudentId(job.studentId);
                              setOcrPanelTab('detected');
                            }
                          }}
                          className="min-w-0 text-left"
                        >
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{job.studentName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{job.fileName}</p>
                          {job.error && <p className="text-xs text-red-600 dark:text-red-300 mt-1">{job.error}</p>}
                          {job.result && <p className="text-xs text-profesor-600 mt-1">Toca para ver resultado</p>}
                        </button>
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            job.status === 'success'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : job.status === 'error'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}>
                            {job.status === 'processing' ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : job.status === 'success' ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : job.status === 'error' ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {statusLabel}
                          </div>
                          {job.status === 'error' && (
                            <button
                              type="button"
                              onClick={() => retryOcrJob(job)}
                              className="text-xs font-semibold text-profesor-700 hover:text-profesor-900"
                            >
                              Reintentar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <ResultCardV2 result={ocrResult} />

          {ocrResult?.detalle_json?.requiere_revision_profesor && selectedJobStudentId && (
            <div className="card mt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Calificación Manual</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                La Visión no pudo calificar automáticamente. Ingresa la nota después de revisar la hoja.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nota (0 – 5)</label>
                  <input
                    type="number" min="0" max="5" step="0.1"
                    value={manualNota} onChange={e => setManualNota(e.target.value)}
                    className="input-field w-36" placeholder="Ej: 3.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Retroalimentacion</label>
                  <textarea
                    rows={3} value={manualRetro} onChange={e => setManualRetro(e.target.value)}
                    className="input-field w-full resize-none" placeholder="Comentarios para el estudiante..."
                  />
                </div>
                <button
                  onClick={handleSaveManual}
                  disabled={savingManual || !manualNota}
                  className="btn-primary flex items-center gap-2 disabled:opacity-60"
                >
                  {savingManual
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                    : <><CheckCircle className="w-4 h-4" /> Guardar nota manual</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

