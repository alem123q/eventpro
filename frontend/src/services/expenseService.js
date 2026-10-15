import api from './api';

export const expenseService = {
  list(params) {
    return api.get('/expenses/', { params });
  },

  create(data) {
    return api.post('/expenses/', data);
  },

  update(id, data) {
    return api.patch(`/expenses/${id}/`, data);
  },

  destroy(id) {
    return api.delete(`/expenses/${id}/`);
  },

  summary(eventId) {
    return api.get('/expenses/summary/', { params: { event: eventId } });
  },

  categories() {
    return api.get('/expenses/categories/');
  },
};
