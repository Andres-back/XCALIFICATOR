import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store';
import {
  LayoutDashboard, Users, BookOpen, Award,
  LogOut, Menu, X, Send, Loader2, ArrowRight,
  Shield, ClipboardList, Wrench, BarChart3, Calendar, ScrollText,
  Settings, ChevronRight, ChevronLeft, Cpu, Bot,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import ThemeToggle from './ThemeToggle';
import usePageMotion from '../hooks/usePageMotion';
import api from '../api';

// ── Nav items per role ────────────────────────────────────────────────────
const NAV_ITEMS = {
  admin: [
    { label: 'Dashboard',     path: '/admin',           icon: LayoutDashboard, exact: true },
    { label: 'Usuarios',      path: '/admin/users',     icon: Users },
    { label: 'Materias',      path: '/admin/materias',  icon: BookOpen },
    { label: 'Períodos',      path: '/admin/periodos',  icon: Calendar },
    { label: 'Boletines',     path: '/admin/boletines', icon: ScrollText },
    { label: 'IA y OCR',      path: '/admin/ai-config', icon: Cpu },
    { label: 'Impacto Tesis', path: '/admin/impacto',   icon: ClipboardList },
    { label: 'Auditoría',     path: '/admin/audit',     icon: Shield },
  ],
  profesor: [
    { label: 'Materias',       path: '/profesor/materias',       icon: BookOpen,     prefix: '/profesor/materia' },
    { label: 'Herramientas',   path: '/profesor/herramientas',   icon: Wrench },
    { label: 'Calificar Tarea', path: '/profesor/calificar-tarea', icon: ScrollText },
    { label: 'Reportes',       path: '/profesor/reportes',       icon: BarChart3 },
    { label: 'Impacto Tesis',  path: '/profesor/impacto',        icon: ClipboardList },
  ],
  estudiante: [
    { label: 'Inicio',          path: '/estudiante',         icon: LayoutDashboard, exact: true },
    { label: 'Mis Notas',       path: '/estudiante/notas',   icon: Award },
    { label: 'Boletín',         path: '/estudiante/boletin', icon: ScrollText },
    { label: 'Encuesta Impacto',path: '/encuesta/impacto',   icon: ClipboardList },
  ],
};

// ── Per-role visual theme ─────────────────────────────────────────────────
const ROLE_THEME = {
  admin: {
    gradient:    'bg-admin-gradient',
    activeItem:  'bg-admin-100 text-admin-700 font-semibold dark:bg-admin-900/40 dark:text-admin-300',
    activeBar:   'bg-admin-500',
    hoverItem:   'hover:bg-admin-50 hover:text-admin-700 dark:hover:bg-admin-900/30 dark:hover:text-admin-300',
    iconActive:  'text-admin-600 dark:text-admin-400',
    avatar:      'bg-admin-100 text-admin-700 dark:bg-admin-900/50 dark:text-admin-300',
    badge:       'badge-admin',
    badgeLabel:  'Administrador',
    ring:        'ring-admin-200 dark:ring-admin-800',
    glow:        'shadow-glow-violet',
  },
  profesor: {
    gradient:    'bg-profesor-gradient',
    activeItem:  'bg-profesor-100 text-profesor-700 font-semibold dark:bg-profesor-900/40 dark:text-profesor-300',
    activeBar:   'bg-profesor-500',
    hoverItem:   'hover:bg-profesor-50 hover:text-profesor-700 dark:hover:bg-profesor-900/30 dark:hover:text-profesor-300',
    iconActive:  'text-profesor-600 dark:text-profesor-400',
    avatar:      'bg-profesor-100 text-profesor-700 dark:bg-profesor-900/50 dark:text-profesor-300',
    badge:       'badge-profesor',
    badgeLabel:  'Docente',
    ring:        'ring-profesor-200 dark:ring-profesor-800',
    glow:        'shadow-glow-indigo',
  },
  estudiante: {
    gradient:    'bg-estudiante-gradient',
    activeItem:  'bg-estudiante-100 text-estudiante-700 font-semibold dark:bg-estudiante-900/40 dark:text-estudiante-300',
    activeBar:   'bg-estudiante-500',
    hoverItem:   'hover:bg-estudiante-50 hover:text-estudiante-700 dark:hover:bg-estudiante-900/30 dark:hover:text-estudiante-300',
    iconActive:  'text-estudiante-600 dark:text-estudiante-400',
    avatar:      'bg-estudiante-100 text-estudiante-700 dark:bg-estudiante-900/50 dark:text-estudiante-300',
    badge:       'badge-estudiante',
    badgeLabel:  'Estudiante',
    ring:        'ring-estudiante-200 dark:ring-estudiante-800',
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

function formatXaliMessage(text) {
  const normalized = String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\s*\([^)]*\/(?:profesor|admin|estudiante|api|perfil)[^)]*\)/g, '')
    .replace(/\/(?:profesor|admin|estudiante|api|perfil)[\w/-]*/g, '')
    .replace(/\b(?:RAG|API|endpoint|URL|localhost|HTTP)\b/gi, 'IA')
    .replace(/\bslides?\b/gi, 'diapositivas')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  const escaped = normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n/g, '<br/>');
  return DOMPurify.sanitize(escaped, { ADD_ATTR: ['class'] });
}

