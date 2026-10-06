import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PAGE_SIZE } from '../constants';
import { EVENT_CATEGORIES } from '../constants/categories';
import { eventService } from '../services/eventService';
import EventCard from '../components/EventCard';
import Loading from '../components/Loading';
import './Events.css';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const currentSearch = searchParams.get('search') || '';
  const currentCategory = searchParams.get('category') || '';
  const currentStatus = searchParams.get('status') || '';

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const fetchEvents = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { page: currentPage, page_size: PAGE_SIZE };
        if (currentSearch) params.search = currentSearch;
        if (currentCategory) params.category = currentCategory;
        if (currentStatus) params.status = currentStatus;

        const { data } = await eventService.list(params);
        if (cancelled) return;
        setEvents(data.results || data);
        setTotal(data.count || 0);
        setTotalPages(data.total_pages || Math.ceil((data.count || 0) / PAGE_SIZE) || 1);
      } catch {
        if (!cancelled) setError('Error al cargar eventos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchEvents();
    return () => { cancelled = true; };
  }, [currentPage, currentSearch, currentCategory, currentStatus]);

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) newParams.set(key, value);
      else newParams.delete(key);
    });
    if (updates.page === undefined && updates.search === undefined) {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  };

  return (
    <div className="events-page">
      <div className="events-header">
        <div>
          <h1>Eventos</h1>
          <p className="events-count">{total} evento{total !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/events/new')}>
          + Nuevo Evento
        </button>
      </div>

      <div className="events-filters">
        <input
          type="text"
          className="input"
          placeholder="Buscar eventos..."
          value={currentSearch}
          onChange={(e) => updateParams({ search: e.target.value, page: '' })}
        />
        <select
          className="input"
          value={currentCategory}
          onChange={(e) => updateParams({ category: e.target.value, page: '' })}
        >
          <option value="">Todas las categorías</option>
          {EVENT_CATEGORIES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          className="input"
          value={currentStatus}
          onChange={(e) => updateParams({ status: e.target.value, page: '' })}
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="active">Activo</option>
          <option value="finished">Finalizado</option>
        </select>
      </div>

      {loading ? (
        <Loading text="Cargando eventos..." />
      ) : error ? (
        <div className="events-error">{error}</div>
      ) : events.length === 0 ? (
        <div className="events-empty">
          <p>No se encontraron eventos.</p>
          <button className="btn btn-primary" onClick={() => navigate('/events/new')}>
            Crear primer evento
          </button>
        </div>
      ) : (
        <>
          <div className="events-grid">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                disabled={currentPage <= 1}
                onClick={() => updateParams({ page: String(currentPage - 1) })}
              >
                Anterior
              </button>
              <span className="pagination-info">
                Página {currentPage} de {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => updateParams({ page: String(currentPage + 1) })}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
