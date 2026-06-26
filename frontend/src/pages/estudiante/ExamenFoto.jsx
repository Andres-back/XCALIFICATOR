import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Camera, Upload, CheckCircle, Clock, AlertCircle,
  FileImage, ArrowLeft, RefreshCw, XCircle,
} from 'lucide-react';

const POLL_INTERVAL = 3000;

function EstadoBadge({ estado }) {
  const map = {
    queued:     { label: 'En cola',      color: 'bg-gray-100 text-gray-700',   icon: Clock },
    processing: { label: 'Calificando…', color: 'bg-blue-100 text-blue-700',   icon: RefreshCw },
    success:    { label: 'Calificado',   color: 'bg-green-100 text-green-700', icon: CheckCircle },
    error:      { label: 'Error',        color: 'bg-red-100 text-red-700',     icon: XCircle },
  };
  const cfg = map[estado] || map.queued;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

function ResultadoPregunta({ p }) {
  return (
    <div className={`p-4 rounded-xl border ${p.correcto ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-sm font-semibold text-gray-800">Pregunta {p.numero}</span>
        <span className={`text-sm font-bold shrink-0 ${p.correcto ? 'text-green-700' : 'text-red-700'}`}>
          {p.nota?.toFixed(1)} / {p.nota_maxima?.toFixed(1)}
        </span>
      </div>
      <div className="space-y-1 text-xs text-gray-600">
        <p><span className="font-medium">Respuesta:</span> {p.respuesta_estudiante || <em className="text-gray-400">no legible</em>}</p>
        {!p.correcto && <p><span className="font-medium">Correcta:</span> {p.respuesta_correcta}</p>}
        {p.retroalimentacion && <p className="text-gray-500 mt-1 italic">{p.retroalimentacion}</p>}
      </div>
    </div>
  );
}

export default function EstudianteExamenFoto() {
  const { examenId } = useParams();
  const navigate = useNavigate();

  const [examen, setExamen] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const fetchExamen = useCallback(async () => {
    try {
      const res = await api.get(`/examenes/${examenId}`);
      setExamen(res.data);
    } catch {
      toast.error('No se pudo cargar el examen');
      navigate('/estudiante');
    }
  }, [examenId, navigate]);

  const fetchEstado = useCallback(async () => {
    try {
      const res = await api.get(`/grading/mi-examen-foto/estado/${examenId}`);
      setJob(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [examenId]);

  useEffect(() => {
    const init = async () => {
      await fetchExamen();
      const j = await fetchEstado();
      setLoading(false);
      if (j && (j.estado === 'queued' || j.estado === 'processing')) {
        startPolling();
      }
    };
    init();
    return () => clearInterval(pollRef.current);
  }, []);

  const startPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const j = await fetchEstado();
      if (j?.estado === 'success' || j?.estado === 'error') {
        clearInterval(pollRef.current);
      }
    }, POLL_INTERVAL);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('examen_id', examenId);
      form.append('file', file);
      const res = await api.post('/grading/mi-examen-foto', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setJob(res.data);
      setFile(null);
      setPreview(null);
      toast.success('Foto enviada. Calificando...');
      startPolling();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al enviar la foto');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  const notaData = job?.result_json?.nota;
  const detalle = notaData?.detalle_json || {};
  const preguntas = detalle.preguntas || [];
  const notaTotal = detalle.nota_total;
  const notaMaxima = detalle.nota_maxima;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/estudiante')}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{examen?.titulo}</h1>
          <p className="text-sm text-gray-500">Entrega de examen físico</p>
        </div>
      </div>

      {/* Estado de entrega anterior */}
      {job && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Estado de tu entrega</span>
            <EstadoBadge estado={job.estado} />
          </div>

          {(job.estado === 'queued' || job.estado === 'processing') && (
            <div className="flex items-center gap-3 text-sm text-blue-600 bg-blue-50 p-3 rounded-xl">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>El modelo de visión está leyendo y calificando tu examen…</span>
            </div>
          )}

          {job.estado === 'error' && (
            <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{job.error_message || 'Ocurrió un error al procesar tu examen. Inténtalo de nuevo.'}</span>
            </div>
          )}

          {job.estado === 'success' && notaData && (
            <div className="space-y-4">
              {/* Nota global */}
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-primary-600 mb-1">
                  {notaTotal != null ? notaTotal.toFixed(1) : '—'}
                </div>
                <div className="text-sm text-gray-500">
                  de {notaMaxima != null ? notaMaxima.toFixed(1) : '—'} puntos
                </div>
              </div>

              {/* Por pregunta */}
              {preguntas.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalle por pregunta</p>
                  {preguntas.map((p, i) => <ResultadoPregunta key={i} p={p} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload área — solo si no hay un job exitoso */}
      {(!job || job.estado === 'error') && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            {job?.estado === 'error' ? 'Volver a intentar' : 'Subir foto del examen'}
          </h2>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors"
          >
            {preview ? (
              <img src={preview} alt="Vista previa" className="max-h-64 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="space-y-2">
                <div className="flex justify-center">
                  <FileImage className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-600">Arrastra tu foto aquí o toca para seleccionar</p>
                <p className="text-xs text-gray-400">JPG, PNG o PDF — máx 10MB</p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg,application/pdf"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex gap-3">
            {/* Botón cámara */}
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute('capture', 'environment');
                  fileInputRef.current.click();
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Camera className="w-4 h-4" />
              Cámara
            </button>

            {/* Botón subir */}
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.click();
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Galería / PDF
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Enviando…' : 'Enviar examen'}
          </button>
        </div>
      )}

      {/* Instrucciones */}
      {!job && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
          <p className="font-semibold">Consejos para una buena foto:</p>
          <ul className="space-y-1 text-amber-700 list-disc list-inside">
            <li>Asegúrate de que las respuestas sean legibles.</li>
            <li>Fotografía sobre una superficie plana, con buena iluminación.</li>
            <li>Incluye todas las hojas del examen (puedes subir un PDF).</li>
          </ul>
        </div>
      )}
    </div>
  );
}
