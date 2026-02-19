import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import Breadcrumb from '../../components/Breadcrumb';
import {
  FileText, Wand2, Grid3X3, Search, Users, Award,
  BookOpen, Copy, Settings, Loader2,
} from 'lucide-react';

// Tab components (lazy-like switching)
import ProfesorExamenes from './Examenes';
import GenerarExamen from './GenerarExamen';
import GenerarCrucigrama from './GenerarCrucigrama';
import GenerarSopaLetras from './GenerarSopaLetras';
import MateriaEstudiantes from './MateriaEstudiantes';
import MateriaCalificaciones from './MateriaCalificaciones';

const TABS = [
  { key: 'examenes',        label: 'Exámenes',        icon: FileText,  mobileLabel: 'Exámenes' },
  { key: 'generar',         label: 'Generar Examen',   icon: Wand2,     mobileLabel: 'Generar' },
  { key: 'crucigrama',      label: 'Crucigrama',       icon: Grid3X3,   mobileLabel: 'Crucigrama' },
  { key: 'sopa',            label: 'Sopa de Letras',   icon: Search,    mobileLabel: 'Sopa' },
  { key: 'estudiantes',     label: 'Estudiantes',      icon: Users,     mobileLabel: 'Alumnos' },
  { key: 'calificaciones',  label: 'Calificaciones',   icon: Award,     mobileLabel: 'Notas' },
];

export default function MateriaDetail() {
  const { materiaId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [materia, setMateria] = useState(null);
  const [loading, setLoading] = useState(true);

  // Determine active tab from URL hash or default
  const hash = location.hash?.replace('#', '') || 'examenes';
  const activeTab = TABS.find(t => t.key === hash)?.key || 'examenes';

  const setActiveTab = (key) => {
    navigate(`#${key}`, { replace: true });
  };

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
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (!materia) return null;

  return (
    <div className="space-y-0">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Materias', to: '/profesor/materias' },
        { label: materia.nombre },
      ]} />

      {/* Materia Header */}
      <div className="bg-gradient-to-r from-primary-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">{materia.nombre}</h1>
              <button onClick={copyCodigo}
                className="flex items-center gap-1.5 mt-1 text-sm text-white/80 hover:text-white transition-colors">
                <Copy className="w-3.5 h-3.5" />
                Código: {materia.codigo}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="mb-6 -mx-3 sm:mx-0">
        <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-200 px-3 sm:px-0">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0
                  ${isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'examenes' && <ProfesorExamenes materiaId={materiaId} embedded />}
        {activeTab === 'generar' && <GenerarExamen materiaId={materiaId} embedded onSuccess={() => setActiveTab('examenes')} />}
        {activeTab === 'crucigrama' && <GenerarCrucigrama materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'sopa' && <GenerarSopaLetras materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'estudiantes' && <MateriaEstudiantes materiaId={materiaId} materiaNombre={materia.nombre} />}
        {activeTab === 'calificaciones' && <MateriaCalificaciones materiaId={materiaId} />}
      </div>
    </div>
  );
}
