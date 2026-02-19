import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { Users, Search, Mail, Phone, UserX, Download, Upload } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';

export default function MateriaEstudiantes({ materiaId, materiaNombre }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchStudents = () => {
    api.get(`/materias/${materiaId}/estudiantes`)
      .then(res => setStudents(res.data))
      .catch(() => toast.error('Error cargando estudiantes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStudents(); }, [materiaId]);

  const filtered = students.filter(s =>
    `${s.nombre} ${s.apellido} ${s.correo} ${s.documento || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <SkeletonLoader type="list" count={5} />;

  return (
    <div className="space-y-4">
      {/* Header with count & search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 ring-1 ring-blue-100">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Estudiantes Inscritos</h2>
            <p className="text-sm text-gray-500">
              {students.length} {students.length === 1 ? 'estudiante' : 'estudiantes'} en {materiaNombre}
            </p>
          </div>
        </div>
        {students.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar estudiante..."
              className="input-field pl-9 py-2 text-sm"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        )}
      </div>

      {/* Student list */}
      {students.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="Sin estudiantes inscritos"
          description={`Ningún estudiante se ha inscrito aún. Comparte el código de la materia para que puedan unirse.`}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-5 sm:col-span-4">Nombre</div>
            <div className="col-span-4 sm:col-span-3 hidden sm:block">Correo</div>
            <div className="col-span-3 sm:col-span-2 hidden md:block">Documento</div>
            <div className="col-span-3 sm:col-span-2 hidden lg:block">Celular</div>
            <div className="col-span-7 sm:col-span-1"></div>
          </div>

          {/* Student rows */}
          {filtered.map(s => (
            <div key={s.id} className="grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors items-center">
              <div className="col-span-5 sm:col-span-4 flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-sm font-bold text-primary-700 shrink-0">
                  {s.nombre?.[0]}{s.apellido?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.nombre} {s.apellido}</p>
                  <p className="text-xs text-gray-400 sm:hidden truncate">{s.correo}</p>
                </div>
              </div>
              <div className="col-span-4 sm:col-span-3 hidden sm:flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-600 truncate">{s.correo}</span>
              </div>
              <div className="col-span-3 sm:col-span-2 hidden md:block">
                <span className="text-sm text-gray-600">{s.documento || '—'}</span>
              </div>
              <div className="col-span-3 sm:col-span-2 hidden lg:flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-600">{s.celular || '—'}</span>
              </div>
              <div className="col-span-7 sm:col-span-1"></div>
            </div>
          ))}

          {filtered.length === 0 && searchTerm && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No se encontraron estudiantes que coincidan con "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {/* Summary footer */}
      {students.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400 px-1">
          <span>
            {filtered.length === students.length
              ? `Mostrando ${students.length} estudiantes`
              : `${filtered.length} de ${students.length} estudiantes`}
          </span>
        </div>
      )}
    </div>
  );
}
