import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  ScrollText, Loader2, Calendar, ChevronDown, ChevronUp,
  Printer, Search, Award, TrendingUp, Target, Users,
  CheckCircle, AlertCircle, BookOpen,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';

export default function MateriaBoletines({ materiaId, materiaNombre }) {
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [boletines, setBoletines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingBol, setLoadingBol] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/periodos/')
      .then(res => {
        setPeriodos(res.data);
        if (res.data.length > 0) setSelectedPeriodo(res.data[0].id);
      })
      .catch(() => toast.error('Error cargando períodos'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPeriodo) loadBoletines();
  }, [selectedPeriodo]);

  const loadBoletines = async () => {
    setLoadingBol(true);
    try {
      const res = await api.get(`/reportes/boletines/materia/${materiaId}/${selectedPeriodo}`);
      setBoletines(res.data);
    } catch {
      setBoletines([]);
    } finally {
      setLoadingBol(false);
    }
  };

  // ── Stats ──
  const allNotas = boletines.filter(b => b.nota_final != null).map(b => b.nota_final);
  const promedio = allNotas.length > 0 ? allNotas.reduce((a, b) => a + b, 0) / allNotas.length : 0;
  const aprobados = allNotas.filter(n => n >= 3.0).length;
  const mejor = allNotas.length > 0 ? Math.max(...allNotas) : 0;

  // ── Filter ──
  const filtered = boletines
    .filter(b => !search || (b.estudiante_nombre || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.estudiante_nombre || '').localeCompare(b.estudiante_nombre || ''));

  // ── Selected periodo name ──
  const periodoNombre = periodos.find(p => p.id === selectedPeriodo)?.nombre || '';

  // ── Print single boletin ──
  const printBoletin = (b) => {
    const html = buildBoletinHtml(b, materiaNombre, periodoNombre);
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

  // ── Print ALL boletines ──
  const printAll = () => {
    if (filtered.length === 0) return;
    const pages = filtered.map(b => buildBoletinPageHtml(b, materiaNombre, periodoNombre)).join('<div style="page-break-after:always"></div>');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boletines - ${materiaNombre}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Poppins', sans-serif; color: #1f2937; }
        @media print { @page { margin: 15mm; } }
      </style></head><body>${pages}</body></html>`;
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

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );

  if (periodos.length === 0) return (
    <EmptyState
      icon={ScrollText}
      title="No hay períodos configurados"
      description="Configura períodos académicos desde el panel de administración."
    />
  );

  return (
    <div className="space-y-6">
      {/* Period selector + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Período:</label>
          <select className="input-field w-full sm:w-56" value={selectedPeriodo}
            onChange={e => setSelectedPeriodo(e.target.value)}>
            {periodos.sort((a, b) => a.numero - b.numero).map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={loadBoletines} disabled={loadingBol}
            className="btn-secondary text-sm flex items-center gap-1">
            {loadingBol ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScrollText className="w-4 h-4" />}
            Actualizar
          </button>
          {filtered.length > 0 && (
            <button onClick={printAll}
              className="btn-primary text-sm flex items-center gap-1">
              <Printer className="w-4 h-4" /> Imprimir Todos
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {allNotas.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Estudiantes</p>
              <p className="text-lg font-bold text-gray-900">{boletines.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${promedio >= 3 ? 'bg-green-100' : 'bg-red-100'} flex items-center justify-center`}>
              <TrendingUp className={`w-5 h-5 ${promedio >= 3 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Promedio</p>
              <p className="text-lg font-bold text-gray-900">{promedio.toFixed(1)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Aprobados</p>
              <p className="text-lg font-bold text-gray-900">{aprobados}/{allNotas.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Award className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Mejor Nota</p>
              <p className="text-lg font-bold text-gray-900">{mejor.toFixed(1)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {boletines.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar estudiante..."
            className="input-field pl-10 w-full sm:w-72" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Boletines list */}
      {loadingBol ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={boletines.length === 0 ? 'No hay boletines publicados' : 'Sin resultados'}
          description={boletines.length === 0
            ? "Publica boletines desde la pestaña 'Reportes' para verlos aquí."
            : 'Ningún estudiante coincide con tu búsqueda.'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(b => {
            const isExpanded = expanded === b.id;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
                {/* Student row */}
                <div className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : b.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      b.nota_final >= 4.0 ? 'bg-green-100 text-green-700' :
                      b.nota_final >= 3.0 ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      <span className="text-lg font-bold">{b.nota_final?.toFixed(1) || '—'}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.estudiante_nombre || 'Estudiante'}</p>
                      <p className="text-xs text-gray-400">
                        {b.publicado_at
                          ? `Publicado: ${new Date(b.publicado_at).toLocaleDateString('es-CO')}`
                          : 'Sin publicar'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={e => { e.stopPropagation(); printBoletin(b); }}
                      className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3">
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </button>
                    {b.nota_final >= 3.0 ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && b.desglose_json && (
                  <div className="px-5 pb-5 border-t border-gray-100 space-y-3 pt-4">
                    {/* Grade bar */}
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        b.nota_final >= 4.0 ? 'bg-green-500' :
                        b.nota_final >= 3.0 ? 'bg-blue-500' : 'bg-red-500'
                      }`} style={{ width: `${(b.nota_final / 5.0) * 100}%` }} />
                    </div>

                    {/* Config */}
                    {b.desglose_json.config && Object.keys(b.desglose_json.config).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(b.desglose_json.config).map(([tipo, pct]) => (
                          <span key={tipo} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 capitalize">
                            {tipo}: {pct}%
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Activities detail */}
                    {b.desglose_json.actividades && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase">Desglose de Actividades</h4>
                        {b.desglose_json.actividades.map((a, i) => (
                          <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                            a.nota != null && a.nota >= 3.0 ? 'bg-green-50 border-green-100' :
                            a.nota != null ? 'bg-red-50 border-red-100' :
                            'bg-gray-50 border-gray-100'
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 capitalize">{a.tipo}</span>
                              <span className="text-sm text-gray-700 truncate">{a.titulo}</span>
                              {a.porcentaje > 0 && <span className="text-xs text-primary-600 font-medium">{a.porcentaje}%</span>}
                            </div>
                            <span className={`text-sm font-bold shrink-0 ${
                              a.nota != null && a.nota >= 3.0 ? 'text-green-600' :
                              a.nota != null ? 'text-red-600' : 'text-gray-400'
                            }`}>
                              {a.nota != null ? a.nota.toFixed(1) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Attendance */}
                    {b.desglose_json.asistencia && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Asistencia</h4>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-center p-2 rounded-lg bg-green-50 border border-green-100">
                            <p className="text-lg font-bold text-green-700">{b.desglose_json.asistencia.presente || 0}</p>
                            <p className="text-xs text-green-600">Presente</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-red-50 border border-red-100">
                            <p className="text-lg font-bold text-red-700">{b.desglose_json.asistencia.ausente || 0}</p>
                            <p className="text-xs text-red-600">Ausente</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-yellow-50 border border-yellow-100">
                            <p className="text-lg font-bold text-yellow-700">{b.desglose_json.asistencia.tardanza || 0}</p>
                            <p className="text-xs text-yellow-600">Tardanza</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-blue-50 border border-blue-100">
                            <p className="text-lg font-bold text-blue-700">{b.desglose_json.asistencia.justificado || 0}</p>
                            <p className="text-xs text-blue-600">Justificado</p>
                          </div>
                        </div>
                      </div>
                    )}
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


/* ── Print helpers ── */

function buildBoletinPageHtml(b, materiaNombre, periodoNombre) {
  const nota = b.nota_final?.toFixed(1) || '—';
  const color = b.nota_final >= 4.0 ? '#16a34a' : b.nota_final >= 3.0 ? '#2563eb' : '#dc2626';
  const estado = b.nota_final >= 3.0 ? 'APROBADO' : 'REPROBADO';
  const estadoColor = b.nota_final >= 3.0 ? '#16a34a' : '#dc2626';

  let actRows = '';
  if (b.desglose_json?.actividades) {
    actRows = b.desglose_json.actividades.map(a => {
      const n = a.nota != null ? a.nota.toFixed(1) : '—';
      const nColor = a.nota != null ? (a.nota >= 3.0 ? '#16a34a' : '#dc2626') : '#9ca3af';
      const pct = a.porcentaje ? `${a.porcentaje}%` : '—';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-transform:capitalize">${a.tipo}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${a.titulo || ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280">${pct}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${nColor}">${n}</td>
      </tr>`;
    }).join('');
  }

  let configHtml = '';
  if (b.desglose_json?.config && Object.keys(b.desglose_json.config).length > 0) {
    const tags = Object.entries(b.desglose_json.config).map(([t, p]) =>
      `<span style="display:inline-block;padding:2px 10px;background:#f3f4f6;border-radius:9999px;font-size:11px;text-transform:capitalize;margin-right:6px">${t}: ${p}%</span>`
    ).join('');
    configHtml = `<div style="margin-bottom:16px">${tags}</div>`;
  }

  return `
    <div style="max-width:700px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="font-size:22px;font-weight:700;margin:0">Boletín de Calificaciones</h1>
        <p style="color:#6b7280;font-size:13px;margin:4px 0 0">xCalificator — Reporte Académico</p>
      </div>

      <table style="width:100%;margin-bottom:20px;font-size:13px">
        <tr>
          <td style="padding:4px 0"><strong>Estudiante:</strong> ${b.estudiante_nombre || 'N/A'}</td>
          <td style="padding:4px 0;text-align:right"><strong>Materia:</strong> ${materiaNombre || b.materia_nombre || ''}</td>
        </tr>
        <tr>
          <td style="padding:4px 0"><strong>Período:</strong> ${periodoNombre || b.periodo_nombre || ''}</td>
          <td style="padding:4px 0;text-align:right"><strong>Fecha:</strong> ${b.publicado_at ? new Date(b.publicado_at).toLocaleDateString('es-CO') : new Date().toLocaleDateString('es-CO')}</td>
        </tr>
      </table>

      <div style="text-align:center;margin:24px 0;padding:20px;background:#f9fafb;border-radius:12px;border:2px solid ${color}">
        <p style="font-size:12px;color:#6b7280;margin:0 0 4px">Nota Final</p>
        <p style="font-size:40px;font-weight:800;color:${color};margin:0">${nota}<span style="font-size:16px;color:#9ca3af"> /5.0</span></p>
        <p style="font-size:13px;font-weight:600;color:${estadoColor};margin:8px 0 0">${estado}</p>
      </div>

      ${configHtml}

      ${actRows ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="text-align:left;padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb">Tipo</th>
              <th style="text-align:left;padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb">Actividad</th>
              <th style="text-align:center;padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb">%</th>
              <th style="text-align:center;padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb">Nota</th>
            </tr>
          </thead>
          <tbody>${actRows}</tbody>
        </table>
      ` : ''}

      ${b.desglose_json?.asistencia ? `
        <div style="margin-top:20px">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:10px">Asistencia</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f3f4f6">
                <th style="padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb;text-align:center">Presente</th>
                <th style="padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb;text-align:center">Ausente</th>
                <th style="padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb;text-align:center">Tardanza</th>
                <th style="padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb;text-align:center">Justificado</th>
                <th style="padding:8px 12px;font-weight:600;border-bottom:2px solid #e5e7eb;text-align:center">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:8px 12px;text-align:center;color:#16a34a;font-weight:600">${b.desglose_json.asistencia.presente || 0}</td>
                <td style="padding:8px 12px;text-align:center;color:#dc2626;font-weight:600">${b.desglose_json.asistencia.ausente || 0}</td>
                <td style="padding:8px 12px;text-align:center;color:#ca8a04;font-weight:600">${b.desglose_json.asistencia.tardanza || 0}</td>
                <td style="padding:8px 12px;text-align:center;color:#2563eb;font-weight:600">${b.desglose_json.asistencia.justificado || 0}</td>
                <td style="padding:8px 12px;text-align:center;font-weight:600">${b.desglose_json.asistencia.total || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ` : ''}

      <div style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between">
        <div style="text-align:center;flex:1">
          <div style="border-top:1px solid #1f2937;width:180px;margin:0 auto;padding-top:4px;font-size:11px;color:#6b7280">Firma del Profesor</div>
        </div>
        <div style="text-align:center;flex:1">
          <div style="border-top:1px solid #1f2937;width:180px;margin:0 auto;padding-top:4px;font-size:11px;color:#6b7280">Firma del Estudiante</div>
        </div>
      </div>
    </div>`;
}

function buildBoletinHtml(b, materiaNombre, periodoNombre) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Boletín - ${b.estudiante_nombre}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Poppins', sans-serif; color: #1f2937; padding: 40px; }
      @media print { @page { margin: 15mm; } body { padding: 0; } }
    </style>
  </head><body>${buildBoletinPageHtml(b, materiaNombre, periodoNombre)}</body></html>`;
}
