import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import Breadcrumb from '../../components/Breadcrumb';
import {
  FileText, Users, Award, Home,
  BookOpen, Copy, Loader2, BarChart3, CalendarCheck, ScrollText,
  Trash2, Upload, CheckCircle, ChevronRight, Sparkles,
} from 'lucide-react';

import ProfesorExamenes from './Examenes';
import MateriaEstudiantes from './MateriaEstudiantes';
import MateriaCalificaciones from './MateriaCalificaciones';
import MateriaReportes from './MateriaReportes';
import MateriaBoletines from './MateriaBoletines';
import MateriaAsistencia from './MateriaAsistencia';
import PageGuide from '../../components/GuidedTour';

const TABS = [
  { key: 'panel',           label: 'Inicio',          desc: 'Resumen y accesos rápidos',   icon: Home,           mobileLabel: 'Inicio' },
  { key: 'estudiantes',     label: 'Mis alumnos',     desc: 'Ver quién se inscribió',       icon: Users,          mobileLabel: 'Alumnos' },
  { key: 'asistencia',      label: 'Asistencia',      desc: 'Toma lista de quién vino',     icon: CalendarCheck,  mobileLabel: 'Asistencia' },
  { key: 'examenes',        label: 'Exámenes',        desc: 'Crea y asigna exámenes con IA',icon: FileText,       mobileLabel: 'Exámenes' },
  { key: 'calificaciones',  label: 'Calificar',       desc: 'Pon notas a los exámenes',     icon: Award,          mobileLabel: 'Notas' },
  { key: 'reportes',        label: 'Reportes',        desc: 'Resultados y estadísticas',    icon: BarChart3,      mobileLabel: 'Reportes' },
  { key: 'boletines',       label: 'Boletines',       desc: 'Genera boletines de notas',    icon: ScrollText,     mobileLabel: 'Boletines' },
  { key: 'curriculo',       label: 'DBA / Currículo', desc: 'Sube el plan de estudios',     icon: BookOpen,       mobileLabel: 'DBA' },
];

