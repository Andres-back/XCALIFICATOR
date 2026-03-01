import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Calendar, Plus, Edit3, Trash2, Save, X, AlertCircle,
  CheckCircle, Loader2, Info,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

const PERIODO_NOMBRES = ['Primer Período', 'Segundo Período', 'Tercer Período', 'Cuarto Período'];

export default function AdminPeriodos() {
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchPeriodos = async () => {
    try {
      const res = await api.get('/periodos/');
      setPeriodos(res.data);
    } catch {
      toast.error('Error cargando períodos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPeriodos(); }, []);

  const startEdit = () => {
    if (periodos.length > 0) {
      setForm(periodos.map(p => ({
        id: p.id,
        nombre: p.nombre,
        numero: p.numero,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
        porcentaje: p.porcentaje || 25,
      })));
    } else {
      setForm([{
        nombre: PERIODO_NOMBRES[0],
        numero: 1,
        fecha_inicio: '',
        fecha_fin: '',
        porcentaje: 25,
      }]);
    }
    setEditMode(true);
  };

  const addPeriodo = () => {
    const nextNum = form.length + 1;
    if (nextNum > 10) { toast.error('Máximo 10 períodos'); return; }
    setForm(prev => [...prev, {
      nombre: PERIODO_NOMBRES[nextNum - 1] || `Período ${nextNum}`,
      numero: nextNum,
      fecha_inicio: '',
      fecha_fin: '',
      porcentaje: 25,
    }]);
  };

  const removePeriodoForm = (index) => {
    setForm(prev => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero: i + 1 })));
  };

  const updateForm = (index, field, value) => {
    setForm(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const totalPorcentaje = form.reduce((a, p) => a + (parseFloat(p.porcentaje) || 0), 0);

  const handleSave = async () => {
    for (const p of form) {
      if (!p.fecha_inicio || !p.fecha_fin) {
        toast.error(`${p.nombre}: Las fechas son obligatorias`);
        return;
      }
      if (new Date(p.fecha_inicio) >= new Date(p.fecha_fin)) {
        toast.error(`${p.nombre}: La fecha de inicio debe ser anterior a la de fin`);
        return;
      }
    }

    setSaving(true);
    try {
      await api.post('/periodos/bulk', {
        periodos: form.map(p => ({
          nombre: p.nombre,
          numero: p.numero,
          fecha_inicio: p.fecha_inicio,
          fecha_fin: p.fecha_fin,
          porcentaje: parseFloat(p.porcentaje),
        })),
      });
      toast.success('Períodos académicos guardados');
      setEditMode(false);
      fetchPeriodos();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        toast.error(detail);
      } else if (Array.isArray(detail)) {
        toast.error(detail.map(e => e.msg || JSON.stringify(e)).join(', '));
      } else {
        toast.error('Error guardando períodos');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/periodos/${id}`);
      toast.success('Período eliminado');
      setDeleteConfirm(null);
      fetchPeriodos();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error eliminando');
      setDeleteConfirm(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Períodos Académicos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configura los períodos del año escolar y sus porcentajes de calificación.
          </p>
        </div>
        {!editMode && (
          <button onClick={startEdit} className="btn-primary flex items-center gap-2 shrink-0">
            {periodos.length > 0 ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {periodos.length > 0 ? 'Editar Períodos' : 'Configurar Períodos'}
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800 font-medium">Períodos flexibles</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Puedes configurar de 1 a 4 períodos de forma independiente. Cada período tiene su propio porcentaje de calificación.
            Se recomienda que los porcentajes sumen 100%.
          </p>
        </div>
      </div>

      {/* View Mode */}
      {!editMode && (
        <>
          {periodos.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No hay períodos configurados"
              description="Configura los períodos académicos del año escolar para habilitar reportes y boletines por período."
              action={
                <button onClick={startEdit} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Configurar Períodos
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {periodos.sort((a, b) => a.numero - b.numero).map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-700 font-bold">{p.numero}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{p.nombre}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-medium">
                          {p.porcentaje}%
                        </span>
                      </div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">Inicio:</span> {new Date(p.fecha_inicio).toLocaleDateString('es-CO')}</p>
                    <p><span className="font-medium">Fin:</span> {new Date(p.fecha_fin).toLocaleDateString('es-CO')}</p>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${p.porcentaje}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Edit Mode */}
      {editMode && (
        <div className="space-y-4">
          {form.map((p, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-700 font-bold text-sm">{p.numero}</span>
                </div>
                <input
                  type="text"
                  className="input-field flex-1"
                  value={p.nombre}
                  onChange={e => updateForm(i, 'nombre', e.target.value)}
                  placeholder="Nombre del período"
                />
                {form.length > 1 && (
                  <button type="button" onClick={() => removePeriodoForm(i)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha inicio</label>
                  <input type="date" className="input-field"
                    value={p.fecha_inicio}
                    onChange={e => updateForm(i, 'fecha_inicio', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha fin</label>
                  <input type="date" className="input-field"
                    value={p.fecha_fin}
                    onChange={e => updateForm(i, 'fecha_fin', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Porcentaje (%)</label>
                  <input type="number" min="0" max="100" step="0.1" className="input-field"
                    value={p.porcentaje}
                    onChange={e => updateForm(i, 'porcentaje', e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          {/* Add period button */}
          {form.length < 10 && (
            <button type="button" onClick={addPeriodo}
              className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Agregar período
            </button>
          )}

          {/* Total indicator */}
          <div className={`flex items-center justify-between p-4 rounded-xl border ${
            Math.abs(totalPorcentaje - 100) < 0.01
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <span className={`text-sm font-medium ${
              Math.abs(totalPorcentaje - 100) < 0.01 ? 'text-green-700' : 'text-yellow-700'
            }`}>
              Total de porcentajes: {totalPorcentaje.toFixed(1)}%
              {Math.abs(totalPorcentaje - 100) >= 0.01 && ' (se recomienda 100%)'}
            </span>
            {Math.abs(totalPorcentaje - 100) < 0.01 ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <Info className="w-5 h-5 text-yellow-500" />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditMode(false)} className="btn-secondary flex items-center gap-2">
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Períodos
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar período?"
        message="Se eliminará este período académico. Los reportes y boletines asociados podrían verse afectados."
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
