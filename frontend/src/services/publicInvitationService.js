import axios from 'axios';

// Cliente aparte, sin token: la pagina del invitado es publica. Si se usara el
// cliente comun y el navegador tuviera una sesion vencida guardada, el
// servidor rechazaria el pedido y la pagina mandaria al inicio de sesion.
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

export const publicInvitationService = {
  get(code) {
    return publicApi.get(`/public/invitations/${code}/`);
  },

  respond(code, rsvpStatus) {
    return publicApi.post(`/public/invitations/${code}/rsvp/`, { rsvp_status: rsvpStatus });
  },
};
