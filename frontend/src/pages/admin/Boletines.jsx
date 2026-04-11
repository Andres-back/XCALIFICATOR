import { Fragment, useState, useEffect, useMemo } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  ScrollText, Loader2, Calendar, ChevronDown, ChevronUp,
  Printer, Search, Award, TrendingUp, Users,
  BookOpen, GraduationCap,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNota(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

export default function AdminBoletines() {
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [filterGrado, setFilterGrado] = useState('');
  const [search, setSearch] = useState('');
  const [expandedGrado, setExpandedGrado] = useState(null);
  const [expandedStudent, setExpandedStudent] = useState(null);

  useEffect(() => {
    api.get('/periodos/')
      .then(res => {
        const sorted = res.data.sort((a, b) => a.numero - b.numero);
        setPeriodos(sorted);
        if (sorted.length > 0) setSelectedPeriodo(sorted[0].id);
      })
      .catch(() => toast.error('Error cargando períodos'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPeriodo) loadData();
  }, [selectedPeriodo, filterGrado]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const params = filterGrado ? `?grado=${encodeURIComponent(filterGrado)}` : '';
      const res = await api.get(`/admin/boletines-global/${selectedPeriodo}${params}`);
      setData(res.data);
    } catch {
      setData(null);
      toast.error('Error cargando boletines');
    } finally {
      setLoadingData(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    if (!data?.grados) return { totalEstudiantes: 0, totalGrados: 0, promedioGeneral: 0, aprobados: 0 };
    let totalEst = 0;
    const allPromedios = [];
    let aprobados = 0;

    data.grados.forEach(g => {
      totalEst += g.total_estudiantes;
      g.estudiantes.forEach(e => {
        const notaRef = e.promedio_definitivo ?? e.promedio_general;
        allPromedios.push(notaRef);
        if (notaRef >= 3.0) aprobados++;
      });
    });

    return {
      totalEstudiantes: totalEst,
      totalGrados: data.grados.length,
      promedioGeneral: allPromedios.length ? (allPromedios.reduce((a, b) => a + b, 0) / allPromedios.length).toFixed(2) : '0.00',
      aprobados,
    };
  }, [data]);

  const periodosConfig = useMemo(() => {
    const source = Array.isArray(data?.periodos_configurados) && data.periodos_configurados.length > 0
      ? data.periodos_configurados
      : periodos;

    return [...source]
      .sort((a, b) => Number(a.numero || 0) - Number(b.numero || 0))
      .slice(0, 4);
  }, [data, periodos]);

  // Filter students by search within displayed grados
  const filteredGrados = useMemo(() => {
    if (!data?.grados) return [];
    if (!search) return data.grados;
    return data.grados.map(g => ({
      ...g,
      estudiantes: g.estudiantes.filter(e =>
        e.nombre.toLowerCase().includes(search.toLowerCase()) ||
        e.documento.includes(search)
      ),
    })).filter(g => g.estudiantes.length > 0);
  }, [data, search]);

  const periodoNombre = periodos.find(p => p.id === selectedPeriodo)?.nombre || data?.periodo?.nombre || '';

  // ── Print single student global boletin ──
  const printStudent = (est) => {
    const html = buildGlobalBoletinHtml(est, periodoNombre, periodosConfig);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 3000);
    };
  };

  // ── Print all students in a grado ──
  const printGrado = (grado) => {
    const pages = grado.estudiantes
      .map(e => buildGlobalBoletinPageHtml(e, periodoNombre, periodosConfig))
      .join('<div style="page-break-after:always"></div>');
    printPages(pages, `Boletines ${grado.grado} - ${periodoNombre}`);
  };

  // ── Print ALL ──
  const printAll = () => {
    if (!filteredGrados.length) return;
    const pages = filteredGrados.flatMap(g =>
      g.estudiantes.map(e => buildGlobalBoletinPageHtml(e, periodoNombre, periodosConfig))
    ).join('<div style="page-break-after:always"></div>');
    printPages(pages, `Boletines Globales - ${periodoNombre}`);
  };

  const printPages = (pagesHtml, title) => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title || '')}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Poppins', sans-serif; color: #1f2937; }
        @media print { @page { margin: 15mm; } }
      </style></head><body>${pagesHtml}</body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 3000);
    };
  };

  const getColorByNota = (nota) => {
    if (nota >= 4.5) return '#16a34a';
    if (nota >= 3.5) return '#2563eb';
    if (nota >= 3.0) return '#d97706';
    return '#dc2626';
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Boletines Globales</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reporte integral de notas por estudiante en todas sus materias
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select className="input-field w-52" value={selectedPeriodo}
              onChange={e => setSelectedPeriodo(e.target.value)}>
              {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-gray-500" />
            <select className="input-field w-44" value={filterGrado}
              onChange={e => setFilterGrado(e.target.value)}>
              <option value="">Todos los grados</option>
              {(data?.available_grados || []).map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar estudiante..."
              className="input-field pl-10" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} disabled={loadingData}
              className="btn-secondary text-sm flex items-center gap-1">
              {loadingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScrollText className="w-4 h-4" />}
              Actualizar
            </button>
            {filteredGrados.length > 0 && (
              <button onClick={printAll}
                className="btn-primary text-sm flex items-center gap-1">
                <Printer className="w-4 h-4" /> Imprimir Todos
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats.totalEstudiantes > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Estudiantes</p>
              <p className="text-xl font-bold text-gray-900">{stats.totalEstudiantes}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Grados</p>
              <p className="text-xl font-bold text-gray-900">{stats.totalGrados}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Promedio Definitivo</p>
              <p className="text-xl font-bold text-gray-900">{stats.promedioGeneral}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Award className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Aprobados</p>
              <p className="text-xl font-bold text-gray-900">{stats.aprobados} / {stats.totalEstudiantes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingData && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loadingData && filteredGrados.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title="No hay boletines publicados"
          description="Los profesores deben publicar los boletines de sus materias para que aparezcan aquí."
        />
      )}

      {/* Grados accordion */}
      {!loadingData && filteredGrados.map(grado => (
        <div key={grado.grado} className="card mb-4">
          {/* Grado header */}
          <button
            onClick={() => setExpandedGrado(expandedGrado === grado.grado ? null : grado.grado)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">{grado.grado}</h3>
                <p className="text-xs text-gray-500">
                  {grado.total_estudiantes} estudiante{grado.total_estudiantes !== 1 ? 's' : ''} · Promedio: {grado.promedio_grado}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); printGrado(grado); }}
                className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                title="Imprimir grado"
              >
                <Printer className="w-4 h-4" />
              </button>
              {expandedGrado === grado.grado
                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                : <ChevronDown className="w-5 h-5 text-gray-400" />
              }
            </div>
          </button>

          {/* Students list */}
          {expandedGrado === grado.grado && (
            <div className="px-4 pb-4 space-y-2">
              {grado.estudiantes.map(est => (
                <div key={est.estudiante_id} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Student header */}
                  <button
                    onClick={() => setExpandedStudent(expandedStudent === est.estudiante_id ? null : est.estudiante_id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                        {est.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 text-sm">{est.nombre}</p>
                        <p className="text-xs text-gray-500">Doc: {est.documento} · {est.total_materias} materia{est.total_materias !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Período actual</p>
                        <p className="text-lg font-bold" style={{ color: getColorByNota(est.promedio_periodo_actual ?? est.promedio_general) }}>
                          {formatNota(est.promedio_periodo_actual ?? est.promedio_general)}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          Definitiva: <span className="font-semibold" style={{ color: getColorByNota(est.promedio_definitivo ?? est.promedio_general) }}>
                            {formatNota(est.promedio_definitivo ?? est.promedio_general)}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); printStudent(est); }}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                        title="Imprimir boletín"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {expandedStudent === est.estudiante_id
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </button>

                  {/* Student materias detail */}
                  {expandedStudent === est.estudiante_id && (
                    <div className="px-4 pb-4 bg-gray-50">
                      <div className="mt-3 mb-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Nota general del estudiante</p>
                        <p className="text-sm text-indigo-900 mt-1">
                          {est.nota_general || 'Aun no hay suficientes calificaciones para generar una nota general.'}
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm mt-2 min-w-[980px]">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Materia</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Período Actual</th>
                              {periodosConfig.map(p => (
                                <th key={`head-${est.estudiante_id}-${p.numero}`} className="text-center py-2 px-2 text-xs font-medium text-gray-500">
                                  <div>P{p.numero}</div>
                                  <div className="text-[10px] text-gray-400 font-normal">{p.porcentaje ? `${Number(p.porcentaje)}%` : ''}</div>
                                </th>
                              ))}
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Definitiva</th>
                              <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {est.materias.map(m => {
                              const notasPeriodos = m.notas_periodos || {};
                              const notaActual = m.nota_final ?? 0;
                              const notaDefinitiva = m.nota_definitiva ?? m.nota_final ?? 0;
                              const fortalezas = Array.isArray(m.fortalezas) ? m.fortalezas : [];
                              const debilidades = Array.isArray(m.debilidades) ? m.debilidades : [];
                              const totalCols = 4 + periodosConfig.length;

                              return (
                                <Fragment key={m.materia_id}>
                                  <tr className="border-b border-gray-100 bg-white">
                                    <td className="py-2 px-2 font-medium text-gray-800">
                                      <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-gray-400 shrink-0" />
                                        <span>{m.materia_nombre}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <span className="font-bold" style={{ color: getColorByNota(notaActual) }}>
                                        {formatNota(notaActual)}
                                      </span>
                                    </td>
                                    {periodosConfig.map(p => {
                                      const notaPeriodo = notasPeriodos?.[String(p.numero)];
                                      return (
                                        <td key={`np-${m.materia_id}-${p.numero}`} className="py-2 px-2 text-center">
                                          <span className="font-semibold" style={{ color: notaPeriodo == null ? '#9ca3af' : getColorByNota(notaPeriodo) }}>
                                            {formatNota(notaPeriodo)}
                                          </span>
                                        </td>
                                      );
                                    })}
                                    <td className="py-2 px-2 text-center">
                                      <span className="font-bold" style={{ color: getColorByNota(notaDefinitiva) }}>
                                        {formatNota(notaDefinitiva)}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                                        ${notaDefinitiva >= 3.0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {notaDefinitiva >= 3.0 ? 'Aprobado' : 'Reprobado'}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="border-b border-gray-100 bg-gray-50">
                                    <td colSpan={totalCols} className="py-2 px-3">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                                          <p className="font-semibold text-emerald-700 mb-1">Fortalezas por competencias</p>
                                          <p className="text-emerald-900">
                                            {fortalezas.length > 0 ? fortalezas.join(' · ') : 'Sin fortalezas registradas por competencias todavía.'}
                                          </p>
                                        </div>
                                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                                          <p className="font-semibold text-rose-700 mb-1">Debilidades por competencias</p>
                                          <p className="text-rose-900">
                                            {debilidades.length > 0 ? debilidades.join(' · ') : 'Sin debilidades críticas por competencias registradas.'}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                </Fragment>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-300 bg-white">
                              <td className="py-2 px-2 font-semibold text-gray-900">Promedio General</td>
                              <td className="py-2 px-2 text-center">
                                <span className="font-bold text-base" style={{ color: getColorByNota(est.promedio_periodo_actual ?? est.promedio_general) }}>
                                  {formatNota(est.promedio_periodo_actual ?? est.promedio_general)}
                                </span>
                              </td>
                              {periodosConfig.map(p => (
                                <td key={`foot-${est.estudiante_id}-${p.numero}`} className="py-2 px-2 text-center text-gray-400">—</td>
                              ))}
                              <td className="py-2 px-2 text-center">
                                <span className="font-bold text-lg" style={{ color: getColorByNota(est.promedio_definitivo ?? est.promedio_general) }}>
                                  {formatNota(est.promedio_definitivo ?? est.promedio_general)}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                                  ${(est.promedio_definitivo ?? est.promedio_general) >= 3.0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {(est.promedio_definitivo ?? est.promedio_general) >= 3.0 ? 'Aprobado' : 'Reprobado'}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Print HTML builders ──

function buildGlobalBoletinHtml(est, periodoNombre, periodosConfig = []) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boletín - ${escapeHtml(est.nombre || 'Estudiante')}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Poppins', sans-serif; color: #1f2937; padding: 20mm; }
      @media print { @page { margin: 12mm; } body { padding: 0; } }
    </style></head><body>${buildGlobalBoletinPageHtml(est, periodoNombre, periodosConfig)}</body></html>`;
  return html;
}

function buildGlobalBoletinPageHtml(est, periodoNombre, periodosConfig = []) {
  const getColor = (n) => {
    if (n >= 4.5) return '#16a34a';
    if (n >= 3.5) return '#2563eb';
    if (n >= 3.0) return '#d97706';
    return '#dc2626';
  };

  const displayPeriodos = Array.isArray(periodosConfig)
    ? [...periodosConfig].sort((a, b) => Number(a.numero || 0) - Number(b.numero || 0)).slice(0, 4)
    : [];

  const promedioPeriodo = Number(est.promedio_periodo_actual ?? est.promedio_general ?? 0);
  const promedioDefinitivo = Number(est.promedio_definitivo ?? est.promedio_general ?? 0);

  const safePeriodoNombre = escapeHtml(periodoNombre || '');
  const safeNombre = escapeHtml(est.nombre || 'N/A');
  const safeDocumento = escapeHtml(est.documento || 'N/A');
  const safeGrado = escapeHtml(est.grado || 'N/A');
  const safeNotaGeneral = escapeHtml(est.nota_general || 'Aun no hay suficientes calificaciones para generar una nota general.');
  const periodHeaders = displayPeriodos
    .map((p) => `<th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:700">P${p.numero}${p.porcentaje ? `<br/><span style="font-size:9px;font-weight:400;color:#9ca3af">${Number(p.porcentaje)}%</span>` : ''}</th>`)
    .join('');

  const totalCols = 4 + displayPeriodos.length;

  const materiasRows = est.materias.map(m => {
    const notaActual = Number(m.nota_final ?? 0);
    const notaDefinitiva = Number(m.nota_definitiva ?? m.nota_final ?? 0);
    const fortalezas = Array.isArray(m.fortalezas) ? m.fortalezas : [];
    const debilidades = Array.isArray(m.debilidades) ? m.debilidades : [];
    const notasPeriodos = m.notas_periodos || {};
    const safeMateriaNombre = escapeHtml(m.materia_nombre || '');
    const periodCells = displayPeriodos.map((p) => {
      const notaPeriodo = notasPeriodos[String(p.numero)];
      const notaTexto = formatNota(notaPeriodo);
      const color = notaPeriodo == null ? '#9ca3af' : getColor(Number(notaPeriodo));
      return `<td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${color}">${notaTexto}</td>`;
    }).join('');

    const fortalezasHtml = escapeHtml(
      fortalezas.length > 0 ? fortalezas.join(' · ') : 'Sin fortalezas registradas por competencias todavía.'
    );
    const debilidadesHtml = escapeHtml(
      debilidades.length > 0 ? debilidades.join(' · ') : 'Sin debilidades críticas por competencias registradas.'
    );

    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:500">${safeMateriaNombre}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="font-weight:700;color:${getColor(notaActual)};font-size:15px">${formatNota(notaActual)}</span>
      </td>
      ${periodCells}
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${notaDefinitiva >= 3.0 ? '#dcfce7' : '#fee2e2'};color:${notaDefinitiva >= 3.0 ? '#15803d' : '#dc2626'}">
          ${formatNota(notaDefinitiva)}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${notaDefinitiva >= 3.0 ? '#dcfce7' : '#fee2e2'};color:${notaDefinitiva >= 3.0 ? '#15803d' : '#dc2626'}">
          ${notaDefinitiva >= 3.0 ? 'Aprobado' : 'Reprobado'}
        </span>
      </td>
    </tr>
    <tr>
      <td colspan="${totalCols}" style="padding:8px 10px;border-bottom:1px solid #e5e7eb;background:#fafafa">
        <div style="display:flex;gap:8px">
          <div style="width:50%;border:1px solid #a7f3d0;background:#ecfdf5;border-radius:8px;padding:6px 8px">
            <p style="font-size:10px;font-weight:700;color:#047857;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px">Fortalezas por competencias</p>
            <p style="font-size:11px;color:#065f46;line-height:1.4">${fortalezasHtml}</p>
          </div>
          <div style="width:50%;border:1px solid #fecaca;background:#fff1f2;border-radius:8px;padding:6px 8px">
            <p style="font-size:10px;font-weight:700;color:#be123c;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.3px">Debilidades por competencias</p>
            <p style="font-size:11px;color:#9f1239;line-height:1.4">${debilidadesHtml}</p>
          </div>
        </div>
      </td>
    </tr>
  `;}).join('');

  const barWidth = Math.min(100, (promedioPeriodo / 5) * 100);

  return `
    <div style="max-width:700px;margin:0 auto">
      <!-- Header -->
      <div style="text-align:center;margin-bottom:25px;border-bottom:3px solid #6d28d9;padding-bottom:15px">
        <h1 style="font-size:24px;font-weight:700;color:#6d28d9;margin-bottom:4px">xCalificator</h1>
        <h2 style="font-size:16px;font-weight:600;color:#374151;margin-bottom:2px">Boletín de Calificaciones</h2>
        <p style="font-size:13px;color:#6b7280">${safePeriodoNombre}</p>
      </div>

      <!-- Student info -->
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
        <div>
          <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Estudiante</p>
          <p style="font-size:16px;font-weight:600">${safeNombre}</p>
        </div>
        <div style="text-align:center">
          <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Documento</p>
          <p style="font-size:14px;font-weight:500">${safeDocumento}</p>
        </div>
        <div style="text-align:right">
          <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Grado</p>
          <p style="font-size:14px;font-weight:500">${safeGrado}</p>
        </div>
      </div>

      <!-- Grade bar -->
      <div style="margin-bottom:20px;padding:16px;background:#f3f4f6;border-radius:10px;text-align:center">
        <p style="font-size:12px;color:#6b7280;margin-bottom:8px">Promedio del período actual</p>
        <p style="font-size:32px;font-weight:700;color:${getColor(promedioPeriodo)}">${formatNota(promedioPeriodo)}</p>
        <div style="width:100%;max-width:300px;margin:10px auto 0;background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
          <div style="height:100%;width:${barWidth}%;background:${getColor(promedioPeriodo)};border-radius:999px"></div>
        </div>
        <p style="font-size:12px;color:#6b7280;margin-top:10px">
          Promedio definitivo acumulado: <strong style="color:${getColor(promedioDefinitivo)}">${formatNota(promedioDefinitivo)}</strong>
        </p>
      </div>

      <div style="margin-bottom:16px;padding:12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px">
        <p style="font-size:11px;color:#4338ca;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px">Nota general del estudiante</p>
        <p style="font-size:12px;line-height:1.5;color:#312e81">${safeNotaGeneral}</p>
      </div>

      <!-- Materias table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:25px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Materia</th>
            <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Actual</th>
            ${periodHeaders}
            <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Definitiva</th>
            <th style="padding:10px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${materiasRows}
        </tbody>
        <tfoot>
          <tr style="background:#f9fafb;border-top:2px solid #d1d5db">
            <td style="padding:12px;font-weight:700;font-size:14px">Promedio General</td>
            <td style="padding:12px;text-align:center">
              <span style="font-weight:700;font-size:16px;color:${getColor(promedioPeriodo)}">${formatNota(promedioPeriodo)}</span>
            </td>
            ${displayPeriodos.map(() => '<td style="padding:12px;text-align:center;color:#9ca3af">—</td>').join('')}
            <td style="padding:12px;text-align:center">
              <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;
                background:${promedioDefinitivo >= 3.0 ? '#dcfce7' : '#fee2e2'};color:${promedioDefinitivo >= 3.0 ? '#15803d' : '#dc2626'}">
                ${formatNota(promedioDefinitivo)}
              </span>
            </td>
            <td style="padding:12px;text-align:center">
              <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;
                background:${promedioDefinitivo >= 3.0 ? '#dcfce7' : '#fee2e2'};color:${promedioDefinitivo >= 3.0 ? '#15803d' : '#dc2626'}">
                ${promedioDefinitivo >= 3.0 ? 'Aprobado' : 'Reprobado'}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Signatures -->
      <div style="display:flex;justify-content:space-between;margin-top:50px;padding-top:20px">
        <div style="text-align:center;width:40%">
          <div style="border-top:1px solid #9ca3af;padding-top:8px">
            <p style="font-size:12px;color:#6b7280">Director(a) Académico</p>
          </div>
        </div>
        <div style="text-align:center;width:40%">
          <div style="border-top:1px solid #9ca3af;padding-top:8px">
            <p style="font-size:12px;color:#6b7280">Acudiente / Padre de Familia</p>
          </div>
        </div>
      </div>

      <p style="text-align:center;font-size:10px;color:#9ca3af;margin-top:30px">
        Generado por xCalificator · ${new Date().toLocaleDateString('es-CO')}
      </p>
    </div>
  `;
}
