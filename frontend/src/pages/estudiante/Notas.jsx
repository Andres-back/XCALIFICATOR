import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { Award, MessageCircle, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function EstudianteNotas() {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/examenes/mis-notas')
      .then(res => setNotas(res.data))
      .catch(() => toast.error('Error cargando notas'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis Notas</h1>

      {notas.length === 0 ? (
        <div className="card text-center py-12">
          <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aún no tienes notas registradas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notas.map(n => (
            <div key={n.id} className="card">
              <div className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                <div className="flex items-center gap-3">
                  <div className={`text-2xl font-bold ${
                    n.nota >= 3.0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {n.nota}
                  </div>
                  <div>
                    {n.examen_titulo && (
                      <p className="text-sm font-medium text-gray-800">{n.examen_titulo}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      {n.materia_nombre && <span className="text-primary-600 mr-2">{n.materia_nombre}</span>}
                      {format(new Date(n.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <Link to={`/estudiante/chat/${n.id}`}
                  onClick={e => e.stopPropagation()}
                  className="btn-secondary text-xs flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> Chatbot
                </Link>
              </div>

              {/* Expanded detail */}
              {expanded === n.id && (
                <div className="mt-4 border-t pt-4">
                  {n.retroalimentacion && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <h3 className="text-sm font-medium text-blue-800 mb-1">Retroalimentación</h3>
                      <p className="text-sm text-blue-700 whitespace-pre-line">{n.retroalimentacion}</p>
                    </div>
                  )}

                  {n.detalle_json?.preguntas && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-700">Detalle por Pregunta</h3>
                      {n.detalle_json.preguntas.map((p, i) => (
                        <div key={i} className={`p-3 rounded-lg flex items-start gap-2
                          ${p.correcto ? 'bg-green-50' : 'bg-red-50'}`}>
                          {p.correcto ? (
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium">Pregunta {p.numero}</span>
                              <span className="text-sm">{p.nota}/{p.nota_maxima}</span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{p.retroalimentacion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
