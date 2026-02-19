import { useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { Grid3X3, Loader2, Wand2, RotateCcw, Download, Trash2, Eye, EyeOff } from 'lucide-react';
import Crucigrama from '../../components/Crucigrama';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function GenerarCrucigrama({ materiaId, materiaNombre }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tema: '',
    num_pistas: 6,
    nivel: 'intermedio',
  });
  const [generated, setGenerated] = useState(null); // The generated crucigrama data
  const [showPreview, setShowPreview] = useState(true);
  const [history, setHistory] = useState([]); // Previously generated crucigramas
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.tema.trim()) {
      toast.error('Ingresa un tema');
      return;
    }
    setLoading(true);
    try {
      // Generate via the exam endpoint but with ONLY crucigrama
      const payload = {
        materia_id: materiaId,
        titulo: `Crucigrama: ${form.tema}`,
        tema: form.tema,
        nivel: form.nivel,
        distribucion: { crucigrama: 1 },
        crucigrama_config: { num_pistas: form.num_pistas },
      };
      const res = await api.post('/generate/exam', payload);
      const examId = res.data?.id || res.data?.examen_id;

      // Fetch the generated content
      if (examId) {
        const examRes = await api.get(`/generate/exam/${examId}/answers`);
        const crucigrama = examRes.data?.contenido_json?.crucigrama;
        if (crucigrama) {
          setGenerated({ ...crucigrama, examId, titulo: `Crucigrama: ${form.tema}` });
          setHistory(prev => [{ id: examId, titulo: `Crucigrama: ${form.tema}`, tema: form.tema, created: new Date().toISOString() }, ...prev]);
          toast.success('¡Crucigrama generado!');
        } else {
          toast.error('No se generó el crucigrama. Intenta de nuevo.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando crucigrama');
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
      toast.success('Crucigrama eliminado');
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
          <div className="p-2 rounded-xl bg-purple-50 ring-1 ring-purple-100">
            <Grid3X3 className="w-5 h-5 text-purple-600" />
          </div>
          Generar Crucigrama
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Crea un crucigrama interactivo sobre cualquier tema. Se genera con IA y puede asignarse como actividad.
        </p>

        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tema</label>
            <input type="text" className="input-field" value={form.tema}
              onChange={e => setForm(p => ({ ...p, tema: e.target.value }))}
              placeholder="Ej: Capitales de América, Partes de la célula..."
              required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de pistas</label>
              <input type="number" min="3" max="15" className="input-field"
                value={form.num_pistas}
                onChange={e => setForm(p => ({ ...p, num_pistas: parseInt(e.target.value) || 6 }))} />
              <p className="text-xs text-gray-400 mt-1">Entre 3 y 15 pistas</p>
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
              <><Wand2 className="w-4 h-4" /> Generar Crucigrama</>
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
              <Crucigrama crucigrama={generated} onComplete={(answers) => {
                toast.success('¡Crucigrama completado!');
              }} />
            </div>
          )}
        </div>
      )}

      {/* Empty state when no crucigrama generated */}
      {!generated && !loading && (
        <EmptyState
          icon={Grid3X3}
          title="Genera tu primer crucigrama"
          description="Completa el formulario de arriba para crear un crucigrama interactivo con IA. Podrás previsualizarlo antes de compartirlo."
        />
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Crucigramas generados en esta sesión</h3>
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

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar crucigrama?"
        message="Se eliminará permanentemente este crucigrama y el examen asociado."
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
