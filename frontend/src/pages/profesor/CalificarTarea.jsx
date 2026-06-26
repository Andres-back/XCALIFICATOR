import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Upload, Loader2, CheckCircle, AlertTriangle,
  BookOpen, User, FileText, Sparkles, ChevronRight,
} from 'lucide-react';
import MathText from '../../components/MathText';
import PageGuide from '../../components/GuidedTour';

function GradeResult({ result }) {
  if (!result) return null;
  const d = result.detalle_json || {};
  const positivos = d.aspectos_positivos || [];
  const mejorar = d.aspectos_mejorar || [];

  return (
    <div className="card mt-6 animate-fadeIn space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Resultado de Calificacion</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-extrabold text-profesor-600">{result.nota}</span>
          <span className="text-base text-gray-400">/ {d.nota_maxima ?? 5.0}</span>
        </div>
      </div>

      {result.retroalimentacion && (
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">Retroalimentacion General</p>
          <MathText text={result.retroalimentacion} className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-line" />
        </div>
      )}

      {positivos.length > 0 && (
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-2">Aspectos Positivos</p>
          <ul className="space-y-1">
            {positivos.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mejorar.length > 0 && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Por Mejorar</p>
          <ul className="space-y-1">
            {mejorar.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.texto_extraido && (
        <details>
          <summary className="text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
            Ver texto extraido por OCR
          </summary>
          <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-950 rounded-lg text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap border border-gray-200 dark:border-gray-800 max-h-48 overflow-y-auto">
            {d.texto_extraido}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function CalificarTarea() {
  const [materias, setMaterias] = useState([]);
  const [materiaId, setMateriaId] = useState('');
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [actividades, setActividades] = useState([]);
  const [actividadId, setActividadId] = useState('__manual__');
  const [titulo, setTitulo] = useState('');
  const [criterios, setCriterios] = useState('');
  const [notaMaxima, setNotaMaxima] = useState('5.0');
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/materias/mis-materias')
      .then(res => setMaterias(res.data || []))
      .catch(() => toast.error('Error cargando materias'));
  }, []);

  useEffect(() => {
    if (!materiaId) {
      setStudents([]);
      setStudentId('');
      setActividades([]);
      setActividadId('__manual__');
      return;
    }
    Promise.all([
      api.get(`/materias/${materiaId}/estudiantes`),
      api.get(`/examenes/materia/${materiaId}`),
    ])
      .then(([studRes, actRes]) => {
        setStudents(studRes.data || []);
        setActividades(actRes.data || []);
      })
      .catch(() => toast.error('Error cargando estudiantes o actividades'));
  }, [materiaId]);

  const selectedActividad = actividades.find((item) => String(item.id) === String(actividadId));
  const isManual = !selectedActividad || actividadId === '__manual__';
  const selectedActividadJson = selectedActividad?.contenido_json || {};
  const selectedCriterios = selectedActividadJson.criterios || selectedActividad?.clave_respuestas?.criterios || '';
  const selectedNotaMaxima = selectedActividadJson.nota_maxima || selectedActividad?.clave_respuestas?.nota_maxima || 5.0;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDrop: useCallback((files) => {
      setFile(files[0]);
      setResult(null);
    }, []),
  });

  useEffect(() => {
    if (!file) { setFilePreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSubmit = async () => {
    if (!materiaId || !studentId || !file) {
      toast.error('Completa todos los campos y sube la foto de la tarea');
      return;
    }
    if (isManual && !criterios.trim()) {
      toast.error('Escribe los criterios o selecciona una actividad registrada');
      return;
    }
    const nm = parseFloat(isManual ? notaMaxima : selectedNotaMaxima);
    if (isNaN(nm) || nm <= 0 || nm > 10) {
      toast.error('La nota maxima debe ser entre 0.1 y 10');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('estudiante_id', studentId);
      fd.append('materia_id', materiaId);
      if (isManual) {
        fd.append('criterios', criterios.trim());
        fd.append('titulo', titulo.trim() || 'Tarea');
        fd.append('nota_maxima', nm.toString());
      } else {
        fd.append('examen_id', selectedActividad.id);
      }
      fd.append('file', file);
      const res = await api.post('/grading/free-grade', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      toast.success('Tarea calificada con IA');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al calificar');
    } finally {
      setLoading(false);
    }
  };

  const isPdf = file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Calificar Tarea</h1>
          <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
            Selecciona una actividad, sube la foto del trabajo y la IA califica con esos criterios.
          </p>
        </div>
        <PageGuide
          storageKey="guide-profesor-calificar-tarea"
          steps={[
            { title: 'Empieza por la materia', body: 'Elige la materia y luego el estudiante. Asi el sistema sabe a quien pertenece la foto o el PDF.', selector: '[data-guide="calificar-materia"]' },
            { title: 'Elige la actividad', body: 'Escoge un examen o tarea ya registrada y se traen sus criterios. Si no existe, elige Otra tarea y escribe tu mismo como calificar.', selector: '[data-guide="calificar-actividad"]' },
            { title: 'Sube la evidencia', body: 'Toma la foto o sube el PDF del trabajo. Procura que la hoja se vea completa y clara.', selector: '[data-guide="calificar-archivo"]' },
            { title: 'Califica y revisa', body: 'Toca el boton para que la IA lea la hoja y proponga una nota con retroalimentacion. Revisala y ajustala antes de usarla en tus reportes.', selector: '[data-guide="calificar-enviar"]' },
          ]}
        />
      </div>

      <div className="card space-y-5">
        {/* Materia */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            <BookOpen className="inline w-4 h-4 mr-1.5 text-profesor-500" />Materia
          </label>
          <select data-guide="calificar-materia" className="input-field" value={materiaId} onChange={e => setMateriaId(e.target.value)}>
            <option value="">Seleccionar materia...</option>
            {materias.map(m => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>

        {/* Student */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            <User className="inline w-4 h-4 mr-1.5 text-profesor-500" />Estudiante
          </label>
          <select data-guide="calificar-estudiante" className="input-field" value={studentId} onChange={e => setStudentId(e.target.value)}
            disabled={!materiaId}>
            <option value="">
              {materiaId ? 'Seleccionar estudiante...' : 'Primero selecciona una materia'}
            </option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.nombre} {s.apellido} — {s.documento}</option>
            ))}
          </select>
        </div>

        {/* Actividad */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            <FileText className="inline w-4 h-4 mr-1.5 text-profesor-500" />Actividad a calificar
          </label>
          <select
            data-guide="calificar-actividad"
            className="input-field"
            value={actividadId}
            disabled={!materiaId}
            onChange={(e) => setActividadId(e.target.value)}
          >
            <option value="__manual__">Otra tarea</option>
            {actividades.map((act) => (
              <option key={act.id} value={act.id}>{act.titulo}</option>
            ))}
          </select>
        </div>

        {isManual ? (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <FileText className="inline w-4 h-4 mr-1.5 text-profesor-500" />Nombre de la Tarea
              </label>
              <input
                type="text" className="input-field" value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="Ej: Taller de fracciones, Ensayo sobre el agua..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Nota Maxima
              </label>
              <input
                type="number" min="1" max="10" step="0.5"
                className="input-field w-32" value={notaMaxima}
                onChange={e => setNotaMaxima(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-profesor-100 bg-profesor-50/70 p-3 text-sm text-profesor-900 dark:border-profesor-900 dark:bg-profesor-950/30 dark:text-profesor-100">
            <p className="font-semibold">{selectedActividad.titulo} · Nota maxima {selectedNotaMaxima}</p>
            {selectedCriterios && <p className="mt-1 whitespace-pre-line">{selectedCriterios}</p>}
          </div>
        )}

        {/* Criteria */}
        {isManual && <div data-guide="calificar-criterios">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              <Sparkles className="inline w-4 h-4 mr-1.5 text-violet-500" />Criterios de Calificacion
            </label>
          </div>
          <textarea
            rows={5} className="input-field w-full resize-none"
            value={criterios} onChange={e => setCriterios(e.target.value)}
            placeholder={`Describe como se debe calificar. Ejemplos:\n• Presentacion: 1 punto\n• Resolucion correcta de ejercicios: 3 puntos\n• Redaccion clara: 1 punto\n\nO simplemente: "Califica segun comprension del tema, orden y ortografia"`}
          />
          <p className="text-xs text-gray-400 mt-1">
            Entre mas detallado, mejor califica la IA. Puedes usar puntos, porcentajes o descripciones libres.
          </p>
        </div>}

        {/* File upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Foto / PDF de la Tarea del Estudiante
          </label>
          <div
            data-guide="calificar-archivo"
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${isDragActive
                ? 'border-profesor-500 bg-profesor-50 dark:bg-profesor-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}
          >
            <input {...getInputProps({ capture: 'environment' })} />
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            {file ? (
              <p className="text-sm font-semibold text-profesor-600">{file.name}</p>
            ) : (
              <p className="text-sm text-gray-500">
                Toma foto, arrastra o haz clic para seleccionar
                <br /><span className="text-xs">JPG, PNG o PDF (max 10MB)</span>
              </p>
            )}
          </div>

          {filePreviewUrl && !isPdf && (
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50">
              <img src={filePreviewUrl} alt="Vista previa" className="max-h-64 w-full object-contain" />
            </div>
          )}
          {filePreviewUrl && isPdf && (
            <div className="mt-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50">
              <p className="text-sm text-gray-600">PDF listo: <span className="font-semibold">{file.name}</span></p>
            </div>
          )}
        </div>

        <button
          data-guide="calificar-enviar"
          onClick={handleSubmit}
          disabled={loading || !materiaId || !studentId || !file || (isManual && !criterios.trim())}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-base
            bg-profesor-600 hover:bg-profesor-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Calificando con IA...</>
          ) : (
            <><ChevronRight className="w-5 h-5" /> Calificar Tarea con IA</>
          )}
        </button>
      </div>

      <div data-guide="calificar-resultado">
        <GradeResult result={result} />
      </div>
    </div>
  );
}
