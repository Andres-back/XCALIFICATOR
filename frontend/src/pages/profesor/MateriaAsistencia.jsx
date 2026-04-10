import { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  CalendarCheck, Save, Loader2, Download, Check, X,
  Calendar, Users, AlertCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import EmptyState from '../../components/EmptyState';

export default function MateriaAsistencia({ materiaId, materiaNombre }) {
  const [students, setStudents] = useState([]);
  const [dates, setDates] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studRes, datesRes] = await Promise.all([
          api.get(`/materias/${materiaId}/estudiantes`),
          api.get(`/asistencia/materia/${materiaId}/dates`).catch(() => ({ data: [] })),
        ]);
        setStudents(studRes.data);
        setDates(datesRes.data);
        await loadAttendance(selectedDate, studRes.data);
      } catch {
        toast.error('Error cargando datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [materiaId]);

  const loadAttendance = async (date, studentsList = students) => {
    try {
      const res = await api.get(`/asistencia/materia/${materiaId}?fecha=${date}`);
      const map = {};
      for (const s of studentsList) {
        const record = res.data.find(r => r.estudiante_id === s.id);
        map[s.id] = record ? record.estado : 'presente';
      }
      setAttendance(map);
      setRecords(res.data);
    } catch {
      const map = {};
      for (const s of studentsList) {
        map[s.id] = 'presente';
      }
      setAttendance(map);
    }
  };

  const handleDateChange = async (date) => {
    setSelectedDate(date);
    await loadAttendance(date);
  };

  const toggleAttendance = (studentId) => {
    setAttendance(prev => {
      const current = prev[studentId];
      const next = current === 'presente' ? 'ausente' : current === 'ausente' ? 'tardanza' : 'presente';
      return { ...prev, [studentId]: next };
    });
  };

  const setAllStatus = (status) => {
    const map = {};
    for (const s of students) {
      map[s.id] = status;
    }
    setAttendance(map);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const registros = Object.entries(attendance).map(([estudiante_id, estado]) => ({
        estudiante_id,
        estado,
      }));
      await api.post(`/asistencia/materia/${materiaId}`, {
        fecha: selectedDate,
        registros,
      });
      toast.success('Asistencia guardada');
      // Refresh dates
      const datesRes = await api.get(`/asistencia/materia/${materiaId}/dates`).catch(() => ({ data: [] }));
      setDates(datesRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/asistencia/materia/${materiaId}/export-pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `asistencia_${materiaNombre || 'materia'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF descargado');
    } catch {
      toast.error('Error exportando PDF');
    } finally {
      setExporting(false);
    }
  };

  const statusConfig = {
    presente: { label: 'P', color: 'bg-green-100 text-green-700 border-green-200', fullLabel: 'Presente' },
    ausente: { label: 'A', color: 'bg-red-100 text-red-700 border-red-200', fullLabel: 'Ausente' },
    tardanza: { label: 'T', color: 'bg-amber-100 text-amber-700 border-amber-200', fullLabel: 'Tardanza' },
  };

  const stats = {
    presentes: Object.values(attendance).filter(v => v === 'presente').length,
    ausentes: Object.values(attendance).filter(v => v === 'ausente').length,
    tardanzas: Object.values(attendance).filter(v => v === 'tardanza').length,
  };

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );

  if (students.length === 0) return (
    <EmptyState
      icon={Users}
      title="No hay estudiantes matriculados"
      description="Los estudiantes deben inscribirse con el código de la materia para poder registrar asistencia."
    />
  );

  return (
    <div className="space-y-6">
      {/* Date selector + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-5 h-5 text-primary-600" />
          <input type="date" className="input-field w-full sm:w-48" value={selectedDate}
            onChange={e => handleDateChange(e.target.value)} />
          <div className="flex gap-1">
            <button onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              handleDateChange(d.toISOString().split('T')[0]);
            }} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => handleDateChange(new Date().toISOString().split('T')[0])}
              className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2">
              Hoy
            </button>
            <button onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              handleDateChange(d.toISOString().split('T')[0]);
            }} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExport} disabled={exporting}
            className="btn-secondary text-sm flex items-center gap-1">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar PDF
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary text-sm flex items-center gap-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-500">Marcar todos como:</span>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <button key={key} onClick={() => setAllStatus(key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${cfg.color} hover:opacity-80`}>
            {cfg.fullLabel}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
          <p className="text-2xl font-bold text-green-700">{stats.presentes}</p>
          <p className="text-xs text-green-600">Presentes</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
          <p className="text-2xl font-bold text-red-700">{stats.ausentes}</p>
          <p className="text-xs text-red-600">Ausentes</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
          <p className="text-2xl font-bold text-amber-700">{stats.tardanzas}</p>
          <p className="text-xs text-amber-600">Tardanzas</p>
        </div>
      </div>

      {/* Student list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">
              {students.length} estudiantes • {new Date(selectedDate).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <span className="text-xs text-gray-500">Clic para cambiar estado</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {students
            .sort((a, b) => (a.apellido || '').localeCompare(b.apellido || ''))
            .map((s, i) => {
              const status = attendance[s.id] || 'presente';
              const cfg = statusConfig[status];
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                      {s.nombre?.[0]}{s.apellido?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.apellido} {s.nombre}</p>
                      <p className="text-xs text-gray-400">{s.documento}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleAttendance(s.id)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${cfg.color} hover:scale-105`}>
                    {cfg.label} — {cfg.fullLabel}
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* Recent dates */}
      {dates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Fechas con registro</h3>
          <div className="flex flex-wrap gap-2">
            {dates.slice(0, 20).map(d => (
              <button key={d} onClick={() => handleDateChange(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  d === selectedDate
                    ? 'bg-primary-100 text-primary-700 border border-primary-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
