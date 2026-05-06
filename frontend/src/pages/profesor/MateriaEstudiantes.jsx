import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Users, Search, Mail, Phone, UserX, Loader2, Calendar,
  FileText, AlertCircle, CheckCircle2, Download, ClipboardList,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';

const DETAIL_TABS = [
  { key: 'actividades', label: 'Actividades' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'boletin', label: 'Boletín' },
];

const formatShortDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
};

const formatJson = (data) => {
  if (data == null) return 'Sin respuesta registrada';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

const notaTone = (nota) => {
  if (nota == null) return 'text-gray-400';
  if (nota >= 4.0) return 'text-green-600';
  if (nota >= 3.0) return 'text-blue-600';
  return 'text-red-600';
};

const getPreguntaEnunciado = (detallePregunta, idx, actividad) => {
  const direct = detallePregunta?.pregunta || detallePregunta?.enunciado || detallePregunta?.texto || detallePregunta?.statement;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const numeroObjetivo = Number(detallePregunta?.numero ?? idx + 1);
  const fromExam = (actividad?.preguntas_examen || []).find((q) => Number(q?.numero) === numeroObjetivo);
  const fallback = fromExam?.enunciado || fromExam?.pregunta || fromExam?.texto || fromExam?.statement;

  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
  return null;
};

const normalizeName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const buildStudentIdentityKey = (student) => {
  if (student?.id) return `id:${student.id}`;
  if (student?.documento) return `doc:${student.documento}`;
  if (student?.correo) return `mail:${String(student.correo).toLowerCase()}`;
  return `fallback:${normalizeName(`${student?.nombre || ''} ${student?.apellido || ''}`)}`;
};

const sanitizeStudents = (rawStudents) => {
  const seen = new Set();
  const deduped = [];
  let removedDuplicates = 0;

  for (const student of rawStudents || []) {
    const key = buildStudentIdentityKey(student);
    if (seen.has(key)) {
      removedDuplicates += 1;
      continue;
    }
    seen.add(key);
    deduped.push(student);
  }

  return { deduped, removedDuplicates };
};

export default function MateriaEstudiantes({ materiaId, materiaNombre }) {
  const [students, setStudents] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedActividadId, setSelectedActividadId] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('actividades');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [removedDuplicates, setRemovedDuplicates] = useState(0);
  const [exportingStudents, setExportingStudents] = useState(false);
  const [exportingAttendanceTemplate, setExportingAttendanceTemplate] = useState(false);

  const fetchBaseData = async () => {
    setLoading(true);
    try {
      const [studentsRes, periodosRes] = await Promise.all([
        api.get(`/materias/${materiaId}/estudiantes`),
        api.get('/periodos/').catch(() => ({ data: [] })),
      ]);

      const studentListRaw = studentsRes.data || [];
      const { deduped: studentList, removedDuplicates: removed } = sanitizeStudents(studentListRaw);
      const periodList = [...(periodosRes.data || [])].sort((a, b) => a.numero - b.numero);

      setStudents(studentList);
      setRemovedDuplicates(removed);
      setPeriodos(periodList);

      if (periodList.length > 0) {
        const activeOrFirst = periodList.find((p) => p.activo) || periodList[0];
        setSelectedPeriodo((prev) => (
          prev && periodList.some((p) => p.id === prev) ? prev : activeOrFirst.id
        ));
      } else {
        setSelectedPeriodo('');
      }

      if (studentList.length > 0) {
        setSelectedStudentId((prev) => (
          prev && studentList.some((s) => s.id === prev) ? prev : studentList[0].id
        ));
      } else {
        setSelectedStudentId('');
      }
    } catch {
      toast.error('Error cargando estudiantes o períodos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBaseData();
  }, [materiaId]);

  useEffect(() => {
    if (!selectedStudentId || !selectedPeriodo) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      setProfileLoading(true);
      try {
        const res = await api.get(`/reportes/estudiante/${materiaId}/${selectedPeriodo}/${selectedStudentId}`);
        if (!cancelled) {
          setProfile(res.data);
          const firstActividad = (res.data?.actividades || [])[0];
          setSelectedActividadId(firstActividad?.examen_id || '');
        }
      } catch (err) {
        if (!cancelled) {
          setProfile(null);
          setSelectedActividadId('');
          toast.error(err.response?.data?.detail || 'Error cargando perfil académico');
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [materiaId, selectedPeriodo, selectedStudentId]);

  const filtered = useMemo(() => (
    [...students]
      .filter((s) =>
        `${s.nombre} ${s.apellido} ${s.correo} ${s.documento || ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(`${b.apellido || ''} ${b.nombre || ''}`))
  ), [students, searchTerm]);

  const homonymMeta = useMemo(() => {
    const counts = {};

    students.forEach((student) => {
      const key = normalizeName(`${student?.nombre || ''} ${student?.apellido || ''}`);
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });

    return { counts };
  }, [students]);

  const isHomonymStudent = (student) => {
    const key = normalizeName(`${student?.nombre || ''} ${student?.apellido || ''}`);
    return Boolean(key) && (homonymMeta.counts[key] || 0) > 1;
  };

  const downloadBlob = (blobData, filename) => {
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportStudentList = async () => {
    setExportingStudents(true);
    try {
      const res = await api.get(`/asistencia/materia/${materiaId}/export-estudiantes-pdf`, {
        responseType: 'blob',
      });
      downloadBlob(res.data, `lista_estudiantes_${materiaNombre || 'materia'}.pdf`);
      toast.success('Lista de estudiantes descargada');
    } catch {
      toast.error('Error exportando lista de estudiantes');
    } finally {
      setExportingStudents(false);
    }
  };

  const handleExportAttendanceTemplate = async () => {
    setExportingAttendanceTemplate(true);
    try {
      const res = await api.get(`/asistencia/materia/${materiaId}/export-pdf`, {
        responseType: 'blob',
      });
      downloadBlob(res.data, `asistencia_${materiaNombre || 'materia'}.pdf`);
      toast.success('Formato de asistencia descargado');
    } catch {
      toast.error('Error exportando formato de asistencia');
    } finally {
      setExportingAttendanceTemplate(false);
    }
  };

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedPeriodoObj = periodos.find((p) => p.id === selectedPeriodo);
  const selectedStudentVisible = filtered.some((s) => s.id === selectedStudentId);
  const selectedActividad = useMemo(
    () => (profile?.actividades || []).find((a) => a.examen_id === selectedActividadId),
    [profile, selectedActividadId]
  );

  if (loading) return <SkeletonLoader type="list" count={5} />;

  return (
    <div className="space-y-4">
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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-56">
            <Calendar className="w-4 h-4 text-gray-400" />
            <select
              className="input-field py-2 text-sm"
              value={selectedPeriodo}
              onChange={(e) => setSelectedPeriodo(e.target.value)}
              disabled={periodos.length === 0}
            >
              {periodos.length === 0 ? (
                <option value="">Sin períodos</option>
              ) : (
                periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))
              )}
            </select>
          </div>

          {students.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar estudiante..."
                className="input-field pl-9 py-2 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {students.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="px-2 py-1 rounded-full border border-gray-200 bg-white">
                Período: {selectedPeriodoObj?.nombre || 'Sin período'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full lg:w-auto">
              <button
                type="button"
                onClick={handleExportStudentList}
                disabled={exportingStudents}
                className="btn-secondary text-sm flex items-center justify-center gap-2 w-full lg:w-auto"
              >
                {exportingStudents ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                Lista estudiantes
              </button>
              <button
                type="button"
                onClick={handleExportAttendanceTemplate}
                disabled={exportingAttendanceTemplate}
                className="btn-secondary text-sm flex items-center justify-center gap-2 w-full lg:w-auto"
              >
                {exportingAttendanceTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Formato asistencia
              </button>
            </div>
          </div>
        </div>
      )}

      {students.length > 0 && removedDuplicates > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Se detectaron {removedDuplicates} registros duplicados por ID/documento/correo y se ocultaron automáticamente en esta vista.
        </div>
      )}

      {selectedStudent && searchTerm && !selectedStudentVisible && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El estudiante seleccionado no coincide con el filtro actual. Limpia la búsqueda para volver a verlo en la lista.
        </div>
      )}

      {students.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="Sin estudiantes inscritos"
          description={`Ningún estudiante se ha inscrito aún. Comparte el código de la materia para que puedan unirse.`}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Lista de estudiantes
            </div>

            {filtered.length === 0 && searchTerm ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No se encontraron estudiantes que coincidan con "{searchTerm}"
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[36rem] overflow-auto">
                {filtered.map((s) => {
                  const isSelected = s.id === selectedStudentId;
                  const isHomonym = isHomonymStudent(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setDetailTab('actividades');
                        setSelectedActividadId('');
                      }}
                      className={`w-full text-left px-5 py-3.5 transition-colors ${
                        isSelected ? 'bg-primary-50 border-l-4 border-primary-600' : 'hover:bg-gray-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-sm font-bold text-primary-700 shrink-0">
                          {s.nombre?.[0]}{s.apellido?.[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">{s.nombre} {s.apellido}</p>
                            {isHomonym && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                Homónimo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{s.correo}</p>
                          <p className="text-xs text-gray-400">Doc: {s.documento || '—'}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="xl:col-span-7 bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[26rem]">
            {!selectedStudent ? (
              <div className="h-full flex items-center justify-center p-8 text-center">
                <div>
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Selecciona un estudiante para ver su detalle académico.</p>
                </div>
              </div>
            ) : profileLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
              </div>
            ) : !profile ? (
              <div className="h-full flex items-center justify-center p-8 text-center">
                <div>
                  <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No se pudo cargar el detalle del estudiante para este período.</p>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {profile.config_warning && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {profile.config_warning}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {profile.estudiante?.nombre} {profile.estudiante?.apellido}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{profile.estudiante?.correo}</span>
                      <span>Doc: {profile.estudiante?.documento || '—'}</span>
                      <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{profile.estudiante?.celular || '—'}</span>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {profile.periodo?.nombre || 'Sin período'}
                  </span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MiniMetric
                    label="Actividades"
                    value={`${profile.resumen?.actividades_calificadas || 0}/${profile.resumen?.actividades_total || 0}`}
                  />
                  <MiniMetric
                    label="Promedio"
                    value={profile.resumen?.promedio_actividades != null ? profile.resumen.promedio_actividades.toFixed(2) : '—'}
                  />
                  <MiniMetric
                    label="Asistencia"
                    value={`${profile.resumen?.asistencia_porcentaje ?? 0}%`}
                  />
                  <MiniMetric
                    label="Nota final"
                    value={profile.resumen?.nota_boletin != null
                      ? profile.resumen.nota_boletin.toFixed(2)
                      : (profile.resumen?.nota_proyectada != null ? profile.resumen.nota_proyectada.toFixed(2) : '—')}
                    tone={profile.resumen?.nota_boletin ?? profile.resumen?.nota_proyectada}
                  />
                </div>

                <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
                  {DETAIL_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setDetailTab(tab.key)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        detailTab === tab.key
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {detailTab === 'actividades' && (
                  <div className="space-y-2">
                    {(profile.actividades || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No hay actividades configuradas para este período.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {profile.actividades.map((item) => {
                            const isActive = item.examen_id === selectedActividadId;
                            return (
                              <button
                                key={item.examen_id}
                                type="button"
                                onClick={() => setSelectedActividadId(item.examen_id)}
                                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                                  isActive
                                    ? 'border-primary-300 bg-primary-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{item.titulo}</p>
                                    <p className="text-xs text-gray-500">
                                      {item.tipo || 'examen'} • {formatShortDate(item.fecha)} • {item.porcentaje || 0}%
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-bold ${notaTone(item.nota)}`}>
                                      {item.nota == null ? 'Pendiente' : item.nota.toFixed(2)}
                                    </span>
                                    <span className="text-xs text-primary-700 font-medium">
                                      {isActive ? 'Abierta' : 'Abrir'}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedActividad && (
                          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Detalle de actividad</p>
                                <p className="text-xs text-gray-500">
                                  {selectedActividad.titulo} • {selectedActividad.tipo || 'examen'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Link
                                  to={selectedActividad.nota == null
                                    ? `/profesor/calificar/${selectedActividad.examen_id}`
                                    : `/profesor/notas/${selectedActividad.examen_id}`}
                                  className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                                >
                                  {selectedActividad.nota == null ? 'Calificar ahora' : 'Abrir panel de notas'}
                                </Link>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-gray-500">Nota</p>
                                <p className={`text-base font-bold ${notaTone(selectedActividad.nota)}`}>
                                  {selectedActividad.nota == null ? 'Pendiente' : selectedActividad.nota.toFixed(2)}
                                </p>
                              </div>
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-gray-500">Respuesta enviada</p>
                                <p className="text-sm font-semibold text-gray-700">
                                  {selectedActividad.enviado_at ? formatShortDate(selectedActividad.enviado_at) : 'Sin envío'}
                                </p>
                              </div>
                              <div className="rounded-md border border-gray-200 bg-white p-2">
                                <p className="text-gray-500">Estado</p>
                                <p className="text-sm font-semibold capitalize text-gray-700">{selectedActividad.estado}</p>
                              </div>
                            </div>

                            <div className="rounded-md border border-gray-200 bg-white p-3">
                              <p className="text-xs text-gray-500 mb-1">Retroalimentación del docente</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {selectedActividad.retroalimentacion || 'Aún no hay retroalimentación registrada.'}
                              </p>
                            </div>

                            {Array.isArray(selectedActividad.detalle_json?.preguntas) && selectedActividad.detalle_json.preguntas.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs text-gray-500">Detalle por pregunta</p>
                                {selectedActividad.detalle_json.preguntas.map((p, idx) => {
                                  const enunciado = getPreguntaEnunciado(p, idx, selectedActividad);
                                  return (
                                    <div key={`${selectedActividad.examen_id}-preg-${idx}`} className="rounded-md border border-gray-200 bg-white p-3 space-y-1">
                                      <p className="text-sm font-medium text-gray-800">Pregunta {p.numero ?? idx + 1}</p>
                                      {enunciado && (
                                        <p className="text-xs text-gray-700">
                                          <span className="font-semibold">Enunciado:</span> {enunciado}
                                        </p>
                                      )}
                                      {p.respuesta_estudiante && (
                                        <p className="text-xs text-gray-600"><span className="font-semibold">Respuesta:</span> {p.respuesta_estudiante}</p>
                                      )}
                                      {p.respuesta_correcta && (
                                        <p className="text-xs text-green-700"><span className="font-semibold">Correcta:</span> {p.respuesta_correcta}</p>
                                      )}
                                      {p.retroalimentacion && (
                                        <p className="text-xs text-blue-700"><span className="font-semibold">Feedback:</span> {p.retroalimentacion}</p>
                                      )}
                                      {p.nota != null && (
                                        <p className="text-xs text-gray-600"><span className="font-semibold">Puntaje:</span> {p.nota}/{p.nota_maxima ?? '-'}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="rounded-md border border-gray-200 bg-white p-3">
                              <p className="text-xs text-gray-500 mb-1">Respuesta cruda enviada</p>
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words max-h-52 overflow-auto bg-gray-50 rounded p-2 border border-gray-100">
                                {formatJson(selectedActividad.respuestas_json)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'asistencia' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <AsistenciaStat label="Presente" value={profile.asistencia?.presente || 0} tone="green" />
                      <AsistenciaStat label="Ausente" value={profile.asistencia?.ausente || 0} tone="red" />
                      <AsistenciaStat label="Tardanza" value={profile.asistencia?.tardanza || 0} tone="amber" />
                      <AsistenciaStat label="Justificado" value={profile.asistencia?.justificado || 0} tone="blue" />
                    </div>

                    {(profile.asistencia?.registros || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No hay registros de asistencia en este período.</p>
                    ) : (
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        {(profile.asistencia.registros || []).slice(0, 14).map((row) => (
                          <div key={row.id} className="px-3 py-2 border-b border-gray-100 last:border-0 flex items-center justify-between text-sm">
                            <span className="text-gray-700">{formatShortDate(row.fecha)}</span>
                            <span className="text-gray-500 capitalize">{row.estado}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'boletin' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <p className="text-xs text-gray-500">Participación</p>
                      <p className={`text-lg font-bold ${notaTone(profile.participacion?.nota)}`}>
                        {profile.participacion?.nota != null ? profile.participacion.nota.toFixed(2) : '—'}
                      </p>
                      {profile.participacion?.observacion && (
                        <p className="text-xs text-gray-500 mt-1">{profile.participacion.observacion}</p>
                      )}
                    </div>

                    {profile.boletin ? (
                      <div className="rounded-lg border border-gray-200 p-3">
                        <p className="text-xs text-gray-500">Boletín</p>
                        <p className={`text-lg font-bold ${notaTone(profile.boletin?.nota_final)}`}>
                          {profile.boletin?.nota_final != null ? profile.boletin.nota_final.toFixed(2) : '—'}
                        </p>
                        <p className="text-xs mt-1 text-gray-500 inline-flex items-center gap-1">
                          {profile.boletin.publicado ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                          {profile.boletin.publicado
                            ? `Publicado ${formatShortDate(profile.boletin.publicado_at)}`
                            : 'Pendiente de publicación'}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500">
                        Aún no existe boletín generado para este estudiante en este período.
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-gray-500 mb-2">Ponderación activa</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(profile.config_porcentajes || {}).length === 0 ? (
                          <span className="text-xs text-gray-400">Sin configuración de porcentajes.</span>
                        ) : (
                          Object.entries(profile.config_porcentajes || {}).map(([key, value]) => (
                            <span key={key} className="px-2 py-1 rounded-full text-xs border border-primary-100 bg-primary-50 text-primary-700">
                              {key.replaceAll('__', '')}: {value}%
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

function MiniMetric({ label, value, tone }) {
  const toneClass = tone == null
    ? 'text-gray-800'
    : tone >= 4.0
      ? 'text-green-600'
      : tone >= 3.0
        ? 'text-blue-600'
        : 'text-red-600';

  return (
    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function AsistenciaStat({ label, value, tone }) {
  const styles = {
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
  };

  return (
    <div className={`rounded-lg border p-2 text-center ${styles[tone] || styles.blue}`}>
      <p className="text-lg font-bold">{value}</p>
      <p>{label}</p>
    </div>
  );
}
