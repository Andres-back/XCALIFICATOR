import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart3, Clock3, Gauge, Sigma, CheckCircle2,
  AlertTriangle, MessageSquareText, RefreshCw,
} from 'lucide-react';
import api from '../../api';
import useAuthStore from '../../store';

const emptyForm = {
  fase: 'con_sistema',
  actividad_tipo: 'examen',
  duracion_minutos: '',
  estudiantes_evaluados: 1,
  grupo_pareado: '',
  observacion: '',
};

function MetricCard({ icon: Icon, label, value, subtitle, color = 'blue' }) {
  const palette = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  };

  return (
    <div className={`rounded-xl border p-4 ${palette[color] || palette.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-90">{subtitle}</p>}
    </div>
  );
}

export default function ImpactoTesis() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [tiempos, setTiempos] = useState(null);
  const [kappa, setKappa] = useState(null);
  const [encuestas, setEncuestas] = useState(null);
  const [cualitativo, setCualitativo] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, kRes, eRes, cRes] = await Promise.all([
        api.get('/tesis/tiempos/resumen'),
        api.get('/tesis/concordancia/kappa'),
        api.get('/tesis/encuestas/resumen'),
        api.get('/tesis/cualitativo'),
      ]);
      setTiempos(tRes.data);
      setKappa(kRes.data);
      setEncuestas(eRes.data);
      setCualitativo(cRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No fue posible cargar métricas de impacto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTiempo = async (e) => {
    e.preventDefault();
    if (!form.duracion_minutos || Number(form.duracion_minutos) <= 0) {
      toast.error('Ingresa una duración válida en minutos');
      return;
    }

    setSaving(true);
    try {
      await api.post('/tesis/tiempos', {
        ...form,
        duracion_minutos: Number(form.duracion_minutos),
        estudiantes_evaluados: Number(form.estudiantes_evaluados) || 1,
        grupo_pareado: form.grupo_pareado || null,
        observacion: form.observacion || null,
      });
      toast.success('Registro de tiempo guardado');
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No fue posible guardar el registro');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <RefreshCw className="w-7 h-7 animate-spin text-primary-600" />
      </div>
    );
  }

  const reduction = tiempos?.reduccion_porcentual;
  const reductionColor = reduction == null ? 'amber' : reduction >= 0 ? 'green' : 'red';
  const weightedKappa = kappa?.resultado?.kappa_ponderado;
  const kappaColor = weightedKappa == null ? 'amber' : weightedKappa >= 0.75 ? 'green' : 'red';
  const clarityAvg = encuestas?.promedios?.claridad;
  const utilityAvg = encuestas?.promedios?.utilidad;
  const pertinenceAvg = encuestas?.promedios?.pertinencia;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impacto de Tesis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Registro y análisis de eficiencia, concordancia, encuestas Likert y percepciones cualitativas.
          </p>
        </div>
        <button onClick={loadData} className="btn-secondary text-sm flex items-center gap-1">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Clock3}
          label="Registros de tiempo"
          value={tiempos?.n_total ?? 0}
          subtitle={`Pares válidos: ${tiempos?.pares_validos ?? 0}`}
          color="indigo"
        />
        <MetricCard
          icon={Gauge}
          label="Reducción promedio"
          value={reduction == null ? 'N/D' : `${reduction}%`}
          subtitle={tiempos?.analisis_recomendado === 'insuficiente'
            ? 'Aún no hay pares suficientes'
            : `Prueba sugerida: ${tiempos?.analisis_recomendado}`}
          color={reductionColor}
        />
        <MetricCard
          icon={Sigma}
          label="Kappa ponderado"
          value={weightedKappa == null ? 'N/D' : weightedKappa}
          subtitle={kappa?.resultado?.criterio_alta_concordancia ? 'Cumple criterio ≥ 0.75' : 'No cumple criterio ≥ 0.75'}
          color={kappaColor}
        />
        <MetricCard
          icon={BarChart3}
          label="Encuestas"
          value={encuestas?.n_total ?? 0}
          subtitle={`Promedio claridad: ${clarityAvg ?? 'N/D'}`}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Registrar Tiempo de Evaluación</h2>
          <form onSubmit={handleCreateTiempo} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-gray-700">
                Fase
                <select
                  className="input-field mt-1"
                  value={form.fase}
                  onChange={(e) => setForm((p) => ({ ...p, fase: e.target.value }))}
                >
                  <option value="sin_sistema">Sin sistema</option>
                  <option value="con_sistema">Con sistema</option>
                </select>
              </label>

              <label className="text-sm text-gray-700">
                Tipo de actividad
                <input
                  className="input-field mt-1"
                  value={form.actividad_tipo}
                  onChange={(e) => setForm((p) => ({ ...p, actividad_tipo: e.target.value }))}
                  placeholder="ej: examen, taller"
                />
              </label>

              <label className="text-sm text-gray-700">
                Duración (minutos)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  className="input-field mt-1"
                  value={form.duracion_minutos}
                  onChange={(e) => setForm((p) => ({ ...p, duracion_minutos: e.target.value }))}
                />
              </label>

              <label className="text-sm text-gray-700">
                Estudiantes evaluados
                <input
                  type="number"
                  min="1"
                  className="input-field mt-1"
                  value={form.estudiantes_evaluados}
                  onChange={(e) => setForm((p) => ({ ...p, estudiantes_evaluados: e.target.value }))}
                />
              </label>
            </div>

            <label className="text-sm text-gray-700 block">
              Grupo pareado (opcional, para pre/post)
              <input
                className="input-field mt-1"
                value={form.grupo_pareado}
                onChange={(e) => setForm((p) => ({ ...p, grupo_pareado: e.target.value }))}
                placeholder="ej: docenteA_matematicas_actividad1"
              />
            </label>

            <label className="text-sm text-gray-700 block">
              Observación
              <textarea
                className="input-field mt-1 h-20"
                value={form.observacion}
                onChange={(e) => setForm((p) => ({ ...p, observacion: e.target.value }))}
                placeholder="Contexto del registro (opcional)"
              />
            </label>

            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando...' : 'Guardar registro'}
            </button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Resumen de Instrumentos</h2>
          <div className="space-y-3 text-sm text-gray-700">
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="font-semibold">Eficiencia</p>
              <p>Sin sistema: {tiempos?.fases?.sin_sistema?.duracion_promedio_min ?? 'N/D'} min</p>
              <p>Con sistema: {tiempos?.fases?.con_sistema?.duracion_promedio_min ?? 'N/D'} min</p>
              <p className="mt-1 text-xs text-gray-500">{tiempos?.nota}</p>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="font-semibold">Concordancia</p>
              <p>Muestras válidas: {kappa?.n_muestras_validas ?? 0}</p>
              <p>Kappa: {kappa?.resultado?.kappa ?? 'N/D'}</p>
              <p>Kappa ponderado: {weightedKappa ?? 'N/D'}</p>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="font-semibold">Likert (1 a 5)</p>
              <p>Claridad: {clarityAvg ?? 'N/D'}</p>
              <p>Utilidad: {utilityAvg ?? 'N/D'}</p>
              <p>Pertinencia: {pertinenceAvg ?? 'N/D'}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <MessageSquareText className="w-5 h-5 text-primary-600" />
          Percepciones cualitativas
        </h2>

        {!cualitativo?.n_comentarios ? (
          <p className="text-sm text-gray-500">Aún no hay comentarios cualitativos registrados.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Temas frecuentes</h3>
              <div className="flex flex-wrap gap-2">
                {(cualitativo.temas_frecuentes || []).map((t) => (
                  <span key={t.tema} className="px-2 py-1 rounded-full text-xs bg-primary-50 text-primary-700 border border-primary-100">
                    {t.tema} ({t.frecuencia})
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Últimos comentarios</h3>
              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {['profesor', 'estudiante', 'admin'].flatMap((rol) => (cualitativo?.comentarios_por_rol?.[rol] || []).slice(0, 3).map((c, i) => (
                  <div key={`${rol}-${i}`} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    <p className="text-[11px] font-semibold uppercase text-gray-500">{rol}</p>
                    <p className="text-sm text-gray-700">{c.comentario}</p>
                  </div>
                )))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg border border-blue-100 bg-blue-50 text-blue-800 text-xs flex items-start gap-2">
          {weightedKappa != null && weightedKappa >= 0.75
            ? <CheckCircle2 className="w-4 h-4 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          <p>
            {user?.rol === 'admin'
              ? 'Este panel consolida la evidencia metodológica para el informe de tesis en una sola vista.'
              : 'Este panel te ayuda a registrar evidencia de impacto para la evaluación metodológica de la tesis.'}
          </p>
        </div>
      </section>
    </div>
  );
}
