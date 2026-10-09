import api from '../services/api';

/**
 * Convierte una fecha 'AAAA-MM-DD' de la API en un Date local.
 * `new Date('2026-12-01')` la interpreta en UTC, y en Argentina (UTC-3)
 * se muestra como el 30 de noviembre.
 */
export function parseEventDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * La API devuelve archivos como '/media/events/foto.png'. El frontend corre en
 * otro puerto, asi que hay que anteponer la direccion del backend.
 */
export function mediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const backendOrigin = new URL(api.defaults.baseURL, window.location.origin).origin;
  return `${backendOrigin}${path}`;
}

/**
 * Extrae un mensaje legible de un error de la API. DRF puede responder
 * {detail: '...'}, {error: '...'}, ['...'] o {campo: ['...']}.
 */
export function apiErrorMessage(err, fallback = 'Ocurrió un error.') {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data[0] || fallback;
  if (data.detail) return Array.isArray(data.detail) ? data.detail[0] : data.detail;
  if (data.error) return data.error;
  const first = Object.values(data)[0];
  if (Array.isArray(first)) return first[0] || fallback;
  return typeof first === 'string' ? first : fallback;
}
