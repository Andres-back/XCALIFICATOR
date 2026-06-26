import api from '../api';

export const asistenciaService = {
  getDates: (materiaId) =>
    api.get(`/asistencia/materia/${materiaId}/dates`).then(r => r.data).catch(() => []),
  getByDate: (materiaId, fecha) =>
    api.get(`/asistencia/materia/${materiaId}?fecha=${fecha}`).then(r => r.data),
  save: (materiaId, fecha, registros) =>
    api.post(`/asistencia/materia/${materiaId}`, { fecha, registros }).then(r => r.data),
  exportPdf: (materiaId) =>
    api.get(`/asistencia/materia/${materiaId}/export-pdf`, { responseType: 'blob' }).then(r => r.data),
};
