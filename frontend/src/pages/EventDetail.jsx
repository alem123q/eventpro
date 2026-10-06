import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCategoryLabel } from '../constants/categories';
import { eventService } from '../services/eventService';
import Loading from '../components/Loading';
import './EventDetail.css';
import { mediaUrl, parseEventDate } from '../utils/format';

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
            <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}/edit`)}>
              Editar
            </button>
          </div>
        </div>

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
