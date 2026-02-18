import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { BookOpen, Plus, FileText, ClipboardList, X, Clock, CheckCircle, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function EstudianteHome() {
  const [materias, setMaterias] = useState([]);
  const [examenesPorMateria, setExamenesPorMateria] = useState({});
  const [respondidos, setRespondidos] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showInscribir, setShowInscribir] = useState(false);
  const [codigo, setCodigo] = useState('');

  const fetchMaterias = async () => {
    try {
      const [matRes, respRes] = await Promise.all([
        api.get('/materias/mis-inscripciones'),
        api.get('/examenes/mis-respuestas'),
      ]);
      setMaterias(matRes.data);
      setRespondidos(new Set(respRes.data));
      // Fetch exams for each materia
      const examenesMap = {};
      await Promise.all(
        matRes.data.map(async (m) => {
          try {
            const exRes = await api.get(`/examenes/materia/${m.id}`);
            examenesMap[m.id] = exRes.data.filter(e => {
              if (!e.activo_online) return false;
              // Hide exams whose activation date hasn't arrived yet
              if (e.fecha_activacion && new Date(e.fecha_activacion) > new Date()) return false;
              return true;
            });
          } catch {
            examenesMap[m.id] = [];
          }
        })
      );
      setExamenesPorMateria(examenesMap);
    } catch {
      toast.error('Error cargando materias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMaterias(); }, []);

  const inscribir = async (e) => {
    e.preventDefault();
    try {
      await api.post('/materias/inscribir', { codigo: codigo.toUpperCase() });
      toast.success('Inscripción exitosa');
      setShowInscribir(false);
      setCodigo('');
      fetchMaterias();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mis Materias</h1>
        <button onClick={() => setShowInscribir(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Inscribirme
        </button>
      </div>

      {materias.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No estás inscrito en ninguna materia.</p>
          <p className="text-sm text-gray-400 mt-1">Solicita el código de inscripción a tu profesor.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {materias.map(m => (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{m.nombre}</h3>
                    <p className="text-xs text-gray-400">Código: {m.codigo}</p>
                  </div>
                </div>
                <Link to={`/estudiante/notas?materia=${encodeURIComponent(m.nombre)}`} className="btn-secondary text-xs flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Mis Notas
                </Link>
              </div>

              {/* Online Exams for this materia */}
              {(examenesPorMateria[m.id] || []).length > 0 ? (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exámenes disponibles</p>
                  {examenesPorMateria[m.id].map(ex => {
                    const yaRespondido = respondidos.has(ex.id);
                    const vencido = ex.fecha_limite && new Date(ex.fecha_limite) < new Date();
                    return (
                    <div key={ex.id} className={`flex items-center justify-between rounded-lg px-4 py-3 ${yaRespondido ? 'bg-green-50' : vencido ? 'bg-gray-50' : 'bg-blue-50'}`}>
                      <div className="flex items-center gap-2">
                        {yaRespondido
                          ? <CheckCircle className="w-4 h-4 text-green-600" />
                          : <ClipboardList className="w-4 h-4 text-primary-600" />}
                        <div>
                          <p className={`text-sm font-medium ${yaRespondido ? 'text-green-800' : 'text-gray-800'}`}>{ex.titulo}</p>
                          {ex.fecha_limite && (
                            <p className={`text-xs flex items-center gap-1 ${vencido ? 'text-red-500' : 'text-gray-500'}`}>
                              <Clock className="w-3 h-3" />
                              {vencido ? 'Vencido: ' : 'Límite: '}{format(new Date(ex.fecha_limite), 'dd/MM/yyyy HH:mm')}
                            </p>
                          )}
                        </div>
                      </div>
                      {yaRespondido ? (
                        <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-green-700 bg-green-100 border border-green-200">
                          <CheckCircle className="w-3 h-3" /> Respondido
                        </span>
                      ) : vencido ? (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100">
                          Vencido
                        </span>
                      ) : (
                        <Link
                          to={`/estudiante/examen/${ex.id}`}
                          className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary-700 transition-colors"
                        >
                          Resolver
                        </Link>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">No hay exámenes en línea disponibles.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Inscripción Modal */}
      {showInscribir && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Inscribirme a Materia</h3>
              <button onClick={() => setShowInscribir(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={inscribir}>
              <input type="text" placeholder="Código (ej: MAT-7X2K)" className="input-field mb-3"
                value={codigo} onChange={e => setCodigo(e.target.value)} required />
              <p className="text-xs text-gray-400 mb-3">Ingresa el código proporcionado por tu profesor.</p>
              <button type="submit" className="btn-primary w-full">Inscribirme</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
