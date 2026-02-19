import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Plus, BookOpen, Users, FileText, Copy, X, Search,
  ArrowRight, Trash2, Edit3, GraduationCap, BarChart3,
} from 'lucide-react';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function ProfesorMaterias() {
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [nombre, setNombre] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
    try {
      await api.post('/materias/', { nombre });
      toast.success('Materia creada exitosamente');
      setShowCreate(false);
      setNombre('');
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

  const filtered = materias.filter(m =>
    m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader type="stats" count={4} />
      <SkeletonLoader type="card" count={3} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Materias</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona tus cursos, exámenes y herramientas de generación</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Nueva Materia
        </button>
      </div>

      {/* Global Stats */}
      {materias.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Materias" value={materias.length} color="blue" />
          <StatCard icon={Users} label="Estudiantes Totales" value={totalEstudiantes} color="green" />
          <StatCard icon={FileText} label="Exámenes Creados" value={totalExamenes} color="purple" />
          <StatCard icon={BarChart3} label="Exámenes Online" value={totalOnline} color="indigo"
            subtitle={totalExamenes > 0 ? `${Math.round((totalOnline / totalExamenes) * 100)}% activos` : undefined} />
        </div>
      )}

      {/* Search bar */}
      {materias.length > 2 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar materia por nombre o código..."
            className="input-field pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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
              <Link key={m.id} to={`/profesor/materia/${m.id}`}
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
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-sm text-gray-500 group-hover:text-primary-600 transition-colors">
                    Ver materia
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary-50">
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Nueva Materia</h3>
                </div>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={createMateria}>
                <input type="text" placeholder="Nombre de la materia" className="input-field mb-3"
                  value={nombre} onChange={e => setNombre(e.target.value)} required
                  autoFocus />
                <p className="text-xs text-gray-400 mb-4">Se generará un código único de inscripción automáticamente.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowCreate(false)}
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
