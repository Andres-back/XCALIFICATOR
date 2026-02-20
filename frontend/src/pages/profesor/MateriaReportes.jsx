import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  BarChart3, Save, Loader2, FileText, Download, Send,
  AlertCircle, CheckCircle, TrendingUp, Settings2,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';

export default function MateriaReportes({ materiaId, materiaNombre }) {
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [config, setConfig] = useState([]);
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const TIPOS_ACTIVIDAD = [
    { key: 'examen', label: 'Exámenes' },
    { key: 'crucigrama', label: 'Crucigramas' },
    { key: 'sopa_letras', label: 'Sopas de Letras' },
    { key: 'tarea', label: 'Tareas' },
    { key: 'participacion', label: 'Participación' },
    { key: 'asistencia', label: 'Asistencia' },
  ];

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
    if (selectedPeriodo) loadConfig();
  }, [selectedPeriodo]);

  const loadConfig = async () => {
    try {
      const res = await api.get(`/reportes/config/${materiaId}/${selectedPeriodo}`);
      if (res.data.length > 0) {
        setConfig(res.data.map(c => ({ tipo_actividad: c.tipo_actividad, porcentaje: c.porcentaje })));
      } else {
        setConfig(TIPOS_ACTIVIDAD.slice(0, 3).map(t => ({ tipo_actividad: t.key, porcentaje: 33.33 })));
      }
    } catch {
      setConfig([]);
    }
  };

  const loadReporte = async () => {
    if (!selectedPeriodo) return;
    setLoadingReport(true);
    try {
      const res = await api.get(`/reportes/materia/${materiaId}/periodo/${selectedPeriodo}`);
      setReporte(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error cargando reporte');
    } finally {
      setLoadingReport(false);
    }
  };

  const saveConfig = async () => {
    const total = config.reduce((a, c) => a + (parseFloat(c.porcentaje) || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      toast.error(`Los porcentajes deben sumar 100%. Suma actual: ${total.toFixed(1)}%`);
      return;
    }
    setSavingConfig(true);
    try {
      await api.post(`/reportes/config/${materiaId}`, {
        periodo_id: selectedPeriodo,
        actividades: config,
      });
      toast.success('Configuración guardada');
      setShowConfig(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando');
    } finally {
      setSavingConfig(false);
    }
  };

  const publishBoletines = async () => {
    if (!selectedPeriodo) return;
    setPublishing(true);
    try {
      const res = await api.post(`/reportes/boletin/${materiaId}/${selectedPeriodo}`);
      toast.success(res.data.detail);
      loadReporte();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando boletines');
    } finally {
      setPublishing(false);
    }
  };

  const updateConfig = (index, field, value) => {
    setConfig(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const addConfigRow = () => {
    setConfig(prev => [...prev, { tipo_actividad: '', porcentaje: 0 }]);
  };
  const removeConfigRow = (index) => {
    setConfig(prev => prev.filter((_, i) => i !== index));
  };

  const configTotal = config.reduce((a, c) => a + (parseFloat(c.porcentaje) || 0), 0);

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );

  if (periodos.length === 0) return (
    <EmptyState
      icon={BarChart3}
      title="No hay períodos configurados"
      description="Pide al administrador que configure los períodos académicos para habilitar reportes."
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
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowConfig(!showConfig)}
            className="btn-secondary text-sm flex items-center gap-1">
            <Settings2 className="w-4 h-4" /> Configurar %
          </button>
          <button onClick={loadReporte} disabled={loadingReport}
            className="btn-secondary text-sm flex items-center gap-1">
            {loadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            Ver Reporte
          </button>
          <button onClick={publishBoletines} disabled={publishing}
            className="btn-primary text-sm flex items-center gap-1">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Publicar Boletines
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary-600" />
            Porcentajes por Tipo de Actividad
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Define qué porcentaje de la nota final aporta cada tipo de actividad. Deben sumar 100%.
          </p>
          <div className="space-y-2">
            {config.map((c, i) => (
              <div key={i} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <select className="input-field flex-1" value={c.tipo_actividad}
                  onChange={e => updateConfig(i, 'tipo_actividad', e.target.value)}>
                  <option value="">Seleccionar tipo...</option>
                  {TIPOS_ACTIVIDAD.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input type="number" min="0" max="100" step="0.1" className="input-field w-20 text-center"
                    value={c.porcentaje}
                    onChange={e => updateConfig(i, 'porcentaje', parseFloat(e.target.value) || 0)} />
                  <span className="text-sm text-gray-500">%</span>
                </div>
                <button onClick={() => removeConfigRow(i)}
                  className="text-red-500 hover:text-red-700 text-sm">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addConfigRow}
            className="text-sm text-primary-600 hover:text-primary-800 mt-2">
            + Agregar tipo de actividad
          </button>

          <div className={`flex items-center justify-between mt-4 p-3 rounded-lg ${
            Math.abs(configTotal - 100) < 0.01 ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <span className={`text-sm font-medium ${
              Math.abs(configTotal - 100) < 0.01 ? 'text-green-700' : 'text-red-700'
            }`}>
              Total: {configTotal.toFixed(1)}%
            </span>
            <button onClick={saveConfig} disabled={savingConfig || Math.abs(configTotal - 100) > 0.01}
              className="btn-primary text-sm flex items-center gap-1">
              {savingConfig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Report table */}
      {reporte && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Reporte de Notas</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {reporte.periodo.nombre} • {reporte.estudiantes.length} estudiantes
                </p>
              </div>
              {Object.keys(reporte.config_porcentajes).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(reporte.config_porcentajes).map(([tipo, pct]) => (
                    <span key={tipo} className="px-2 py-0.5 text-xs rounded-full bg-primary-50 text-primary-700 font-medium">
                      {tipo}: {pct}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 font-medium text-gray-600 sticky left-0 bg-gray-50">Estudiante</th>
                  {reporte.estudiantes[0]?.actividades?.map((a, i) => (
                    <th key={i} className="text-center p-3 font-medium text-gray-600 min-w-[80px]">
                      <div className="truncate max-w-[80px]" title={a.titulo}>{a.titulo}</div>
                      <div className="text-xs text-gray-400 capitalize">{a.tipo}</div>
                    </th>
                  ))}
                  <th className="text-center p-3 font-semibold text-gray-800 bg-primary-50">Nota Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reporte.estudiantes.map(est => (
                  <tr key={est.estudiante_id} className="hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap">
                      {est.nombre}
                    </td>
                    {est.actividades.map((a, i) => (
                      <td key={i} className="text-center p-3">
                        {a.nota != null ? (
                          <span className={`font-medium ${
                            a.nota >= 4.0 ? 'text-green-600' : a.nota >= 3.0 ? 'text-blue-600' : 'text-red-600'
                          }`}>{a.nota.toFixed(1)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="text-center p-3 bg-primary-50/50">
                      <span className={`text-lg font-bold ${
                        est.nota_final >= 4.0 ? 'text-green-600' : est.nota_final >= 3.0 ? 'text-blue-600' : 'text-red-600'
                      }`}>{est.nota_final.toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reporte.estudiantes.length === 0 && (
            <div className="p-10 text-center text-gray-400 text-sm">
              No hay estudiantes matriculados o no hay actividades en este período.
            </div>
          )}
        </div>
      )}

      {!reporte && !loadingReport && (
        <EmptyState
          icon={BarChart3}
          title="Selecciona un período y genera el reporte"
          description="Haz clic en 'Ver Reporte' para ver las notas detalladas de los estudiantes en el período seleccionado."
        />
      )}
    </div>
  );
}
