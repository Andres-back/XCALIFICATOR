import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, MessageSquareQuote } from 'lucide-react';
import api from '../api';

const initialForm = {
  hito: 'post_uso',
  claridad: 4,
  utilidad: 4,
  pertinencia: 4,
  satisfaccion: 4,
  facilidad_uso: 4,
  comentario: '',
  consentimiento: true,
};

function LikertField({ label, value, onChange }) {
  return (
    <label className="text-sm text-gray-700 block">
      {label}
      <select className="input-field mt-1" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={1}>1 - Muy bajo</option>
        <option value={2}>2 - Bajo</option>
        <option value={3}>3 - Medio</option>
        <option value={4}>4 - Alto</option>
        <option value={5}>5 - Muy alto</option>
      </select>
    </label>
  );
}

export default function EncuestaImpacto() {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.consentimiento) {
      toast.error('Debes aceptar el consentimiento para participar');
      return;
    }

    setSaving(true);
    try {
      await api.post('/tesis/encuestas', form);
      setSaved(true);
      toast.success('Encuesta registrada correctamente');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No fue posible registrar la encuesta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Encuesta de Impacto</h1>
        <p className="text-sm text-gray-500 mt-1">
          Instrumento Likert (1 a 5) para evaluar claridad, utilidad y pertinencia del sistema.
        </p>
      </div>

      <form onSubmit={submit} className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-gray-700 block">
            Momento de evaluación
            <select
              className="input-field mt-1"
              value={form.hito}
              onChange={(e) => setForm((p) => ({ ...p, hito: e.target.value }))}
            >
              <option value="post_uso">Post uso</option>
              <option value="piloto">Piloto</option>
              <option value="seguimiento">Seguimiento</option>
            </select>
          </label>

          <LikertField
            label="Satisfacción general"
            value={form.satisfaccion}
            onChange={(v) => setForm((p) => ({ ...p, satisfaccion: v }))}
          />

          <LikertField
            label="Claridad de la retroalimentación"
            value={form.claridad}
            onChange={(v) => setForm((p) => ({ ...p, claridad: v }))}
          />

          <LikertField
            label="Utilidad para mejorar el aprendizaje"
            value={form.utilidad}
            onChange={(v) => setForm((p) => ({ ...p, utilidad: v }))}
          />

          <LikertField
            label="Pertinencia de la evaluación"
            value={form.pertinencia}
            onChange={(v) => setForm((p) => ({ ...p, pertinencia: v }))}
          />

          <LikertField
            label="Facilidad de uso"
            value={form.facilidad_uso}
            onChange={(v) => setForm((p) => ({ ...p, facilidad_uso: v }))}
          />
        </div>

        <label className="text-sm text-gray-700 block">
          Percepción cualitativa (opcional)
          <textarea
            className="input-field mt-1 h-24"
            value={form.comentario}
            onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))}
            placeholder="Cuéntanos cómo te ayudó el sistema o qué mejorarías"
          />
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.consentimiento}
            onChange={(e) => setForm((p) => ({ ...p, consentimiento: e.target.checked }))}
          />
          <span>
            Acepto participar en el análisis de impacto. La información será usada con fines académicos
            y presentada de forma agregada, sin identificación personal.
          </span>
        </label>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Guardando...' : 'Enviar encuesta'}
          </button>
          {saved && (
            <span className="text-sm text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Respuesta registrada
            </span>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 flex items-start gap-2">
        <MessageSquareQuote className="w-5 h-5 mt-0.5" />
        <p>
          Esta encuesta complementa los indicadores cuantitativos (eficiencia y concordancia) con evidencia
          cualitativa sobre utilidad y facilidad de uso.
        </p>
      </div>
    </div>
  );
}
