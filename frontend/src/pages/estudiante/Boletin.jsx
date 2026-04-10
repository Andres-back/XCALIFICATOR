import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  ScrollText, TrendingUp, BookOpen, Calendar,
  Award, Target, BarChart3, ChevronUp, ChevronDown,
} from 'lucide-react';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';

export default function EstudianteBoletin() {
  const [boletines, setBoletines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/reportes/mis-boletines')
      .then(res => setBoletines(res.data))
      .catch(() => toast.error('Error cargando boletines'))
      .finally(() => setLoading(false));
  }, []);

  // Group by materia
  const byMateria = {};
  for (const b of boletines) {
    const key = b.materia_nombre || 'Sin materia';
    if (!byMateria[key]) byMateria[key] = [];
    byMateria[key].push(b);
  }

  // Global stats
  const allNotas = boletines.filter(b => b.nota_final != null).map(b => b.nota_final);
  const promedio = allNotas.length > 0 ? allNotas.reduce((a, b) => a + b, 0) / allNotas.length : 0;
  const mejor = allNotas.length > 0 ? Math.max(...allNotas) : 0;
  const aprobadas = allNotas.filter(n => n >= 3.0).length;

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader type="stats" count={3} />
      <SkeletonLoader type="list" count={3} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mi Boletín</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aquí puedes ver tus notas finales publicadas por período y materia.
        </p>
      </div>

      {/* Stats */}
      {allNotas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="Promedio General" value={promedio.toFixed(1)}
            color={promedio >= 3.0 ? 'green' : 'red'} />
          <StatCard icon={Award} label="Mejor Nota" value={mejor.toFixed(1)} color="blue" />
          <StatCard icon={Target} label="Aprobadas" value={`${aprobadas}/${allNotas.length}`}
            color="green" subtitle={`${allNotas.length > 0 ? Math.round((aprobadas / allNotas.length) * 100) : 0}%`} />
          <StatCard icon={BarChart3} label="Períodos" value={allNotas.length} color="purple" />
        </div>
      )}

      {boletines.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No tienes boletines publicados"
          description="Tus boletines aparecerán aquí cuando tus profesores publiquen las notas de cada período."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(byMateria).map(([materia, bols]) => (
            <div key={materia} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Materia header */}
              <div className="p-5 bg-gradient-to-r from-primary-50 to-indigo-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">{materia}</h2>
                    <p className="text-xs text-gray-500">{bols.length} período{bols.length > 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>

              {/* Period grades */}
              <div className="divide-y divide-gray-100">
                {bols.sort((a, b) => (a.periodo_nombre || '').localeCompare(b.periodo_nombre || '')).map(b => (
                  <div key={b.id}>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{b.periodo_nombre || 'Período'}</p>
                          <p className="text-xs text-gray-400">
                            Publicado: {new Date(b.publicado_at || b.created_at).toLocaleDateString('es-CO')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`px-4 py-2 rounded-xl text-center ${
                          b.nota_final >= 4.0 ? 'bg-green-100 text-green-700' :
                          b.nota_final >= 3.0 ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          <span className="text-xl font-bold">{b.nota_final?.toFixed(1) || '—'}</span>
                          <span className="text-xs ml-1">/5.0</span>
                        </div>
                        {expanded === b.id ?
                          <ChevronUp className="w-5 h-5 text-gray-400" /> :
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        }
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expanded === b.id && b.desglose_json && (
                      <div className="px-5 pb-5 space-y-3">
                        {/* Grade bar */}
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            b.nota_final >= 4.0 ? 'bg-green-500' :
                            b.nota_final >= 3.0 ? 'bg-blue-500' : 'bg-red-500'
                          }`} style={{ width: `${(b.nota_final / 5.0) * 100}%` }} />
                        </div>

                        {/* Config percentages */}
                        {b.desglose_json.config && Object.keys(b.desglose_json.config).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(b.desglose_json.config).map(([tipo, pct]) => (
                              <span key={tipo} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                {tipo}: {pct}%
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Activities detail */}
                        {b.desglose_json.actividades && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-gray-600 uppercase">Desglose de actividades</h4>
                            {b.desglose_json.actividades.map((a, i) => (
                              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                                a.nota != null && a.nota >= 3.0 ? 'bg-green-50 border-green-100' :
                                a.nota != null ? 'bg-red-50 border-red-100' :
                                'bg-gray-50 border-gray-100'
                              }`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 capitalize">{a.tipo}</span>
                                  <span className="text-sm text-gray-700 truncate">{a.titulo}</span>
                                </div>
                                <span className={`text-sm font-bold ${
                                  a.nota != null && a.nota >= 3.0 ? 'text-green-600' :
                                  a.nota != null ? 'text-red-600' : 'text-gray-400'
                                }`}>
                                  {a.nota != null ? a.nota.toFixed(1) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
