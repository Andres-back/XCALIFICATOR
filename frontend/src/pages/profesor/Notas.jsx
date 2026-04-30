import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Award, Trash2, Edit3, X, Save, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, BarChart3, Users, TrendingUp, Target,
  Presentation, Sparkles, Loader2,
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

function normalizeWord(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseRespuestaMap(respuestasJson) {
  const map = {};
  if (!respuestasJson) return map;

  const items = Array.isArray(respuestasJson)
    ? respuestasJson
    : Array.isArray(respuestasJson.preguntas)
      ? respuestasJson.preguntas
      : [];

  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = String(item.numero);
    map[key] = item.respuesta;
  });

  return map;
}

function getQuestionText(examContent, numero) {
  const preguntas = examContent?.preguntas;
  if (!Array.isArray(preguntas)) return null;
  const found = preguntas.find((q) => String(q?.numero) === String(numero));
  if (!found) return null;
  return found.enunciado || found.pregunta || found.texto || found.statement || null;
}

function toDisplayText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function splitWords(text) {
  if (!text) return [];
  return String(text)
    .split(',')
    .map((w) => normalizeWord(w))
    .filter(Boolean);
}

function SopaReview({ sopa, respuestaRaw }) {
  const grid = Array.isArray(sopa?.grid) ? sopa.grid : [];
  const palabras = Array.isArray(sopa?.palabras) ? sopa.palabras : [];
  const correctWords = palabras.map((w) => normalizeWord(typeof w === 'object' ? w?.palabra : w));
  const foundWords = splitWords(respuestaRaw);
  const foundSet = new Set(foundWords);
  const missing = correctWords.filter((w) => !foundSet.has(w));

  return (
    <div className="space-y-3">
      {grid.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
          <table className="mx-auto border-collapse">
            <tbody>
              {grid.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={`${rIdx}-${cIdx}`}
                      className="w-7 h-7 text-center text-[11px] font-bold border border-indigo-100 text-indigo-900"
                    >
                      {String(cell || '').toUpperCase()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg border border-green-200 bg-green-50 p-2">
          <p className="text-[10px] font-semibold uppercase text-green-700 mb-1">Palabras encontradas por el estudiante</p>
          <div className="flex flex-wrap gap-1.5">
            {foundWords.length > 0 ? foundWords.map((w, i) => (
              <span key={`${w}-${i}`} className="px-2 py-0.5 rounded-full text-[11px] bg-white border border-green-300 text-green-700">{w}</span>
            )) : <span className="text-xs text-green-700">No registró palabras.</span>}
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
          <p className="text-[10px] font-semibold uppercase text-amber-700 mb-1">Palabras faltantes</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.length > 0 ? missing.map((w, i) => (
              <span key={`${w}-${i}`} className="px-2 py-0.5 rounded-full text-[11px] bg-white border border-amber-300 text-amber-700">{w}</span>
            )) : <span className="text-xs text-green-700">Completó todas las palabras.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CrucigramaReview({ crucigrama, respuestaRaw, detallePalabras }) {
  const grid = Array.isArray(crucigrama?.grid) ? crucigrama.grid : [];
  const studentGrid = parseMaybeJson(respuestaRaw) || {};

  let minR = Infinity;
  let maxR = -1;
  let minC = Infinity;
  let maxC = -1;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < (grid[r]?.length || 0); c += 1) {
      if (grid[r][c] && String(grid[r][c]).trim()) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const hasBounds = maxR >= minR && maxC >= minC;

  return (
    <div className="space-y-3">
      {hasBounds && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
          <table className="mx-auto border-collapse">
            <tbody>
              {Array.from({ length: maxR - minR + 1 }).map((_, rr) => {
                const r = minR + rr;
                return (
                  <tr key={r}>
                    {Array.from({ length: maxC - minC + 1 }).map((__, cc) => {
                      const c = minC + cc;
                      const active = grid[r]?.[c] && String(grid[r][c]).trim();
                      const key = `${r},${c}`;
                      const letter = active ? String(studentGrid[key] || '').toUpperCase() : '';
                      return (
                        <td
                          key={key}
                          className={`w-8 h-8 text-center text-[11px] font-bold border ${
                            active ? 'bg-white border-indigo-200 text-indigo-800' : 'bg-indigo-900 border-indigo-900'
                          }`}
                        >
                          {letter}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {Array.isArray(detallePalabras) && detallePalabras.length > 0 && (
        <div className="space-y-1.5">
          {detallePalabras.map((item, idx) => (
            <div
              key={`${item.numero || idx}-${item.dir || 'x'}`}
              className={`rounded-lg border p-2 text-xs ${item.correcto ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            >
              <p className="font-semibold text-gray-800">
                {item.numero}{item.dir ? item.dir.toUpperCase() : ''}. {item.pista || 'Pista'}
              </p>
              <p className="text-gray-700 mt-0.5">Estudiante: {item.respuesta_estudiante || '-'}</p>
              <p className="text-gray-700">Correcta: {item.respuesta_correcta || '-'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmparejarReview({ emparejar, respuestaRaw, detallePares }) {
  const pares = Array.isArray(emparejar?.pares) ? emparejar.pares : [];
  let matches = parseMaybeJson(respuestaRaw) || {};
  if (matches && typeof matches === 'object' && matches.matches && typeof matches.matches === 'object') {
    matches = matches.matches;
  }

  const rows = Array.isArray(detallePares) && detallePares.length > 0
    ? detallePares
    : pares.map((par) => {
      const rid = matches?.[String(par.id)] ?? matches?.[par.id];
      const right = pares.find((p) => String(p.id) === String(rid));
      return {
        izquierda: par.izquierda,
        derecha_correcta: par.derecha,
        derecha_estudiante: right?.derecha || '',
        correcto: String(rid) === String(par.id),
      };
    });

  return (
    <div className="space-y-1.5">
      {rows.map((row, idx) => (
        <div
          key={`${row.izquierda || 'left'}-${idx}`}
          className={`rounded-lg border p-2 text-xs ${row.correcto ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
        >
          <p className="font-semibold text-gray-800">{row.izquierda || 'Concepto'}</p>
          <p className="text-gray-700 mt-0.5">Emparejó con: {row.derecha_estudiante || '-'}</p>
          <p className="text-gray-700">Correcta: {row.derecha_correcta || '-'}</p>
        </div>
      ))}
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
  const [generandoRepaso, setGenerandoRepaso] = useState(false);

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

  const generarRepaso = async () => {
    if (generandoRepaso) return;
    if (!stats || !stats.total) {
      toast.error('Necesitas calificar al menos un estudiante primero');
      return;
    }
    setGenerandoRepaso(true);
    const tid = toast.loading('Creando repaso… esto puede tardar 30-90 segundos ✨');
    try {
      const { data } = await api.post(`/presentaciones/repaso-examen/${examenId}`, null, {
        params: { plantilla: 'general', num_slides: 8 },
        timeout: 240000, // 4 min
      });
      toast.dismiss(tid);
      toast.success('¡Presentación lista! 🎉');
      if (data?.pptx_url) {
        window.open(data.pptx_url, '_blank', 'noopener');
      }
    } catch (err) {
      toast.dismiss(tid);
      toast.error(err?.response?.data?.detail || 'No pudimos generar el repaso');
    } finally {
      setGenerandoRepaso(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  const maxInDist = stats?.distribucion ? Math.max(...stats.distribucion.map(d => d.count), 1) : 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Notas del Examen</h1>
        {stats && stats.total > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={generarRepaso}
              disabled={generandoRepaso}
              title="Genera diapositivas con las preguntas más falladas"
              className="
                inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                rounded-lg shadow-sm transition-all
                bg-gradient-to-r from-profesor-600 to-profesor-700 text-white
                hover:from-profesor-700 hover:to-profesor-800
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {generandoRepaso
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              <Presentation className="w-3.5 h-3.5" />
              {generandoRepaso ? 'Creando…' : 'Crear repaso para clase'}
            </button>
            <button onClick={() => setShowStats(!showStats)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              <BarChart3 className="w-3.5 h-3.5" />
              {showStats ? 'Ocultar métricas' : 'Ver métricas'}
            </button>
          </div>
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
                    <span className={`text-sm font-bold ${s.nota >= 3.0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
            const examContent = n.examen_contenido_json || {};
            const respuestasMap = parseRespuestaMap(n.respuestas_json);
            const examType = n.examen_tipo || n.detalle_json?.tipo || '';

            return (
              <div key={n.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-extrabold
                      ${parseFloat(n.nota) >= 3.0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
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
                        {examType && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 rounded uppercase">
                            {String(examType).replaceAll('_', ' ')}
                          </span>
                        )}
                        {isAutoGraded && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Auto</span>
                        )}
                        {hasPending && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Pendientes
                          </span>
                        )}
                        {n.enviado_at && (
                          <span className="text-xs text-gray-400">
                            Enviado: {format(new Date(n.enviado_at), 'dd/MM/yyyy HH:mm')}
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

                {/* Per-question detail — transparent context for review */}
                {expanded === n.id && hasDetail && (
                  <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                    {n.detalle_json.preguntas.map((p, i) => {
                      const numeroKey = String(p.numero);
                      const tipo = p.tipo || numeroKey;
                      const isSopa = tipo === 'sopa_letras' || numeroKey === 'sopa_letras';
                      const isCrucigrama = tipo === 'crucigrama' || numeroKey === 'crucigrama';
                      const isEmparejar = tipo === 'emparejar' || numeroKey === 'emparejar';
                      const isInteractive = isSopa || isCrucigrama || isEmparejar;

                      const respuestaRaw = p.respuesta_estudiante ?? respuestasMap[numeroKey];
                      const respuestaTexto = toDisplayText(respuestaRaw);
                      const correctaTexto = toDisplayText(p.respuesta_correcta);
                      const preguntaTexto = getQuestionText(examContent, p.numero);

                      let actividadTexto = preguntaTexto;
                      if (isSopa) {
                        actividadTexto = examContent?.sopa_letras?.instrucciones
                          || examContent?.sopa_letras?.tema
                          || 'Encuentra las palabras solicitadas en la sopa de letras.';
                      }
                      if (isCrucigrama) {
                        actividadTexto = examContent?.crucigrama?.instrucciones
                          || examContent?.crucigrama?.tema
                          || 'Resuelve el crucigrama con las pistas dadas.';
                      }
                      if (isEmparejar) {
                        actividadTexto = examContent?.emparejar?.instrucciones
                          || examContent?.emparejar?.tema
                          || 'Empareja cada concepto con su definición correcta.';
                      }

                      return (
                        <div key={i} className={`rounded-xl border overflow-hidden text-sm
                          ${p.pendiente ? 'border-amber-200' : p.correcto ? 'border-emerald-200' : 'border-red-200'}`}>
                          <div className={`flex items-center justify-between px-4 py-2
                            ${p.pendiente ? 'bg-amber-50' : p.correcto ? 'bg-emerald-50' : 'bg-red-50'}`}>
                            <div className="flex items-center gap-2">
                              {p.pendiente
                                ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                                : p.correcto
                                  ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                                  : <XCircle className="w-4 h-4 text-red-500" />}
                              <span className="font-medium">
                                {isInteractive ? `Actividad ${numeroKey.replaceAll('_', ' ')}` : `Pregunta ${p.numero}`}
                              </span>
                            </div>
                            <span className={`font-bold text-xs ${p.pendiente ? 'text-amber-700' : p.correcto ? 'text-emerald-700' : 'text-red-700'}`}>
                              {p.nota}/{p.nota_maxima}
                            </span>
                          </div>

                          <div className="px-4 py-3 space-y-2 bg-white">
                            {actividadTexto && (
                              <div>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Actividad / Pregunta</p>
                                <p className="text-xs text-gray-800 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{actividadTexto}</p>
                              </div>
                            )}

                            {!isInteractive && (
                              <>
                                <div>
                                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Respuesta del estudiante</p>
                                  <pre className="text-xs text-gray-800 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap break-words font-sans">
                                    {respuestaTexto || 'Sin respuesta registrada.'}
                                  </pre>
                                </div>
                                {correctaTexto && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-green-600 uppercase mb-0.5">Respuesta correcta</p>
                                    <pre className="text-xs text-green-800 bg-green-50 rounded-lg px-3 py-2 whitespace-pre-wrap break-words font-sans">
                                      {correctaTexto}
                                    </pre>
                                  </div>
                                )}
                              </>
                            )}

                            {isSopa && (
                              <SopaReview
                                sopa={examContent?.sopa_letras}
                                respuestaRaw={respuestaRaw}
                              />
                            )}

                            {isCrucigrama && (
                              <CrucigramaReview
                                crucigrama={examContent?.crucigrama}
                                respuestaRaw={respuestaRaw}
                                detallePalabras={p.detalle_palabras}
                              />
                            )}

                            {isEmparejar && (
                              <EmparejarReview
                                emparejar={examContent?.emparejar}
                                respuestaRaw={respuestaRaw}
                                detallePares={p.detalle_pares}
                              />
                            )}

                            <div>
                              <p className="text-[10px] font-semibold text-blue-500 uppercase mb-0.5">Justificación de calificación</p>
                              <p className="text-xs text-blue-800 bg-blue-50 rounded-lg px-3 py-2 whitespace-pre-wrap italic">
                                {p.retroalimentacion || 'Sin justificación registrada.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
