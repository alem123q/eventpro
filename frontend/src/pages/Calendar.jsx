import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventService } from '../services/eventService';
import Loading from '../components/Loading';
import './Calendar.css';
import { parseEventDate } from '../utils/format';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function Calendar() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const { data } = await eventService.list({ page_size: 100 });
        setEvents(data.results || data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const monthEvents = {};
  events.forEach((e) => {
    const d = parseEventDate(e.event_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      if (!monthEvents[key]) monthEvents[key] = [];
      monthEvents[key].push(e);
    }
  });

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = new Date();
  const isToday = (d) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="cal-day cal-day-other">{prevDays - firstDay + i + 1}</div>);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const hasEvents = monthEvents[d]?.length > 0;
    cells.push(
      <div key={d} className={`cal-day ${isToday(d) ? 'cal-today' : ''} ${hasEvents ? 'cal-has-events' : ''}`}>
        <span className="cal-day-num">{d}</span>
        {hasEvents && (
          <div className="cal-day-events">
            {monthEvents[d].slice(0, 2).map((e) => (
              <span
                key={e.id}
                className="cal-event-dot"
                title={e.title}
                onClick={() => navigate(`/events/${e.id}`)}
              >
                {e.title}
              </span>
            ))}
            {monthEvents[d].length > 2 && (
              <span className="cal-more">+{monthEvents[d].length - 2} más</span>
            )}
          </div>
        )}
      </div>,
    );
  }

  if (loading) return <Loading text="Cargando calendario..." />;

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1>Calendario</h1>
      </div>

      <div className="calendar-nav">
        <button className="btn btn-secondary" onClick={prev}>←</button>
        <span className="calendar-month">{MONTHS[month]} {year}</span>
        <button className="btn btn-secondary" onClick={next}>→</button>
      </div>

      <div className="calendar-grid">
        {DAYS.map((d) => (
          <div key={d} className="cal-header">{d}</div>
        ))}
        {cells}
      </div>
    </div>
  );
}
