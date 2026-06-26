import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Plus, BookOpen, Users, FileText, Copy, X, Search,
  GraduationCap, Trash2, Upload, Clock, CalendarDays,
  ChevronRight, Award, CheckCircle,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageGuide from '../../components/GuidedTour';

const CARD_COLORS = [
  { gradient: 'from-blue-500 to-indigo-600',   iconBg: 'bg-blue-100 dark:bg-blue-900/40',   iconColor: 'text-blue-600 dark:text-blue-400',   band: 'from-blue-500 to-indigo-600' },
  { gradient: 'from-emerald-500 to-teal-600',  iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400', band: 'from-emerald-500 to-teal-600' },
  { gradient: 'from-violet-500 to-purple-600', iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400', band: 'from-violet-500 to-purple-600' },
  { gradient: 'from-rose-500 to-pink-600',     iconBg: 'bg-rose-100 dark:bg-rose-900/40',   iconColor: 'text-rose-600 dark:text-rose-400',   band: 'from-rose-500 to-pink-600' },
  { gradient: 'from-amber-500 to-orange-600',  iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', band: 'from-amber-500 to-orange-600' },
];

const DAY_OPTIONS = [
  { value: 'lunes',     label: 'Lunes' },
  { value: 'martes',    label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves',    label: 'Jueves' },
  { value: 'viernes',   label: 'Viernes' },
  { value: 'sabado',    label: 'Sábado' },
  { value: 'domingo',   label: 'Domingo' },
];

const buildDefaultEncuentros = (count) => {
  const safeCount = Math.min(Math.max(Number(count) || 1, 1), 7);
  return DAY_OPTIONS.slice(0, safeCount).map((day) => ({
    dia_semana: day.value,
    hora_inicio: '07:00',
    hora_fin: '08:00',
  }));
};

export default function ProfesorMaterias() {
  const navigate = useNavigate();
  const [materias, setMaterias]                 = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [showCreate, setShowCreate]             = useState(false);
  const [nombre, setNombre]                     = useState('');
  const [dbaTexto, setDbaTexto]                 = useState('');
  const [planTexto, setPlanTexto]               = useState('');
  const [encuentrosSemana, setEncuentrosSemana] = useState(1);
  const [encuentros, setEncuentros]             = useState(buildDefaultEncuentros(1));
  const [dbaFile, setDbaFile]                   = useState(null);
  const dbaFileRef                              = useRef(null);
  const [searchTerm, setSearchTerm]             = useState('');
  const [stats, setStats]                       = useState({});
  const [deleteConfirm, setDeleteConfirm]       = useState(null);
  const [showAdvanced, setShowAdvanced]         = useState(false);

  const resetCreateForm = () => {
    setNombre(''); setDbaTexto(''); setPlanTexto('');
    setEncuentrosSemana(1); setEncuentros(buildDefaultEncuentros(1));
    setDbaFile(null); setShowAdvanced(false);
    if (dbaFileRef.current) dbaFileRef.current.value = '';
  };

  const closeCreateModal = () => { setShowCreate(false); resetCreateForm(); };

  const updateEncuentro = (index, field, value) =>
    setEncuentros((prev) => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));

  const updateEncuentrosSemana = (countValue) => {
    const count = Math.min(Math.max(Number(countValue) || 1, 1), 7);
    setEncuentrosSemana(count);
    setEncuentros((prev) => {
      if (prev.length === count) return prev;
      if (prev.length > count)  return prev.slice(0, count);
      const usados = new Set(prev.map((e) => e.dia_semana));
      const nuevos = [...prev];
      while (nuevos.length < count) {
        const sig = DAY_OPTIONS.find((d) => !usados.has(d.value))?.value || DAY_OPTIONS[0].value;
        usados.add(sig);
        nuevos.push({ dia_semana: sig, hora_inicio: '07:00', hora_fin: '08:00' });
      }
      return nuevos;
    });
  };

  const validateEncuentros = () => {
    if (!encuentros.length) { toast.error('Configura al menos un día de clase'); return false; }
    const dias = encuentros.map((e) => e.dia_semana);
    if (new Set(dias).size !== dias.length) { toast.error('No puedes repetir días de la semana'); return false; }
    for (const e of encuentros) {
      if (!e.hora_inicio || !e.hora_fin) { toast.error('Completa la hora de inicio y fin en todos los días'); return false; }
      if (e.hora_fin <= e.hora_inicio)   { toast.error('La hora de fin debe ser después de la de inicio'); return false; }
    }
    return true;
  };

  const fetchMaterias = async () => {
    try {
      const res = await api.get('/materias/mis-materias');
      setMaterias(res.data);
      const statsMap = {};
      await Promise.all(res.data.map(async (m) => {
        try {
          const [studRes, exRes] = await Promise.all([
            api.get(`/materias/${m.id}/estudiantes`),
            api.get(`/examenes/materia/${m.id}`),
          ]);
          statsMap[m.id] = {
            estudiantes:    studRes.data.length,
            examenes:       exRes.data.length,
            examenesOnline: exRes.data.filter(e => e.activo_online).length,
          };
        } catch {
          statsMap[m.id] = { estudiantes: 0, examenes: 0, examenesOnline: 0 };
        }
      }));
      setStats(statsMap);
    } catch { toast.error('Error cargando materias'); }
    finally  { setLoading(false); }
  };

  useEffect(() => { fetchMaterias(); }, []);

  const createMateria = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) { toast.error('Escribe el nombre de la materia'); return; }
    if (!validateEncuentros()) return;
    try {
      const res = await api.post('/materias/', {
        nombre: nombre.trim(), encuentros,
        dba_json:  dbaTexto.trim()  ? { texto: dbaTexto.trim() }  : null,
        plan_json: planTexto.trim() ? { texto: planTexto.trim() } : null,
      });
      const materiaId = res.data?.id;
      if (dbaFile && materiaId) {
        try {
          const fd = new FormData();
          fd.append('titulo', 'DBA y plan curricular');
          fd.append('file', dbaFile);
          await api.post(`/materias/${materiaId}/curriculo/documentos`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          toast.success('¡Materia creada con éxito!');
        } catch {
          toast.success('¡Materia creada! (puedes subir el DBA desde el panel de la materia)');
        }
      } else {
        toast.success('¡Materia creada con éxito!');
      }
      closeCreateModal(); fetchMaterias();
    } catch (err) { toast.error(err.response?.data?.detail || 'Ocurrió un error, intenta de nuevo'); }
  };

  const copyCodigo = (e, codigo) => {
    e.preventDefault(); e.stopPropagation();
    navigator.clipboard.writeText(codigo);
    toast.success(`Código ${codigo} copiado`);
  };

  const handleDelete = async (materiaId) => {
    try {
      await api.delete(`/materias/${materiaId}`);
      toast.success('Materia eliminada');
      setDeleteConfirm(null); fetchMaterias();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error eliminando la materia');
      setDeleteConfirm(null);
    }
  };

  const filtered = materias.filter((m) =>
    m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader type="card" count={3} />
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Mis Materias</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {materias.length === 0
              ? 'Todavía no tienes materias. ¡Crea la primera!'
              : `Tienes ${materias.length} ${materias.length === 1 ? 'materia' : 'materias'}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 self-start sm:self-auto">
          <PageGuide
            storageKey="guide-profesor-materias"
            steps={[
              { title: 'Crea tu primera materia', body: 'Toca aqui y ponle el nombre que usas en clase. Despues podras sumar estudiantes, DBA y periodos.', selector: '[data-guide="crear-materia"]' },
              { title: 'El codigo para invitar', body: 'Cada tarjeta muestra un codigo. Tocalo para copiarlo y pasalo a tus estudiantes: con ese codigo se inscriben solos.', selector: '[data-guide="lista-materias"]' },
              { title: 'Entra a la materia', body: 'Toca una tarjeta para abrir su espacio de trabajo, donde estan los estudiantes, examenes, notas y reportes.', selector: '[data-guide="lista-materias"]' },
            ]}
          />
          <button
            data-guide="crear-materia"
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 text-base px-5 py-3">
            <Plus className="w-5 h-5" />
            Crear nueva materia
          </button>
        </div>
      </div>

      {/* ── Búsqueda (solo si hay materias) ───────────────────────────────── */}
      {materias.length > 1 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            data-guide="buscar-materia"
            type="text"
            placeholder="Buscar materia por nombre…"
            className="input-field pl-11 text-base py-3"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {/* ── Lista de materias ─────────────────────────────────────────────── */}
      {materias.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aún no tienes materias"
          description="Crea tu primera materia para comenzar a usar la plataforma. Solo necesitas el nombre y el horario de clases."
          action={
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-base px-6 py-3">
              <Plus className="w-5 h-5" /> Crear mi primera materia
            </button>
          }
        />
      ) : (
        <div data-guide="lista-materias" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((m, index) => {
            const s = stats[m.id] || { estudiantes: 0, examenes: 0, examenesOnline: 0 };
            const cc = CARD_COLORS[index % CARD_COLORS.length];
            return (
              <article key={m.id}
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
                className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm hover:shadow-lg dark:hover:shadow-gray-900/40 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden animate-fade-up animate-fill-both">

                {/* Banda de color superior (más gruesa y vistosa) */}
                <div className={`h-3 bg-gradient-to-r ${cc.gradient}`} />

                <div className="p-5 sm:p-6">
                  {/* Encabezado de la tarjeta */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-14 h-14 rounded-2xl ${cc.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                        <GraduationCap className={`w-8 h-8 ${cc.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                          {m.nombre}
                        </h2>
                        <button
                          onClick={(e) => copyCodigo(e, m.codigo)}
                          title="Toca para copiar el código de inscripción"
                          className="flex items-center gap-1.5 mt-1.5 text-base text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 font-mono font-semibold transition-colors">
                          <Copy className="w-4 h-4" />
                          Código: <strong>{m.codigo}</strong>
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(m.id)}
                      title="Eliminar esta materia"
                      className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Indicadores clave — chips grandes */}
                  <div className="flex flex-wrap items-center gap-3 mb-5">
                    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-xl px-3.5 py-2.5">
                      <Users className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="text-base font-bold text-blue-800 dark:text-blue-300">
                        {s.estudiantes} {s.estudiantes === 1 ? 'alumno' : 'alumnos'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/40 rounded-xl px-3.5 py-2.5">
                      <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span className="text-base font-bold text-purple-800 dark:text-purple-300">
                        {s.examenes} {s.examenes === 1 ? 'examen' : 'exámenes'}
                      </span>
                    </div>
                    {s.examenesOnline > 0 && (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/40 rounded-xl px-3.5 py-2.5">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                        <span className="text-base font-bold text-green-800 dark:text-green-300">
                          ¡Examen activo!
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Acceso rápido — botones grandes con icono + texto */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Link to={`/profesor/materia/${m.id}#estudiantes`}
                      className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border-2 border-blue-100 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 transition-colors text-center">
                      <Users className="w-6 h-6" />
                      <span className="text-sm font-bold">Mis alumnos</span>
                    </Link>
                    <Link to={`/profesor/materia/${m.id}#calificaciones`}
                      className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border-2 border-amber-100 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300 transition-colors text-center">
                      <Award className="w-6 h-6" />
                      <span className="text-sm font-bold">Calificar</span>
                    </Link>
                    <Link to={`/profesor/materia/${m.id}#examenes`}
                      className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border-2 border-purple-100 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 transition-colors text-center">
                      <FileText className="w-6 h-6" />
                      <span className="text-sm font-bold">Exámenes</span>
                    </Link>
                  </div>

                  {/* CTA principal */}
                  <Link to={`/profesor/materia/${m.id}`}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base bg-gradient-to-r ${cc.gradient} hover:opacity-90 active:scale-[0.98] transition-all shadow-sm`}>
                    Entrar a la materia
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && searchTerm && materias.length > 0 && (
        <div className="text-center py-10">
          <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            No encontré ninguna materia con el nombre "<strong>{searchTerm}</strong>"
          </p>
          <button onClick={() => setSearchTerm('')} className="mt-3 text-primary-600 dark:text-primary-400 text-sm underline">
            Ver todas mis materias
          </button>
        </div>
      )}

      {/* ── Modal: Crear materia ───────────────────────────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
          onClick={closeCreateModal}>
          <div
            className="bg-white dark:bg-gray-900 w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-scale-in"
            onClick={(e) => e.stopPropagation()}>

            {/* Drag handle — solo móvil */}
            <div className="flex justify-center pt-3 pb-0 flex-shrink-0 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Encabezado del modal */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva materia</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Solo necesitas el nombre y el horario</p>
                </div>
              </div>
              <button
                onClick={closeCreateModal}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createMateria} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5 space-y-6">

                {/* Nombre — campo obligatorio y principal */}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    ¿Cómo se llama la materia? <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Matemáticas Grado 5°, Español 8°B…"
                    className="input-field text-base py-3"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    Ponle el nombre que usas normalmente con tus estudiantes.
                  </p>
                </div>

                {/* Horario de clases */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      ¿Cuántos días a la semana tienes clase? <span className="text-red-500">*</span>
                    </label>
                  </div>
                  <select
                    className="input-field text-base py-3 mb-4"
                    value={encuentrosSemana}
                    onChange={(e) => updateEncuentrosSemana(e.target.value)}>
                    {[1,2,3,4,5,6,7].map((num) => (
                      <option key={num} value={num}>
                        {num === 1 ? '1 día por semana' : `${num} días por semana`}
                      </option>
                    ))}
                  </select>

                  <div className="space-y-3">
                    {encuentros.map((enc, idx) => (
                      <div key={`enc-${idx}`} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          Día {idx + 1} de clase
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Día de la semana</p>
                            <select
                              className="input-field py-2.5"
                              value={enc.dia_semana}
                              onChange={(e) => updateEncuentro(idx, 'dia_semana', e.target.value)}>
                              {DAY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Hora de inicio</p>
                            <input
                              type="time"
                              className="input-field py-2.5"
                              value={enc.hora_inicio}
                              onChange={(e) => updateEncuentro(idx, 'hora_inicio', e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Hora de fin</p>
                            <input
                              type="time"
                              className="input-field py-2.5"
                              value={enc.hora_fin}
                              onChange={(e) => updateEncuentro(idx, 'hora_fin', e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opciones avanzadas (colapsadas por defecto) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-medium hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
                    <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                    {showAdvanced ? 'Ocultar opciones adicionales' : 'Agregar DBA o plan curricular (opcional)'}
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-4 pl-1">
                      <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                          DBA o estándares del colegio
                          <span className="ml-2 text-xs font-normal text-gray-400">· opcional</span>
                        </label>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                          La IA usará este texto para crear mejores exámenes y actividades acordes al programa de tu institución.
                        </p>
                        <textarea
                          className="input-field resize-none"
                          rows={3}
                          value={dbaTexto}
                          onChange={(e) => setDbaTexto(e.target.value)}
                          placeholder="Copia y pega aquí los DBA, estándares o el texto que el colegio te entregó…"
                        />
                        <div className="flex items-center gap-2 my-3">
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                          <span className="text-xs text-gray-400 font-medium">o sube un archivo PDF</span>
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        </div>
                        {dbaFile ? (
                          <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
                            <FileText className="w-4 h-4 text-primary-500 shrink-0" />
                            <span className="text-sm text-primary-700 dark:text-primary-300 truncate flex-1 min-w-0">{dbaFile.name}</span>
                            <button type="button"
                              onClick={() => { setDbaFile(null); if (dbaFileRef.current) dbaFileRef.current.value = ''; }}
                              className="p-0.5 rounded text-gray-400 hover:text-red-500 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center gap-2 cursor-pointer w-full px-4 py-5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors">
                            <Upload className="w-6 h-6 text-gray-400" />
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Toca aquí para subir un archivo</span>
                            <span className="text-xs text-gray-400">Formatos: PDF, imagen (PNG, JPG)</span>
                            <input ref={dbaFileRef} type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
                              className="hidden" onChange={(e) => setDbaFile(e.target.files[0] || null)} />
                          </label>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                          Metas o plan del periodo
                          <span className="ml-2 text-xs font-normal text-gray-400">· opcional</span>
                        </label>
                        <textarea
                          className="input-field resize-none"
                          rows={3}
                          value={planTexto}
                          onChange={(e) => setPlanTexto(e.target.value)}
                          placeholder="Escribe aquí las metas del periodo, evidencias esperadas o lo que quieres lograr con los estudiantes…"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500 pb-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                  Al crear la materia se generará automáticamente un <strong>código único</strong> para que tus estudiantes puedan inscribirse.
                </p>
              </div>

              {/* Botones del modal */}
              <div className="flex gap-3 px-5 sm:px-6 py-4 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                <button type="button" onClick={closeCreateModal} className="btn-secondary flex-1 py-3 text-base">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1 py-3 text-base">
                  Crear materia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar esta materia?"
        message="Se eliminará la materia y todos los exámenes que creaste para ella. Esta acción no se puede deshacer."
        confirmText="Sí, eliminar"
        variant="danger"
      />
    </div>
  );
}
