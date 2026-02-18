import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Award, Trash2, Edit3, X, Save, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, BarChart3, Users, TrendingUp, Target,
} from 'lucide-react';
import { format } from 'date-fns';

/* ─── Simple Bar for distribution ─── */
function DistBar({ label, count, max }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-500 text-right shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
          style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
        >
          {count > 0 && <span className="text-[10px] font-bold text-white">{count}</span>}
        </div>
      </div>
    </div>
  );
}

/* ─── Question difficulty bar ─── */
function QuestionBar({ pregunta }) {
  const rate = pregunta.tasa_acierto;
  const color = rate >= 70 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const label = rate >= 70 ? 'Fácil' : rate >= 40 ? 'Media' : 'Difícil';
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-10 text-xs font-bold text-gray-700 text-center">P{pregunta.numero}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${rate}%` }} />
      </div>
      <span className="w-12 text-xs font-bold text-gray-600 text-right">{rate}%</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
        ${rate >= 70 ? 'bg-emerald-100 text-emerald-700' : rate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
        {label}
      </span>
    </div>
  );
}

export default function ProfesorNotas() {
  const { examenId } = useParams();
  const [notas, setNotas] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({ nota: '', retroalimentacion: '' });
  const [expanded, setExpanded] = useState(null);
  const [showStats, setShowStats] = useState(true);

  const fetchNotas = () => {
    api.get(`/examenes/notas/examen/${examenId}`)
      .then(res => setNotas(res.data))
      .catch(() => toast.error('Error'))
      .finally(() => setLoading(false));
  };

  const fetchStats = () => {
    api.get(`/examenes/notas/examen/${examenId}/stats`)
      .then(res => setStats(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotas();
    fetchStats();
  }, [examenId]);

  const startEdit = (nota) => {
    setEditing(nota.id);
    setEditValues({ nota: nota.nota, retroalimentacion: nota.retroalimentacion || '' });
  };

  const saveEdit = async () => {
    try {
      await api.patch(`/examenes/notas/${editing}`, editValues);
      toast.success('Nota actualizada');
      setEditing(null);
      fetchNotas();
      fetchStats();
    } catch {
      toast.error('Error');
    }
  };

  const deleteNota = async (notaId) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    try {
      await api.delete(`/examenes/notas/${notaId}`);
      toast.success('Nota eliminada');
      fetchNotas();
      fetchStats();
    } catch {
      toast.error('Error');
    }
  };

  const toggleExpand = (id) => setExpanded(expanded === id ? null : id);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  const maxInDist = stats?.distribucion ? Math.max(...stats.distribucion.map(d => d.count), 1) : 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Notas del Examen</h1>
        {stats && stats.total > 0 && (
          <button onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            <BarChart3 className="w-3.5 h-3.5" />
            {showStats ? 'Ocultar métricas' : 'Ver métricas'}
          </button>
        )}
      </div>

      {/* ═══════ METRICS DASHBOARD ═══════ */}
      {showStats && stats && stats.total > 0 && (
        <div className="space-y-4 mb-8 animate-fadeIn">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 border border-indigo-200">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-indigo-500" />
                <p className="text-xs text-indigo-600 font-medium">Calificados</p>
              </div>
              <p className="text-2xl font-bold text-indigo-700">{stats.total}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <p className="text-xs text-blue-600 font-medium">Promedio</p>
              </div>
              <p className="text-2xl font-bold text-blue-700">{stats.promedio} <span className="text-sm font-normal text-blue-400">/ {stats.nota_maxima}</span></p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <p className="text-xs text-emerald-600 font-medium">Aprobados</p>
              </div>
              <p className="text-2xl font-bold text-emerald-700">{stats.tasa_aprobacion}%
                <span className="text-sm font-normal text-emerald-400 ml-1">({stats.aprobados})</span>
              </p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <p className="text-xs text-red-600 font-medium">Reprobados</p>
              </div>
              <p className="text-2xl font-bold text-red-700">{stats.reprobados}
                <span className="text-sm font-normal text-red-400 ml-1">({(100 - stats.tasa_aprobacion).toFixed(1)}%)</span>
              </p>
            </div>
          </div>

          {/* Second row: min/max/median */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-xs text-gray-500">Más alta</p>
              <p className="text-lg font-bold text-emerald-600">{stats.max_nota}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-xs text-gray-500">Mediana</p>
              <p className="text-lg font-bold text-blue-600">{stats.mediana}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-xs text-gray-500">Más baja</p>
              <p className="text-lg font-bold text-red-600">{stats.min_nota}</p>
            </div>
          </div>

          {/* Distribution + Question Analysis side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Grade Distribution */}
            {stats.distribucion && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" /> Distribución de Notas
                </h3>
                <div className="space-y-2">
                  {stats.distribucion.map((d, i) => (
                    <DistBar key={i} label={d.label} count={d.count} max={maxInDist} />
                  ))}
                </div>
              </div>
            )}

            {/* Per-question analysis */}
            {stats.preguntas_stats && stats.preguntas_stats.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-violet-500" /> Dificultad por Pregunta
                </h3>
                <div className="space-y-0.5">
                  {stats.preguntas_stats.map((p) => (
                    <QuestionBar key={p.numero} pregunta={p} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Student Ranking */}
          {stats.ranking && stats.ranking.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" /> Ranking de Estudiantes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {stats.ranking.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${i === 0 ? 'bg-amber-100 text-amber-700' :
                        i === 1 ? 'bg-gray-200 text-gray-600' :
                        i === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-gray-100 text-gray-500'}`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-700 truncate">{s.nombre}</span>
                    <span className={`text-sm font-bold ${s.nota >= (stats.nota_maxima * 0.6) ? 'text-emerald-600' : 'text-red-600'}`}>
                      {s.nota}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ NOTAS LIST ═══════ */}
      {notas.length === 0 ? (
        <div className="card text-center py-12">
          <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay notas registradas para este examen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notas.map(n => {
            const hasDetail = n.detalle_json?.preguntas?.length > 0;
            const isAutoGraded = n.detalle_json?.calificacion_automatica;
            const hasPending = n.detalle_json?.tiene_preguntas_abiertas;

            return (
              <div key={n.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-extrabold
                      ${parseFloat(n.nota) >= (stats?.nota_maxima ? stats.nota_maxima * 0.6 : 3.0) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {n.nota}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {n.estudiante_nombre ? `${n.estudiante_nombre} ${n.estudiante_apellido || ''}`.trim() : n.estudiante_id}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {format(new Date(n.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                        {n.detalle_json?.nota_maxima && (
                          <span className="text-xs text-gray-400">/ {n.detalle_json.nota_maxima}</span>
                        )}
                        {isAutoGraded && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Auto</span>
                        )}
                        {hasPending && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Pendientes
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasDetail && (
                      <button onClick={() => toggleExpand(n.id)}
                        className="p-2 rounded text-gray-500 hover:bg-gray-100" title="Ver detalle">
                        {expanded === n.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                    {editing === n.id ? (
                      <>
                        <button onClick={saveEdit} className="p-2 rounded text-green-600 hover:bg-green-50">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditing(null)} className="p-2 rounded text-gray-600 hover:bg-gray-100">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(n)} className="p-2 rounded text-blue-600 hover:bg-blue-50">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteNota(n.id)} className="p-2 rounded text-red-600 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline edit */}
                {editing === n.id && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-500 w-12">Nota:</label>
                      <input type="number" step="0.01" className="w-24 input-field text-sm"
                        value={editValues.nota} onChange={e => setEditValues(p => ({ ...p, nota: e.target.value }))} />
                    </div>
                    <textarea className="input-field text-sm h-20 w-full"
                      value={editValues.retroalimentacion}
                      onChange={e => setEditValues(p => ({ ...p, retroalimentacion: e.target.value }))}
                      placeholder="Retroalimentación..." />
                  </div>
                )}

                {/* Per-question detail */}
                {expanded === n.id && hasDetail && (
                  <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                    {n.detalle_json.preguntas.map((p, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-sm
                        ${p.pendiente ? 'bg-amber-50 border-amber-200' : p.correcto ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="shrink-0 mt-0.5">
                          {p.pendiente
                            ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                            : p.correcto
                              ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                              : <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">P{p.numero}</span>
                            <span className={`font-bold text-xs ${p.pendiente ? 'text-amber-700' : p.correcto ? 'text-emerald-700' : 'text-red-700'}`}>
                              {p.nota}/{p.nota_maxima}
                            </span>
                          </div>
                          {p.respuesta_estudiante && (
                            <p className="text-xs text-gray-600 mt-1">
                              <span className="font-medium">Resp:</span> {p.respuesta_estudiante}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">{p.retroalimentacion}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Retroalimentacion (only when not expanded) */}
                {expanded !== n.id && !editing && n.retroalimentacion && (
                  <p className="text-sm text-gray-600 mt-2 whitespace-pre-line line-clamp-2">{n.retroalimentacion}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
