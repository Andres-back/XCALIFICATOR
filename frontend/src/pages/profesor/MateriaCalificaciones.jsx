import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Award, Users, FileText, TrendingUp, BarChart3,
  ChevronDown, ChevronUp, Download,
} from 'lucide-react';
import { format } from 'date-fns';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';
const GRADE_COLORS = {
  '1.0 - 1.9': '#ef4444',
  '2.0 - 2.9': '#f97316',
  '3.0 - 3.4': '#eab308',
  '3.5 - 3.9': '#22c55e',
  '4.0 - 4.5': '#3b82f6',
  '4.6 - 5.0': '#8b5cf6',
};

export default function MateriaCalificaciones({ materiaId }) {
  const [examenes, setExamenes] = useState([]);
  const [notas, setNotas] = useState({}); // { examenId: [notas] }
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const exRes = await api.get(`/examenes/materia/${materiaId}`);
        setExamenes(exRes.data);

        // Fetch notas for each exam
        const notasMap = {};
        await Promise.all(
          exRes.data.map(async (ex) => {
            try {
              const nRes = await api.get(`/examenes/${ex.id}/notas`);
              notasMap[ex.id] = nRes.data;
            } catch {
              notasMap[ex.id] = [];
            }
          })
        );
        setNotas(notasMap);
      } catch {
        toast.error('Error cargando datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [materiaId]);

  if (loading) return <SkeletonLoader type="stats" count={4} />;

  // Compute overall stats
  const allNotas = Object.values(notas).flat();
  const totalCalificados = allNotas.length;
  const promedio = totalCalificados > 0 ? (allNotas.reduce((a, n) => a + (n.nota || 0), 0) / totalCalificados) : 0;
  const aprobados = allNotas.filter(n => n.nota >= 3.0).length;
  const porcentajeAprobados = totalCalificados > 0 ? Math.round((aprobados / totalCalificados) * 100) : 0;
  const notaMasAlta = totalCalificados > 0 ? Math.max(...allNotas.map(n => n.nota || 0)) : 0;

  // Grade distribution
  const distribucion = { '1.0 - 1.9': 0, '2.0 - 2.9': 0, '3.0 - 3.4': 0, '3.5 - 3.9': 0, '4.0 - 4.5': 0, '4.6 - 5.0': 0 };
  allNotas.forEach(n => {
    const nota = n.nota || 0;
    if (nota < 2) distribucion['1.0 - 1.9']++;
    else if (nota < 3) distribucion['2.0 - 2.9']++;
    else if (nota < 3.5) distribucion['3.0 - 3.4']++;
    else if (nota < 4) distribucion['3.5 - 3.9']++;
    else if (nota < 4.6) distribucion['4.0 - 4.5']++;
    else distribucion['4.6 - 5.0']++;
  });

  const chartData = Object.entries(distribucion).map(([name, value]) => ({
    name, value, color: GRADE_COLORS[name],
  }));

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Award} label="Calificados" value={totalCalificados} color="blue" />
        <StatCard icon={TrendingUp} label="Promedio General" value={promedio.toFixed(1)}
          color={promedio >= 3.0 ? 'green' : 'red'} />
        <StatCard icon={Users} label="Aprobados" value={`${porcentajeAprobados}%`}
          color={porcentajeAprobados >= 60 ? 'green' : 'amber'}
          subtitle={`${aprobados} de ${totalCalificados}`} />
        <StatCard icon={BarChart3} label="Nota más alta" value={notaMasAlta.toFixed(1)} color="purple" />
      </div>

      {/* Grade Distribution Chart — pure CSS */}
      {totalCalificados > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Distribución de Notas</h3>
          <CSSBarChart data={chartData} />
        </div>
      )}

      {/* Per-exam breakdown */}
      {examenes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin exámenes"
          description="No hay exámenes creados para esta materia. Genera un examen para comenzar a calificar."
        />
      ) : (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Detalle por Examen</h3>
          {examenes.map(ex => {
            const exNotas = notas[ex.id] || [];
            const exPromedio = exNotas.length > 0 ? (exNotas.reduce((a, n) => a + (n.nota || 0), 0) / exNotas.length) : 0;
            const isExpanded = expanded === ex.id;

            return (
              <div key={ex.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setExpanded(isExpanded ? null : ex.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                      exNotas.length > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {exNotas.length}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ex.titulo}</p>
                      <p className="text-xs text-gray-400">
                        {exNotas.length > 0 ? `Promedio: ${exPromedio.toFixed(1)}` : 'Sin calificaciones'}
                        {' · '}{format(new Date(ex.created_at), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/profesor/calificar/${ex.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium">
                      Calificar
                    </Link>
                    <Link to={`/profesor/notas/${ex.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                      Ver Notas
                    </Link>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && exNotas.length > 0 && (
                  <div className="border-t border-gray-100">
                    {exNotas.map((n, i) => (
                      <div key={n.id || i} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate">
                              {n.estudiante_nombre || n.nombre || 'Estudiante'}
                            </p>
                          </div>
                        </div>
                        <span className={`text-sm font-bold ${(n.nota || 0) >= 3.0 ? 'text-green-600' : 'text-red-600'}`}>
                          {n.nota?.toFixed(1) || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pure-CSS bar chart — no external dependency */
function CSSBarChart({ data }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-48">
      {data.map(d => (
        <div key={d.name} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-gray-700">{d.value > 0 ? d.value : ''}</span>
          <div
            className="w-full rounded-t-lg transition-all duration-500"
            style={{
              height: `${Math.max(4, (d.value / maxVal) * 160)}px`,
              backgroundColor: d.color,
              opacity: 0.85,
            }}
            title={`${d.name}: ${d.value}`}
          />
          <span className="text-xs text-gray-500 text-center leading-tight">{d.name}</span>
        </div>
      ))}
    </div>
  );
}
