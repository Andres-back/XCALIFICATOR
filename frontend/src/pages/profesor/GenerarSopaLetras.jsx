import { useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { Search, Loader2, Wand2, RotateCcw, Trash2, Eye, EyeOff } from 'lucide-react';
import SopaLetras from '../../components/SopaLetras';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function GenerarSopaLetras({ materiaId, materiaNombre }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tema: '',
    num_palabras: 8,
    nivel: 'intermedio',
  });
  const [generated, setGenerated] = useState(null);
  const [showPreview, setShowPreview] = useState(true);
  const [history, setHistory] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.tema.trim()) {
      toast.error('Ingresa un tema');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        materia_id: materiaId,
        titulo: `Sopa de Letras: ${form.tema}`,
        tema: form.tema,
        nivel: form.nivel,
        distribucion: { sopa_letras: 1 },
        sopa_config: { num_palabras: form.num_palabras },
      };
      const res = await api.post('/generate/exam', payload);
      const examId = res.data?.id || res.data?.examen_id;

      if (examId) {
        const examRes = await api.get(`/generate/exam/${examId}/answers`);
        const sopa = examRes.data?.contenido_json?.sopa_letras;
        if (sopa) {
          setGenerated({ ...sopa, examId, titulo: `Sopa de Letras: ${form.tema}` });
          setHistory(prev => [{ id: examId, titulo: `Sopa de Letras: ${form.tema}`, tema: form.tema, created: new Date().toISOString() }, ...prev]);
          toast.success('¡Sopa de letras generada!');
        } else {
          toast.error('No se generó la sopa. Intenta de nuevo.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando sopa de letras');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = () => {
    setGenerated(null);
    handleGenerate(new Event('submit'));
  };

  const handleDelete = async (examId) => {
    try {
      await api.delete(`/examenes/${examId}`);
      setHistory(prev => prev.filter(h => h.id !== examId));
      if (generated?.examId === examId) setGenerated(null);
      toast.success('Sopa de letras eliminada');
    } catch {
      toast.error('Error eliminando');
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-6">
      {/* Generator Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-50 ring-1 ring-emerald-100">
            <Search className="w-5 h-5 text-emerald-600" />
          </div>
          Generar Sopa de Letras
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Crea una sopa de letras interactiva con las palabras clave de tu tema. Se genera con IA y se puede asignar como actividad.
        </p>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tema</label>
            <input type="text" className="input-field" value={form.tema}
              onChange={e => setForm(p => ({ ...p, tema: e.target.value }))}
              placeholder="Ej: Sistema Solar, Vocabulario de inglés..."
              required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de palabras</label>
              <input type="number" min="4" max="20" className="input-field"
                value={form.num_palabras}
                onChange={e => setForm(p => ({ ...p, num_palabras: parseInt(e.target.value) || 8 }))} />
              <p className="text-xs text-gray-400 mt-1">Entre 4 y 20 palabras</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dificultad</label>
              <select className="input-field" value={form.nivel}
                onChange={e => setForm(p => ({ ...p, nivel: e.target.value }))}>
                <option value="basico">Básico</option>
                <option value="intermedio">Intermedio</option>
                <option value="avanzado">Avanzado</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary flex items-center gap-2">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
            ) : (
              <><Wand2 className="w-4 h-4" /> Generar Sopa de Letras</>
            )}
          </button>
        </form>
      </div>

      {/* Preview */}
      {generated && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Vista Previa</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPreview(v => !v)}
                className="btn-secondary text-xs flex items-center gap-1">
                {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPreview ? 'Ocultar' : 'Mostrar'}
              </button>
              <button onClick={handleRegenerate} disabled={loading}
                className="btn-secondary text-xs flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Regenerar
              </button>
            </div>
          </div>
          {showPreview && (
            <div className="overflow-x-auto">
              <SopaLetras sopa={generated} onComplete={(found) => {
                toast.success(`¡Encontraste ${found.length} palabras!`);
              }} />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!generated && !loading && (
        <EmptyState
          icon={Search}
          title="Genera tu primera sopa de letras"
          description="Completa el formulario para crear una sopa de letras interactiva con IA. Podrás previsualizarla y editarla."
        />
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Sopas de letras generadas en esta sesión</h3>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">{h.titulo}</p>
                  <p className="text-xs text-gray-400">{new Date(h.created).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDeleteConfirm(h.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar sopa de letras?"
        message="Se eliminará permanentemente esta sopa de letras y el examen asociado."
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
