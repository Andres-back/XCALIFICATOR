import { useState, useEffect, useMemo } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  ScrollText, Loader2, Calendar, ChevronDown, ChevronUp,
  Printer, Search, Award, TrendingUp, Users, Filter,
  BookOpen, GraduationCap, FileText,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';

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
    let totalEst = 0, allPromedios = [], aprobados = 0;
    data.grados.forEach(g => {
      totalEst += g.total_estudiantes;
      g.estudiantes.forEach(e => {
        allPromedios.push(e.promedio_general);
        if (e.promedio_general >= 3.0) aprobados++;
      });
    });
    return {
      totalEstudiantes: totalEst,
      totalGrados: data.grados.length,
      promedioGeneral: allPromedios.length ? (allPromedios.reduce((a, b) => a + b, 0) / allPromedios.length).toFixed(2) : '0.00',
      aprobados,
    };
  }, [data]);

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

  const periodoNombre = periodos.find(p => p.id === selectedPeriodo)?.nombre || '';

  // ── Print single student global boletin ──
  const printStudent = (est) => {
    const html = buildGlobalBoletinHtml(est, periodoNombre);
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
      .map(e => buildGlobalBoletinPageHtml(e, periodoNombre))
      .join('<div style="page-break-after:always"></div>');
    printPages(pages, `Boletines ${grado.grado} - ${periodoNombre}`);
  };

  // ── Print ALL ──
  const printAll = () => {
    if (!filteredGrados.length) return;
    const pages = filteredGrados.flatMap(g =>
      g.estudiantes.map(e => buildGlobalBoletinPageHtml(e, periodoNombre))
    ).join('<div style="page-break-after:always"></div>');
    printPages(pages, `Boletines Globales - ${periodoNombre}`);
  };

  const printPages = (pagesHtml, title) => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
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
              <p className="text-xs text-gray-500">Promedio General</p>
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
                        <p className="text-xs text-gray-500">Promedio</p>
                        <p className="text-lg font-bold" style={{ color: getColorByNota(est.promedio_general) }}>
                          {est.promedio_general}
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
                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Materia</th>
                            <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Nota Final</th>
                            <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Estado</th>
                            <th className="text-center py-2 px-2 text-xs font-medium text-gray-500" title="Presente">✓</th>
                            <th className="text-center py-2 px-2 text-xs font-medium text-gray-500" title="Ausente">✗</th>
                            <th className="text-center py-2 px-2 text-xs font-medium text-gray-500" title="Tardanza">⏱</th>
                          </tr>
                        </thead>
                        <tbody>
                          {est.materias.map(m => {
                            const a = m.desglose_json?.asistencia;
                            return (
                            <tr key={m.materia_id} className="border-b border-gray-100">
                              <td className="py-2 px-2 font-medium text-gray-800 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-gray-400 shrink-0" />
                                {m.materia_nombre}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <span className="font-bold" style={{ color: getColorByNota(m.nota_final) }}>
                                  {m.nota_final.toFixed(2)}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                                  ${m.nota_final >= 3.0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {m.nota_final >= 3.0 ? 'Aprobado' : 'Reprobado'}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-center text-green-600 font-medium text-xs">{a?.presente || 0}</td>
                              <td className="py-2 px-2 text-center text-red-600 font-medium text-xs">{a?.ausente || 0}</td>
                              <td className="py-2 px-2 text-center text-yellow-600 font-medium text-xs">{a?.tardanza || 0}</td>
                            </tr>
                          );})}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300">
                            <td className="py-2 px-2 font-semibold text-gray-900">Promedio General</td>
                            <td className="py-2 px-2 text-center">
                              <span className="font-bold text-lg" style={{ color: getColorByNota(est.promedio_general) }}>
                                {est.promedio_general}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                                ${est.promedio_general >= 3.0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {est.promedio_general >= 3.0 ? 'Aprobado' : 'Reprobado'}
                              </span>
                            </td>
                            <td colSpan={3}></td>
                          </tr>
                        </tfoot>
                      </table>
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

function buildGlobalBoletinHtml(est, periodoNombre) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boletín - ${est.nombre}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Poppins', sans-serif; color: #1f2937; padding: 20mm; }
      @media print { @page { margin: 15mm; } body { padding: 0; } }
    </style></head><body>${buildGlobalBoletinPageHtml(est, periodoNombre)}</body></html>`;
  return html;
}

function buildGlobalBoletinPageHtml(est, periodoNombre) {
  const getColor = (n) => {
    if (n >= 4.5) return '#16a34a';
    if (n >= 3.5) return '#2563eb';
    if (n >= 3.0) return '#d97706';
    return '#dc2626';
  };

  const materiasRows = est.materias.map(m => {
    const a = m.desglose_json?.asistencia;
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:500">${m.materia_nombre}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="font-weight:700;color:${getColor(m.nota_final)};font-size:16px">${m.nota_final.toFixed(2)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;
          background:${m.nota_final >= 3.0 ? '#dcfce7' : '#fee2e2'};color:${m.nota_final >= 3.0 ? '#15803d' : '#dc2626'}">
          ${m.nota_final >= 3.0 ? 'Aprobado' : 'Reprobado'}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;font-weight:500">${a?.presente || 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;font-weight:500">${a?.ausente || 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#ca8a04;font-weight:500">${a?.tardanza || 0}</td>
    </tr>
  `;}).join('');

  const barWidth = Math.min(100, (est.promedio_general / 5) * 100);

  return `
    <div style="max-width:700px;margin:0 auto">
      <!-- Header -->
      <div style="text-align:center;margin-bottom:25px;border-bottom:3px solid #6d28d9;padding-bottom:15px">
        <h1 style="font-size:24px;font-weight:700;color:#6d28d9;margin-bottom:4px">xCalificator</h1>
        <h2 style="font-size:16px;font-weight:600;color:#374151;margin-bottom:2px">Boletín de Calificaciones</h2>
        <p style="font-size:13px;color:#6b7280">${periodoNombre}</p>
      </div>

      <!-- Student info -->
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
        <div>
          <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Estudiante</p>
          <p style="font-size:16px;font-weight:600">${est.nombre}</p>
        </div>
        <div style="text-align:center">
          <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Documento</p>
          <p style="font-size:14px;font-weight:500">${est.documento}</p>
        </div>
        <div style="text-align:right">
          <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Grado</p>
          <p style="font-size:14px;font-weight:500">${est.grado || 'N/A'}</p>
        </div>
      </div>

      <!-- Grade bar -->
      <div style="margin-bottom:20px;padding:16px;background:#f3f4f6;border-radius:10px;text-align:center">
        <p style="font-size:12px;color:#6b7280;margin-bottom:8px">Promedio General</p>
        <p style="font-size:32px;font-weight:700;color:${getColor(est.promedio_general)}">${est.promedio_general}</p>
        <div style="width:100%;max-width:300px;margin:10px auto 0;background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
          <div style="height:100%;width:${barWidth}%;background:${getColor(est.promedio_general)};border-radius:999px"></div>
        </div>
      </div>

      <!-- Materias table -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:25px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Materia</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Nota Final</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Estado</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#16a34a;font-weight:600">✓</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#dc2626;font-weight:600">✗</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#ca8a04;font-weight:600">⏱</th>
          </tr>
        </thead>
        <tbody>
          ${materiasRows}
        </tbody>
        <tfoot>
          <tr style="background:#f9fafb;border-top:2px solid #d1d5db">
            <td style="padding:12px;font-weight:700;font-size:14px">Promedio General</td>
            <td style="padding:12px;text-align:center">
              <span style="font-weight:700;font-size:18px;color:${getColor(est.promedio_general)}">${est.promedio_general}</span>
            </td>
            <td style="padding:12px;text-align:center">
              <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;
                background:${est.promedio_general >= 3.0 ? '#dcfce7' : '#fee2e2'};color:${est.promedio_general >= 3.0 ? '#15803d' : '#dc2626'}">
                ${est.promedio_general >= 3.0 ? 'Aprobado' : 'Reprobado'}
              </span>
            </td>
            <td colspan="3" style="padding:12px"></td>
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
