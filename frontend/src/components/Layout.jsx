import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store';
import {
  LayoutDashboard, Users, BookOpen, FileText, Award,
  MessageCircle, Settings, LogOut, Menu, X, GraduationCap,
  Shield, ClipboardList,
} from 'lucide-react';
import { useState } from 'react';

const navItems = {
  admin: [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Usuarios', path: '/admin/users', icon: Users },
    { label: 'Materias', path: '/admin/materias', icon: BookOpen },
    { label: 'Auditoría', path: '/admin/audit', icon: Shield },
  ],
  profesor: [
    { label: 'Materias', path: '/profesor/materias', icon: BookOpen },
  ],
  estudiante: [
    { label: 'Inicio', path: '/estudiante', icon: LayoutDashboard },
    { label: 'Mis Notas', path: '/estudiante/notas', icon: Award },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const items = navItems[user?.rol] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="w-8 h-8 text-primary-600" />
            <span className="text-xl font-bold text-gray-900">XCalificator</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-col p-4 gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <Link
            to="/perfil"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            <Settings className="w-5 h-5" />
            Configuración
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 w-full"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {user?.nombre} {user?.apellido}
              </p>
              <p className="text-xs text-gray-500 capitalize">{user?.rol}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-primary-700 font-semibold text-sm">
                {user?.nombre?.[0]}{user?.apellido?.[0]}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
