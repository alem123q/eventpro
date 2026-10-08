import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategoryLabel } from '../constants/categories';
import { dashboardService } from '../services/dashboardService';
import StatCard from '../components/StatCard';
import Loading from '../components/Loading';
import './Dashboard.css';
import { parseEventDate } from '../utils/format';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const { data } = await dashboardService.getStats();
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setError('Error al cargar estadísticas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Loading text="Cargando dashboard..." />;

  if (error) {
    return (
      <div className="dashboard-error">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="dashboard-subtitle">Resumen de tu actividad</p>
      </div>

      <div className="dashboard-stats">
        <StatCard
          title="Total Eventos"
          value={stats.total_events}
          icon="📅"
          color="#4f46e5"
        />
        <StatCard
          title="Eventos Activos"
          value={stats.active_events}
          icon="✅"
          color="#22c55e"
        />
        <StatCard
          title="Finalizados"
          value={stats.finished_events}
          icon="🏁"
          color="#6b7280"
        />
        <StatCard
          title="Borradores"
          value={stats.draft_events}
          icon="📝"
          color="#f59e0b"
        />
        <StatCard
          title="Total Invitados"
          value={stats.total_guests}
          icon="👥"
          color="#3b82f6"
        />
        <StatCard
          title="Confirmados"
          value={stats.confirmed_guests}
          icon="✅"
          color="#22c55e"
        />
        <StatCard
          title="Pendientes"
          value={stats.pending_guests}
          icon="⏳"
          color="#f59e0b"
        />
        <StatCard
          title="Tasa Asistencia"
          value={stats.attendance_rate ? `${stats.attendance_rate}%` : '0%'}
          icon="📈"
          color="#8b5cf6"
        />
      </div>

      {stats.upcoming_events && stats.upcoming_events.length > 0 && (
        <section className="dashboard-section">
          <h2>Próximos Eventos</h2>
          <div className="dashboard-upcoming">
            {stats.upcoming_events.map((event) => (
              <div
                key={event.id}
                className="upcoming-card"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <div className="upcoming-date">
                  <span className="upcoming-day">
                    {parseEventDate(event.event_date).getDate()}
                  </span>
                  <span className="upcoming-month">
                    {parseEventDate(event.event_date).toLocaleString('es', { month: 'short' })}
                  </span>
                </div>
                <div className="upcoming-info">
                  <span className="upcoming-title">{event.title}</span>
                  <span className="upcoming-meta">
                    {event.confirmed_count} confirmados · {event.guest_count} invitados
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.events_by_category && Object.keys(stats.events_by_category).length > 0 && (
        <section className="dashboard-section">
          <h2>Eventos por Categoría</h2>
          <div className="dashboard-categories">
            {Object.entries(stats.events_by_category).map(([cat, count]) => (
              <div key={cat} className="category-item">
                <span className="category-name">{getCategoryLabel(cat)}</span>
                <div className="category-bar">
                  <div
                    className="category-fill"
                    style={{
                      width: `${(count / stats.total_events) * 100}%`,
                    }}
                  />
                </div>
                <span className="category-count">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
