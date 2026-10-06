import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCategoryLabel } from '../constants/categories';
import { eventService } from '../services/eventService';
import Loading from '../components/Loading';
import './EventDetail.css';
import { mediaUrl, parseEventDate } from '../utils/format';

// Siguiente estado permitido (el backend solo acepta borrador -> activo -> finalizado)
const NEXT_STATUS = {
  draft: {
    status: 'active',
    label: 'Activar evento',
    confirm: 'Al activar el evento se habilita el check-in de invitados. ¿Continuar?',
  },
  active: {
    status: 'finished',
    label: 'Finalizar evento',
    confirm: 'Un evento finalizado ya no admite check-in y no se puede reabrir. ¿Continuar?',
  },
};

const STATUS_LABELS = {
  draft: 'Borrador',
  active: 'Activo',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchEvent = async () => {
      try {
        const { data } = await eventService.retrieve(id);
        if (!cancelled) setEvent(data);
      } catch {
        if (!cancelled) setError('Error al cargar el evento.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEvent();
    return () => { cancelled = true; };
  }, [id]);

  const handleChangeStatus = async () => {
    const next = NEXT_STATUS[event.status];
    if (!next || !window.confirm(next.confirm)) return;
    setChangingStatus(true);
    setStatusError('');
    try {
      const { data } = await eventService.changeStatus(event.id, next.status);
      setEvent((prev) => ({ ...prev, status: data.status }));
    } catch (err) {
      const data = err.response?.data;
      setStatusError(
        (Array.isArray(data) && data[0]) || data?.detail || data?.error || 'No se pudo cambiar el estado.',
      );
    } finally {
      setChangingStatus(false);
    }
  };

  if (loading) return <Loading text="Cargando evento..." />;

  if (error) {
    return (
      <div className="detail-error">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/events')}>
          Volver a eventos
        </button>
      </div>
    );
  }

  if (!event) return null;

  const date = parseEventDate(event.event_date).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="event-detail">
      <button className="btn btn-secondary" onClick={() => navigate('/events')}>
        ← Volver
      </button>

      <div className="detail-card">
        {event.image && (
          <img className="detail-image" src={mediaUrl(event.image)} alt={event.title} />
        )}
        <div className="detail-header">
          <div>
            <span className="detail-status" data-status={event.status}>
              {STATUS_LABELS[event.status]}
            </span>
            <h1>{event.title}</h1>
          </div>
          <div className="detail-actions">
            {NEXT_STATUS[event.status] && (
              <button
                className="btn btn-primary"
                onClick={handleChangeStatus}
                disabled={changingStatus}
              >
                {changingStatus ? 'Guardando...' : NEXT_STATUS[event.status].label}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}/edit`)}>
              Editar
            </button>
          </div>
        </div>

        {statusError && <p className="detail-status-error">{statusError}</p>}

        <div className="detail-body">
          <div className="detail-section">
            <h3>Descripción</h3>
            <p>{event.description || 'Sin descripción.'}</p>
          </div>

          <div className="detail-meta">
            <div className="meta-item">
              <span className="meta-label">Fecha</span>
              <span className="meta-value">{date}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Categoría</span>
              <span className="meta-value">{getCategoryLabel(event.category)}</span>
            </div>
            {event.location && (
              <div className="meta-item">
                <span className="meta-label">Ubicación</span>
                <span className="meta-value">{event.location}</span>
              </div>
            )}
          </div>

          <div className="detail-section">
            <h3>Invitados</h3>
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/events/${id}/guests`)}
            >
              Gestionar Invitados
            </button>
          </div>

          <div className="detail-section">
            <h3>Asistencia</h3>
            <div className="detail-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/events/${id}/checkin`)}
              >
                Check-in
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/events/${id}/attendance`)}
              >
                Historial
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
