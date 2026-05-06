import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Plus, BookOpen, Users, FileText, Copy, X, Search,
  GraduationCap, BarChart3, Sparkles, ChevronRight, Trash2,
} from 'lucide-react';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConfirmDialog from '../../components/ConfirmDialog';

const DAY_OPTIONS = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miercoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
  { value: 'sabado', label: 'Sabado' },
  { value: 'domingo', label: 'Domingo' },
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
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [nombre, setNombre] = useState('');
  const [encuentrosSemana, setEncuentrosSemana] = useState(1);
  const [encuentros, setEncuentros] = useState(buildDefaultEncuentros(1));
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [sortMode, setSortMode] = useState('name_asc');
  const [stats, setStats] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const resetCreateForm = () => {
    setNombre('');
    setEncuentrosSemana(1);
    setEncuentros(buildDefaultEncuentros(1));
  };

  const closeCreateModal = () => {
    setShowCreate(false);
    resetCreateForm();
  };

  const updateEncuentro = (index, field, value) => {
    setEncuentros((prev) => prev.map((encuentro, i) => (
      i === index ? { ...encuentro, [field]: value } : encuentro
    )));
  };

  const updateEncuentrosSemana = (countValue) => {
    const count = Math.min(Math.max(Number(countValue) || 1, 1), 7);
    setEncuentrosSemana(count);

    setEncuentros((prev) => {
      if (prev.length === count) return prev;
      if (prev.length > count) return prev.slice(0, count);

      const usados = new Set(prev.map((item) => item.dia_semana));
      const nuevos = [...prev];

      while (nuevos.length < count) {
        const siguienteDia = DAY_OPTIONS.find((day) => !usados.has(day.value))?.value || DAY_OPTIONS[0].value;
        usados.add(siguienteDia);
        nuevos.push({
          dia_semana: siguienteDia,
          hora_inicio: '07:00',
          hora_fin: '08:00',
        });
      }

      return nuevos;
    });
  };

  const validateEncuentros = () => {
    if (!encuentros.length) {
      toast.error('Configura al menos un encuentro semanal');
      return false;
    }

    const dias = encuentros.map((item) => item.dia_semana);
    if (new Set(dias).size !== dias.length) {
      toast.error('No puedes repetir dias de semana en el horario');
      return false;
    }

    for (const item of encuentros) {
      if (!item.hora_inicio || !item.hora_fin) {
        toast.error('Completa hora de inicio y fin en todos los encuentros');
        return false;
      }
      if (item.hora_fin <= item.hora_inicio) {
        toast.error('La hora de fin debe ser mayor que la hora de inicio');
        return false;
      }
    }

    return true;
  };

  const fetchMaterias = async () => {
    try {
      const res = await api.get('/materias/mis-materias');
      setMaterias(res.data);

      // Fetch stats for each materia (student count + exam count)
      const statsMap = {};
      await Promise.all(
        res.data.map(async (m) => {
          try {
            const [studentsRes, examsRes] = await Promise.all([
              api.get(`/materias/${m.id}/estudiantes`),
              api.get(`/examenes/materia/${m.id}`),
            ]);
            statsMap[m.id] = {
              estudiantes: studentsRes.data.length,
              examenes: examsRes.data.length,
              examenesOnline: examsRes.data.filter(e => e.activo_online).length,
            };
          } catch {
            statsMap[m.id] = { estudiantes: 0, examenes: 0, examenesOnline: 0 };
          }
        })
      );
      setStats(statsMap);
    } catch {
      toast.error('Error cargando materias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMaterias(); }, []);

  const createMateria = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('Ingresa un nombre de materia');
      return;
    }
    if (!validateEncuentros()) return;

    try {
      await api.post('/materias/', {
        nombre: nombre.trim(),
        encuentros,
      });
      toast.success('Materia creada exitosamente');
      closeCreateModal();
      fetchMaterias();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const copyCodigo = (e, codigo) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(codigo);
    toast.success(`Código ${codigo} copiado`);
  };

  const handleDelete = async (materiaId) => {
    try {
      await api.delete(`/materias/${materiaId}`);
      toast.success('Materia eliminada');
      setDeleteConfirm(null);
      fetchMaterias();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error eliminando materia');
      setDeleteConfirm(null);
    }
  };

  // Compute global stats
  const totalEstudiantes = Object.values(stats).reduce((a, s) => a + s.estudiantes, 0);
  const totalExamenes = Object.values(stats).reduce((a, s) => a + s.examenes, 0);
  const totalOnline = Object.values(stats).reduce((a, s) => a + s.examenesOnline, 0);
  const materiasConOnline = Object.values(stats).filter((s) => s.examenesOnline > 0).length;
  const promedioEstudiantes = materias.length > 0 ? Math.round(totalEstudiantes / materias.length) : 0;

  const passesFilter = (materia) => {
    const s = stats[materia.id] || { estudiantes: 0, examenes: 0, examenesOnline: 0 };
    if (filterMode === 'with_students') return s.estudiantes > 0;
    if (filterMode === 'without_students') return s.estudiantes === 0;
    if (filterMode === 'with_online') return s.examenesOnline > 0;
    return true;
  };

  const applySort = (a, b) => {
    const sa = stats[a.id] || { estudiantes: 0, examenes: 0, examenesOnline: 0 };
    const sb = stats[b.id] || { estudiantes: 0, examenes: 0, examenesOnline: 0 };
    if (sortMode === 'students_desc') return sb.estudiantes - sa.estudiantes;
    if (sortMode === 'exams_desc') return sb.examenes - sa.examenes;
    if (sortMode === 'online_desc') return sb.examenesOnline - sa.examenesOnline;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  };

  const filtered = materias
    .filter((m) => (
      m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
    ))
    .filter(passesFilter)
    .sort(applySort);

  const filterPills = [
    { key: 'all', label: 'Todas' },
    { key: 'with_students', label: 'Con estudiantes' },
    { key: 'without_students', label: 'Sin estudiantes' },
    { key: 'with_online', label: 'Con exámenes online' },
  ];

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader type="stats" count={4} />
      <SkeletonLoader type="card" count={3} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 via-blue-50 to-indigo-50 p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold text-primary-700">Panel del profesor</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">Mis Materias</h1>
            <p className="text-sm text-gray-600 mt-2 max-w-2xl">
              Organiza tus cursos, crea evaluaciones con IA y accede rápidamente a reportes y boletines.
            </p>
          </div>
          <div className={`grid grid-cols-1 ${materias.length > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3 w-full lg:w-auto`}>
            {materias.length > 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nueva Materia
              </button>
            )}
            <Link
              to="/profesor/herramientas"
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Herramientas IA
            </Link>
            <Link
              to="/profesor/reportes"
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-4 h-4" /> Reportes
            </Link>
          </div>
        </div>
      </section>

      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Gestión de materias</h2>
          <p className="text-sm text-gray-500 mt-1">Vista consolidada con estado académico por curso</p>
        </div>
      </div>

      {/* Global Stats */}
      {materias.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Materias" value={materias.length} color="blue" />
          <StatCard icon={Users} label="Estudiantes Totales" value={totalEstudiantes} color="green" />
          <StatCard icon={FileText} label="Exámenes Creados" value={totalExamenes} color="purple"
            subtitle={`${promedioEstudiantes} estudiantes por materia`} />
          <StatCard icon={BarChart3} label="Exámenes Online" value={totalOnline} color="indigo"
            subtitle={`${materiasConOnline} materias con online`} />
        </div>
      )}

      {/* Search + Filters */}
      {materias.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Buscar materia por nombre o código..."
                className="input-field pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="input-field"
            >
              <option value="name_asc">Ordenar: Nombre (A-Z)</option>
              <option value="students_desc">Ordenar: Más estudiantes</option>
              <option value="exams_desc">Ordenar: Más exámenes</option>
              <option value="online_desc">Ordenar: Más online</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterPills.map((pill) => {
              const active = filterMode === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setFilterMode(pill.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Materia Cards */}
      {materias.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No tienes materias aún"
          description="Crea tu primera materia para comenzar a generar exámenes, crucigramas y sopas de letras con IA."
          action={
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Crear Mi Primera Materia
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => {
            const s = stats[m.id] || { estudiantes: 0, examenes: 0, examenesOnline: 0 };
            return (
              <article key={m.id}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-primary-200 transition-all duration-200">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-100 to-indigo-100 flex items-center justify-center shrink-0 group-hover:from-primary-200 group-hover:to-indigo-200 transition-colors">
                      <GraduationCap className="w-6 h-6 text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary-700 transition-colors">
                        {m.nombre}
                      </h3>
                      <button onClick={(e) => copyCodigo(e, m.codigo)}
                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-mono mt-0.5">
                        <Copy className="w-3 h-3" /> {m.codigo}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    {s.examenesOnline > 0 && (
                      <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                        Online activo
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(m.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Eliminar materia"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-bold text-gray-900">{s.estudiantes}</p>
                    <p className="text-xs text-gray-500">Estudiantes</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-bold text-gray-900">{s.examenes}</p>
                    <p className="text-xs text-gray-500">Exámenes</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-bold text-primary-600">{s.examenesOnline}</p>
                    <p className="text-xs text-gray-500">Online</p>
                  </div>
                </div>

                {/* Footer action */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => navigate(`/profesor/materia/${m.id}`)}
                    className="text-xs px-2 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/profesor/examenes/${m.id}`)}
                    className="text-xs px-2 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Exámenes
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/profesor/materia/${m.id}#reportes`)}
                    className="text-xs px-2 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Reportes
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/profesor/materia/${m.id}`)}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Ir al panel de la materia <ChevronRight className="w-4 h-4" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && searchTerm && materias.length > 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No se encontraron materias para "{searchTerm}"</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary-50">
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Nueva Materia</h3>
                </div>
                <button onClick={closeCreateModal} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={createMateria}>
                <label className="block text-sm font-medium text-gray-700 mb-1">1. Nombre de la materia</label>
                <input type="text" placeholder="Nombre de la materia" className="input-field mb-3"
                  value={nombre} onChange={e => setNombre(e.target.value)} required
                  autoFocus />

                <label className="block text-sm font-medium text-gray-700 mb-1">2. Encuentros por semana</label>
                <select
                  className="input-field mb-2"
                  value={encuentrosSemana}
                  onChange={(e) => updateEncuentrosSemana(e.target.value)}
                >
                  {Array.from({ length: 7 }, (_, idx) => idx + 1).map((num) => (
                    <option key={num} value={num}>{num} encuentro{num > 1 ? 's' : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mb-3">Define en que dias se reunen y el horario de cada encuentro.</p>

                <div className="space-y-2 mb-4">
                  <p className="text-sm font-medium text-gray-700">3. Horario por encuentro</p>
                  {encuentros.map((encuentro, idx) => (
                    <div key={`encuentro-${idx}`} className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Dia</label>
                        <select
                          className="input-field"
                          value={encuentro.dia_semana}
                          onChange={(e) => updateEncuentro(idx, 'dia_semana', e.target.value)}
                        >
                          {DAY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Hora inicio</label>
                        <input
                          type="time"
                          className="input-field"
                          value={encuentro.hora_inicio}
                          onChange={(e) => updateEncuentro(idx, 'hora_inicio', e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Hora fin</label>
                        <input
                          type="time"
                          className="input-field"
                          value={encuentro.hora_fin}
                          onChange={(e) => updateEncuentro(idx, 'hora_fin', e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-400 mb-4">4. Se generará automáticamente un codigo unico de inscripcion.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={closeCreateModal}
                    className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" className="btn-primary flex-1">Crear Materia</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar materia?"
        message="Se eliminará la materia y todos sus exámenes asociados. Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
