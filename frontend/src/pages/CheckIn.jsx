import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PAGE_SIZE } from '../constants';
import { guestService } from '../services/guestService';
import { attendanceService } from '../services/attendanceService';
import Loading from '../components/Loading';
import { apiErrorMessage } from '../utils/format';
import './CheckIn.css';

const RSVP_LABELS = {
  confirmed: 'Confirmado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
};

const RSVP_COLORS = {
  confirmed: '#22c55e',
  pending: '#f59e0b',
  rejected: '#ef4444',
};

function GuestCard({ guest, action }) {
  return (
    <div className="checkin-guest-card">
      <div className="checkin-guest-info">
        <span className="checkin-guest-name">
          {guest.first_name} {guest.last_name}
        </span>
        <span className="checkin-guest-email">{guest.email}</span>
      </div>
      <div className="checkin-guest-status">
        <span
          className="rsvp-badge"
          style={{ background: RSVP_COLORS[guest.rsvp_status] }}
        >
          {RSVP_LABELS[guest.rsvp_status] || guest.rsvp_status}
        </span>
      </div>
      {action}
    </div>
  );
}

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

  // Registra el ingreso y dice siempre a quien se registro. El evento viaja
  // en el pedido para que el backend rechace codigos de otros eventos.
  const checkIn = async (code) => {
    setCheckingIn(true);
    setMessage(null);
    try {
      const { data } = await attendanceService.checkIn({ qr_code: code, event: Number(id) });
      if (data.already_checked_in) {
        const hora = new Date(data.checkin_time).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
        setMessage({
          type: 'warning',
          text: `${data.invitation_name} ya había ingresado (a las ${hora}). No se registró de nuevo.`,
        });
      } else {
        setMessage({ type: 'success', text: `✓ Ingreso registrado: ${data.invitation_name}.` });
      }
      loadGuests();
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: apiErrorMessage(err, 'Error al realizar check-in.') });
      return false;
    } finally {
      setCheckingIn(false);
    }
  };

  const handleQrCheckIn = async () => {
    const code = qrCode.trim();
    if (!code) return;
    const ok = await checkIn(code);
    if (ok) setQrCode('');
  };

  const query = search.trim().toLowerCase();
  const filtered = guests.filter((g) => (
    !query ||
    g.first_name.toLowerCase().includes(query) ||
    g.last_name.toLowerCase().includes(query) ||
    g.email.toLowerCase().includes(query)
  ));

  const toCheckIn = filtered.filter((g) => !g.attended && g.rsvp_status === 'confirmed');
  const unconfirmed = filtered.filter((g) => !g.attended && g.rsvp_status !== 'confirmed');
  const attended = filtered.filter((g) => g.attended);

  const totalConfirmed = guests.filter((g) => g.rsvp_status === 'confirmed').length;
  const totalAttended = guests.filter((g) => g.attended).length;

  return (
    <div className="checkin-page">
      <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}`)}>
        ← Volver al evento
      </button>

      <div className="checkin-header">
        <h1>Check-in</h1>
        <p className="checkin-subtitle">
          Registra la asistencia de los invitados · {totalAttended} de {totalConfirmed} confirmados ingresaron
        </p>
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
        <div className={`checkin-message checkin-message-${message.type}`} role="status">
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

      {loading && guests.length === 0 ? (
        <Loading text="Cargando invitados..." />
      ) : error ? (
        <div className="checkin-error">{error}</div>
      ) : (
        <>
          <section className="checkin-group">
            <h2 className="checkin-group-title">Por ingresar ({toCheckIn.length})</h2>
            {toCheckIn.length === 0 ? (
              <div className="checkin-empty">
                {query ? 'Ningún invitado confirmado coincide con la búsqueda.' : 'No quedan invitados confirmados por ingresar.'}
              </div>
            ) : (
              <div className="checkin-guest-list">
                {toCheckIn.map((guest) => (
                  <GuestCard
                    key={guest.id}
                    guest={guest}
                    action={(
                      <button
                        className="btn btn-primary checkin-btn"
                        onClick={() => checkIn(guest.qr_hash)}
                        disabled={checkingIn}
                      >
                        Registrar
                      </button>
                    )}
                  />
                ))}
              </div>
            )}
          </section>

          {unconfirmed.length > 0 && (
            <section className="checkin-group">
              <h2 className="checkin-group-title">Sin confirmar ({unconfirmed.length})</h2>
              <p className="checkin-group-hint">
                Para registrar su ingreso, primero marcalos como confirmados en la lista de invitados.
              </p>
              <div className="checkin-guest-list">
                {unconfirmed.map((guest) => (
                  <GuestCard
                    key={guest.id}
                    guest={guest}
                    action={(
                      <button className="btn btn-secondary checkin-btn" disabled>
                        No confirmado
                      </button>
                    )}
                  />
                ))}
              </div>
            </section>
          )}

          {attended.length > 0 && (
            <section className="checkin-group">
              <h2 className="checkin-group-title">Ya ingresaron ({attended.length})</h2>
              <div className="checkin-guest-list">
                {attended.map((guest) => (
                  <GuestCard
                    key={guest.id}
                    guest={guest}
                    action={<span className="checkin-done">✓ Ingresó</span>}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
