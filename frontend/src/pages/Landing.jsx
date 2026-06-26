/**
 * Landing page pública: la ven usuarios NO autenticados al entrar a "/".
 * Secciones: Hero, Features, How it works, Pilot results, Testimonials, CTA final, Footer.
 */
import { Link } from 'react-router-dom';
import { useRef } from 'react';
import {
  Sparkles, ScanText, FileText, Brain, MessageSquare, Bell, Shield,
  CheckCircle2, ArrowRight, Mail, Phone, MapPin, Github, Twitter, Linkedin,
  Award, Clock, Users, TrendingUp, Zap, BookOpen, GraduationCap, BarChart3,
} from 'lucide-react';
import TestimonialCard from '../components/TestimonialCard';
import ThemeToggle from '../components/ThemeToggle';
import usePageMotion from '../hooks/usePageMotion';

const FEATURES = [
  {
    icon: ScanText,
    title: 'OCR con IA en segundos',
    description: 'Sube una foto de examen manuscrito. La IA extrae las respuestas y las califica con tu rúbrica.',
  },
  {
    icon: Brain,
    title: 'Calificación con Groq + Ollama',
    description: 'Modelos de lenguaje de última generación. Retroalimentación específica por pregunta.',
  },
  {
    icon: FileText,
    title: 'Genera exámenes con IA',
    description: 'Crea exámenes, sopas de letras, crucigramas y actividades desde un tema y grado escolar.',
  },
  {
    icon: BarChart3,
    title: 'Reportes y boletines',
    description: 'Visualiza el progreso de cada estudiante, materia y periodo en dashboards claros.',
  },
  {
    icon: MessageSquare,
    title: 'Tutor Xali 24/7',
    description: 'Chat con IA que ayuda al estudiante a entender sus errores sin dar las respuestas.',
  },
  {
    icon: Bell,
    title: 'Notificaciones por Telegram',
    description: 'Estudiantes reciben sus notas al instante en su celular, sin correos que se pierden.',
  },
];

const STEPS = [
  {
    n: '01',
    icon: BookOpen,
    title: 'Crea la materia y los estudiantes',
    description: 'Importa tu lista, asigna grados y materias. Todo organizado en un solo lugar.',
  },
  {
    n: '02',
    icon: ScanText,
    title: 'Sube el examen o genéralo con IA',
    description: 'Toma una foto del examen manuscrito o pídele a la IA que lo cree desde un tema.',
  },
  {
    n: '03',
    icon: Award,
    title: 'Califica y comparte al instante',
    description: 'La IA extrae respuestas, califica con tu rúbrica y publica. Recibes retroalimentación por pregunta.',
  },
];

const PILOT_RESULTS = [
  { value: '78%',     label: 'menos tiempo de calificación',  Icon: Clock },
  { value: '4.2×',    label: 'más rápido en exámenes grandes', Icon: Zap },
  { value: '0.84',    label: 'Kappa inter-evaluador (IA vs profesor)', Icon: TrendingUp },
  { value: '4.6/5',   label: 'satisfacción de docentes',       Icon: Users },
];

const TESTIMONIALS = [
  {
    name: 'María Camila Restrepo',
    role: 'Docente de Ciencias Sociales',
    institution: 'IE Comercial San Agustín · Mocoa',
    avatar: 'MR',
    quote: 'Antes me gastaba 3 horas calificando 30 exámenes. Con XCalificator lo hago en 25 minutos y la retroalimentación por pregunta es mejor que la mía.',
    rating: 5,
  },
  {
    name: 'Carlos Andrés Pizo',
    role: 'Coordinador Académico',
    institution: 'IE Comercial San Agustín · Mocoa',
    avatar: 'CP',
    quote: 'El tutor Xali cambió cómo mis estudiantes estudian. Ahora llegan a la clase con preguntas específicas, no con respuestas copiadas.',
    rating: 5,
  },
  {
    name: 'Diana Sofía Lucero',
    role: 'Docente de Matemáticas',
    institution: 'IE Comercial San Agustín · Mocoa',
    avatar: 'DL',
    quote: 'Lo que más me gusta es que la IA explica el error, no solo marca con rojo. Mis estudiantes de quinto ahora corrigen solos.',
    rating: 5,
  },
];

const NAV_LINKS = [
  { label: 'Características', href: '#features' },
  { label: 'Cómo funciona',   href: '#how' },
  { label: 'Resultados',      href: '#results' },
  { label: 'Testimonios',     href: '#testimonials' },
];

