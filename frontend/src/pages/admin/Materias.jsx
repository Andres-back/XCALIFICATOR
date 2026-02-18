import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  BookOpen, Users, ClipboardList, Trash2, Search, RefreshCw, ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function AdminMaterias() {
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchMaterias = () => {
    setLoading(true);
    api.get('/admin/materias')
      .then(res => setMaterias(res.data))
      .catch(() => toast.error('Error cargando materias'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMaterias(); }, []);

  const deleteMateria = async (id, nombre) => {
    if (!confirm(`¿Eliminar la materia "${nombre}" y todos sus exámenes, notas e inscripciones? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/admin/materias/${id}`);
      toast.success('Materia eliminada');
      fetchMaterias();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  const filtered = materias.filter(m => {
    const q = search.toLowerCase();
    return !q ||
      m.nombre.toLowerCase().includes(q) ||
      m.codigo.toLowerCase().includes(q) ||
      (m.profesor_nombre || '').toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Materias</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} de {materias.length} materias</p>
        </div>
        <button onClick={fetchMaterias} className="btn-secondary flex items-center gap-1">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar por nombre, código o profesor..."
            className="input-field pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Materias Grid */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No se encontraron materias</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{m.nombre}</h3>
                    <p className="text-xs text-gray-400 font-mono">{m.codigo}</p>
                  </div>
                </div>
                <button onClick={() => deleteMateria(m.id, m.nombre)} title="Eliminar materia"
                  className="p-1.5 rounded text-red-500 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Profesor */}
              <div className="border-t border-gray-100 pt-3 mb-3">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Profesor:</span>{' '}
                  {m.profesor_nombre || <span className="italic text-gray-400">Sin asignar</span>}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Creada: {format(new Date(m.created_at), 'dd/MM/yyyy')}
                </p>
              </div>

              {/* Stats */}
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 rounded-lg flex-1">
                  <Users className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-lg font-bold text-green-700">{m.num_estudiantes}</p>
                    <p className="text-xs text-green-600">Estudiantes</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 rounded-lg flex-1">
                  <ClipboardList className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-lg font-bold text-purple-700">{m.num_examenes}</p>
                    <p className="text-xs text-purple-600">Exámenes</p>
                  </div>
                </div>
              </div>

              {/* Link to profesor view */}
              <Link to={`/profesor/examenes/${m.id}`}
                className="mt-3 flex items-center justify-center gap-1 text-xs text-primary-600 hover:text-primary-800 py-2 bg-primary-50 rounded-lg">
                <ExternalLink className="w-3 h-3" /> Ver exámenes
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
