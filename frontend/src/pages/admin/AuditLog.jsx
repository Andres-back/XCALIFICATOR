import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { Shield, Clock, RefreshCw, User, Globe } from 'lucide-react';
import { format } from 'date-fns';

const ACTION_LABELS = {
  admin_create_user: { label: 'Crear usuario', color: 'bg-green-100 text-green-700' },
  toggle_user: { label: 'Cambiar estado', color: 'bg-amber-100 text-amber-700' },
  admin_change_password: { label: 'Cambiar contraseña', color: 'bg-blue-100 text-blue-700' },
  change_role: { label: 'Cambiar rol', color: 'bg-purple-100 text-purple-700' },
  admin_delete_user: { label: 'Eliminar usuario', color: 'bg-red-100 text-red-700' },
  admin_delete_materia: { label: 'Eliminar materia', color: 'bg-red-100 text-red-700' },
  login: { label: 'Inicio de sesión', color: 'bg-cyan-100 text-cyan-700' },
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchLogs = () => {
    setLoading(true);
    api.get('/admin/audit?limit=200')
      .then(res => setLogs(res.data))
      .catch(() => toast.error('Error cargando auditoría'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, []);

  const getBadge = (accion) => {
    const info = ACTION_LABELS[accion] || { label: accion, color: 'bg-gray-100 text-gray-700' };
    return info;
  };

  const filteredLogs = filter
    ? logs.filter(l => l.accion.includes(filter))
    : logs;

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro de Auditoría</h1>
          <p className="text-sm text-gray-500 mt-1">{filteredLogs.length} registros</p>
        </div>
        <button onClick={fetchLogs} className="btn-secondary flex items-center gap-1">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${!filter ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Todos
        </button>
        {Object.entries(ACTION_LABELS).map(([key, val]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${filter === key ? 'bg-primary-600 text-white' : `${val.color} hover:opacity-80`}`}>
            {val.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="card">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay registros de auditoría</p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {filteredLogs.map((log) => {
              const badge = getBadge(log.accion);
              return (
                <div key={log.id} className="py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                      </span>
                    </div>
                    {log.detalle && (
                      <div className="mt-1 text-xs text-gray-500 space-x-3">
                        {Object.entries(log.detalle).map(([k, v]) => (
                          <span key={k}><span className="font-medium">{k}:</span> {String(v)}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      {log.user_id && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.user_id.slice(0, 8)}...
                        </span>
                      )}
                      {log.ip && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {log.ip}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
