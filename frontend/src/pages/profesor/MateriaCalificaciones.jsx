import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Award, Users, FileText, TrendingUp, BarChart3, Clock3, ExternalLink,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import StatCard from '../../components/StatCard';
import EmptyState from '../../components/EmptyState';
import SkeletonLoader from '../../components/SkeletonLoader';

const GRADE_BANDS = [
  { label: '1.0 - 1.9', min: 1.0, max: 2.0, color: '#ef4444' },
  { label: '2.0 - 2.9', min: 2.0, max: 3.0, color: '#f97316' },
  { label: '3.0 - 3.4', min: 3.0, max: 3.5, color: '#eab308' },
  { label: '3.5 - 3.9', min: 3.5, max: 4.0, color: '#22c55e' },
  { label: '4.0 - 4.5', min: 4.0, max: 4.6, color: '#3b82f6' },
  { label: '4.6 - 5.0', min: 4.6, max: 5.01, color: '#8b5cf6' },
];

function normalizeNota(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getBandLabel(value) {
  const nota = normalizeNota(value);
  const found = GRADE_BANDS.find((band) => nota >= band.min && nota < band.max);
  return found ? found.label : null;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return format(date, 'dd/MM/yyyy HH:mm');
}

function getNotaColorClass(nota) {
  return nota >= 3.0 ? 'text-green-600' : 'text-red-600';
}

export default function MateriaCalificaciones({ materiaId }) {
  const [examenes, setExamenes] = useState([]);
  const [notas, setNotas] = useState({}); // { examenId: [notas] }
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const exRes = await api.get(`/examenes/materia/${materiaId}`);
        setExamenes(exRes.data);

        // Fetch notas for each exam
        const notasMap = {};
        await Promise.all(
          exRes.data.map(async (ex) => {
            try {
              const nRes = await api.get(`/examenes/notas/examen/${ex.id}`);
              notasMap[ex.id] = nRes.data;
            } catch {
              notasMap[ex.id] = [];
            }
          })
        );
        setNotas(notasMap);
      } catch {
        toast.error('Error cargando datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [materiaId]);

  const examById = useMemo(() => {
    const map = {};
    examenes.forEach((ex) => {
      map[ex.id] = ex;
    });
    return map;
  }, [examenes]);

  const allNotas = useMemo(
    () => Object.entries(notas).flatMap(([examId, values]) =>
      (values || [])
        .filter((item) => !item?.detalle_json?.tiene_preguntas_abiertas)
        .map((item) => ({
          ...item,
          __examId: examId,
          __examTitle: examById[examId]?.titulo || item.examen_titulo || 'Examen',
          __nota: normalizeNota(item.nota),
        }))
    ),
    [notas, examById]
  );

  // Pending notas (null grade = pending OCR review)
  const pendingNotas = useMemo(
    () => Object.values(notas).flat().filter(n => n.nota == null),
    [notas]
  );

  // Compute overall stats — only count graded notas (exclude null = pending review)
  const gradedNotas = allNotas.filter(n => n.nota != null);
  const totalCalificados = gradedNotas.length;
  const promedio = totalCalificados > 0 ? (gradedNotas.reduce((a, n) => a + n.__nota, 0) / totalCalificados) : 0;
  const aprobados = gradedNotas.filter((n) => n.__nota >= 3.0).length;
  const porcentajeAprobados = totalCalificados > 0 ? Math.round((aprobados / totalCalificados) * 100) : 0;
  const notaMasAlta = totalCalificados > 0 ? Math.max(...gradedNotas.map((n) => n.__nota)) : 0;

  const studentRows = useMemo(() => {
    const byStudent = new Map();

    gradedNotas.forEach((note) => {
      const nombre = [note.estudiante_nombre || note.nombre, note.estudiante_apellido]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Estudiante';
      const key = String(note.estudiante_id || `${nombre}-${note.__examId}`);

      if (!byStudent.has(key)) {
        byStudent.set(key, {
          id: key,
          estudianteId: note.estudiante_id,
          nombre,
          notas: [],
        });
      }

      byStudent.get(key).notas.push({
        ...note,
        nota: note.__nota,
      });
    });

    return [...byStudent.values()]
      .map((student) => {
        const total = student.notas.length;
        const avg = total > 0 ? student.notas.reduce((acc, item) => acc + normalizeNota(item.nota), 0) / total : 0;
        return {
          ...student,
          promedio: Number(avg.toFixed(2)),
          rango: getBandLabel(avg),
        };
      })
      .sort((a, b) => b.promedio - a.promedio || a.nombre.localeCompare(b.nombre));
  }, [gradedNotas]);

  const distribucion = GRADE_BANDS.reduce((acc, band) => {
    acc[band.label] = 0;
    return acc;
  }, {});

  studentRows.forEach((student) => {
    if (student.rango && distribucion[student.rango] != null) {
      distribucion[student.rango] += 1;
    }
  });

  const chartData = GRADE_BANDS.map((band) => ({
    name: band.label,
    value: distribucion[band.label] || 0,
    color: band.color,
  }));

  const studentsInRange = useMemo(() => {
    if (!selectedRange) return [];
    return studentRows.filter((student) => student.rango === selectedRange);
  }, [selectedRange, studentRows]);

  useEffect(() => {
    if (!selectedRange) {
      setSelectedStudentId(null);
      return;
    }

    if (studentsInRange.length === 0) {
      setSelectedStudentId(null);
      return;
    }

    const selectedExists = studentsInRange.some((student) => student.id === selectedStudentId);
    if (!selectedExists) {
      setSelectedStudentId(studentsInRange[0].id);
    }
  }, [selectedRange, studentsInRange, selectedStudentId]);

  const selectedStudent = useMemo(
    () => studentsInRange.find((student) => student.id === selectedStudentId) || null,
    [studentsInRange, selectedStudentId]
  );

  const selectedTimeline = useMemo(() => {
    if (!selectedStudent) return [];
    return [...selectedStudent.notas].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [selectedStudent]);

  const toggleRange = (rangeLabel) => {
    setSelectedRange((prev) => (prev === rangeLabel ? null : rangeLabel));
  };

  if (loading) return <SkeletonLoader type="stats" count={4} />;

  return (
    <div className="space-y-6">
      {/* Pending-review alert */}
      {pendingNotas.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="text-amber-600 font-semibold">⚠ {pendingNotas.length} {pendingNotas.length === 1 ? 'calificación pendiente' : 'calificaciones pendientes'} de revisión manual (OCR)</span>
          <span className="text-amber-500 text-xs">Visible en la pestaña Exámenes → Calificar</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Award} label="Calificados" value={totalCalificados} color="blue" />
        <StatCard icon={TrendingUp} label="Promedio General" value={promedio.toFixed(1)}
          color={promedio >= 3.0 ? 'green' : 'red'} />
        <StatCard icon={Users} label="Aprobados" value={`${porcentajeAprobados}%`}
          color={porcentajeAprobados >= 60 ? 'green' : 'amber'}
          subtitle={`${aprobados} de ${totalCalificados}`} />
        <StatCard icon={BarChart3} label="Nota más alta" value={notaMasAlta.toFixed(1)} color="purple" />
      </div>

      {/* Grade Distribution Chart — pure CSS */}
      {totalCalificados > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Distribución de Promedios por Estudiante</h3>
              <p className="text-xs text-gray-500 mt-0.5">Haz clic sobre un rango para ver quiénes están en ese promedio.</p>
            </div>
            {selectedRange && (
              <button
                type="button"
                onClick={() => setSelectedRange(null)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Limpiar filtro
              </button>
            )}
          </div>
          <CSSBarChart data={chartData} selectedRange={selectedRange} onSelectRange={toggleRange} />
          <div className="mt-4 flex flex-wrap gap-2">
            {chartData.map((item) => {
              const active = selectedRange === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => toggleRange(item.name)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    active
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.name} ({item.value})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive drill-down by selected grade range */}
      {selectedRange && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-semibold text-gray-900">
              Estudiantes en rango {selectedRange}
            </h3>
            <p className="text-xs text-gray-500">
              {studentsInRange.length} {studentsInRange.length === 1 ? 'estudiante' : 'estudiantes'}
            </p>
          </div>

          {studentsInRange.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">No hay estudiantes dentro de este rango de promedio.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 space-y-2">
                {studentsInRange.map((student) => {
                  const active = selectedStudentId === student.id;
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`w-full text-left rounded-xl border p-3 transition ${
                        active
                          ? 'border-indigo-200 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900 truncate">{student.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{student.notas.length} notas registradas</p>
                      <p className={`text-sm font-bold mt-1 ${getNotaColorClass(student.promedio)}`}>
                        Promedio {student.promedio.toFixed(2)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-2 rounded-xl border border-gray-200 p-3 sm:p-4">
                {!selectedStudent ? (
                  <div className="h-full min-h-[180px] flex items-center justify-center text-sm text-gray-500">
                    Selecciona un estudiante para ver su historial de notas.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{selectedStudent.nombre}</p>
                        <p className="text-xs text-gray-500">Notas en orden cronológico</p>
                      </div>
                      <span className={`text-sm font-bold ${getNotaColorClass(selectedStudent.promedio)}`}>
                        Promedio {selectedStudent.promedio.toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {selectedTimeline.map((item, idx) => {
                        const sourceType = item.imagen_procesada_url
                          ? 'Escaneado (OCR)'
                          : item.respuestas_json
                            ? 'Online'
                            : 'Manual';
                        const detailUrl = item.id && item.__examId
                          ? `/profesor/notas/${item.__examId}?notaId=${item.id}`
                          : null;

                        const content = (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{item.__examTitle}</p>
                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                  <Clock3 className="w-3 h-3" />
                                  {formatDateTime(item.created_at)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-bold ${getNotaColorClass(item.nota)}`}>
                                  {normalizeNota(item.nota).toFixed(1)}
                                </p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{sourceType}</p>
                              </div>
                            </div>

                            <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5">
                              {item.retroalimentacion?.trim()
                                ? item.retroalimentacion
                                : 'Sin anotación de retroalimentación registrada.'}
                            </div>

                            {detailUrl && (
                              <div className="mt-2 flex justify-end">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
                                  Ver evaluación y soportes <ExternalLink className="w-3 h-3" />
                                </span>
                              </div>
                            )}
                          </>
                        );

                        return detailUrl ? (
                          <Link
                            key={item.id || `${item.__examId}-${idx}`}
                            to={detailUrl}
                            className="block rounded-xl border border-gray-200 bg-white p-3 hover:border-indigo-200 hover:bg-indigo-50/40 transition"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div
                            key={`${item.__examId}-${idx}`}
                            className="rounded-xl border border-gray-200 bg-white p-3"
                          >
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-exam breakdown */}
      {examenes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin exámenes"
          description="No hay exámenes creados para esta materia. Genera un examen para comenzar a calificar."
        />
      ) : (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900">Detalle por Examen</h3>
          {examenes.map(ex => {
            const exNotas = notas[ex.id] || [];
            const exPromedio = exNotas.length > 0 ? (exNotas.reduce((a, n) => a + (n.nota || 0), 0) / exNotas.length) : 0;
            const isExpanded = expanded === ex.id;

            return (
              <div key={ex.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setExpanded(isExpanded ? null : ex.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                      exNotas.length > 0 ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {exNotas.length}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ex.titulo}</p>
                      <p className="text-xs text-gray-400">
                        {exNotas.length > 0 ? `Promedio: ${exPromedio.toFixed(1)}` : 'Sin calificaciones'}
                        {' · '}{format(new Date(ex.created_at), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <Link to={`/profesor/calificar/${ex.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs px-2 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 font-medium">
                      Calificar
                    </Link>
                    <Link to={`/profesor/notas/${ex.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium">
                      Ver Notas
                    </Link>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && exNotas.length > 0 && (
                  <div className="border-t border-gray-100">
                    {exNotas.map((n, i) => (
                      <div key={n.id || i} className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-50 last:border-0 gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 truncate">
                              {n.estudiante_nombre || n.nombre || 'Estudiante'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-sm font-bold ${getNotaColorClass(normalizeNota(n.nota))}`}>
                            {normalizeNota(n.nota).toFixed(1)}
                          </span>
                          <Link
                            to={`/profesor/notas/${ex.id}?notaId=${n.id}`}
                            className="text-[11px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium"
                          >
                            Ver evaluación
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pure-CSS bar chart — no external dependency */
function CSSBarChart({ data, selectedRange, onSelectRange }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-48">
      {data.map(d => (
        <button
          key={d.name}
          type="button"
          onClick={() => onSelectRange(d.name)}
          className={`flex-1 flex flex-col items-center gap-1 rounded-lg px-1 py-1 transition ${
            selectedRange === d.name ? 'bg-indigo-50' : 'hover:bg-gray-50'
          }`}
        >
          <span className="text-xs font-semibold text-gray-700">{d.value > 0 ? d.value : ''}</span>
          <div
            className={`w-full rounded-t-lg transition-all duration-500 ${
              selectedRange === d.name ? 'ring-2 ring-indigo-300' : ''
            }`}
            style={{
              height: `${Math.max(4, (d.value / maxVal) * 160)}px`,
              backgroundColor: d.color,
              opacity: 0.85,
            }}
            title={`${d.name}: ${d.value}`}
          />
          <span className="text-xs text-gray-500 text-center leading-tight">{d.name}</span>
        </button>
      ))}
    </div>
  );
}