const XALI_INITIAL_MESSAGES = [
  {
    role: 'assistant',
    content: 'Soy **Xali**. Preguntame lo que necesitas hacer en XCalificator y te guio sin salir de esta pantalla.',
    actions: [],
  },
];

const TOUR_STEPS = {
  profesor: [
    {
      title: 'Bienvenido a XCalificator',
      body: 'Este recorrido te muestra las partes principales. Puedes avanzar paso a paso u omitirlo si ya conoces el programa.',
    },
    {
      title: 'Materias',
      body: 'Aqui creas tus materias, agregas estudiantes y entras al espacio donde estan examenes, asistencia, notas, DBA y boletines.',
      route: '/profesor/materias',
    },
    {
      title: 'Herramientas',
      body: 'Aqui generas examenes, sopas de letras, crucigramas, actividades para emparejar, cuentos y recursos listos para imprimir o descargar.',
      route: '/profesor/herramientas',
    },
    {
      title: 'Presentaciones',
      body: 'Aqui puedes pedir diapositivas para una clase. Escribe el tema, grado, objetivos y la cantidad que necesitas.',
      route: '/profesor/presentacion',
    },
    {
      title: 'Calificar Tarea',
      body: 'Aqui subes evidencias o revisas entregas. El sistema te ayuda con vision, pero siempre puedes revisar y ajustar antes de finalizar.',
      route: '/profesor/calificar-tarea',
    },
    {
      title: 'Reportes',
      body: 'Aqui ves el desempeno de tus estudiantes con graficas, promedios y resumenes utiles para tomar decisiones.',
      route: '/profesor/reportes',
    },
    {
      title: 'Xali',
      body: 'El boton flotante de Xali queda a la derecha. Puedes preguntarle desde cualquier pantalla y usar sus botones para ir al lugar correcto.',
    },
  ],
  admin: [
    {
      title: 'Panel de administracion',
      body: 'Este recorrido muestra las secciones que usas para preparar la plataforma y acompanar a los profesores.',
    },
    {
      title: 'Usuarios',
      body: 'Aqui creas y revisas cuentas de administradores, profesores y estudiantes.',
      route: '/admin/users',
    },
    {
      title: 'Materias y periodos',
      body: 'Aqui organizas materias, grupos y periodos academicos para que las notas y boletines salgan ordenados.',
      route: '/admin/materias',
    },
    {
      title: 'IA y Vision',
      body: 'Aqui eliges los modelos que usara el sistema, subes las mascotas de Xali y dejas la configuracion lista para todos.',
      route: '/admin/ai-config',
    },
    {
      title: 'Xali',
      body: 'El boton flotante te acompana a la derecha. Puedes preguntarle y te llevara con botones a la seccion que necesites.',
    },
  ],
  estudiante: [
    {
      title: 'Bienvenido',
      body: 'Este recorrido te muestra donde ver tus actividades, notas y boletin.',
    },
    {
      title: 'Inicio',
      body: 'Aqui ves tus actividades disponibles y accesos para responder o revisar tareas.',
      route: '/estudiante',
    },
    {
      title: 'Mis notas',
      body: 'Aqui revisas tus resultados y la retroalimentacion que deja el profesor.',
      route: '/estudiante/notas',
    },
    {
      title: 'Boletin',
      body: 'Aqui consultas tu boletin cuando este disponible.',
      route: '/estudiante/boletin',
    },
  ],
};

