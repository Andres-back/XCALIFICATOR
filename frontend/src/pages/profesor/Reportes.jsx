import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  BarChart3, Printer, Loader2, BookOpen, Users,
  Award, TrendingUp, TrendingDown, AlertTriangle, Filter, CalendarDays, FileSpreadsheet,
  Presentation, Sparkles,
} from 'lucide-react';


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadCsv(filename, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCsv = (value) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatScore(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(2);
}

function scoreClass(score) {
  const n = toNumber(score, 0);
  if (n >= 4.0) return 'text-green-600';
  if (n >= 3.0) return 'text-blue-600';
  return 'text-red-600';
}

function buildMateriaReport(data, materia) {
  const estudiantes = Array.isArray(data?.estudiantes) ? data.estudiantes : [];
  const notas = estudiantes
    .map((s) => toNumber(s.nota_final, NaN))
    .filter((n) => Number.isFinite(n));

  const promedioGrupo = notas.length
    ? notas.reduce((a, b) => a + b, 0) / notas.length
    : null;

  const aprobados = notas.filter((n) => n >= 3).length;
  const reprobados = notas.filter((n) => n < 3).length;
  const totalFaltas = estudiantes.reduce((acc, s) => acc + toNumber(s.asistencia?.ausente), 0);

  const ranking = [...estudiantes]
    .map((s) => ({
      ...s,
      nota_final_num: toNumber(s.nota_final, 0),
      faltas_num: toNumber(s.asistencia?.ausente, 0),
      asistencia_nota_num: toNumber(s.asistencia?.nota, 0),
      participacion_num: toNumber(s.nota_participacion, 0),
    }))
    .sort((a, b) => b.nota_final_num - a.nota_final_num);

  const topStudent = ranking[0] || null;
  const lowStudent = ranking[ranking.length - 1] || null;
  const mostAbsences = [...ranking].sort((a, b) => b.faltas_num - a.faltas_num)[0] || null;

  const actividadesMap = new Map();
  ranking.forEach((est) => {
    (est.actividades || []).forEach((act) => {
      const key = act.examen_id || `${act.titulo}-${act.fecha || ''}`;
      if (!actividadesMap.has(key)) {
        actividadesMap.set(key, {
          examen_id: act.examen_id || key,
          titulo: act.titulo || 'Actividad',
          tipo: act.tipo || 'examen',
          porcentaje: toNumber(act.porcentaje, 0),
          notas: [],
          auto_asignadas: 0,
        });
      }

      const ref = actividadesMap.get(key);
      ref.notas.push(toNumber(act.nota, 0));
      if (act.auto_asignada) ref.auto_asignadas += 1;
    });
  });

  const actividadesResumen = [...actividadesMap.values()]
    .map((a) => {
      const promedio = a.notas.length ? a.notas.reduce((x, y) => x + y, 0) / a.notas.length : 0;
      return {
        ...a,
        promedio,
      };
    })
    .sort((a, b) => a.promedio - b.promedio);

  const actividadMasBaja = actividadesResumen[0] || null;
  const actividadMasAlta = actividadesResumen.length
    ? [...actividadesResumen].sort((a, b) => b.promedio - a.promedio)[0]
    : null;

  return {
    materia,
    periodo: data?.periodo,
    config: data?.config_porcentajes || {},
    estudiantesTotal: estudiantes.length,
    promedioGrupo,
    aprobados,
    reprobados,
    totalFaltas,
    topStudent,
    lowStudent,
    mostAbsences,
    ranking,
    actividadesResumen,
    actividadMasBaja,
    actividadMasAlta,
  };
}

export default function ProfesorReportes() {
  const [materias, setMaterias] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [failedReports, setFailedReports] = useState([]);
  const [creatingSlides, setCreatingSlides] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [materiasRes, periodosRes] = await Promise.all([
          api.get('/materias/mis-materias'),
          api.get('/periodos/'),
        ]);

        setMaterias(materiasRes.data || []);
        const periodosSorted = [...(periodosRes.data || [])].sort((a, b) => a.numero - b.numero);
        setPeriodos(periodosSorted);

        if (periodosSorted.length > 0) {
          const activeOrFirst = periodosSorted.find((p) => p.activo) || periodosSorted[0];
          setSelectedPeriodo(activeOrFirst.id);
        }
      } catch {
        toast.error('Error cargando materias o períodos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleMateria = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelected(selected.length === materias.length ? [] : materias.map(m => m.id));
  };

  const generateReport = useCallback(async () => {
    if (!selected.length) { toast.error('Selecciona al menos una materia'); return; }
    if (!selectedPeriodo) { toast.error('Selecciona un período'); return; }

    setGenerating(true);
    setReport(null);
    setFailedReports([]);

    try {
      const responses = await Promise.all(selected.map(async (materiaId) => {
        const mat = materias.find((m) => m.id === materiaId);
        try {
          const { data } = await api.get(`/reportes/materia/${materiaId}/periodo/${selectedPeriodo}`);
          return { ok: true, data: buildMateriaReport(data, mat) };
        } catch (err) {
          return {
            ok: false,
            materia: mat,
            detail: err.response?.data?.detail || 'Error generando reporte de la materia',
          };
        }
      }));

      const ok = responses.filter((r) => r.ok).map((r) => r.data);
      const failed = responses.filter((r) => !r.ok);

      if (failed.length > 0) {
        setFailedReports(failed);
        toast.error(`No se pudieron generar ${failed.length} materias`);
      }

      if (ok.length === 0) {
        setReport(null);
        return;
      }

      setReport(ok);
      toast.success('Reporte generado con éxito');
    } catch (err) {
      toast.error('Error generando reporte');
    } finally {
      setGenerating(false);
    }
  }, [selected, materias, selectedPeriodo]);

  const crearPresentacionBoletin = async () => {
    if (creatingSlides) return;
    if (selected.length !== 1) {
      toast.error('Selecciona exactamente UNA materia para crear la presentación');
      return;
    }
    if (!selectedPeriodo) {
      toast.error('Selecciona un período');
      return;
    }
    const materiaId = selected[0];
    setCreatingSlides(true);
    const tid = toast.loading('Creando presentación del período… ✨ (30-90s)');
    try {
      const { data } = await api.post(
        `/presentaciones/boletin/${materiaId}/${selectedPeriodo}`,
        null,
        { params: { plantilla: 'modern', num_slides: 10 }, timeout: 240000 }
      );
      toast.dismiss(tid);
      toast.success('¡Presentación lista! 🎉');
      if (data?.pptx_url) window.open(data.pptx_url, '_blank', 'noopener');
    } catch (err) {
      toast.dismiss(tid);
      toast.error(err?.response?.data?.detail || 'No pudimos crear la presentación');
    } finally {
      setCreatingSlides(false);
    }
  };

  const selectedPeriodoLabel = useMemo(() => {
    const p = periodos.find((x) => x.id === selectedPeriodo);
    return p ? p.nombre : 'Período';
  }, [periodos, selectedPeriodo]);

  const globalStats = useMemo(() => {
    if (!report || report.length === 0) return null;

    const allRanking = report.flatMap((r) =>
      r.ranking.map((s) => ({
        ...s,
        materia_nombre: r.materia?.nombre || 'Materia',
      }))
    );

    const allScores = allRanking
      .map((s) => toNumber(s.nota_final_num, NaN))
      .filter((n) => Number.isFinite(n));

    const promedioGlobal = allScores.length
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : null;

    const totalFaltas = report.reduce((acc, r) => acc + toNumber(r.totalFaltas), 0);
    const totalEstudiantes = report.reduce((acc, r) => acc + toNumber(r.estudiantesTotal), 0);

    const topGlobal = allRanking.length
      ? [...allRanking].sort((a, b) => b.nota_final_num - a.nota_final_num)[0]
      : null;
    const lowGlobal = allRanking.length
      ? [...allRanking].sort((a, b) => a.nota_final_num - b.nota_final_num)[0]
      : null;
    const absGlobal = allRanking.length
      ? [...allRanking].sort((a, b) => b.faltas_num - a.faltas_num)[0]
      : null;

    return {
      materias: report.length,
      totalEstudiantes,
      promedioGlobal,
      totalFaltas,
      topGlobal,
      lowGlobal,
      absGlobal,
    };
  }, [report]);

  const exportExcel = () => {
    if (!report || report.length === 0) {
      toast.error('Genera el reporte antes de exportar');
      return;
    }

    const rows = [
      {
        Seccion: 'Resumen Global',
        Periodo: selectedPeriodoLabel,
        Materia: '',
        Puesto: '',
        Estudiante: '',
        Nota_Final: '',
        Faltas: globalStats?.totalFaltas || 0,
        Nota_Asistencia: '',
        Nota_Participacion: '',
        Actividad: '',
        Tipo: '',
        Promedio: Number(toNumber(globalStats?.promedioGlobal, 0).toFixed(2)),
        Porcentaje: '',
        Auto_Asignadas_1_0: '',
        Materias: globalStats?.materias || report.length,
        Registros: globalStats?.totalEstudiantes || 0,
        Mejor_Alumno: globalStats?.topGlobal?.nombre || '',
        Mejor_Nota: Number(toNumber(globalStats?.topGlobal?.nota_final_num, 0).toFixed(2)),
        Peor_Alumno: globalStats?.lowGlobal?.nombre || '',
        Peor_Nota: Number(toNumber(globalStats?.lowGlobal?.nota_final_num, 0).toFixed(2)),
      },
    ];

    report.forEach((r) => {
      r.ranking.forEach((s, index) => {
        rows.push({
          Seccion: 'Consolidado',
          Periodo: selectedPeriodoLabel,
          Materia: r.materia?.nombre || 'Materia',
          Puesto: index + 1,
          Estudiante: s.nombre,
          Nota_Final: Number(toNumber(s.nota_final_num, 0).toFixed(2)),
          Faltas: toNumber(s.faltas_num, 0),
          Nota_Asistencia: Number(toNumber(s.asistencia_nota_num, 0).toFixed(2)),
          Nota_Participacion: Number(toNumber(s.participacion_num, 0).toFixed(2)),
          Actividad: '',
          Tipo: '',
          Promedio: '',
          Porcentaje: '',
          Auto_Asignadas_1_0: '',
          Materias: '',
          Registros: '',
          Mejor_Alumno: '',
          Mejor_Nota: '',
          Peor_Alumno: '',
          Peor_Nota: '',
        });
      });
    });

    report.forEach((r) => {
      const materiaNombre = r.materia?.nombre || 'Materia';
      r.actividadesResumen.forEach((a) => {
        rows.push({
          Seccion: 'Actividad',
          Periodo: selectedPeriodoLabel,
          Materia: materiaNombre,
          Puesto: '',
          Estudiante: '',
          Nota_Final: '',
          Faltas: '',
          Nota_Asistencia: '',
          Nota_Participacion: '',
          Actividad: a.titulo,
          Tipo: (a.tipo || 'examen').replace('_', ' '),
          Promedio: Number(toNumber(a.promedio, 0).toFixed(2)),
          Porcentaje: `${a.porcentaje}%`,
          Auto_Asignadas_1_0: toNumber(a.auto_asignadas, 0),
          Materias: '',
          Registros: '',
          Mejor_Alumno: '',
          Mejor_Nota: '',
          Peor_Alumno: '',
          Peor_Nota: '',
        });
      });
    });

    const periodoTag = String(selectedPeriodoLabel || 'periodo').toLowerCase().replace(/\s+/g, '-');
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadCsv(`reporte-multimateria-${periodoTag}-${dateTag}.csv`, rows);
  };

  const handlePrint = () => {
    if (!report) return;
    const pw = window.open('', '_blank', 'width=1000,height=800');
    if (!pw) return;

    const globalSummary = globalStats ? `
      <div class="section">
        <h2>Resumen Global (${escapeHtml(selectedPeriodoLabel)})</h2>
        <div class="stats-row">
          <div class="stat"><span class="stat-n">${globalStats.materias}</span><span class="stat-l">Materias</span></div>
          <div class="stat"><span class="stat-n">${globalStats.totalEstudiantes}</span><span class="stat-l">Registros estudiante</span></div>
          <div class="stat"><span class="stat-n">${formatScore(globalStats.promedioGlobal)}</span><span class="stat-l">Promedio global</span></div>
          <div class="stat"><span class="stat-n">${globalStats.totalFaltas}</span><span class="stat-l">Faltas totales</span></div>
        </div>
      </div>
    ` : '';

    const sections = report.map(r => `
      <div class="section">
        <h2>${escapeHtml(r.materia?.nombre || 'Materia')}</h2>
        <p class="subline">Período: ${escapeHtml(selectedPeriodoLabel)}</p>
        <div class="stats-row">
          <div class="stat"><span class="stat-n">${r.estudiantesTotal}</span><span class="stat-l">Estudiantes</span></div>
          <div class="stat"><span class="stat-n">${formatScore(r.promedioGrupo)}</span><span class="stat-l">Promedio grupo</span></div>
          <div class="stat"><span class="stat-n">${r.aprobados}</span><span class="stat-l">Aprobados</span></div>
          <div class="stat"><span class="stat-n">${r.reprobados}</span><span class="stat-l">Reprobados</span></div>
          <div class="stat"><span class="stat-n">${r.totalFaltas}</span><span class="stat-l">Faltas</span></div>
        </div>

        <div class="insights">
          <div><strong>Nota más alta:</strong> ${escapeHtml(r.topStudent?.nombre || '—')} (${formatScore(r.topStudent?.nota_final_num)})</div>
          <div><strong>Nota más baja:</strong> ${escapeHtml(r.lowStudent?.nombre || '—')} (${formatScore(r.lowStudent?.nota_final_num)})</div>
          <div><strong>Más faltas:</strong> ${escapeHtml(r.mostAbsences?.nombre || '—')} (${toNumber(r.mostAbsences?.faltas_num)})</div>
        </div>

        ${r.actividadesResumen.length ? `
          <table>
            <thead><tr><th>Actividad</th><th>Tipo</th><th>Promedio</th><th>%</th><th>Auto 1.0</th></tr></thead>
            <tbody>${r.actividadesResumen.map(a => `
              <tr>
                <td>${escapeHtml(a.titulo)}</td>
                <td style="text-transform:capitalize">${escapeHtml((a.tipo || 'examen').replace('_', ' '))}</td>
                <td>${formatScore(a.promedio)}</td>
                <td>${a.porcentaje}%</td>
                <td>${a.auto_asignadas}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<p class="empty">Sin actividades registradas</p>'}

        ${r.ranking.length ? `
          <table>
            <thead><tr><th>#</th><th>Estudiante</th><th>Nota final</th><th>Faltas</th><th>Asistencia</th><th>Participación</th></tr></thead>
            <tbody>${r.ranking.map((s, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(s.nombre || 'Estudiante')}</td>
                <td>${formatScore(s.nota_final_num)}</td>
                <td>${s.faltas_num}</td>
                <td>${formatScore(s.asistencia_nota_num)}</td>
                <td>${formatScore(s.participacion_num)}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<p class="empty">Sin datos de estudiantes</p>'}
      </div>
    `).join('<hr/>');

    pw.document.write(`<!DOCTYPE html><html><head><title>Reporte Académico</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Poppins',sans-serif;max-width:900px;margin:20px auto;padding:20px;color:#333}
  h1{text-align:center;font-size:22px;color:#4338CA;margin-bottom:6px}
  .subtitle{text-align:center;font-size:12px;color:#666;margin-bottom:24px}
  .section{margin:20px 0}
  .subline{font-size:12px;color:#64748B;margin-bottom:10px}
  h2{font-size:16px;color:#312E81;margin-bottom:12px;border-bottom:2px solid #C7D2FE;padding-bottom:4px}
  .stats-row{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
  .stat{background:#EEF2FF;border-radius:10px;padding:12px 18px;text-align:center;flex:1;min-width:100px}
  .stat-n{display:block;font-size:22px;font-weight:700;color:#4338CA}
  .stat-l{display:block;font-size:10px;color:#6366F1;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
  th{background:#EEF2FF;color:#4338CA;padding:8px 10px;text-align:left;font-weight:600}
  td{padding:6px 10px;border-bottom:1px solid #E5E7EB}
  .insights{display:grid;gap:4px;margin-bottom:10px;font-size:12px;color:#334155}
  hr{border:none;border-top:2px solid #E5E7EB;margin:24px 0}
  .empty{font-size:12px;color:#999;font-style:italic}
  @media print{body{margin:8px;padding:8px}}
</style></head><body>
  <h1>Reporte Académico</h1>
  <p class="subtitle">Generado el ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  ${globalSummary}
  ${sections}
</body></html>`);
    pw.document.close();
    setTimeout(() => pw.print(), 400);
  };

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><div className="skeleton h-7 w-36 rounded-lg" /><div className="skeleton h-4 w-80 rounded mt-2" /></div>
        <div className="skeleton h-10 w-60 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="skeleton h-4 w-48 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      </div>
      <div className="skeleton h-10 w-full rounded-lg" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vista consolidada para comparar múltiples materias. Para reporte individual usa Materia {'>'} Reportes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-500" />
            <select
              className="input-field w-60"
              value={selectedPeriodo}
              onChange={(e) => setSelectedPeriodo(e.target.value)}
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          {selected.length === 1 && selectedPeriodo && (
            <button
              onClick={crearPresentacionBoletin}
              disabled={creatingSlides}
              title="Slides del período listas para reunión de padres"
              className="btn-md bg-profesor-600 text-white hover:bg-profesor-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shrink-0"
            >
              {creatingSlides
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              <Presentation className="w-4 h-4" />
              {creatingSlides ? 'Creando…' : 'Slides del período'}
            </button>
          )}
          {report && (
            <>
              <button onClick={exportExcel}
                className="btn-secondary flex items-center gap-2 shrink-0">
                <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
              </button>
              <button onClick={handlePrint}
                className="btn-primary flex items-center gap-2 shrink-0">
                <Printer className="w-4 h-4" /> Imprimir Reporte
              </button>
            </>
          )}
        </div>
      </div>

      {/* Materia selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-profesor-500" />
            <h3 className="text-sm font-semibold text-gray-800">Selecciona las materias para el reporte</h3>
          </div>
          <button onClick={selectAll}
            className="text-xs text-profesor-600 font-medium hover:text-profesor-800 transition">
            {selected.length === materias.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </button>
        </div>

        {materias.length === 0 ? (
          <p className="text-sm text-gray-400">No tienes materias asignadas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {materias.map(m => (
              <label key={m.id}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  selected.includes(m.id)
                    ? 'bg-profesor-50 border-profesor-300'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}>
                <input type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggleMateria(m.id)}
                  className="rounded border-gray-300 text-profesor-600 w-4 h-4" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.nombre}</p>
                  {m.grado && <p className="text-xs text-gray-400">{m.grado}</p>}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={generateReport}
            disabled={generating || !selected.length || !selectedPeriodo}
            className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {generating ? 'Generando...' : `Generar Reporte Profundo (${selected.length})`}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-profesor-200 bg-profesor-50 p-4">
        <p className="text-sm text-profesor-900 font-medium">Este reporte del menú lateral es consolidado (multi-materia).</p>
        <p className="text-xs text-profesor-700 mt-1">
          Si necesitas un reporte individual de una sola materia con configuración y publicación de boletines,
          entra por Materias {'>'} Materia {'>'} pestaña Reportes.
        </p>
      </div>

      {failedReports.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">Materias con error</p>
          <div className="mt-2 space-y-1">
            {failedReports.map((f, idx) => (
              <p key={idx} className="text-xs text-amber-700">
                {f.materia?.nombre || 'Materia'}: {f.detail}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Report results */}
      {report && (
        <div className="space-y-6">
          {globalStats && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-profesor-600" />
                <h3 className="font-bold text-gray-900">Resumen Global ({selectedPeriodoLabel})</h3>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-profesor-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-profesor-700">{globalStats.materias}</p>
                  <p className="text-[10px] text-profesor-500">Materias evaluadas</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{globalStats.totalEstudiantes}</p>
                  <p className="text-[10px] text-blue-500">Registros estudiante</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className={`text-xl font-bold ${scoreClass(globalStats.promedioGlobal)}`}>{formatScore(globalStats.promedioGlobal)}</p>
                  <p className="text-[10px] text-emerald-500">Promedio global</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-red-600">{globalStats.totalFaltas}</p>
                  <p className="text-[10px] text-red-400">Faltas totales</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
                  <p className="font-semibold text-green-700 mb-1">Alumno con mejor nota</p>
                  <p className="text-gray-700">{globalStats.topGlobal?.nombre || '—'}</p>
                  <p className={`font-bold ${scoreClass(globalStats.topGlobal?.nota_final_num)}`}>{formatScore(globalStats.topGlobal?.nota_final_num)} • {globalStats.topGlobal?.materia_nombre || ''}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="font-semibold text-red-700 mb-1">Alumno con nota más baja</p>
                  <p className="text-gray-700">{globalStats.lowGlobal?.nombre || '—'}</p>
                  <p className={`font-bold ${scoreClass(globalStats.lowGlobal?.nota_final_num)}`}>{formatScore(globalStats.lowGlobal?.nota_final_num)} • {globalStats.lowGlobal?.materia_nombre || ''}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-700 mb-1">Alumno con más faltas</p>
                  <p className="text-gray-700">{globalStats.absGlobal?.nombre || '—'}</p>
                  <p className="font-bold text-amber-700">{toNumber(globalStats.absGlobal?.faltas_num)} faltas • {globalStats.absGlobal?.materia_nombre || ''}</p>
                </div>
              </div>
            </div>
          )}

          {report.map((r, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Materia header */}
              <div className="bg-profesor-50 px-5 py-3 border-b border-profesor-100">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-profesor-600" />
                  <h3 className="font-bold text-profesor-800">{r.materia?.nombre || 'Materia'}</h3>
                </div>
                <p className="text-xs text-profesor-600 mt-1">Período: {selectedPeriodoLabel}</p>
              </div>

              {/* Summary cards */}
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <p className="text-xl font-bold text-blue-700">{r.estudiantesTotal}</p>
                    <p className="text-[10px] text-blue-500">Estudiantes</p>
                  </div>
                  <div className="bg-profesor-50 rounded-xl p-3 text-center">
                    <Award className="w-5 h-5 text-profesor-600 mx-auto mb-1" />
                    <p className={`text-xl font-bold ${scoreClass(r.promedioGrupo)}`}>{formatScore(r.promedioGrupo)}</p>
                    <p className="text-[10px] text-profesor-500">Promedio</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xl font-bold text-emerald-700">{r.aprobados}</p>
                    <p className="text-[10px] text-emerald-500">Aprobados</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <TrendingDown className="w-5 h-5 text-red-500 mx-auto mb-1" />
                    <p className="text-xl font-bold text-red-600">{r.reprobados}</p>
                    <p className="text-[10px] text-red-400">Reprobados</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                    <p className="text-xl font-bold text-amber-700">{r.totalFaltas}</p>
                    <p className="text-[10px] text-amber-500">Faltas</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-green-600 mb-1">Nota más alta</p>
                    <p className={`text-base font-bold ${scoreClass(r.topStudent?.nota_final_num)}`}>{formatScore(r.topStudent?.nota_final_num)}</p>
                    <p className="text-[10px] text-green-700 truncate" title={r.topStudent?.nombre}>{r.topStudent?.nombre || '—'}</p>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-rose-600 mb-1">Nota más baja</p>
                    <p className={`text-base font-bold ${scoreClass(r.lowStudent?.nota_final_num)}`}>{formatScore(r.lowStudent?.nota_final_num)}</p>
                    <p className="text-[10px] text-rose-700 truncate" title={r.lowStudent?.nombre}>{r.lowStudent?.nombre || '—'}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-yellow-700 mb-1">Más faltas</p>
                    <p className="text-base font-bold text-yellow-700">{toNumber(r.mostAbsences?.faltas_num)}</p>
                    <p className="text-[10px] text-yellow-800 truncate" title={r.mostAbsences?.nombre}>{r.mostAbsences?.nombre || '—'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">#</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Estudiante</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Nota Final</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Faltas</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Asistencia</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Particip.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.ranking.map((s, i) => (
                          <tr key={s.estudiante_id} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{s.nombre}</td>
                            <td className={`px-3 py-2 text-center font-bold ${scoreClass(s.nota_final_num)}`}>{formatScore(s.nota_final_num)}</td>
                            <td className="px-3 py-2 text-center text-gray-700">{s.faltas_num}</td>
                            <td className={`px-3 py-2 text-center font-semibold ${scoreClass(s.asistencia_nota_num)}`}>{formatScore(s.asistencia_nota_num)}</td>
                            <td className={`px-3 py-2 text-center font-semibold ${scoreClass(s.participacion_num)}`}>{formatScore(s.participacion_num)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Actividad</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Tipo</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Promedio</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">%</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Auto 1.0</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.actividadesResumen.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-gray-400">Sin actividades registradas</td>
                          </tr>
                        ) : (
                          r.actividadesResumen.map((a) => (
                            <tr key={a.examen_id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-medium text-gray-800">{a.titulo}</td>
                              <td className="px-3 py-2 text-gray-500 capitalize">{(a.tipo || 'examen').replace('_', ' ')}</td>
                              <td className={`px-3 py-2 text-center font-bold ${scoreClass(a.promedio)}`}>{formatScore(a.promedio)}</td>
                              <td className="px-3 py-2 text-center text-gray-700">{a.porcentaje}%</td>
                              <td className="px-3 py-2 text-center text-gray-700">{a.auto_asignadas}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                    <p className="font-semibold text-red-700">Actividad con promedio más bajo</p>
                    <p className="text-gray-700 mt-1">{r.actividadMasBaja?.titulo || '—'}</p>
                    <p className={`font-bold ${scoreClass(r.actividadMasBaja?.promedio)}`}>{formatScore(r.actividadMasBaja?.promedio)}</p>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
                    <p className="font-semibold text-green-700">Actividad con promedio más alto</p>
                    <p className="text-gray-700 mt-1">{r.actividadMasAlta?.titulo || '—'}</p>
                    <p className={`font-bold ${scoreClass(r.actividadMasAlta?.promedio)}`}>{formatScore(r.actividadMasAlta?.promedio)}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
