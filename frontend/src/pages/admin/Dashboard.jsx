import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import {
  Users, Activity, FileCheck, UserCheck, UserX, BookOpen,
  ClipboardList, Award, TrendingUp, Globe, UserPlus, ShieldCheck,
  GraduationCap, Briefcase, Cpu, Zap, Clock, BarChart3,
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [apiUsage, setApiUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/users'),
      api.get('/admin/api-usage').catch(() => ({ data: null })),
    ])
      .then(([statsRes, usersRes, usageRes]) => {
        setStats(statsRes.data);
        setRecentUsers(usersRes.data.slice(0, 5));
        setApiUsage(usageRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  const mainCards = [
    { label: 'Total Usuarios', value: stats?.total_usuarios, icon: Users, color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700' },
    { label: 'Materias', value: stats?.total_materias, icon: BookOpen, color: 'bg-indigo-500', light: 'bg-indigo-50 text-indigo-700' },
    { label: 'Exámenes', value: stats?.total_examenes, icon: ClipboardList, color: 'bg-purple-500', light: 'bg-purple-50 text-purple-700' },
    { label: 'Calificaciones', value: stats?.total_notas, icon: Award, color: 'bg-amber-500', light: 'bg-amber-50 text-amber-700' },
  ];

  const detailCards = [
    { label: 'Profesores', value: stats?.total_profesores, icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
    { label: 'Estudiantes', value: stats?.total_estudiantes, icon: GraduationCap, color: 'text-green-600 bg-green-50' },
    { label: 'Administradores', value: stats?.total_admins, icon: ShieldCheck, color: 'text-purple-600 bg-purple-50' },
    { label: 'Sesiones Activas', value: stats?.sesiones_activas, icon: Activity, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Usuarios Activos', value: stats?.usuarios_activos, icon: UserCheck, color: 'text-teal-600 bg-teal-50' },
    { label: 'Usuarios Inactivos', value: stats?.usuarios_inactivos, icon: UserX, color: 'text-red-600 bg-red-50' },
    { label: 'Exámenes Online', value: stats?.examenes_online_activos, icon: Globe, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Registros (7 días)', value: stats?.registros_ultimos_7_dias, icon: UserPlus, color: 'text-orange-600 bg-orange-50' },
  ];

  const roleDistribution = [
    { role: 'Profesores', count: stats?.total_profesores || 0, color: 'bg-blue-500' },
    { role: 'Estudiantes', count: stats?.total_estudiantes || 0, color: 'bg-green-500' },
    { role: 'Admins', count: stats?.total_admins || 0, color: 'bg-purple-500' },
  ];
  const totalForBar = roleDistribution.reduce((s, r) => s + r.count, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
        <div className="flex gap-2">
          <Link to="/admin/users" className="btn-primary text-sm flex items-center gap-1">
            <Users className="w-4 h-4" /> Usuarios
          </Link>
          <Link to="/admin/materias" className="btn-secondary text-sm flex items-center gap-1">
            <BookOpen className="w-4 h-4" /> Materias
          </Link>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mainCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-full opacity-10 ${card.color}`}></div>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.light}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{card.value ?? 0}</p>
                  <p className="text-sm text-gray-500">{card.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Detail Stats */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Métricas Detalladas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {detailCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`p-3 rounded-xl ${card.color}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{card.label}</span>
                    </div>
                    <p className="text-2xl font-bold">{card.value ?? 0}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Promedio Global & Calificaciones Hoy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="card flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white">
                <TrendingUp className="w-7 h-7" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats?.promedio_global ?? '—'}</p>
                <p className="text-sm text-gray-500">Promedio Global</p>
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white">
                <FileCheck className="w-7 h-7" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats?.examenes_calificados_hoy ?? 0}</p>
                <p className="text-sm text-gray-500">Calificados Hoy</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Role Distribution */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribución por Rol</h2>
            <div className="flex h-4 rounded-full overflow-hidden mb-4">
              {roleDistribution.map((r) => (
                <div
                  key={r.role}
                  className={`${r.color} transition-all`}
                  style={{ width: `${(r.count / totalForBar) * 100}%` }}
                  title={`${r.role}: ${r.count}`}
                ></div>
              ))}
            </div>
            <div className="space-y-2">
              {roleDistribution.map((r) => (
                <div key={r.role} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${r.color}`}></div>
                    <span className="text-gray-600">{r.role}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Users */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Usuarios Recientes</h2>
              <Link to="/admin/users" className="text-xs text-primary-600 hover:underline">Ver todos</Link>
            </div>
            <div className="space-y-3">
              {recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                      {u.nombre?.[0]}{u.apellido?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.nombre} {u.apellido}</p>
                      <p className="text-xs text-gray-400">{u.correo}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${u.rol === 'admin' ? 'bg-purple-100 text-purple-700' :
                      u.rol === 'profesor' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'}`}>
                    {u.rol}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* API Usage Section */}
      {apiUsage && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary-600" /> Uso de API (Groq)
          </h2>

          {/* Usage overview cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{apiUsage.total_requests_today}</p>
                  <p className="text-xs text-gray-500">Solicitudes hoy</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{apiUsage.remaining_requests_today.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Disponibles hoy</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{apiUsage.total_requests_this_month}</p>
                  <p className="text-xs text-gray-500">Solicitudes este mes</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{(apiUsage.total_tokens_this_month || 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Tokens este mes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Usage progress bar */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Uso diario de solicitudes</span>
              <span className="text-sm text-gray-500">
                {apiUsage.total_requests_today} / {apiUsage.requests_per_day_limit.toLocaleString()}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (apiUsage.total_requests_today / apiUsage.requests_per_day_limit) > 0.8
                    ? 'bg-red-500' : (apiUsage.total_requests_today / apiUsage.requests_per_day_limit) > 0.5
                    ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (apiUsage.total_requests_today / apiUsage.requests_per_day_limit) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Límite: {apiUsage.requests_per_minute_limit} req/min</span>
              <span>{apiUsage.tokens_per_minute_limit.toLocaleString()} tokens/min</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Usage by task */}
            {apiUsage.usage_by_task?.length > 0 && (
              <div className="card">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Uso por tarea (este mes)</h3>
                <div className="space-y-3">
                  {apiUsage.usage_by_task.map((t, i) => {
                    const taskLabels = {
                      grading: 'Calificación IA',
                      exam_generation: 'Generación de exámenes',
                      rag_chat: 'Chatbot RAG',
                      classification: 'Clasificación',
                    };
                    const taskColors = {
                      grading: 'bg-blue-500',
                      exam_generation: 'bg-purple-500',
                      rag_chat: 'bg-green-500',
                      classification: 'bg-amber-500',
                    };
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${taskColors[t.task] || 'bg-gray-400'}`}></div>
                          <span className="text-sm text-gray-700">{taskLabels[t.task] || t.task}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-gray-900">{t.requests} req</span>
                          <span className="text-xs text-gray-400 ml-2">{(t.total_tokens || 0).toLocaleString()} tokens</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily history */}
            {apiUsage.daily_history?.length > 0 && (
              <div className="card">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Historial diario (últimos 7 días)</h3>
                <div className="space-y-2">
                  {apiUsage.daily_history.map((d, i) => {
                    const maxReq = Math.max(...apiUsage.daily_history.map(x => x.requests), 1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 shrink-0">{d.date}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(d.requests / maxReq) * 100}%` }}></div>
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-14 text-right">{d.requests} req</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Free tier info */}
          <div className="card bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Cpu className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Plan Gratuito de Groq</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• <strong>14,400</strong> solicitudes por día</li>
                  <li>• <strong>30</strong> solicitudes por minuto</li>
                  <li>• <strong>6,000</strong> tokens por minuto</li>
                  <li>• Sin costo mientras se mantenga dentro de los límites</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
