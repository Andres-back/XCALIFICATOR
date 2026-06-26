import api from '../api';

export const examenesService = {
  listByMateria: (materiaId) => api.get(`/examenes/materia/${materiaId}`).then(r => r.data),
  getById: (id) => api.get(`/examenes/${id}`).then(r => r.data),
  create: (data) => api.post('/examenes/', data).then(r => r.data),
  delete: (id) => api.delete(`/examenes/${id}`),
  getNotas: (examenId) => api.get(`/examenes/notas/examen/${examenId}`).then(r => r.data),
  submitNota: (examenId, estudianteId, nota) =>
    api.post(`/examenes/notas/${examenId}/${estudianteId}`, { nota }).then(r => r.data),
};