export default function MateriaDetail() {
  const { materiaId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [materia, setMateria] = useState(null);
  const [loading, setLoading] = useState(true);

  const hash = location.hash?.replace('#', '') || 'panel';
  const activeTab = TABS.find(t => t.key === hash)?.key || 'panel';

  const setActiveTab = (key) => navigate(`#${key}`, { replace: true });

  useEffect(() => {
    api.get('/materias/mis-materias')
      .then(res => {
        const found = res.data.find(m => m.id === materiaId);
        if (found) {
          setMateria(found);
        } else {
          toast.error('Materia no encontrada');
          navigate('/profesor/materias');
        }
      })
      .catch(() => {
        toast.error('Error cargando materia');
        navigate('/profesor/materias');
      })
      .finally(() => setLoading(false));
  }, [materiaId]);

  const copyCodigo = () => {
    if (materia?.codigo) {
      navigator.clipboard.writeText(materia.codigo);
      toast.success(`Código ${materia.codigo} copiado`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-5 w-48 rounded" />
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-4">
            <div className="skeleton w-14 h-14 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-6 w-56 rounded" />
              <div className="skeleton h-4 w-32 rounded" />
            </div>
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 pb-0">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-11 w-24 rounded-t-xl" />)}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!materia) return null;
  const activeTabInfo = TABS.find(t => t.key === activeTab) || TABS[0];

  // Explicación específica de cada pestaña (lo nuevo de cada sección).
  const TAB_GUIDE = {
    estudiantes:    'Aqui ves quien se inscribio con el codigo y puedes administrar la lista de tu clase.',
    asistencia:     'Toma lista de quien asistio cada dia. Esto puede pesar en la nota final desde Reportes.',
    examenes:       'Crea examenes y actividades con IA y asignalos a esta materia para que tus estudiantes los resuelvan.',
    calificaciones: 'Revisa los examenes resueltos y ponles nota, con apoyo de la IA cuando aplique.',
    reportes:       'Calcula la nota final combinando actividades, asistencia y participacion con los porcentajes que tu definas.',
    boletines:      'Genera y publica los boletines de notas del periodo para tus estudiantes.',
    curriculo:      'Sube el plan de estudios o los DBA. La IA los usa como base para crear actividades acordes a tu materia.',
  };

  // En la pestaña de inicio damos la bienvenida al espacio; en las demas
  // mostramos solo lo nuevo de esa seccion para no repetir lo ya explicado.
  const guideSteps = activeTab === 'panel'
    ? [
        { title: 'El espacio de tu materia', body: 'Desde aqui administras todo lo de esta clase: alumnos, asistencia, examenes, notas, reportes, boletines y DBA.' },
        { title: 'Comparte el codigo', body: 'Toca el codigo para copiarlo y pasalo a tus estudiantes: con el se inscriben a esta materia.', selector: '[data-guide="materia-codigo"]' },
        { title: 'Navega por pestanas', body: 'Cada pestana es una tarea distinta. Al abrir una por primera vez te explico que puedes hacer en ella.', selector: '[data-guide="materia-tabs"]' },
      ]
    : [
        { title: activeTabInfo.label, body: TAB_GUIDE[activeTab] || activeTabInfo.desc || 'En esta seccion trabajas la parte seleccionada de la materia.', selector: '[data-guide="materia-contenido"]' },
      ];

  return (
    <div className="space-y-0">
      <Breadcrumb items={[
        { label: 'Mis materias', to: '/profesor/materias' },
        { label: materia.nombre },
      ]} />

      {/* Header de la materia */}
      <div className="bg-gradient-to-r from-primary-600 to-indigo-600 rounded-2xl p-5 sm:p-7 mb-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
            <BookOpen className="w-9 h-9 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{materia.nombre}</h1>
            <button
              data-guide="materia-codigo"
              onClick={copyCodigo}
              title="Toca para copiar el código"
              className="flex items-center gap-1.5 mt-2 text-base text-white/90 hover:text-white transition-colors font-mono">
              <Copy className="w-4 h-4 shrink-0" />
              <span>Código: <strong>{materia.codigo}</strong></span>
              <span className="ml-1 text-sm bg-white/20 px-2 py-0.5 rounded-lg font-sans">Copiar</span>
            </button>
          </div>
          </div>
          <PageGuide
            storageKey={`guide-profesor-materia-${activeTab}`}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            steps={guideSteps}
          />
        </div>
      </div>

      {/* Navegación por tabs */}
      <div className="mb-6 -mx-3 sm:mx-0">
        {/* Contenedor con fade a la derecha para indicar scroll en móvil */}
        <div className="relative">
          <div data-guide="materia-tabs" className="flex overflow-x-auto scrollbar-hide border-b border-gray-200 dark:border-gray-700 px-3 sm:px-0">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 sm:px-5 py-4 text-base font-bold whitespace-nowrap border-b-2 transition-colors shrink-0
                    ${isActive
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                </button>
              );
            })}
          </div>
          {/* Fade que sugiere que hay más tabs al scrollear */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white dark:from-gray-950 sm:hidden" />
        </div>
        {TABS.find(t => t.key === activeTab)?.desc && (
          <p className="text-sm font-medium text-primary-600 dark:text-primary-400 px-3 sm:px-0 pt-2">
            {TABS.find(t => t.key === activeTab).desc}
          </p>
        )}
      </div>

      {/* Contenido del tab */}
      <div data-guide="materia-contenido">
        {activeTab === 'panel'          && <PanelInicio materiaId={materiaId} materia={materia} copyCodigo={copyCodigo} setActiveTab={setActiveTab} />}
        {activeTab === 'examenes'       && <ProfesorExamenes materiaId={materiaId} embedded />}
        {activeTab === 'estudiantes'    && <MateriaEstudiantes materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'calificaciones' && <MateriaCalificaciones materiaId={materiaId} />}
        {activeTab === 'reportes'       && <MateriaReportes materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'boletines'      && <MateriaBoletines materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'asistencia'     && <MateriaAsistencia materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'curriculo'      && <MateriaCurriculo materiaId={materiaId} />}
      </div>
    </div>
  );
}

/* ─── Panel de inicio ────────────────────────────────────────────────────── */

