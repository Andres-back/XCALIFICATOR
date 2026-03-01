import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  BarChart3, Save, Loader2, Send, Settings2, Hand,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';

const TIPO_LABELS = {
  examen: 'Examen',
  crucigrama: 'Crucigrama',
  sopa_letras: 'Sopa de Letras',
  emparejar: 'Emparejar',
  tarea: 'Tarea',
  exposicion: 'Exposición',
};

const SPECIAL_ITEMS = [
  { key: '__asistencia__', label: 'Asistencia (5.0 − faltas×0.3)', icon: '📋' },
  { key: '__participacion__', label: 'Participación', icon: '🤚' },
];

export default function MateriaReportes({ materiaId, materiaNombre }) {
  const [periodos, setPeriodos] = useState([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [config, setConfig] = useState([]); // [{examen_id?, tipo_actividad?, porcentaje}]
  const [actividades, setActividades] = useState([]);
  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingActs, setLoadingActs] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showParticipacion, setShowParticipacion] = useState(false);
  const [participacion, setParticipacion] = useState([]);
  const [savingPart, setSavingPart] = useState(false);

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
    if (selectedPeriodo) {
      loadActividades();
      loadConfig();
      setReporte(null);
    }
  }, [selectedPeriodo]);

  const loadActividades = async () => {
    setLoadingActs(true);
    try {
      const res = await api.get(`/reportes/actividades/${materiaId}/${selectedPeriodo}`);
      setActividades(res.data);
    } catch { setActividades([]); }
    finally { setLoadingActs(false); }
  };

  const loadConfig = async () => {
    try {
      const res = await api.get(`/reportes/config/${materiaId}/${selectedPeriodo}`);
      if (res.data.length > 0) {
        setConfig(res.data.map(c => {
          if (c.examen_id) return { examen_id: c.examen_id, porcentaje: c.porcentaje };
          if (c.tipo_actividad) return { tipo_actividad: c.tipo_actividad, porcentaje: c.porcentaje };
          return { porcentaje: c.porcentaje };
        }));
      } else {
        setConfig([]);
      }
    } catch { setConfig([]); }
  };

  const loadReporte = async () => {
    if (!selectedPeriodo) return;
    setLoadingReport(true);
    try {
      const res = await api.get(`/reportes/materia/${materiaId}/periodo/${selectedPeriodo}`);
      setReporte(res.data);
      try {
        const pRes = await api.get(`/reportes/participacion/${materiaId}/${selectedPeriodo}`);
        setParticipacion(pRes.data);
      } catch { setParticipacion([]); }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error cargando reporte');
    } finally { setLoadingReport(false); }
  };

  const saveConfig = async () => {
    const total = config.reduce((a, c) => a + (parseFloat(c.porcentaje) || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      toast.error(`Los porcentajes deben sumar 100%. Suma actual: ${total.toFixed(1)}%`);
      return;
    }
    // Check duplicates
    const keys = config.map(c => c.examen_id || c.tipo_actividad).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      toast.error('No puedes asignar el mismo ítem dos veces');
      return;
    }
    setSavingConfig(true);
    try {
      const actividades_payload = config.map(c => {
        if (c.examen_id) return { examen_id: c.examen_id, porcentaje: c.porcentaje };
        if (c.tipo_actividad) return { tipo_actividad: c.tipo_actividad, porcentaje: c.porcentaje };
        return { porcentaje: c.porcentaje };
      });
      await api.post(`/reportes/config/${materiaId}`, {
        periodo_id: selectedPeriodo,
        actividades: actividades_payload,
      });
      toast.success('Configuración guardada');
      setShowConfig(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando');
    } finally { setSavingConfig(false); }
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
    } finally { setPublishing(false); }
  };

  const saveParticipacion = async () => {
    setSavingPart(true);
    try {
      await api.post(`/reportes/participacion/${materiaId}/${selectedPeriodo}`, {
        notas: participacion.map(p => ({
          estudiante_id: p.estudiante_id,
          nota: p.nota,
          observacion: p.observacion,
        })),
      });
      toast.success('Participación guardada');
      setShowParticipacion(false);
      loadReporte();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando participación');
    } finally { setSavingPart(false); }
  };

  const updateConfig = (index, field, value) => {
    setConfig(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const addConfigRow = () => {
    setConfig(prev => [...prev, { examen_id: '', porcentaje: 0 }]);
  };

  const removeConfigRow = (index) => {
    setConfig(prev => prev.filter((_, i) => i !== index));
  };

  const handleSelectChange = (index, value) => {
    if (SPECIAL_ITEMS.some(s => s.key === value)) {
      setConfig(prev => prev.map((c, i) => i === index
        ? { tipo_actividad: value, porcentaje: c.porcentaje }
        : c));
    } else {
      setConfig(prev => prev.map((c, i) => i === index
        ? { examen_id: value, porcentaje: c.porcentaje }
        : c));
    }
  };

  const configTotal = config.reduce((a, c) => a + (parseFloat(c.porcentaje) || 0), 0);
  const selectedKeys = config.map(c => c.examen_id || c.tipo_actividad).filter(Boolean);

  const getConfigValue = (c) => c.examen_id || c.tipo_actividad || '';

  const getConfigLabel = (key) => {
    const special = SPECIAL_ITEMS.find(s => s.key === key);
    if (special) return `${special.icon} ${special.label}`;
    const act = actividades.find(a => a.examen_id === key);
    if (act) return act.titulo;
    return key;
  };

  const updatePartNota = (estudianteId, nota) => {
    setParticipacion(prev => prev.map(p =>
      p.estudiante_id === estudianteId ? { ...p, nota: Math.min(5, Math.max(0, nota)) } : p
    ));
  };

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );

  if (periodos.length === 0) return (
    <EmptyState icon={BarChart3} title="No hay períodos configurados"
      description="Pide al administrador que configure los períodos académicos para habilitar reportes." />
  );

  const hasAsistencia = reporte?.config_porcentajes?.['__asistencia__'];
  const hasParticipacion = reporte?.config_porcentajes?.['__participacion__'];

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
            Porcentajes por Actividad
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Selecciona actividades, asistencia o participación y asigna el porcentaje que cada una aporta a la nota final (máx. 5.0). Deben sumar 100%.
          </p>

          {loadingActs ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-primary-500 animate-spin" /></div>
          ) : (
            <>
              <div className="space-y-2">
                {config.map((c, i) => {
                  const currentVal = getConfigValue(c);
                  const availableActs = actividades.filter(
                    a => !selectedKeys.includes(a.examen_id) || a.examen_id === currentVal
                  );
                  const availableSpecials = SPECIAL_ITEMS.filter(
                    s => !selectedKeys.includes(s.key) || s.key === currentVal
                  );
                  return (
                    <div key={i} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      <select className="input-field flex-1" value={currentVal}
                        onChange={e => handleSelectChange(i, e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {availableActs.length > 0 && (
                          <optgroup label="Actividades">
                            {availableActs.map(a => (
                              <option key={a.examen_id} value={a.examen_id}>
                                {a.titulo} ({TIPO_LABELS[a.tipo] || a.tipo})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Especiales">
                          {availableSpecials.map(s => (
                            <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
                          ))}
                        </optgroup>
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
                  );
                })}
              </div>
              <button onClick={addConfigRow}
                className="text-sm text-primary-600 hover:text-primary-800 mt-2">
                + Agregar ítem
              </button>
            </>
          )}

          <div className={`flex items-center justify-between mt-4 p-3 rounded-lg ${
            Math.abs(configTotal - 100) < 0.01 ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <span className={`text-sm font-medium ${
              Math.abs(configTotal - 100) < 0.01 ? 'text-green-700' : 'text-red-700'
            }`}>Total: {configTotal.toFixed(1)}%</span>
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
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">Reporte de Notas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {reporte.periodo.nombre} • {reporte.estudiantes.length} estudiantes
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(reporte.config_porcentajes || {}).map(([key, pct]) => (
                    <span key={key} className="px-2 py-0.5 text-xs rounded-full bg-primary-50 text-primary-700 font-medium">
                      {getConfigLabel(key)}: {pct}%
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-600 sticky left-0 bg-gray-50 z-10">Estudiante</th>
                    {reporte.estudiantes[0]?.actividades?.map((a, i) => (
                      <th key={i} className="text-center p-3 font-medium text-gray-600 min-w-[80px]">
                        <div className="truncate max-w-[80px]" title={a.titulo}>{a.titulo}</div>
                        <div className="text-xs text-gray-400 capitalize">{TIPO_LABELS[a.tipo] || a.tipo}</div>
                        {a.porcentaje > 0 && <div className="text-xs text-primary-600">{a.porcentaje}%</div>}
                      </th>
                    ))}
                    {hasAsistencia && (
                      <th className="text-center p-3 font-medium text-gray-600 bg-blue-50 min-w-[70px]">
                        <div>📋 Asist.</div>
                        <div className="text-xs text-primary-600">{hasAsistencia}%</div>
                      </th>
                    )}
                    {hasParticipacion && (
                      <th className="text-center p-3 font-medium text-gray-600 bg-purple-50 min-w-[70px]">
                        <div>🤚 Partic.</div>
                        <div className="text-xs text-primary-600">{hasParticipacion}%</div>
                      </th>
                    )}
                    <th className="text-center p-3 font-semibold text-gray-800 bg-primary-50">Nota Final</th>
                    <th className="text-center p-3 font-medium text-gray-600 bg-green-50 min-w-[45px]" title="Presente">✓</th>
                    <th className="text-center p-3 font-medium text-gray-600 bg-red-50 min-w-[45px]" title="Ausente">✗</th>
                    <th className="text-center p-3 font-medium text-gray-600 bg-yellow-50 min-w-[45px]" title="Tardanza">⏱</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reporte.estudiantes.map(est => (
                    <tr key={est.estudiante_id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap z-10">
                        {est.nombre}
                      </td>
                      {est.actividades.map((a, i) => (
                        <td key={i} className="text-center p-3">
                          <span className={`font-medium ${
                            a.nota >= 4.0 ? 'text-green-600' : a.nota >= 3.0 ? 'text-blue-600' : 'text-red-600'
                          }`}>{a.nota.toFixed(1)}</span>
                        </td>
                      ))}
                      {hasAsistencia && (
                        <td className="text-center p-3 bg-blue-50/50">
                          <span className={`font-medium ${
                            (est.asistencia?.nota || 0) >= 3 ? 'text-blue-600' : 'text-red-600'
                          }`}>{(est.asistencia?.nota || 0).toFixed(1)}</span>
                        </td>
                      )}
                      {hasParticipacion && (
                        <td className="text-center p-3 bg-purple-50/50">
                          <span className={`font-medium ${
                            (est.nota_participacion || 0) >= 3 ? 'text-purple-600' : 'text-red-600'
                          }`}>{(est.nota_participacion || 0).toFixed(1)}</span>
                        </td>
                      )}
                      <td className="text-center p-3 bg-primary-50/50">
                        <span className={`text-lg font-bold ${
                          est.nota_final >= 4.0 ? 'text-green-600' : est.nota_final >= 3.0 ? 'text-blue-600' : 'text-red-600'
                        }`}>{est.nota_final.toFixed(1)}</span>
                      </td>
                      <td className="text-center p-3 bg-green-50/50 text-green-700 font-medium text-xs">
                        {est.asistencia?.presente || 0}
                      </td>
                      <td className="text-center p-3 bg-red-50/50 text-red-700 font-medium text-xs">
                        {est.asistencia?.ausente || 0}
                      </td>
                      <td className="text-center p-3 bg-yellow-50/50 text-yellow-700 font-medium text-xs">
                        {est.asistencia?.tardanza || 0}
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

          {/* Participation grade panel */}
          <div className="flex gap-2">
            <button onClick={() => setShowParticipacion(!showParticipacion)}
              className="btn-secondary text-sm flex items-center gap-1">
              <Hand className="w-4 h-4" /> {showParticipacion ? 'Ocultar' : 'Notas de'} Participación
            </button>
          </div>

          {showParticipacion && participacion.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Hand className="w-4 h-4 text-purple-600" />
                Notas de Participación
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Asigna una nota de participación (0.0 - 5.0) a cada estudiante en este período.
              </p>
              <div className="space-y-2">
                {participacion.map(p => (
                  <div key={p.estudiante_id} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 flex-1 truncate">{p.nombre}</span>
                    <input type="number" min="0" max="5" step="0.1"
                      className="input-field w-20 text-center"
                      value={p.nota}
                      onChange={e => updatePartNota(p.estudiante_id, parseFloat(e.target.value) || 0)} />
                    <span className="text-xs text-gray-400">/ 5.0</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={saveParticipacion} disabled={savingPart}
                  className="btn-primary text-sm flex items-center gap-1">
                  {savingPart ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Guardar Participación
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!reporte && !loadingReport && (
        <EmptyState icon={BarChart3} title="Selecciona un período y genera el reporte"
          description="Haz clic en 'Ver Reporte' para ver las notas detalladas de los estudiantes en el período seleccionado." />
      )}
    </div>
  );
}
