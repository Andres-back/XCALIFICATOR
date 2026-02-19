import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  BookOpen, Plus, FileText, ClipboardList, X, Clock,
  CheckCircle, Calendar, TrendingUp, AlertCircle, Award,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';

export default function EstudianteHome() {
  const [materias, setMaterias] = useState([]);
  const [examenesPorMateria, setExamenesPorMateria] = useState({});
  const [respondidos, setRespondidos] = useState(new Set());
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInscribir, setShowInscribir] = useState(false);
  const [codigo, setCodigo] = useState('');

  const fetchData = async () => {
    try {
      const [matRes, respRes, notasRes] = await Promise.all([
        api.get('/materias/mis-inscripciones'),
        api.get('/examenes/mis-respuestas'),
        api.get('/examenes/mis-notas').catch(() => ({ data: [] })),
      ]);
      setMaterias(matRes.data);
      setRespondidos(new Set(respRes.data));
      setNotas(notasRes.data || []);

      // Fetch exams for each materia
      const examenesMap = {};
      await Promise.all(
        matRes.data.map(async (m) => {
          try {
            const exRes = await api.get(`/examenes/materia/${m.id}`);
            examenesMap[m.id] = exRes.data.filter(e => {
              if (!e.activo_online) return false;
              if (e.fecha_activacion && new Date(e.fecha_activacion) > new Date()) return false;
              return true;
            });
          } catch {
            examenesMap[m.id] = [];
          }
        })
      );
      setExamenesPorMateria(examenesMap);
    } catch {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const inscribir = async (e) => {
    e.preventDefault();
    try {
      await api.post('/materias/inscribir', { codigo: codigo.toUpperCase() });
      toast.success('¡Inscripción exitosa!');
      setShowInscribir(false);
      setCodigo('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  // Compute dashboard stats
  const allExamenes = Object.values(examenesPorMateria).flat();
  const pendientes = allExamenes.filter(ex => !respondidos.has(ex.id) && !(ex.fecha_limite && new Date(ex.fecha_limite) < new Date()));
  const promedio = notas.length > 0 ? (notas.reduce((a, n) => a + (n.nota || 0), 0) / notas.length) : 0;

  // Next exam (closest deadline)
  const proximoExamen = pendientes
    .filter(ex => ex.fecha_limite)
    .sort((a, b) => new Date(a.fecha_limite) - new Date(b.fecha_limite))[0];

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader type="stats" count={4} />
      <SkeletonLoader type="list" count={3} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page header with greeting */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mis Materias</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bienvenido, aquí puedes ver tus materias y exámenes disponibles.
          </p>
        </div>
        <button onClick={() => setShowInscribir(true)} className="btn-primary flex items-center gap-2 text-sm shrink-0">
          <Plus className="w-4 h-4" /> Inscribirme
        </button>
      </div>

      {/* Dashboard Stats */}
      {materias.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Materias Inscritas" value={materias.length} color="blue" />
          <StatCard icon={ClipboardList} label="Exámenes Pendientes" value={pendientes.length}
            color={pendientes.length > 0 ? 'amber' : 'green'}
            subtitle={pendientes.length > 0 ? 'Por resolver' : '¡Todo al día!'} />
          <StatCard icon={TrendingUp} label="Promedio General" value={promedio > 0 ? promedio.toFixed(1) : '—'}
            color={promedio >= 3.0 ? 'green' : promedio > 0 ? 'red' : 'blue'} />
          <StatCard icon={Award} label="Exámenes Completados" value={respondidos.size} color="purple"
            subtitle={allExamenes.length > 0 ? `de ${allExamenes.length} disponibles` : undefined} />
        </div>
      )}

      {/* Urgent alert: next exam deadline */}
      {proximoExamen && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Próximo examen por vencer</p>
            <p className="text-sm text-amber-700 mt-0.5">
              <span className="font-medium">{proximoExamen.titulo}</span> — vence{' '}
              {formatDistanceToNow(new Date(proximoExamen.fecha_limite), { addSuffix: true, locale: es })}
            </p>
          </div>
          <Link to={`/estudiante/examen/${proximoExamen.id}`}
            className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors shrink-0">
            Resolver Ahora
          </Link>
        </div>
      )}

      {/* Materia Cards */}
      {materias.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No estás inscrito en ninguna materia"
          description="Solicita el código de inscripción a tu profesor y presiona el botón 'Inscribirme' para comenzar."
          action={
            <button onClick={() => setShowInscribir(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Inscribirme a una Materia
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {materias.map(m => {
            const examenesMateria = examenesPorMateria[m.id] || [];
            const completados = examenesMateria.filter(ex => respondidos.has(ex.id)).length;
            const progreso = examenesMateria.length > 0 ? Math.round((completados / examenesMateria.length) * 100) : 0;

            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                {/* Materia header */}
                <div className="flex items-center justify-between p-5 pb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-100 to-indigo-100 flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5 text-primary-700" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{m.nombre}</h3>
                      <p className="text-xs text-gray-400">Código: {m.codigo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/estudiante/notas?materia=${encodeURIComponent(m.nombre)}`}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> Mis Notas
                    </Link>
                  </div>
                </div>

                {/* Progress bar */}
                {examenesMateria.length > 0 && (
                  <div className="px-5 pb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">Progreso: {completados}/{examenesMateria.length} exámenes</span>
                      <span className="text-xs font-medium text-primary-600">{progreso}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${progreso}%` }} />
                    </div>
                  </div>
                )}

                {/* Exam list */}
                <div className="border-t border-gray-100">
                  {examenesMateria.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                      {examenesMateria.map(ex => {
                        const yaRespondido = respondidos.has(ex.id);
                        const vencido = ex.fecha_limite && new Date(ex.fecha_limite) < new Date();
                        return (
                          <div key={ex.id} className={`flex items-center justify-between px-5 py-3.5 ${
                            yaRespondido ? 'bg-green-50/50' : vencido ? 'bg-gray-50/50' : 'hover:bg-blue-50/50'
                          } transition-colors`}>
                            <div className="flex items-center gap-3 min-w-0">
                              {yaRespondido ? (
                                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                              ) : vencido ? (
                                <Clock className="w-5 h-5 text-gray-400 shrink-0" />
                              ) : (
                                <ClipboardList className="w-5 h-5 text-primary-500 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className={`text-sm font-medium truncate ${
                                  yaRespondido ? 'text-green-800' : vencido ? 'text-gray-500' : 'text-gray-800'
                                }`}>{ex.titulo}</p>
                                {ex.fecha_limite && (
                                  <p className={`text-xs flex items-center gap-1 mt-0.5 ${
                                    vencido ? 'text-red-500' : 'text-gray-400'
                                  }`}>
                                    <Calendar className="w-3 h-3" />
                                    {vencido ? 'Vencido ' : 'Vence '}
                                    {formatDistanceToNow(new Date(ex.fecha_limite), { addSuffix: true, locale: es })}
                                  </p>
                                )}
                              </div>
                            </div>
                            {yaRespondido ? (
                              <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-green-700 bg-green-100 border border-green-200">
                                <CheckCircle className="w-3 h-3" /> Respondido
                              </span>
                            ) : vencido ? (
                              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100">
                                Vencido
                              </span>
                            ) : (
                              <Link to={`/estudiante/examen/${ex.id}`}
                                className="bg-primary-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-primary-700 transition-colors shrink-0">
                                Resolver
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-6 text-center">
                      <p className="text-sm text-gray-400">No hay exámenes disponibles en este momento.</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inscripción Modal */}
      {showInscribir && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary-50">
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Inscribirme a Materia</h3>
                </div>
                <button onClick={() => setShowInscribir(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={inscribir}>
                <input type="text" placeholder="Código (ej: MAT-7X2K)" className="input-field mb-3 text-center text-lg font-mono tracking-widest"
                  value={codigo} onChange={e => setCodigo(e.target.value)} required autoFocus />
                <p className="text-xs text-gray-400 mb-4 text-center">Ingresa el código proporcionado por tu profesor.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowInscribir(false)}
                    className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" className="btn-primary flex-1">Inscribirme</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