function PanelInicio({ materiaId, materia, copyCodigo, setActiveTab }) {
  const [stats, setStats] = useState({ estudiantes: 0, examenes: 0, examenesOnline: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/materias/${materiaId}/estudiantes`),
      api.get(`/examenes/materia/${materiaId}`),
    ]).then(([studRes, exRes]) => {
      setStats({
        estudiantes:    studRes.data.length,
        examenes:       exRes.data.length,
        examenesOnline: exRes.data.filter(e => e.activo_online).length,
      });
    }).catch(() => {}).finally(() => setLoadingStats(false));
  }, [materiaId]);

  const ACCIONES = [
    {
      icon: Users,
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50',
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      title: 'Ver mis alumnos',
      desc: 'Mira quién ya se inscribió en esta materia',
      tab: 'estudiantes',
    },
    {
      icon: CalendarCheck,
      color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50',
      iconColor: 'text-green-600 dark:text-green-400',
      iconBg: 'bg-green-100 dark:bg-green-900/40',
      title: 'Tomar asistencia',
      desc: 'Registra quién vino a clase hoy',
      tab: 'asistencia',
    },
    {
      icon: Sparkles,
      color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/50',
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-100 dark:bg-purple-900/40',
      title: 'Crear un examen con IA',
      desc: 'La IA te ayuda a crear el examen en minutos',
      tab: 'examenes',
    },
    {
      icon: Award,
      color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50',
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      title: 'Poner notas',
      desc: 'Califica los exámenes que ya hicieron',
      tab: 'calificaciones',
    },
  ];

  return (
    <div className="space-y-6">

      {/* Código de inscripción — lo más importante al inicio */}
      <div className="bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 border-2 border-primary-300 dark:border-primary-700/60 rounded-2xl p-5 sm:p-7">
        <p className="text-lg font-bold text-primary-800 dark:text-primary-300 mb-1">
          Código de inscripción
        </p>
        <p className="text-sm text-primary-600 dark:text-primary-400 mb-5">
          Comparte este código con tus estudiantes — ellos lo usan para inscribirse desde la app.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="text-5xl sm:text-7xl font-black font-mono tracking-[0.3em] text-primary-700 dark:text-primary-300 bg-white dark:bg-gray-800 px-8 py-5 rounded-2xl border-2 border-primary-300 dark:border-primary-600 w-full sm:w-auto text-center shadow-inner">
            {materia.codigo}
          </div>
          <button
            onClick={copyCodigo}
            className="btn-primary flex items-center gap-2 text-lg px-8 py-4 w-full sm:w-auto justify-center rounded-xl">
            <Copy className="w-5 h-5" />
            Copiar código
          </button>
        </div>
      </div>

      {/* Resumen de la materia */}
      {!loadingStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800/50 rounded-2xl p-5 text-center">
            <p className="text-4xl font-black text-blue-700 dark:text-blue-300">{stats.estudiantes}</p>
            <p className="text-base font-semibold text-blue-600 dark:text-blue-400 mt-1">
              {stats.estudiantes === 1 ? 'alumno inscrito' : 'alumnos inscritos'}
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800/50 rounded-2xl p-5 text-center">
            <p className="text-4xl font-black text-purple-700 dark:text-purple-300">{stats.examenes}</p>
            <p className="text-base font-semibold text-purple-600 dark:text-purple-400 mt-1">
              {stats.examenes === 1 ? 'examen creado' : 'exámenes creados'}
            </p>
          </div>
          {stats.examenesOnline > 0 ? (
            <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700/60 rounded-2xl p-5 text-center col-span-2 sm:col-span-1">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                <p className="text-4xl font-black text-green-700 dark:text-green-300">{stats.examenesOnline}</p>
              </div>
              <p className="text-base font-semibold text-green-700 dark:text-green-400">
                {stats.examenesOnline === 1 ? '¡examen activo ahora!' : '¡exámenes activos!'}
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/60 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-5 text-center col-span-2 sm:col-span-1">
              <p className="text-4xl font-black text-gray-400 dark:text-gray-500">0</p>
              <p className="text-base font-semibold text-gray-400 dark:text-gray-500 mt-1">exámenes activos</p>
            </div>
          )}
        </div>
      )}

      {/* Guía para comenzar — solo si no hay alumnos */}
      {!loadingStats && stats.estudiantes === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800/40 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-amber-800 dark:text-amber-300 mb-4 flex items-center gap-2">
            <span className="text-2xl">👋</span> ¿Por dónde empezar?
          </h3>
          <ol className="space-y-4">
            {[
              { n: 1, text: `Copia el código ${materia.codigo} y envíaselo a tus estudiantes (por WhatsApp, escríbelo en el tablero, etc.)` },
              { n: 2, text: 'Pídeles que descarguen la app XCalificator y se inscriban usando ese código.' },
              { n: 3, text: 'Una vez inscritos, ya puedes tomar asistencia y crear exámenes para ellos.' },
            ].map(({ n, text }) => (
              <li key={n} className="flex items-start gap-4">
                <span className="w-9 h-9 rounded-full bg-amber-300 dark:bg-amber-700 text-amber-900 dark:text-amber-100 font-black text-base flex items-center justify-center shrink-0 mt-0.5">
                  {n}
                </span>
                <p className="text-base text-amber-800 dark:text-amber-300 leading-relaxed">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Acciones rápidas */}
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">¿Qué quieres hacer?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ACCIONES.map(({ icon: Icon, color, iconColor, iconBg, title, desc, tab }) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg active:scale-[0.98] ${color}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
                <Icon className={`w-8 h-8 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight">{title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ─── Currículo / DBA ────────────────────────────────────────────────────── */

function MateriaCurriculo({ materiaId }) {
  const [docs, setDocs]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]   = useState({ titulo: 'DBA y plan de aula', texto: '', file: null });

  const fetchDocs = async () => {
    try {
      const res = await api.get(`/materias/${materiaId}/curriculo/documentos`);
      setDocs(res.data || []);
    } catch {
      toast.error('No se pudieron cargar los documentos curriculares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, [materiaId]);

  const uploadDoc = async () => {
    if (!form.texto.trim() && !form.file) {
      toast.error('Pega texto o selecciona un archivo');
      return;
    }
    const data = new FormData();
    data.append('titulo', form.titulo || 'Documento curricular');
    data.append('texto', form.texto || '');
    if (form.file) data.append('file', form.file);
    setSaving(true);
    try {
      await api.post(`/materias/${materiaId}/curriculo/documentos`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Documento agregado correctamente');
      setForm({ titulo: 'DBA y plan de aula', texto: '', file: null });
      await fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo subir el documento');
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (docId) => {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await api.delete(`/materias/${materiaId}/curriculo/documentos/${docId}`);
      toast.success('Documento eliminado');
      fetchDocs();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-2xl p-5">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">DBA y plan curricular</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sube aquí los DBA o estándares del colegio. La IA los usará para crear mejores exámenes y actividades.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Nombre del documento
            </label>
            <input className="input-field" value={form.titulo}
              onChange={(e) => setForm(prev => ({ ...prev, titulo: e.target.value }))} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Pega el texto aquí <span className="font-normal text-gray-400">(opcional si subes archivo)</span>
            </label>
            <textarea className="input-field min-h-[120px] resize-none" value={form.texto}
              onChange={(e) => setForm(prev => ({ ...prev, texto: e.target.value }))}
              placeholder="Copia y pega aquí los DBA, desempeños, metas o plan de aula…" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              O sube un archivo PDF <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <input type="file"
              accept=".pdf,.txt,.png,.jpg,.jpeg,application/pdf,text/plain,image/png,image/jpeg"
              className="input-field"
              onChange={(e) => setForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))} />
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={uploadDoc} disabled={saving}
            className="btn-primary flex items-center gap-2 px-5 py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Guardar documento
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">Documentos guardados</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : docs.length === 0 ? (
          <div className="text-center py-6">
            <BookOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aún no hay documentos. Sube los DBA de la materia para que la IA los use.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id}
                className="flex items-start justify-between gap-3 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{doc.titulo}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {doc.chunks_count} fragmentos · {doc.fuente_tipo}
                  </p>
                  {doc.texto_preview && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-2">{doc.texto_preview}</p>
                  )}
                </div>
                <button onClick={() => deleteDoc(doc.id)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 rounded-lg transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
