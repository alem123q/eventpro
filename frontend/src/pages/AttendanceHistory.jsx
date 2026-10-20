import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PAGE_SIZE } from '../constants';
import { attendanceService } from '../services/attendanceService';
import { eventService } from '../services/eventService';
import Loading from '../components/Loading';
import DownloadButton from '../components/DownloadButton';
import './AttendanceHistory.css';

export default function AttendanceHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [event, setEvent] = useState(null);
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [eventRes, attendanceRes] = await Promise.all([
          eventService.retrieve(id),
          attendanceService.history({ event: id, page: currentPage, page_size: PAGE_SIZE }),
        ]);
        if (cancelled) return;
        setEvent(eventRes.data);
        setAttendances(attendanceRes.data.results || attendanceRes.data);
        setTotal(attendanceRes.data.count || 0);
        setTotalPages(attendanceRes.data.total_pages || Math.ceil((attendanceRes.data.count || 0) / PAGE_SIZE) || 1);
      } catch {
        if (!cancelled) setError('Error al cargar historial de asistencia.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [id, currentPage]);

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) newParams.set(key, value);
      else newParams.delete(key);
    });
    setSearchParams(newParams);
  };

  if (loading) return <Loading text="Cargando historial..." />;

  if (error) {
    return (
      <div className="attendance-error">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate(`/events/${id}`)}>
          Volver al evento
        </button>
      </div>
    );
  }

  return (
    <div className="attendance-page">
      <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}`)}>
        ← Volver al evento
      </button>

      <div className="attendance-header">
        <div>
          <h1>Historial de Asistencia</h1>
          {event && <p className="attendance-event-title">{event.title}</p>}
        </div>
        {/* El Excel tiene datos de contacto: solo para el organizador */}
        {event && event.my_role !== 'collaborator' && (
          <DownloadButton
            url="/invitations/export/"
            params={{ event: id }}
            fallbackName="invitados.xlsx"
            label="Descargar invitados y asistencia"
          />
        )}
      </div>

      {attendances.length === 0 ? (
        <div className="attendance-empty">
          No se han registrado asistencias aún.
        </div>
      ) : (
        <>
          <div className="attendance-table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Invitado</th>
                  <th>Email</th>
                  <th>Hora de ingreso</th>
                </tr>
              </thead>
              <tbody>
                {attendances.map((a) => (
                  <tr key={a.id}>
                    <td className="attendance-guest-name">
                      {a.invitation_name || `${a.invitation?.first_name || ''} ${a.invitation?.last_name || ''}`}
                    </td>
                    <td>{a.invitation_email || a.invitation?.email || '—'}</td>
                    <td>
                      {new Date(a.checkin_time).toLocaleString('es-CL', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {event && (
        <div className="attendance-summary">
          <p>
            <strong>{total}</strong> de{' '}
            <strong>{event.confirmed_count || 0}</strong> confirmados asistieron
            {event.guest_count > 0 && (
              <span> ({Math.round((total / event.guest_count) * 100)}% del total de invitados)</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
