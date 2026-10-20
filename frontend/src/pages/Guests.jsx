import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { PAGE_SIZE } from '../constants';
import { guestService } from '../services/guestService';
import { eventService } from '../services/eventService';
import Loading from '../components/Loading';
import GuestQrModal from '../components/GuestQrModal';
import DownloadButton from '../components/DownloadButton';
import { apiErrorMessage } from '../utils/format';
import './Guests.css';

const RSVP_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
};

const RSVP_COLORS = {
  pending: '#f59e0b',
  confirmed: '#22c55e',
  rejected: '#ef4444',
};

// '2026-10-20T15:40:00Z' -> '20/10 12:40'
function formatSentAt(value) {
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
}

const INITIAL_GUEST = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
};

export default function Guests() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [guestForm, setGuestForm] = useState(INITIAL_GUEST);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const [qrGuest, setQrGuest] = useState(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStatus, setEventStatus] = useState('');

  // Envio de invitaciones por correo
  const [notInvited, setNotInvited] = useState(0);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    eventService.retrieve(id)
      .then(({ data }) => {
        // Los invitados los gestiona el organizador; el colaborador vuelve al evento
        if (data.my_role === 'collaborator') {
          navigate(`/events/${id}`, { replace: true });
          return;
        }
        setEventTitle(data.title);
        setEventStatus(data.status);
      })
      .catch(() => setEventTitle(''));
  }, [id, navigate]);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadGuests = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { event: id, page: currentPage, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      const { data } = await guestService.list(params);
      setGuests(data.results || data);
      setTotal(data.count || 0);
      setTotalPages(data.total_pages || Math.ceil((data.count || 0) / PAGE_SIZE) || 1);
      // Cuantos faltan recibir la invitacion, en todo el evento (no solo esta pagina)
      const pending = await guestService.list({ event: id, not_invited: 'true', page_size: 1 });
      setNotInvited(pending.data.count || 0);
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
  }, [id, search, currentPage]);

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) newParams.set(key, value);
      else newParams.delete(key);
    });
    setSearchParams(newParams);
  };

  const openCreateModal = () => {
    setEditingGuest(null);
    setGuestForm(INITIAL_GUEST);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (guest) => {
    setEditingGuest(guest);
    setGuestForm({
      first_name: guest.first_name,
      last_name: guest.last_name,
      email: guest.email,
      phone: guest.phone || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleGuestChange = (e) => {
    setGuestForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (formErrors[e.target.name]) {
      setFormErrors((prev) => ({ ...prev, [e.target.name]: '' }));
    }
  };

  const validateGuest = () => {
    const errs = {};
    if (!guestForm.first_name.trim()) errs.first_name = 'Obligatorio.';
    if (!guestForm.last_name.trim()) errs.last_name = 'Obligatorio.';
    if (!guestForm.email.trim()) errs.email = 'Obligatorio.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    if (!validateGuest()) return;

    setSaving(true);
    try {
      const payload = { ...guestForm, event: Number(id) };
      if (editingGuest) {
        await guestService.update(editingGuest.id, payload);
      } else {
        await guestService.create(payload);
      }
      setModalOpen(false);
      loadGuests();
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const fieldErrors = {};
        let hasField = false;
        for (const [key, msgs] of Object.entries(data)) {
          if (Array.isArray(msgs) && msgs.length > 0) {
            fieldErrors[key] = msgs[0];
            hasField = true;
          }
        }
        if (hasField) {
          setFormErrors(fieldErrors);
          return;
        }
        setFormErrors({ email: data.detail || data.email?.[0] || 'Error al guardar.' });
        return;
      }
      setFormErrors({ email: 'Error al guardar el invitado.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (guestId) => {
    if (!window.confirm('¿Eliminar este invitado?')) return;
    try {
      await guestService.destroy(guestId);
      loadGuests();
    } catch {
      alert('Error al eliminar invitado.');
    }
  };

  const handleRsvp = async (guestId, status) => {
    try {
      await guestService.changeRsvp(guestId, status);
      loadGuests();
    } catch (err) {
      alert(apiErrorMessage(err, 'Error al cambiar estado RSVP.'));
      loadGuests();
    }
  };

  const handleSendPending = async () => {
    setSendingAll(true);
    setNotice(null);
    try {
      const { data } = await guestService.sendPending(Number(id));
      const plural = data.sent === 1 ? '' : 'es';
      let text = data.sent > 0
        ? `✓ Se enviaron ${data.sent} invitacion${plural} por correo.`
        : 'Todos los invitados ya tienen su invitación.';
      if (data.failed > 0) text += ` ${data.failed} no se pudieron enviar; probá de nuevo más tarde.`;
      setNotice({ type: data.failed > 0 ? 'warning' : 'success', text });
      loadGuests();
    } catch (err) {
      setNotice({ type: 'error', text: apiErrorMessage(err, 'No se pudieron enviar las invitaciones.') });
    } finally {
      setSendingAll(false);
    }
  };

  const handleSendOne = async (guest) => {
    if (guest.invited_at && !window.confirm(`¿Reenviar la invitación a ${guest.email}?`)) return;
    setSendingId(guest.id);
    setNotice(null);
    try {
      await guestService.sendInvitation(guest.id);
      setNotice({ type: 'success', text: `✓ Invitación enviada a ${guest.email}.` });
      loadGuests();
    } catch (err) {
      setNotice({ type: 'error', text: apiErrorMessage(err, 'No se pudo enviar la invitación.') });
    } finally {
      setSendingId(null);
    }
  };

  const handleBulkImport = async () => {
    const lines = bulkData.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return;

    const guests = lines.map((line) => {
      const parts = line.split(',').map((s) => s.trim());
      const [first_name, last_name, email, phone = ''] = parts;
      return { first_name, last_name, email, phone };
    });

    setBulkSaving(true);
    setBulkResult(null);
    try {
      const { data } = await guestService.create({
        event: Number(id),
        guests,
      });
      setBulkResult(data);
      if (data.created) {
        setBulkData('');
      }
      loadGuests();
    } catch {
      setBulkResult({ errors: [{ message: 'Error al importar invitados.' }] });
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="guests-page">
      <button className="btn btn-secondary" onClick={() => navigate(`/events/${id}`)}>
        ← Volver al evento
      </button>

      <div className="guests-header">
        <div>
          <h1>Invitados</h1>
          <p className="guests-count">{total} invitado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="guests-actions">
          <DownloadButton
            url="/invitations/export/"
            params={{ event: id }}
            fallbackName="invitados.xlsx"
          />
          <button className="btn btn-secondary" onClick={() => setBulkModalOpen(true)}>
            Importar CSV
          </button>
          <button className="btn btn-primary" onClick={openCreateModal}>
            + Añadir Invitado
          </button>
        </div>
      </div>

      <div className="guests-invite-bar">
        <button
          className="btn btn-primary"
          onClick={handleSendPending}
          disabled={sendingAll || eventStatus !== 'active' || notInvited === 0}
        >
          {sendingAll ? 'Enviando...' : `✉️ Enviar invitaciones${notInvited > 0 ? ` (${notInvited} sin enviar)` : ''}`}
        </button>
        <span className="guests-invite-hint">
          {eventStatus === 'draft' && 'Activá el evento para poder enviar las invitaciones.'}
          {eventStatus === 'finished' && 'El evento ya finalizó.'}
          {eventStatus === 'active' && notInvited === 0 && total > 0 && 'Todos los invitados ya recibieron su invitación.'}
          {eventStatus === 'active' && notInvited > 0 && 'Cada invitado recibe su código QR y un enlace para confirmar.'}
        </span>
      </div>

      {notice && (
        <div className={`guests-notice guests-notice-${notice.type}`} role="status">{notice.text}</div>
      )}

      <div className="guests-filters">
        <input
          type="text"
          className="input"
          placeholder="Buscar invitados..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); updateParams({ page: '' }); }}
        />
      </div>

      {loading ? (
        <Loading text="Cargando invitados..." />
      ) : error ? (
        <div className="guests-error">{error}</div>
      ) : guests.length === 0 ? (
        <div className="guests-empty">
          <p>{search ? 'No se encontraron invitados.' : 'No hay invitados en este evento.'}</p>
          {!search && (
            <button className="btn btn-primary" onClick={openCreateModal}>
              Añadir primer invitado
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="guests-table-wrapper">
            <table className="guests-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Contacto</th>
                  <th>Invitación</th>
                  <th>RSVP</th>
                  <th>Asistió</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.id}>
                    <td className="guest-name">{guest.first_name} {guest.last_name}</td>
                    <td className="guest-contact">
                      {/* Si no entra, que el correo se corte despues de la @ */}
                      {guest.email.split('@')[0]}@<wbr />{guest.email.split('@').slice(1).join('@')}
                      {guest.phone && <span className="guest-phone">{guest.phone}</span>}
                    </td>
                    <td className="guest-invite-cell">
                      {guest.invited_at
                        ? (
                          <span title="Fecha del último envío">
                            Enviada
                            <span className="guest-invite-date">{formatSentAt(guest.invited_at)}</span>
                          </span>
                        )
                        : <span className="guest-invite-none">Sin enviar</span>}
                    </td>
                    <td>
                      <span
                        className="rsvp-badge"
                        style={{ background: RSVP_COLORS[guest.rsvp_status] }}
                      >
                        {RSVP_LABELS[guest.rsvp_status]}
                      </span>
                      {guest.responded_at && (
                        <span className="guest-responded" title={`Respondió el ${formatSentAt(guest.responded_at)}`}>
                          por el invitado
                        </span>
                      )}
                    </td>
                    <td>{guest.attended ? '✅' : '—'}</td>
                    <td>
                      <div className="guest-actions-cell">
                        <select
                          className="rsvp-select"
                          value={guest.rsvp_status}
                          onChange={(e) => handleRsvp(guest.id, e.target.value)}
                        >
                          <option value="pending">Pendiente</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="rejected">Rechazado</option>
                        </select>
                        <button
                          className="btn-icon"
                          onClick={() => handleSendOne(guest)}
                          disabled={eventStatus !== 'active' || guest.attended || sendingId === guest.id}
                          title={guest.invited_at ? 'Reenviar invitación por correo' : 'Enviar invitación por correo'}
                          aria-label={`${guest.invited_at ? 'Reenviar' : 'Enviar'} invitación a ${guest.first_name}`}
                        >
                          {sendingId === guest.id ? '⏳' : '✉️'}
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => setQrGuest(guest)}
                          title="Ver código QR"
                          aria-label={`Ver código QR de ${guest.first_name}`}
                        >
                          🔳
                        </button>
                        <button className="btn-icon" onClick={() => openEditModal(guest)} title="Editar">
                          ✏️
                        </button>
                        <button className="btn-icon" onClick={() => handleDelete(guest.id)} title="Eliminar">
                          🗑️
                        </button>
                      </div>
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

      {qrGuest && (
        <GuestQrModal
          guest={qrGuest}
          eventTitle={eventTitle}
          onClose={() => setQrGuest(null)}
        />
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingGuest ? 'Editar Invitado' : 'Añadir Invitado'}</h2>

            <form onSubmit={handleGuestSubmit} noValidate>
              <div className="form-row">
                <div className="form-group">
                  <label>Nombres</label>
                  <input
                    name="first_name"
                    value={guestForm.first_name}
                    onChange={handleGuestChange}
                    className={formErrors.first_name ? 'input-error' : ''}
                  />
                  {formErrors.first_name && <p className="error-text">{formErrors.first_name}</p>}
                </div>
                <div className="form-group">
                  <label>Apellidos</label>
                  <input
                    name="last_name"
                    value={guestForm.last_name}
                    onChange={handleGuestChange}
                    className={formErrors.last_name ? 'input-error' : ''}
                  />
                  {formErrors.last_name && <p className="error-text">{formErrors.last_name}</p>}
                </div>
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  name="email"
                  type="email"
                  value={guestForm.email}
                  onChange={handleGuestChange}
                  className={formErrors.email ? 'input-error' : ''}
                />
                {formErrors.email && <p className="error-text">{formErrors.email}</p>}
              </div>

              <div className="form-group">
                <label>Teléfono</label>
                <input
                  name="phone"
                  type="tel"
                  value={guestForm.phone}
                  onChange={handleGuestChange}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : editingGuest ? 'Guardar Cambios' : 'Añadir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkModalOpen && (
        <div className="modal-overlay" onClick={() => { setBulkModalOpen(false); setBulkResult(null); }}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Importar invitados (CSV)</h2>
            <p className="bulk-hint">
              Ingresa un invitado por línea: <code>nombre,apellido,email</code> o <code>nombre,apellido,email,teléfono</code>
            </p>

            <textarea
              className="bulk-textarea"
              rows={8}
              placeholder={`Juan,Pérez,juan@email.com,+56912345678\nMaría,García,maria@email.com`}
              value={bulkData}
              onChange={(e) => setBulkData(e.target.value)}
            />

            {bulkResult && (
              <div className="bulk-result">
                {bulkResult.created && (
                  <p className="bulk-success">{bulkResult.created.length} invitados creados.</p>
                )}
                {bulkResult.errors && bulkResult.errors.length > 0 && (
                  <div className="bulk-errors">
                    {bulkResult.errors.map((e, i) => (
                      <p key={i} className="error-text">
                        {typeof e === 'string' ? e : `Error en línea ${e.index + 1}: ${Object.values(e.errors || {}).join(', ')}`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setBulkModalOpen(false); setBulkResult(null); }}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBulkImport}
                disabled={bulkSaving || !bulkData.trim()}
              >
                {bulkSaving ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
