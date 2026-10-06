import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PAGE_SIZE } from '../constants';
import { guestService } from '../services/guestService';
import { attendanceService } from '../services/attendanceService';
import Loading from '../components/Loading';
import './CheckIn.css';

export default function CheckIn() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [message, setMessage] = useState(null);

  const loadGuests = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await guestService.list({ event: id, page_size: PAGE_SIZE * 10 });
      setGuests(data.results || data);
    } catch {
      setError('Error al cargar invitados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadGuests();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleQrCheckIn = async () => {
    const code = qrCode.trim();
    if (!code) return;

    setCheckingIn(true);
    setMessage(null);
    try {
      await attendanceService.checkIn({ qr_code: code });
      setMessage({ type: 'success', text: 'Check-in exitoso.' });
      setQrCode('');
      loadGuests();
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || 'Error al realizar check-in.';
      setMessage({ type: 'error', text: detail });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleGuestCheckIn = async (guest) => {
    setCheckingIn(true);
    setMessage(null);
    try {
      await attendanceService.checkIn({ qr_code: guest.qr_hash });
      setMessage({ type: 'success', text: `${guest.first_name} ${guest.last_name} registrado.` });
      loadGuests();
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || 'Error al registrar asistencia.';
      setMessage({ type: 'error', text: detail });
    } finally {
      setCheckingIn(false);
    }
  };

  const filtered = guests.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.first_name.toLowerCase().includes(q) ||
      g.last_name.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q)
    );
  });

  const pendingGuests = filtered.filter((g) => !g.attended);

  return (
    <div className="checkin-page">
      <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}`)}>
        ← Volver al evento
      </button>

      <div className="checkin-header">
        <h1>Check-in</h1>
        <p className="checkin-subtitle">Registra la asistencia de los invitados</p>
      </div>

      <div className="checkin-qr-section">
        <h2>Código QR</h2>
        <div className="checkin-qr-row">
          <input
            type="text"
            className="input"
            placeholder="Ingresa el código QR..."
            value={qrCode}
            onChange={(e) => { setQrCode(e.target.value); setMessage(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQrCheckIn(); }}
          />
          <button
            className="btn btn-primary"
            onClick={handleQrCheckIn}
            disabled={checkingIn || !qrCode.trim()}
          >
            {checkingIn ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`checkin-message checkin-message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="checkin-search-section">
        <h2>Buscar invitado</h2>
        <input
          type="text"
          className="input"
          placeholder="Nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Loading text="Cargando invitados..." />
      ) : error ? (
        <div className="checkin-error">{error}</div>
      ) : pendingGuests.length === 0 ? (
        <div className="checkin-empty">
          {search ? 'No se encontraron invitados pendientes.' : 'Todos los invitados han sido registrados.'}
        </div>
      ) : (
        <div className="checkin-guest-list">
          {pendingGuests.map((guest) => (
            <div key={guest.id} className="checkin-guest-card">
              <div className="checkin-guest-info">
                <span className="checkin-guest-name">
                  {guest.first_name} {guest.last_name}
                </span>
                <span className="checkin-guest-email">{guest.email}</span>
              </div>
              <div className="checkin-guest-status">
                <span
                  className="rsvp-badge"
                  style={{
                    background:
                      guest.rsvp_status === 'confirmed' ? '#22c55e' :
                      guest.rsvp_status === 'rejected' ? '#ef4444' : '#f59e0b',
                  }}
                >
                  {guest.rsvp_status === 'confirmed' ? 'Confirmado' :
                   guest.rsvp_status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                </span>
              </div>
              <button
                className="btn btn-primary checkin-btn"
                onClick={() => handleGuestCheckIn(guest)}
                disabled={checkingIn}
              >
                Registrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
