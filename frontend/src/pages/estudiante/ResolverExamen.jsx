import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Send, Loader2, Clock, ChevronLeft, ChevronRight, CheckCircle2,
  Circle, AlertTriangle, FileText, Award, ArrowLeft, Users, UserPlus, X,
} from 'lucide-react';
import SopaLetras from '../../components/SopaLetras';
import Crucigrama from '../../components/Crucigrama';
import Emparejar from '../../components/Emparejar';
import Cuento from '../../components/Cuento';
import MathText from '../../components/MathText';

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

  // Group mode state
  const [grupo, setGrupo] = useState(null); // current group
  const [grupoLoading, setGrupoLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

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

        // Load group if exam is grupal
        if (res.data.modo_grupal) {
          try {
            const gRes = await api.get(`/grupos/mi-grupo/${examenId}`);
            setGrupo(gRes.data);
          } catch { /* no group yet */ }
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

  // Group mode helpers
  const createGrupo = async () => {
    setGrupoLoading(true);
    try {
      const res = await api.post(`/grupos/${examenId}`);
      setGrupo(res.data);
      toast.success('Grupo creado');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error creando grupo');
    } finally { setGrupoLoading(false); }
  };

  const inviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await api.post(`/grupos/${grupo.id}/invitar`, { email: inviteEmail.trim() });
      const gRes = await api.get(`/grupos/mi-grupo/${examenId}`);
      setGrupo(gRes.data);
      setInviteEmail('');
      setShowInvite(false);
      toast.success('Miembro agregado');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error invitando');
    }
  };

  const removeMember = async (miembroId) => {
    try {
      await api.delete(`/grupos/${grupo.id}/miembro/${miembroId}`);
      const gRes = await api.get(`/grupos/mi-grupo/${examenId}`);
      setGrupo(gRes.data);
      toast.success('Miembro removido');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const updateResp = useCallback((numero, value) => {
    setRespuestas(prev => ({ ...prev, [numero]: value }));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const respuestas_formatted = Object.entries(respuestas).map(([num, resp]) => ({
        numero: isNaN(parseInt(num)) ? num : parseInt(num),
        respuesta: resp,
      }));

      let res;
      if (examen.modo_grupal && grupo) {
        // Group submit — creates Nota for all members
        res = await api.post(`/grupos/${grupo.id}/submit`, {
          respuestas_json: { preguntas: respuestas_formatted },
        });
      } else {
        res = await api.post('/examenes/responder', {
          examen_id: examenId,
          respuestas_json: { preguntas: respuestas_formatted },
        });
      }

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

      {/* Group mode panel */}
      {examen.modo_grupal && (
        <div className="card mb-6 border-2 border-blue-200 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-blue-900">Modo Grupal</h2>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg">
              Máx {examen.max_integrantes || 4} integrantes
            </span>
          </div>

          {!grupo ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-3">
                Este examen se resuelve en grupo. Crea un grupo o espera a que te inviten.
              </p>
              <button onClick={createGrupo} disabled={grupoLoading}
                className="btn-primary flex items-center gap-2 mx-auto">
                {grupoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Crear Grupo
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {grupo.miembros?.map(m => (
                  <div key={m.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-200 text-sm">
                    <span className="font-medium text-gray-800">{m.nombre || m.email}</span>
                    {m.es_lider && <span className="text-xs text-blue-600 font-semibold">Líder</span>}
                    {!m.es_lider && grupo.es_lider && (
                      <button onClick={() => removeMember(m.id)} className="text-red-400 hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {grupo.es_lider && (grupo.miembros?.length || 1) < (examen.max_integrantes || 4) && (
                showInvite ? (
                  <form onSubmit={inviteMember} className="flex gap-2">
                    <input type="email" placeholder="Email del compañero" className="input-field flex-1 text-sm"
                      value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} autoFocus />
                    <button type="submit" className="btn-primary text-sm px-3">Agregar</button>
                    <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary text-sm px-3">Cancelar</button>
                  </form>
                ) : (
                  <button onClick={() => setShowInvite(true)} className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                    <UserPlus className="w-4 h-4" /> Invitar miembro
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}

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
                <div className="text-gray-800 text-base leading-relaxed font-medium">
                  <MathText text={currentPregunta.enunciado} />
                </div>
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
                          <MathText text={opt} />
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
            onChange={(foundWords) => {
              updateResp('sopa_letras', foundWords.join(', '));
            }}
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
            onChange={(userGrid) => {
              updateResp('crucigrama', JSON.stringify(userGrid));
            }}
          />
        </div>
      )}

      {/* Interactive Matching */}
      {examen.contenido_json?.emparejar?.pares && (
        <div className="card mt-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            🔗 Emparejar
          </h2>
          <Emparejar
            emparejar={examen.contenido_json.emparejar}
            onChange={(matchesObj) => {
              updateResp('emparejar', JSON.stringify(matchesObj));
            }}
            onComplete={(results) => {
              updateResp('emparejar', JSON.stringify(results));
              toast.success(`¡Emparejar completado! ${results.correct}/${results.total} correctas 🎉`);
            }}
          />
        </div>
      )}

      {/* Story */}
      {examen.contenido_json?.cuento && (
        <div className="card mt-6">
          <Cuento
            cuento={examen.contenido_json.cuento}
            titulo={examen.contenido_json.titulo || examen.titulo}
          />
        </div>
      )}

      {/* Activity-only submit button — shown when there are no standard preguntas */}
      {totalQ === 0 && Object.keys(respuestas).length > 0 && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-8 py-3 rounded-xl text-base font-bold
              bg-green-600 text-white hover:bg-green-700 transition-colors shadow-lg"
          >
            <Send className="w-5 h-5" /> Terminar y Enviar
          </button>
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
              <h3 className="text-xl font-bold text-gray-900">{totalQ === 0 ? '¿Enviar actividad?' : '¿Enviar examen?'}</h3>
              <p className="text-gray-500 text-sm mt-2">
                {totalQ > 0 ? (
                  <>
                    Has respondido <span className="font-bold text-primary-600">{answered}</span> de <span className="font-bold">{totalQ}</span> preguntas.
                    {answered < totalQ && (
                      <span className="text-amber-600 block mt-1">
                        ⚠️ Hay {totalQ - answered} pregunta(s) sin responder.
                      </span>
                    )}
                  </>
                ) : (
                  <>Has completado <span className="font-bold text-primary-600">{Object.keys(respuestas).length}</span> actividad(es). Esta acción no se puede deshacer.</>
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
