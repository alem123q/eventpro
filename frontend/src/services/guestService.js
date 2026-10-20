import api from './api';

export const guestService = {
  list(params) {
    return api.get('/invitations/', { params });
  },

  create(data) {
    return api.post('/invitations/', data);
  },

  retrieve(id) {
    return api.get(`/invitations/${id}/`);
  },

  update(id, data) {
    return api.put(`/invitations/${id}/`, data);
  },

  destroy(id) {
    return api.delete(`/invitations/${id}/`);
  },

  changeRsvp(id, rsvpStatus) {
    return api.patch(`/invitations/${id}/rsvp/`, { rsvp_status: rsvpStatus });
  },

  /** Envia (o reenvia) la invitacion de un invitado por correo. */
  sendInvitation(id) {
    return api.post(`/invitations/${id}/send/`);
  },

  /** Envia la invitacion a todos los que todavia no la recibieron. */
  sendPending(eventId) {
    return api.post('/invitations/send/', { event: eventId });
  },
};
