import api from '../api';

export const materiasService = {
  list: () => api.get('/materias/').then(r => r.data),
  create: (data) => api.post('/materias/', data).then(r => r.data),
  delete: (id) => api.delete(`/materias/${id}`),
  getStudents: (materiaId) => api.get(`/materias/${materiaId}/estudiantes`).then(r => r.data),
  getById: (id) => api.get(`/materias/${id}`).then(r => r.data),
};