function FloatingXaliChat({ role, mascotUrl, pathname }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(XALI_INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [isOpen, messages, loading]);

  const sendMessage = async (event, text = input) => {
    event?.preventDefault();
    const clean = String(text || '').trim();
    if (!clean || loading) return;

    const history = messages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .slice(-4)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, { role: 'user', content: clean }]);
    setInput('');
    setLoading(true);
    try {
      const startedAt = Date.now();
      const { data } = await api.post('/xali-master/chat', {
        message: clean,
        history,
        current_path: pathname,
      });
      const elapsedMs = Date.now() - startedAt;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response || 'No encontre una respuesta clara. Reformula la pregunta y te guio.',
          actions: data.actions || [],
          elapsedMs,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err.response?.data?.detail || 'No pude conectar con Xali ahora. Intenta de nuevo en unos segundos.',
          actions: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (role !== 'profesor' && role !== 'admin') return null;

  return (
    <div className="fixed right-3 bottom-20 sm:right-5 sm:bottom-6 z-30">
      {isOpen && (
        <section className="mb-3 w-[calc(100vw-1.5rem)] max-w-sm sm:w-96 rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-profesor-900/15 dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
          <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-profesor-50 ring-2 ring-profesor-100 dark:bg-profesor-900/30 dark:ring-profesor-800">
              {mascotUrl ? (
                <img src={mascotUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Bot className="m-2 h-6 w-6 text-profesor-600 dark:text-profesor-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Xali</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Asistente rapido del profesor</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              aria-label="Cerrar Xali"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={messagesRef} className="max-h-[48vh] min-h-64 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              return (
                <div key={`${message.role}-${index}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${
                    isUser
                      ? 'bg-profesor-600 text-white'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                  }`}>
                    <div
                      className="leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: formatXaliMessage(message.content) }}
                    />
                    {!isUser && message.actions?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.actions.map((action, actionIndex) => (
                          <Link
                            key={`${action.route}-${actionIndex}`}
                            to={action.route}
                            onClick={() => setIsOpen(false)}
                            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-profesor-700 ring-1 ring-profesor-100 hover:bg-profesor-50 dark:bg-gray-900 dark:text-profesor-300 dark:ring-profesor-800"
                            title={action.reason}
                          >
                            {action.label}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-200">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pensando...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="flex gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
            <input
              type="text"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-profesor-400 focus:ring-2 focus:ring-profesor-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              placeholder="Preguntale a Xali..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-profesor-600 text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Enviar mensaje"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="group flex items-center gap-2 rounded-full border border-profesor-100 bg-white/95 px-3 py-2 shadow-lg shadow-profesor-900/10 ring-1 ring-white/70 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-profesor-800/60 dark:bg-gray-900/95"
        title="Abrir Xali"
        aria-label="Abrir Xali"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-profesor-50 ring-2 ring-profesor-100 dark:bg-profesor-900/30 dark:ring-profesor-800">
          {mascotUrl ? (
            <img src={mascotUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Bot className="h-6 w-6 text-profesor-600 dark:text-profesor-300" />
          )}
        </span>
        <span className="hidden sm:block pr-1 text-left">
          <span className="block text-sm font-bold leading-tight text-gray-900 dark:text-white">Xali</span>
          <span className="block text-[11px] leading-tight text-profesor-600 dark:text-profesor-300">Chat</span>
        </span>
      </button>
    </div>
  );
}

// ── Sidebar inner content (shared by desktop + mobile) ───────────────────
function FirstVisitTour({ role, userId, onNavigate }) {
  const steps = TOUR_STEPS[role] || [];
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!role || steps.length === 0) return;
    const key = `xcalificator-tour-v1-${role}-${userId || 'local'}`;
    if (window.localStorage.getItem(key) === 'done') return;
    const timer = window.setTimeout(() => setVisible(true), 500);
    return () => window.clearTimeout(timer);
  }, [role, userId, steps.length]);

  if (!visible || steps.length === 0) return null;

  const key = `xcalificator-tour-v1-${role}-${userId || 'local'}`;
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const finish = () => {
    window.localStorage.setItem(key, 'done');
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-950/35 backdrop-blur-[1px] flex items-end justify-center p-4 sm:items-center">
      <section
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-profesor-50 ring-2 ring-profesor-100 dark:bg-profesor-900/30 dark:ring-profesor-800">
            <img src="/xali/mascota-principal.png" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-profesor-600 dark:text-profesor-300">
              Paso {index + 1} de {steps.length}
            </p>
            <h2 id="tour-title" className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {step.body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            onClick={finish}
          >
            Omitir
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            {step.route && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onNavigate(step.route)}
              >
                Abrir sección
              </button>
            )}
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={isFirst}
            >
              <ChevronLeft className="h-4 w-4" />
              Regresar
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              onClick={() => (isLast ? finish() : setIndex((value) => value + 1))}
            >
              {isLast ? 'Finalizar' : 'Avanzar'}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SidebarContent({ user, items, theme, location, onClose, onLogout }) {
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
                  flex items-center gap-3 px-3 py-3.5 rounded-xl text-base
                  transition-all duration-150 relative group
                  ${active
                    ? `${theme.activeItem}`
                    : `text-gray-600 dark:text-gray-300 ${theme.hoverItem}`
                  }
                `}
              >
              {/* active left bar */}
              {active && (
                <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full ${theme.activeBar}`} />
              )}
              <Icon className={`w-5 h-5 shrink-0 ${active ? theme.iconActive : 'text-gray-400 group-hover:text-current'}`} />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 space-y-1 shrink-0">
        <Link
          to="/perfil"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-3.5 rounded-xl text-base text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-400" />
          Configuración
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />
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
  const [xaliSettings, setXaliSettings] = useState(null);
  const contentRef          = useRef(null);

  const items = NAV_ITEMS[user?.rol] || [];
  const theme = ROLE_THEME[user?.rol] || ROLE_THEME.estudiante;

  usePageMotion(contentRef, [location.pathname]);

  useEffect(() => {
    if (!user?.rol) return;
    let alive = true;
    api.get('/xali/settings')
      .then((res) => {
        if (alive) setXaliSettings(res.data || {});
      })
      .catch(() => {
        if (alive) setXaliSettings({});
      });
    return () => {
      alive = false;
    };
  }, [user?.rol]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const ini = initials(user?.nombre, user?.apellido);

  return (
    <div className="flex h-screen bg-surface dark:bg-gray-950 overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-surface-border dark:border-gray-800 bg-white dark:bg-gray-900">
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
          fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-900 shadow-xl
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
        <header className="h-16 shrink-0 bg-white dark:bg-gray-900 border-b border-surface-border dark:border-gray-800 flex items-center px-4 gap-4">
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User chip */}
          <div className="flex items-center gap-3">
            <ThemeToggle className="bg-transparent border-0 hover:bg-gray-100 dark:hover:bg-gray-800" />
            <Link to="/perfil" className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <div className="text-right hidden sm:block">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {user?.nombre} {user?.apellido}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{theme.badgeLabel}</p>
              </div>
              <div className={`w-10 h-10 rounded-full ${theme.avatar} flex items-center justify-center text-base font-bold ring-2 ${theme.ring}`}>
                {ini}
              </div>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 dark-compat">
          <div ref={contentRef} className="min-h-full">
            {children}
          </div>
        </main>
      </div>
      <FloatingXaliChat
        role={user?.rol}
        mascotUrl={xaliSettings?.profesor_mascot_url || '/xali/mascota-principal.png'}
        pathname={location.pathname}
      />
      <FirstVisitTour
        role={user?.rol}
        userId={user?.id || user?.correo}
        onNavigate={(path) => navigate(path)}
      />
    </div>
  );
}
