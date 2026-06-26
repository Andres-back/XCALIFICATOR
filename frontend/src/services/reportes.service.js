import api from '../api';

export const reportesService = {
  getActividades: (materiaId, periodoId) =>
    api.get(`/reportes/actividades/${materiaId}/${periodoId}`).then(r => r.data),
  getConfig: (materiaId, periodoId) =>
    api.get(`/reportes/config/${materiaId}/${periodoId}`).then(r => r.data),
  saveConfig: (materiaId, periodoId, actividades) =>
    api.post(`/reportes/config/${materiaId}`, { periodo_id: periodoId, actividades }).then(r => r.data),
  getReporte: (materiaId, periodoId) =>
    api.get(`/reportes/materia/${materiaId}/periodo/${periodoId}`).then(r => r.data),
  publishBoletines: (materiaId, periodoId) =>
    api.post(`/reportes/boletin/${materiaId}/${periodoId}`).then(r => r.data),
  getBoletines: (materiaId, periodoId) =>
    api.get(`/reportes/boletines/materia/${materiaId}/${periodoId}`).then(r => r.data),
  getParticipacion: (materiaId, periodoId) =>
    api.get(`/reportes/participacion/${materiaId}/${periodoId}`).then(r => r.data),
  saveParticipacion: (materiaId, periodoId, notas) =>
    api.post(`/reportes/participacion/${materiaId}/${periodoId}`, { notas }).then(r => r.data),
};
