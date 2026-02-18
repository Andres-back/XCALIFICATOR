import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { Plus, BookOpen, Users, FileText, Copy, X } from 'lucide-react';

export default function ProfesorMaterias() {
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [nombre, setNombre] = useState('');
  const [students, setStudents] = useState({ show: false, materiaId: null, list: [] });

  const fetchMaterias = () => {
    api.get('/materias/mis-materias')
      .then(res => setMaterias(res.data))
      .catch(() => toast.error('Error cargando materias'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMaterias(); }, []);

  const createMateria = async (e) => {
    e.preventDefault();
    try {
      await api.post('/materias/', { nombre });
      toast.success('Materia creada');
      setShowCreate(false);
      setNombre('');
      fetchMaterias();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const copyCodigo = (codigo) => {
    navigator.clipboard.writeText(codigo);
    toast.success(`Código ${codigo} copiado`);
  };

  const viewStudents = async (materiaId) => {
    try {
      const res = await api.get(`/materias/${materiaId}/estudiantes`);
      setStudents({ show: true, materiaId, list: res.data });
    } catch {
      toast.error('Error cargando estudiantes');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mis Materias</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva Materia
        </button>
      </div>

      {materias.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No tienes materias aún. ¡Crea tu primera materia!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materias.map(m => (
            <div key={m.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{m.nombre}</h3>
                <button onClick={() => copyCodigo(m.codigo)}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-mono bg-primary-50 px-2 py-1 rounded">
                  {m.codigo} <Copy className="w-3 h-3" />
                </button>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => viewStudents(m.id)}
                  className="btn-secondary text-xs flex items-center gap-1">
                  <Users className="w-3 h-3" /> Estudiantes
                </button>
                <Link to={`/profesor/examenes/${m.id}`}
                  className="btn-secondary text-xs flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Exámenes
                </Link>
                <Link to={`/profesor/generar/${m.id}`}
                  className="btn-primary text-xs flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Generar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nueva Materia</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createMateria}>
              <input type="text" placeholder="Nombre de la materia" className="input-field mb-3"
                value={nombre} onChange={e => setNombre(e.target.value)} required />
              <p className="text-xs text-gray-400 mb-3">Se generará un código único de inscripción automáticamente.</p>
              <button type="submit" className="btn-primary w-full">Crear Materia</button>
            </form>
          </div>
        </div>
      )}

      {/* Students Modal */}
      {students.show && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Estudiantes Inscritos</h3>
              <button onClick={() => setStudents({ show: false, materiaId: null, list: [] })}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {students.list.length === 0 ? (
              <p className="text-gray-500 text-sm">Ningún estudiante inscrito aún.</p>
            ) : (
              <div className="space-y-2">
                {students.list.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-700">
                      {s.nombre[0]}{s.apellido[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.nombre} {s.apellido}</p>
                      <p className="text-xs text-gray-500">{s.correo}</p>
                    </div>
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
