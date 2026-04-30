import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store';
import {
  LayoutDashboard, Users, BookOpen, Award,
  LogOut, Menu, X,
  Shield, ClipboardList, Wrench, BarChart3, Calendar, ScrollText,
  Settings, ChevronRight, Presentation,
} from 'lucide-react';
import { useState } from 'react';

// ── Nav items per role ────────────────────────────────────────────────────
const NAV_ITEMS = {
  admin: [
    { label: 'Dashboard',     path: '/admin',          icon: LayoutDashboard, exact: true },
    { label: 'Usuarios',      path: '/admin/users',    icon: Users },
    { label: 'Materias',      path: '/admin/materias', icon: BookOpen },
    { label: 'Períodos',      path: '/admin/periodos', icon: Calendar },
    { label: 'Boletines',     path: '/admin/boletines',icon: ScrollText },
    { label: 'Impacto Tesis', path: '/admin/impacto',  icon: ClipboardList },
    { label: 'Auditoría',     path: '/admin/audit',    icon: Shield },
  ],
  profesor: [
    { label: 'Materias',       path: '/profesor/materias',       icon: BookOpen,     prefix: '/profesor/materia' },
    { label: 'Herramientas',   path: '/profesor/herramientas',   icon: Wrench },
    { label: 'Presentaciones', path: '/profesor/presentaciones', icon: Presentation, prefix: '/profesor/presentacion' },
    { label: 'Reportes',       path: '/profesor/reportes',       icon: BarChart3 },
    { label: 'Impacto Tesis',  path: '/profesor/impacto',        icon: ClipboardList },
  ],
  estudiante: [
    { label: 'Inicio',          path: '/estudiante',        icon: LayoutDashboard, exact: true },
    { label: 'Mis Notas',       path: '/estudiante/notas',  icon: Award },
    { label: 'Boletín',         path: '/estudiante/boletin',icon: ScrollText },
    { label: 'Encuesta Impacto',path: '/encuesta/impacto',  icon: ClipboardList },
  ],
};

// ── Per-role visual theme ─────────────────────────────────────────────────
const ROLE_THEME = {
  admin: {
    gradient:    'bg-admin-gradient',
    activeItem:  'bg-admin-100 text-admin-700 font-semibold',
    activeBar:   'bg-admin-500',
    hoverItem:   'hover:bg-admin-50 hover:text-admin-700',
    iconActive:  'text-admin-600',
    avatar:      'bg-admin-100 text-admin-700',
    badge:       'badge-admin',
    badgeLabel:  'Administrador',
    ring:        'ring-admin-200',
    glow:        'shadow-glow-violet',
  },
  profesor: {
    gradient:    'bg-profesor-gradient',
    activeItem:  'bg-profesor-100 text-profesor-700 font-semibold',
    activeBar:   'bg-profesor-500',
    hoverItem:   'hover:bg-profesor-50 hover:text-profesor-700',
    iconActive:  'text-profesor-600',
    avatar:      'bg-profesor-100 text-profesor-700',
    badge:       'badge-profesor',
    badgeLabel:  'Docente',
    ring:        'ring-profesor-200',
    glow:        'shadow-glow-indigo',
  },
  estudiante: {
    gradient:    'bg-estudiante-gradient',
    activeItem:  'bg-estudiante-100 text-estudiante-700 font-semibold',
    activeBar:   'bg-estudiante-500',
    hoverItem:   'hover:bg-estudiante-50 hover:text-estudiante-700',
    iconActive:  'text-estudiante-600',
    avatar:      'bg-estudiante-100 text-estudiante-700',
    badge:       'badge-estudiante',
    badgeLabel:  'Estudiante',
    ring:        'ring-estudiante-200',
    glow:        'shadow-glow-emerald',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────
function isItemActive(item, pathname) {
  if (item.exact)   return pathname === item.path;
  if (item.prefix)  return pathname.startsWith(item.prefix) || pathname === item.path;
  return pathname === item.path || pathname.startsWith(item.path + '/');
}

function initials(nombre, apellido) {
  return `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase();
}

// ── Sidebar inner content (shared by desktop + mobile) ───────────────────
function SidebarContent({ user, items, theme, location, onClose, onLogout }) {
  const ini = initials(user?.nombre, user?.apellido);

  return (
    <div className="flex flex-col h-full">

      {/* Brand header */}
      <div className={`${theme.gradient} px-5 py-5 flex items-center justify-between shrink-0`}>
        <Link to="/" onClick={onClose} className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 shrink-0">
            <img src="/icono.png" alt="" className="w-6 h-6 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-base leading-tight font-display truncate">
              XCalificator
            </p>
            <p className="text-white/70 text-2xs mt-0.5 truncate">Plataforma Educativa IA</p>
          </div>
        </Link>
        {/* mobile close */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* User chip */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-surface-muted">
          <div className={`w-8 h-8 rounded-full ${theme.avatar} flex items-center justify-center text-xs font-bold shrink-0`}>
            {ini}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
              {user?.nombre} {user?.apellido}
            </p>
            <span className={`${theme.badge} mt-0.5`}>{theme.badgeLabel}</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {items.map((item, i) => {
          const Icon     = item.icon;
          const active   = isItemActive(item, location.pathname);

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              style={{ animationDelay: `${i * 40}ms` }}
              className={`
                animate-slide-in-left animate-fill-both
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                transition-all duration-150 relative group
                ${active
                  ? `${theme.activeItem}`
                  : `text-gray-600 ${theme.hoverItem}`
                }
              `}
            >
              {/* active left bar */}
              {active && (
                <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full ${theme.activeBar}`} />
              )}
              <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? theme.iconActive : 'text-gray-400 group-hover:text-current'}`} />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-3 border-t border-gray-100 space-y-0.5 shrink-0">
        <Link
          to="/perfil"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <Settings className="w-4.5 h-4.5 text-gray-400" />
          Configuración
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────
export default function Layout({ children }) {
  const { user, logout }    = useAuthStore();
  const navigate            = useNavigate();
  const location            = useLocation();
  const [open, setOpen]     = useState(false);

  const items = NAV_ITEMS[user?.rol] || [];
  const theme = ROLE_THEME[user?.rol] || ROLE_THEME.estudiante;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const ini = initials(user?.nombre, user?.apellido);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-surface-border bg-white">
        <SidebarContent
          user={user}
          items={items}
          theme={theme}
          location={location}
          onClose={() => {}}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl
          transform transition-transform duration-250 ease-out lg:hidden
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarContent
          user={user}
          items={items}
          theme={theme}
          location={location}
          onClose={() => setOpen(false)}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 shrink-0 bg-white border-b border-surface-border flex items-center px-4 gap-4">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User chip */}
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                {user?.nombre} {user?.apellido}
              </p>
              <p className="text-2xs text-gray-500">{theme.badgeLabel}</p>
            </div>
            <div className={`w-9 h-9 rounded-full ${theme.avatar} flex items-center justify-center text-sm font-bold ring-2 ${theme.ring}`}>
              {ini}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
