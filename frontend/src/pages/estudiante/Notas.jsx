import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Award, MessageCircle, CheckCircle, XCircle, Filter, TrendingUp,
  BarChart3, Target, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';

export default function EstudianteNotas() {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [searchParams] = useSearchParams();
  const [filtroMateria, setFiltroMateria] = useState(searchParams.get('materia') || '');

  useEffect(() => {
    api.get('/examenes/mis-notas')
      .then(res => setNotas(res.data))
      .catch(() => toast.error('Error cargando notas'))
      .finally(() => setLoading(false));
  }, []);

  // Extract unique materias for filter
  const materias = [...new Set(notas.map(n => n.materia_nombre).filter(Boolean))];
  const notasFiltradas = filtroMateria
    ? notas.filter(n => n.materia_nombre === filtroMateria)
    : notas;

  // Compute summary stats
  const stats = useMemo(() => {
    if (notasFiltradas.length === 0) return null;
    const vals = notasFiltradas.map(n => n.nota).filter(n => n != null);
    if (vals.length === 0) return null;
    const promedio = vals.reduce((a, b) => a + b, 0) / vals.length;
    const mejor = Math.max(...vals);
    const aprobadas = vals.filter(v => v >= 3.0).length;
    return { promedio, mejor, aprobadas, total: vals.length };
  }, [notasFiltradas]);

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader type="stats" count={4} />
      <SkeletonLoader type="list" count={4} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mis Notas</h1>
          <p className="text-sm text-gray-500 mt-1">Tu historial de calificaciones y evaluaciones.</p>
        </div>
        {materias.length > 1 && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={filtroMateria} onChange={e => setFiltroMateria(e.target.value)}
              className="input-field py-1.5 text-sm w-48">
              <option value="">Todas las materias</option>
              {materias.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="Promedio" value={stats.promedio.toFixed(1)}
            color={stats.promedio >= 3.0 ? 'green' : 'red'} />
          <StatCard icon={Award} label="Mejor Nota" value={stats.mejor.toFixed(1)} color="blue" />
          <StatCard icon={Target} label="Aprobadas" value={`${stats.aprobadas}/${stats.total}`}
            color="green" subtitle={`${Math.round((stats.aprobadas / stats.total) * 100)}%`} />
          <StatCard icon={BarChart3} label="Total Evaluaciones" value={stats.total} color="purple" />
        </div>
      )}

      {/* Grade Distribution Mini Chart */}
      {stats && stats.total >= 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Distribución de Notas</h3>
          <GradeDistribution notas={notasFiltradas} />
        </div>
      )}

      {/* Grades List */}
      {notasFiltradas.length === 0 ? (
        <EmptyState
          icon={Award}
          title={filtroMateria ? `No hay notas para ${filtroMateria}` : 'Aún no tienes notas registradas'}
          description="Tus notas aparecerán aquí después de que el profesor califique tus exámenes."
        />
      ) : (
        <div className="space-y-3">
          {notasFiltradas.map(n => (
            <div key={n.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between p-5 cursor-pointer"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                <div className="flex items-center gap-4">
                  {/* Grade badge */}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    n.nota >= 4.0 ? 'bg-green-100 text-green-700' :
                    n.nota >= 3.0 ? 'bg-blue-100 text-blue-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    <span className="text-xl font-bold">{n.nota}</span>
                  </div>
                  <div className="min-w-0">
                    {n.examen_titulo && (
                      <p className="text-sm font-semibold text-gray-900 truncate">{n.examen_titulo}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {n.materia_nombre && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-medium">{n.materia_nombre}</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {format(new Date(n.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                      </span>
                    </div>
                    {/* Grade bar */}
                    <div className="mt-2 h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        n.nota >= 4.0 ? 'bg-green-500' : n.nota >= 3.0 ? 'bg-blue-500' : 'bg-red-500'
                      }`} style={{ width: `${(n.nota / 5.0) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/estudiante/chat/${n.id}`}
                    onClick={e => e.stopPropagation()}
                    className="btn-secondary text-xs flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" /> Chatbot
                  </Link>
                  {expanded === n.id ?
                    <ChevronUp className="w-5 h-5 text-gray-400" /> :
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  }
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === n.id && (
                <div className="p-5 pt-0 border-t border-gray-100 mt-0">
                  <div className="pt-4 space-y-4">
                    {n.retroalimentacion && (
                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <h3 className="text-sm font-semibold text-blue-800 mb-1">Retroalimentación General</h3>
                        <p className="text-sm text-blue-700 whitespace-pre-line">{n.retroalimentacion}</p>
                      </div>
                    )}

                    {n.detalle_json?.preguntas && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-gray-700">
                          Detalle por Pregunta ({n.detalle_json.preguntas.filter(p => p.correcto).length}/{n.detalle_json.preguntas.length} correctas)
                        </h3>
                        {n.detalle_json.preguntas.map((p, i) => (
                          <div key={i} className={`p-3 rounded-xl border ${
                            p.correcto ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                          }`}>
                            <div className="flex items-start gap-2">
                              {p.correcto ? (
                                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">Pregunta {p.numero}</span>
                                  <span className="text-sm font-semibold">{p.nota}/{p.nota_maxima}</span>
                                </div>
                                {p.respuesta_estudiante && (
                                  <p className="text-xs text-gray-700 mt-1">
                                    <span className="font-medium">Tu respuesta:</span> {p.respuesta_estudiante}
                                  </p>
                                )}
                                {p.respuesta_correcta && !p.correcto && (
                                  <p className="text-xs text-green-700 mt-0.5">
                                    <span className="font-medium">Correcta:</span> {p.respuesta_correcta}
                                  </p>
                                )}
                                {p.retroalimentacion && (
                                  <p className="text-xs text-gray-600 mt-1 italic">{p.retroalimentacion}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mini grade distribution visualization */
function GradeDistribution({ notas }) {
  const buckets = [
    { label: '0-1', min: 0, max: 1, color: 'bg-red-500' },
    { label: '1-2', min: 1, max: 2, color: 'bg-red-400' },
    { label: '2-3', min: 2, max: 3, color: 'bg-amber-500' },
    { label: '3-4', min: 3, max: 4, color: 'bg-blue-500' },
    { label: '4-5', min: 4, max: 5.01, color: 'bg-green-500' },
  ];

  const counts = buckets.map(b => ({
    ...b,
    count: notas.filter(n => n.nota >= b.min && n.nota < b.max).length,
  }));
  const maxCount = Math.max(...counts.map(c => c.count), 1);

  return (
    <div className="flex items-end gap-2 h-24">
      {counts.map(c => (
        <div key={c.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-gray-600">{c.count}</span>
          <div className="w-full rounded-t-lg relative" style={{ height: `${Math.max(4, (c.count / maxCount) * 80)}px` }}>
            <div className={`absolute inset-0 ${c.color} rounded-t-lg opacity-80`} />
          </div>
          <span className="text-xs text-gray-400">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
