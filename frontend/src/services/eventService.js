import api from './api';

export const eventService = {
  list(params) {
    return api.get('/events/', { params });
  },

  create(data) {
    return api.post('/events/', data);
  },

  retrieve(id) {
    return api.get(`/events/${id}/`);
  },

  update(id, data) {
    return api.put(`/events/${id}/`, data);
  },

  partialUpdate(id, data) {
    return api.patch(`/events/${id}/`, data);
  },

  destroy(id) {
    return api.delete(`/events/${id}/`);
  },

  changeStatus(id, status) {
    return api.patch(`/events/${id}/status/`, { status });
  },

  // Colaboradores del evento (solo el organizador los gestiona)
  listCollaborators(id) {
    return api.get(`/events/${id}/collaborators/`);
  },

  addCollaborator(id, email) {
    return api.post(`/events/${id}/collaborators/`, { email });
  },

  removeCollaborator(id, userId) {
    return api.delete(`/events/${id}/collaborators/${userId}/`);
  },
};
