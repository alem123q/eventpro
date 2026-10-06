import { useNavigate } from 'react-router-dom';
import { getCategoryLabel } from '../constants/categories';
import { mediaUrl, parseEventDate } from '../utils/format';
import './EventCard.css';

const STATUS_LABELS = {
  draft: 'Borrador',
  active: 'Activo',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

const STATUS_COLORS = {
  draft: '#f59e0b',
  active: '#22c55e',
  finished: '#6b7280',
  cancelled: '#ef4444',
};

export default function EventCard({ event }) {
  const navigate = useNavigate();

  const date = parseEventDate(event.event_date);
  const formattedDate = date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="event-card" onClick={() => navigate(`/events/${event.id}`)}>
      {event.image && (
        <img className="event-card-image" src={mediaUrl(event.image)} alt="" loading="lazy" />
      )}
      <div className="event-card-header">
        <span
          className="event-card-status"
          style={{ '--status-color': STATUS_COLORS[event.status] }}
        >
          {STATUS_LABELS[event.status] || event.status}
        </span>
        <span className="event-card-category">{getCategoryLabel(event.category)}</span>
      </div>
      <h3 className="event-card-title">{event.title}</h3>
      <p className="event-card-description">{event.description}</p>
      <div className="event-card-footer">
        <span className="event-card-date">{formattedDate}</span>
        {event.guest_count !== undefined && (
          <span className="event-card-guests">
            {event.guest_count} invitados
          </span>
        )}
      </div>
    </div>
  );
}