export default function Landing() {
  const pageRef = useRef(null);
  usePageMotion(pageRef, []);

  return (
    <div ref={pageRef} className="min-h-screen bg-white dark:bg-gray-950">
      {/* ──────────────────────── NAV ──────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-md shadow-brand-500/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-gray-900 dark:text-white text-lg">XCalificator</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle className="bg-transparent border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300" />
            <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">
              Ingresar
            </Link>
            <Link to="/register" className="btn-primary text-sm">
              Empezar gratis
            </Link>
          </div>
        </nav>
      </header>

      {/* ──────────────────────── HERO ──────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white dark:from-brand-900/20 dark:via-gray-950 dark:to-gray-950">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-brand-200/30 rounded-full blur-3xl" />
          <div className="absolute top-40 right-20 w-96 h-96 bg-accent-200/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-300 text-xs font-semibold rounded-full mb-5">
                <Sparkles className="w-3.5 h-3.5" />
                Piloto activo en la IE Comercial San Agustín · Mocoa, Putumayo
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold text-gray-900 dark:text-white leading-[1.05] tracking-tight text-balance">
                Califica exámenes <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">en minutos</span>, no en horas.
              </h1>

              {/* Subheadline */}
              <p className="mt-5 text-lg sm:text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Plataforma educativa con IA que extrae respuestas manuscritas, califica con tu rúbrica y devuelve retroalimentación específica por pregunta. Diseñada para colegios colombianos.
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
                <Link to="/register" className="btn-gradient text-base px-6 py-3.5">
                  Empezar gratis
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#how" className="btn-secondary text-base px-6 py-3.5">
                  Ver cómo funciona
                </a>
              </div>

              {/* Trust line */}
              <div className="mt-6 flex items-center gap-4 text-xs text-gray-500 justify-center lg:justify-start">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Sin tarjeta de crédito
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Datos seguros en tu servidor
                </div>
              </div>
            </div>

            {/* Mascot */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-200/40 to-accent-200/40 rounded-full blur-3xl" />
              <img
                src="/xali/mascota-principal.png"
                alt="Xali, la mascota de XCalificator"
                className="relative w-64 sm:w-80 lg:w-96 drop-shadow-2xl animate-fade-up"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────── FEATURES ──────────────────────── */}
      <section id="features" className="py-20 sm:py-24 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-sm font-semibold text-brand-600 uppercase tracking-wider">Características</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 dark:text-white mt-2">
              Todo lo que necesitas para evaluar mejor
            </h2>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              Diseñado con docentes colombianos, para el aula colombiana.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group p-6 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-brand-300 dark:hover:border-brand-500 hover:shadow-card-md transition-all duration-200"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-900/30 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/50 flex items-center justify-center mb-4 transition-colors">
                  <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────── HOW IT WORKS ──────────────────────── */}
      <section id="how" className="py-20 sm:py-24 bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-sm font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">Cómo funciona</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 dark:text-white mt-2">
              Tres pasos. En menos de 30 minutos.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-brand-200 via-accent-200 to-brand-200 dark:from-brand-800 dark:via-accent-800 dark:to-brand-800" />

            {STEPS.map(({ n, icon: Icon, title, description }) => (
              <div key={n} className="relative text-center">
                <div className="relative inline-flex w-24 h-24 rounded-3xl bg-white dark:bg-gray-900 border-2 border-brand-200 dark:border-brand-500 items-center justify-center mb-5 shadow-card">
                  <Icon className="w-9 h-9 text-brand-600 dark:text-brand-400" strokeWidth={1.5} />
                  <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white text-xs font-bold flex items-center justify-center shadow-md">
                    {n}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-xs mx-auto">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────── PILOT RESULTS ──────────────────────── */}
      <section id="results" className="py-20 sm:py-24 bg-gradient-to-br from-accent-700 via-accent-800 to-gray-900 dark:from-accent-900 dark:via-gray-900 dark:to-black text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-brand-400 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent-300 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-sm font-semibold text-brand-300 uppercase tracking-wider">Resultados del piloto</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold mt-2 text-balance">
              Lo que medimos en 4 meses con la IE Comercial San Agustín
            </h2>
            <p className="mt-3 text-accent-100">
              Datos reales del piloto controlado. Publicados con permiso de la institución.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PILOT_RESULTS.map(({ value, label, Icon }) => (
              <div key={label} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 text-center hover:bg-white/15 transition-colors">
                <Icon className="w-7 h-7 text-brand-300 mx-auto mb-3" />
                <p className="text-4xl sm:text-5xl font-display font-extrabold text-white tracking-tight">
                  {value}
                </p>
                <p className="text-sm text-accent-100 mt-2 leading-snug">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────── TESTIMONIALS ──────────────────────── */}
      <section id="testimonials" className="py-20 sm:py-24 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">Testimonios</span>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 dark:text-white mt-2">
              Lo que dicen los docentes que lo usan
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────── CTA FINAL ──────────────────────── */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-brand-500 to-brand-700 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <img src="/xali/burbuja-junto.png" alt="" className="absolute -bottom-10 -right-10 w-72 opacity-40" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-balance">
            Empieza a calificar con evidencia hoy
          </h2>
          <p className="mt-4 text-lg text-brand-100">
            Sin tarjeta, sin instalaciones. En 5 minutos tienes tu primera materia con estudiantes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="bg-white text-brand-700 hover:bg-gray-50 font-semibold text-base px-6 py-3.5 rounded-lg inline-flex items-center justify-center gap-2 shadow-lg transition-colors"
            >
              Crear cuenta gratis
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:contacto@xcalificator.app"
              className="bg-transparent border-2 border-white/30 hover:bg-white/10 text-white font-semibold text-base px-6 py-3.5 rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Hablar con el equipo
            </a>
          </div>
        </div>
      </section>

      {/* ──────────────────────── FOOTER ──────────────────────── */}
      <footer className="bg-gray-900 dark:bg-black text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <span className="font-display font-bold text-white">XCalificator</span>
              </div>
              <p className="text-sm leading-relaxed">
                Plataforma educativa con IA, diseñada para instituciones colombianas.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Producto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Características</a></li>
                <li><a href="#how"      className="hover:text-white transition-colors">Cómo funciona</a></li>
                <li><a href="#results"  className="hover:text-white transition-colors">Resultados</a></li>
                <li><Link to="/register" className="hover:text-white transition-colors">Empezar</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Institución</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  Mocoa, Putumayo · Colombia
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 shrink-0" />
                  contacto@xcalificator.app
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 shrink-0" />
                  +57 (8) 429-6000
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Síguenos</h4>
              <div className="flex items-center gap-2">
                <a href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                  <Twitter className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                  <Linkedin className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                  <Github className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <p>© 2026 XCalificator. Hecho con propósito en Colombia.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-white transition-colors">Privacidad</a>
              <a href="#" className="hover:text-white transition-colors">Términos</a>
              <a href="#" className="hover:text-white transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
