import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Send, Loader2, Clock, ChevronLeft, ChevronRight, CheckCircle2,
  Circle, AlertTriangle, FileText, Award, ArrowLeft,
} from 'lucide-react';
import SopaLetras from '../../components/SopaLetras';
import Crucigrama from '../../components/Crucigrama';

const TIPO_LABELS = {
  seleccion_multiple: 'Selección Múltiple',
  verdadero_falso: 'Verdadero / Falso',
  desarrollo: 'Desarrollo',
  respuesta_corta: 'Respuesta Corta',
  completar: 'Completar',
};

const TIPO_COLORS = {
  seleccion_multiple: 'bg-blue-100 text-blue-700 border-blue-200',
  verdadero_falso: 'bg-purple-100 text-purple-700 border-purple-200',
  desarrollo: 'bg-amber-100 text-amber-700 border-amber-200',
  respuesta_corta: 'bg-teal-100 text-teal-700 border-teal-200',
  completar: 'bg-pink-100 text-pink-700 border-pink-200',
};

export default function ResolverExamen() {
  const { examenId } = useParams();
  const navigate = useNavigate();
  const [examen, setExamen] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const loadExam = async () => {
      try {
        // Check if already submitted
        const respRes = await api.get('/examenes/mis-respuestas');
        if (respRes.data.includes(examenId)) {
          toast.error('Ya enviaste respuestas para este examen');
          navigate('/estudiante');
          return;
        }

        const res = await api.get(`/examenes/${examenId}`);
        setExamen(res.data);
        if (!res.data.activo_online) {
          toast.error('Este examen no está disponible online');
          navigate('/estudiante');
        }

        // Check fecha_limite
        if (res.data.fecha_limite && new Date(res.data.fecha_limite) < new Date()) {
          toast.error('El plazo para este examen ha vencido');
          navigate('/estudiante');
        }
      } catch {
        toast.error('Examen no encontrado');
        navigate('/estudiante');
      } finally {
        setLoading(false);
      }
    };
    loadExam();
  }, [examenId]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  const updateResp = useCallback((numero, value) => {
    setRespuestas(prev => ({ ...prev, [numero]: value }));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const respuestas_formatted = Object.entries(respuestas).map(([num, resp]) => ({
        numero: parseInt(num),
        respuesta: resp,
      }));

      const res = await api.post('/examenes/responder', {
        examen_id: examenId,
        respuestas_json: { preguntas: respuestas_formatted },
      });

      if (res.data.nota) {
        const n = res.data.nota;
        const msg = n.tiene_preguntas_abiertas
          ? `¡Enviado! Nota parcial (objetivas): ${n.nota}. Preguntas abiertas pendientes de revisión.`
          : `¡Enviado y calificado! Nota: ${n.nota}`;
        toast.success(msg, { duration: 5000 });
      } else {
        toast.success('¡Respuestas enviadas exitosamente!');
      }
      navigate('/estudiante/notas');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error enviando respuestas');
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="animate-spin h-10 w-10 border-4 border-primary-500 border-t-transparent rounded-full"></div>
        <p className="text-gray-500 text-sm">Cargando examen...</p>
      </div>
    );
  }

  if (!examen) return null;

  const preguntas = examen.contenido_json?.preguntas || [];
  const totalQ = preguntas.length;
  const answered = preguntas.filter(p => respuestas[p.numero] !== undefined && respuestas[p.numero] !== '').length;
  const progress = totalQ > 0 ? (answered / totalQ) * 100 : 0;
  const currentPregunta = preguntas[currentQ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-2xl p-6 text-white mb-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <button onClick={() => navigate('/estudiante')} className="flex items-center gap-1 text-white/70 hover:text-white text-xs mb-2 transition-colors">
              <ArrowLeft className="w-3 h-3" /> Volver al inicio
            </button>
            <h1 className="text-2xl font-bold">{examen.titulo}</h1>
            {examen.fecha_limite && (
              <p className="text-primary-200 text-sm mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Fecha límite: {new Date(examen.fecha_limite).toLocaleString()}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2 backdrop-blur-sm">
              <Clock className="w-5 h-5" />
              <span className="text-xl font-mono font-bold">{formatTime(elapsed)}</span>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span>{answered} de {totalQ} respondidas</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Navigation Panel (sidebar) */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <div className="card sticky top-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Preguntas</h3>
            <div className="grid grid-cols-5 lg:grid-cols-3 gap-2">
              {preguntas.map((p, i) => {
                const isAnswered = respuestas[p.numero] !== undefined && respuestas[p.numero] !== '';
                const isCurrent = i === currentQ;
                return (
                  <button
                    key={p.numero}
                    onClick={() => setCurrentQ(i)}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all
                      ${isCurrent
                        ? 'bg-primary-600 text-white shadow-lg scale-110 ring-2 ring-primary-300'
                        : isAnswered
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                  >
                    {p.numero}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-100 border border-green-200" />
                Respondida
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-gray-100" />
                Pendiente
              </div>
            </div>
          </div>
        </div>

        {/* Main Question Area */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          {currentPregunta && (
            <div className="card border-2 border-gray-100 shadow-sm">
              {/* Question header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-700 font-bold text-lg">{currentPregunta.numero}</span>
                  </div>
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-semibold border ${TIPO_COLORS[currentPregunta.tipo] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {TIPO_LABELS[currentPregunta.tipo] || currentPregunta.tipo}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1 rounded-lg border border-amber-200">
                  <Award className="w-4 h-4" />
                  <span className="text-sm font-bold">{currentPregunta.puntos || 1} pts</span>
                </div>
              </div>

              {/* Question text */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <p className="text-gray-800 text-base leading-relaxed font-medium">
                  {currentPregunta.enunciado}
                </p>
              </div>

              {/* Answer Section */}
              <div className="space-y-3">
                {currentPregunta.tipo === 'seleccion_multiple' && currentPregunta.opciones ? (
                  currentPregunta.opciones.map((opt, j) => {
                    const isSelected = respuestas[currentPregunta.numero] === opt;
                    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
                    return (
                      <button
                        key={j}
                        onClick={() => updateResp(currentPregunta.numero, opt)}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all
                          ${isSelected
                            ? 'border-primary-500 bg-primary-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0
                          ${isSelected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {letters[j] || (j + 1)}
                        </div>
                        <span className={`text-sm ${isSelected ? 'text-primary-800 font-medium' : 'text-gray-700'}`}>
                          {opt}
                        </span>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-primary-600 ml-auto shrink-0" />}
                      </button>
                    );
                  })
                ) : currentPregunta.tipo === 'verdadero_falso' ? (
                  <div className="grid grid-cols-2 gap-4">
                    {['Verdadero', 'Falso'].map(opt => {
                      const isSelected = respuestas[currentPregunta.numero] === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => updateResp(currentPregunta.numero, opt)}
                          className={`p-5 rounded-xl border-2 font-semibold text-center transition-all
                            ${isSelected
                              ? opt === 'Verdadero'
                                ? 'border-green-500 bg-green-50 text-green-700 shadow-md'
                                : 'border-red-500 bg-red-50 text-red-700 shadow-md'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          <div className="text-3xl mb-1">{opt === 'Verdadero' ? '✓' : '✗'}</div>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : currentPregunta.tipo === 'desarrollo' ? (
                  <textarea
                    className="input-field h-40 resize-y text-sm"
                    value={respuestas[currentPregunta.numero] || ''}
                    onChange={e => updateResp(currentPregunta.numero, e.target.value)}
                    placeholder="Escribe tu respuesta detallada aquí..."
                  />
                ) : (
                  <input
                    type="text"
                    className="input-field text-sm"
                    value={respuestas[currentPregunta.numero] || ''}
                    onChange={e => updateResp(currentPregunta.numero, e.target.value)}
                    placeholder="Escribe tu respuesta..."
                  />
                )}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
                  disabled={currentQ === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    disabled:opacity-30 disabled:cursor-not-allowed
                    text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>

                <span className="text-sm text-gray-400">
                  {currentQ + 1} / {totalQ}
                </span>

                {currentQ < totalQ - 1 ? (
                  <button
                    onClick={() => setCurrentQ(currentQ + 1)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                      bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={answered === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold
                      bg-green-600 text-white hover:bg-green-700 transition-colors
                      disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                  >
                    <Send className="w-4 h-4" /> Enviar Examen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Word Search */}
      {examen.contenido_json?.sopa_letras?.grid && (
        <div className="card mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            🔍 Sopa de Letras
          </h2>
          <SopaLetras
            grid={examen.contenido_json.sopa_letras.grid}
            palabras={examen.contenido_json.sopa_letras.palabras || []}
            onComplete={(foundWords) => {
              updateResp('sopa_letras', foundWords.join(', '));
              toast.success('¡Encontraste todas las palabras! 🎉');
            }}
          />
        </div>
      )}

      {/* Interactive Crossword */}
      {examen.contenido_json?.crucigrama?.grid && (
        <div className="card mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            🧩 Crucigrama
          </h2>
          <Crucigrama
            crucigrama={examen.contenido_json.crucigrama}
            onComplete={(userGrid) => {
              updateResp('crucigrama', JSON.stringify(userGrid));
              toast.success('¡Crucigrama completado! 🎉');
            }}
          />
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">¿Enviar examen?</h3>
              <p className="text-gray-500 text-sm mt-2">
                Has respondido <span className="font-bold text-primary-600">{answered}</span> de <span className="font-bold">{totalQ}</span> preguntas.
                {answered < totalQ && (
                  <span className="text-amber-600 block mt-1">
                    ⚠️ Hay {totalQ - answered} pregunta(s) sin responder.
                  </span>
                )}
              </p>
              <p className="text-gray-400 text-xs mt-2">
                Tiempo: {formatTime(elapsed)}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                Revisar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Confirmar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
