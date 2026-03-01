import { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  BarChart3, Printer, Download, Loader2, BookOpen, Users,
  FileText, Award, TrendingUp, TrendingDown, CheckCircle, XCircle, Filter,
} from 'lucide-react';

export default function ProfesorReportes() {
  const [materias, setMaterias] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/materias/mis-materias');
        setMaterias(data);
      } catch {
        toast.error('Error cargando materias');
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
    setGenerating(true);
    setReport(null);
    try {
      const results = [];
      for (const materiaId of selected) {
        const mat = materias.find(m => m.id === materiaId);
        // Fetch students
        let estudiantes = [];
        try {
          const { data } = await api.get(`/materias/${materiaId}/estudiantes`);
          estudiantes = data;
        } catch { /* no students */ }
        // Fetch exams
        let examenes = [];
        try {
          const { data } = await api.get(`/examenes/materia/${materiaId}`);
          examenes = data;
        } catch { /* no exams */ }
        // Fetch stats per exam
        const examStats = [];
        for (const ex of examenes) {
          try {
            const { data } = await api.get(`/examenes/notas/examen/${ex.id}/stats`);
            examStats.push({ ...ex, stats: data });
          } catch {
            examStats.push({ ...ex, stats: { total: 0 } });
          }
        }

        const totalNotas = examStats.reduce((a, e) => a + (e.stats?.total || 0), 0);
        const allScores = examStats.flatMap(e =>
          (e.stats?.ranking || []).map(n => Number(n.nota)).filter(n => !isNaN(n))
        );
        const promedio = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(2) : '—';
        const aprobados = allScores.filter(s => s >= 3.0).length;
        const reprobados = allScores.filter(s => s < 3.0).length;

        results.push({
          materia: mat,
          estudiantes: estudiantes.length,
          examenes: examStats,
          totalNotas,
          promedio,
          aprobados,
          reprobados,
        });
      }
      setReport(results);
      toast.success('Reporte generado');
    } catch (err) {
      toast.error('Error generando reporte');
    } finally {
      setGenerating(false);
    }
  }, [selected, materias]);

  const handlePrint = () => {
    if (!report) return;
    const pw = window.open('', '_blank', 'width=1000,height=800');
    if (!pw) return;

    const sections = report.map(r => `
      <div class="section">
        <h2>${r.materia?.nombre || 'Materia'}</h2>
        <div class="stats-row">
          <div class="stat"><span class="stat-n">${r.estudiantes}</span><span class="stat-l">Estudiantes</span></div>
          <div class="stat"><span class="stat-n">${r.examenes.length}</span><span class="stat-l">Exámenes</span></div>
          <div class="stat"><span class="stat-n">${r.promedio}</span><span class="stat-l">Promedio</span></div>
          <div class="stat"><span class="stat-n">${r.aprobados}</span><span class="stat-l">Aprobados</span></div>
          <div class="stat"><span class="stat-n">${r.reprobados}</span><span class="stat-l">Reprobados</span></div>
        </div>
        ${r.examenes.length ? `
          <table>
            <thead><tr><th>Examen</th><th>Tipo</th><th>Evaluados</th><th>Promedio</th></tr></thead>
            <tbody>${r.examenes.map(e => {
              const scores = (e.stats?.ranking || []).map(n => Number(n.nota)).filter(n => !isNaN(n));
              const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—';
              return `<tr><td>${e.titulo}</td><td style="text-transform:capitalize">${(e.tipo || 'examen').replace('_', ' ')}</td><td>${e.stats?.total || 0}</td><td>${avg}</td></tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<p class="empty">Sin exámenes registrados</p>'}
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
  h2{font-size:16px;color:#312E81;margin-bottom:12px;border-bottom:2px solid #C7D2FE;padding-bottom:4px}
  .stats-row{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
  .stat{background:#EEF2FF;border-radius:10px;padding:12px 18px;text-align:center;flex:1;min-width:100px}
  .stat-n{display:block;font-size:22px;font-weight:700;color:#4338CA}
  .stat-l{display:block;font-size:10px;color:#6366F1;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
  th{background:#EEF2FF;color:#4338CA;padding:8px 10px;text-align:left;font-weight:600}
  td{padding:6px 10px;border-bottom:1px solid #E5E7EB}
  hr{border:none;border-top:2px solid #E5E7EB;margin:24px 0}
  .empty{font-size:12px;color:#999;font-style:italic}
  @media print{body{margin:8px;padding:8px}}
</style></head><body>
  <h1>Reporte Académico</h1>
  <p class="subtitle">Generado el ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  ${sections}
</body></html>`);
    pw.document.close();
    setTimeout(() => pw.print(), 400);
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Genera reportes académicos seleccionando una o varias materias.
          </p>
        </div>
        {report && (
          <button onClick={handlePrint}
            className="btn-primary flex items-center gap-2 shrink-0">
            <Printer className="w-4 h-4" /> Imprimir Reporte
          </button>
        )}
      </div>

      {/* Materia selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800">Selecciona las materias para el reporte</h3>
          </div>
          <button onClick={selectAll}
            className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition">
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
                    ? 'bg-indigo-50 border-indigo-300'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}>
                <input type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggleMateria(m.id)}
                  className="rounded border-gray-300 text-indigo-600 w-4 h-4" />
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
            disabled={generating || !selected.length}
            className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {generating ? 'Generando...' : `Generar Reporte (${selected.length})`}
          </button>
        </div>
      </div>

      {/* Report results */}
      {report && (
        <div className="space-y-6">
          {report.map((r, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Materia header */}
              <div className="bg-indigo-50 px-5 py-3 border-b border-indigo-100">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-indigo-800">{r.materia?.nombre || 'Materia'}</h3>
                </div>
              </div>

              {/* Summary cards */}
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                    <p className="text-xl font-bold text-blue-700">{r.estudiantes}</p>
                    <p className="text-[10px] text-blue-500">Estudiantes</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                    <FileText className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                    <p className="text-xl font-bold text-purple-700">{r.examenes.length}</p>
                    <p className="text-[10px] text-purple-500">Exámenes</p>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-3 text-center">
                    <Award className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
                    <p className="text-xl font-bold text-indigo-700">{r.promedio}</p>
                    <p className="text-[10px] text-indigo-500">Promedio</p>
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
                </div>

                {/* Exams table */}
                {r.examenes.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Examen</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Tipo</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Evaluados</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Promedio</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-600">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.examenes.map((e, i) => {
                          const scores = (e.stats?.ranking || []).map(n => Number(n.nota)).filter(n => !isNaN(n));
                          const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '—';
                          const passed = avg !== '—' && Number(avg) >= 3.0;
                          return (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-medium text-gray-800">{e.titulo}</td>
                              <td className="px-3 py-2 text-gray-500 capitalize">{(e.tipo || 'examen').replace('_', ' ')}</td>
                              <td className="px-3 py-2 text-center text-gray-600">{e.stats?.total || 0}</td>
                              <td className="px-3 py-2 text-center font-semibold text-gray-800">{avg}</td>
                              <td className="px-3 py-2 text-center">
                                {avg === '—' ? (
                                  <span className="text-xs text-gray-400">Sin notas</span>
                                ) : passed ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                    <CheckCircle className="w-3 h-3" /> Aprobado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-500">
                                    <XCircle className="w-3 h-3" /> Bajo
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">Sin exámenes registrados para esta materia.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
