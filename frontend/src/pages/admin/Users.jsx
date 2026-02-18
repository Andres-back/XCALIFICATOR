import { useState, useEffect, useMemo } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  UserPlus, Shield, ShieldOff, Key, Eye, X, Trash2,
  Search, Filter, RefreshCw, ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';

const ROLES = [
  { value: 'estudiante', label: 'Estudiante', color: 'bg-green-100 text-green-700' },
  { value: 'profesor', label: 'Profesor', color: 'bg-blue-100 text-blue-700' },
  { value: 'admin', label: 'Administrador', color: 'bg-purple-100 text-purple-700' },
];

const getRoleColor = (rol) => ROLES.find(r => r.value === rol)?.color || 'bg-gray-100 text-gray-700';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRol, setFilterRol] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showSessions, setShowSessions] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [roleDropdown, setRoleDropdown] = useState(null);
  const [newUser, setNewUser] = useState({
    nombre: '', apellido: '', documento: '', correo: '', celular: '', password: '', rol: 'estudiante',
  });
  const [passwordModal, setPasswordModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = () => {
    setLoading(true);
    api.get('/admin/users')
      .then(res => setUsers(res.data))
      .catch(() => toast.error('Error cargando usuarios'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = search.toLowerCase();
      const matchSearch = !q || 
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(q) ||
        u.correo.toLowerCase().includes(q) ||
        u.documento.includes(q);
      const matchRol = !filterRol || u.rol === filterRol;
      const matchEstado = !filterEstado || 
        (filterEstado === 'activo' ? u.activo : !u.activo);
      return matchSearch && matchRol && matchEstado;
    });
  }, [users, search, filterRol, filterEstado]);

  const toggleUser = async (userId) => {
    try {
      await api.patch(`/admin/users/${userId}/toggle`);
      fetchUsers();
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const changeRole = async (userId, newRol) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { rol: newRol });
      fetchUsers();
      toast.success(`Rol cambiado a ${newRol}`);
      setRoleDropdown(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const deleteUser = async (userId, nombre) => {
    if (!confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      fetchUsers();
      toast.success('Usuario eliminado');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', newUser);
      toast.success('Usuario creado');
      setShowCreate(false);
      setNewUser({ nombre: '', apellido: '', documento: '', correo: '', celular: '', password: '', rol: 'estudiante' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) { toast.error('Mínimo 8 caracteres'); return; }
    try {
      await api.put(`/admin/users/${passwordModal}/password`, { new_password: newPassword });
      toast.success('Contraseña actualizada');
      setPasswordModal(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const viewSessions = async (userId) => {
    try {
      const res = await api.get(`/admin/users/${userId}/sessions`);
      setSessions(res.data);
      setShowSessions(userId);
    } catch {
      toast.error('Error cargando sesiones');
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">{filteredUsers.length} de {users.length} usuarios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-1" title="Recargar">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar por nombre, correo o documento..."
              className="input-field pl-10" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input-field w-auto" value={filterRol} onChange={e => setFilterRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className="input-field w-auto" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-500">Nombre</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Correo</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Documento</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Rol</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Estado</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Registro</th>
              <th className="text-left py-3 px-2 font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-400">No se encontraron usuarios</td></tr>
            ) : filteredUsers.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                      {u.nombre?.[0]}{u.apellido?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{u.nombre} {u.apellido}</p>
                      {u.celular && <p className="text-xs text-gray-400">{u.celular}</p>}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2 text-gray-600">{u.correo}</td>
                <td className="py-3 px-2 text-gray-600">{u.documento}</td>
                <td className="py-3 px-2 relative">
                  <button
                    onClick={() => setRoleDropdown(roleDropdown === u.id ? null : u.id)}
                    className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 cursor-pointer hover:opacity-80 ${getRoleColor(u.rol)}`}
                  >
                    {u.rol}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {roleDropdown === u.id && (
                    <div className="absolute z-20 mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px]">
                      {ROLES.map(r => (
                        <button key={r.value}
                          onClick={() => changeRole(u.id, r.value)}
                          disabled={r.value === u.rol}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2
                            ${r.value === u.rol ? 'text-gray-300 cursor-default' : 'text-gray-700'}`}
                        >
                          <div className={`w-2 h-2 rounded-full ${r.value === u.rol ? 'bg-primary-500' : 'bg-gray-300'}`}></div>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-3 px-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium
                    ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-3 px-2 text-xs text-gray-500">
                  {format(new Date(u.created_at), 'dd/MM/yyyy')}
                </td>
                <td className="py-3 px-2">
                  <div className="flex gap-1">
                    <button onClick={() => toggleUser(u.id)} title={u.activo ? 'Deshabilitar' : 'Habilitar'}
                      className={`p-1.5 rounded ${u.activo ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                      {u.activo ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setPasswordModal(u.id)} title="Cambiar contraseña"
                      className="p-1.5 rounded text-amber-600 hover:bg-amber-50">
                      <Key className="w-4 h-4" />
                    </button>
                    <button onClick={() => viewSessions(u.id)} title="Ver sesiones"
                      className="p-1.5 rounded text-blue-600 hover:bg-blue-50">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteUser(u.id, `${u.nombre} ${u.apellido}`)} title="Eliminar usuario"
                      className="p-1.5 rounded text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Crear Usuario</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Nombre" className="input-field" required autoComplete="given-name"
                  value={newUser.nombre} onChange={e => setNewUser(p => ({ ...p, nombre: e.target.value }))} />
                <input type="text" placeholder="Apellido" className="input-field" required autoComplete="family-name"
                  value={newUser.apellido} onChange={e => setNewUser(p => ({ ...p, apellido: e.target.value }))} />
              </div>
              <input type="text" placeholder="Documento" className="input-field" required
                value={newUser.documento} onChange={e => setNewUser(p => ({ ...p, documento: e.target.value }))} />
              <input type="email" placeholder="Correo electrónico" className="input-field" required autoComplete="email"
                value={newUser.correo} onChange={e => setNewUser(p => ({ ...p, correo: e.target.value }))} />
              <input type="tel" placeholder="Celular (opcional)" className="input-field" autoComplete="tel"
                value={newUser.celular} onChange={e => setNewUser(p => ({ ...p, celular: e.target.value }))} />
              <input type="password" placeholder="Contraseña (min 8, 1 mayúscula, 1 número)" className="input-field" required autoComplete="new-password"
                value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
              <select className="input-field" value={newUser.rol}
                onChange={e => setNewUser(p => ({ ...p, rol: e.target.value }))}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button type="submit" className="btn-primary w-full">Crear Usuario</button>
            </form>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPasswordModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Cambiar Contraseña</h3>
              <button onClick={() => setPasswordModal(null)}><X className="w-5 h-5" /></button>
            </div>
            <input type="password" placeholder="Nueva contraseña" className="input-field mb-3" autoComplete="new-password"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <p className="text-xs text-gray-400 mb-3">Mínimo 8 caracteres, 1 mayúscula, 1 número</p>
            <button onClick={changePassword} className="btn-primary w-full">Actualizar</button>
          </div>
        </div>
      )}

      {/* Sessions Modal */}
      {showSessions && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSessions(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Historial de Sesiones</h3>
              <button onClick={() => setShowSessions(null)}><X className="w-5 h-5" /></button>
            </div>
            {sessions.length === 0 ? (
              <p className="text-gray-500 text-sm py-6 text-center">Sin sesiones registradas</p>
            ) : (
              <div className="space-y-2">
                {sessions.map(s => (
                  <div key={s.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">IP: {s.ip || 'N/A'}</span>
                      <span className="text-gray-500">
                        {s.fecha_inicio ? format(new Date(s.fecha_inicio), 'dd/MM/yyyy HH:mm') : ''}
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-1 truncate">{s.dispositivo || 'Dispositivo desconocido'}</p>
                    {s.fecha_fin && (
                      <p className="text-xs text-red-500 mt-1">Cerrada: {format(new Date(s.fecha_fin), 'dd/MM/yyyy HH:mm')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
