import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { publicInvitationService } from '../services/publicInvitationService';
import { apiErrorMessage, mediaUrl, parseEventDate } from '../utils/format';
import './InvitationPage.css';

const STATUS_TEXT = {
  pending: 'Todavía no respondiste.',
  confirmed: '✓ Confirmaste tu asistencia.',
  rejected: 'Respondiste que no vas a poder ir.',
};

function formatDate(value) {
  const date = parseEventDate(value);
  if (!date) return '';
  const text = date.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Pagina publica a la que llega el invitado desde el correo
 * (/invitacion/<codigo>). No necesita cuenta. Permite confirmar o rechazar la
 * asistencia y, una vez confirmada, muestra el codigo QR para la entrada.
 */
export default function InvitationPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  // El boton que se toco en el correo. No se responde solo al abrir la
  // pagina: algunos programas de correo abren los enlaces para revisarlos.
  const suggested = { si: 'confirmed', no: 'rejected' }[searchParams.get('respuesta')];

  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [qrImage, setQrImage] = useState('');

  useEffect(() => {
    let cancelled = false;
    publicInvitationService.get(code)
      .then(({ data }) => { if (!cancelled) setInvitation(data); })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.status === 404
          ? 'No encontramos esta invitación. Revisá que el enlace esté completo.'
          : apiErrorMessage(err, 'No se pudo cargar la invitación.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  const qrCode = invitation?.qr_code;
  useEffect(() => {
    if (!qrCode) return undefined;
    let cancelled = false;
    QRCode.toDataURL(qrCode, { width: 320, margin: 2 })
      .then((url) => { if (!cancelled) setQrImage(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [qrCode]);

  const respond = async (status) => {
    setSaving(true);
    setActionError('');
    try {
      const { data } = await publicInvitationService.respond(code, status);
      setInvitation(data);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'No se pudo guardar tu respuesta. Probá de nuevo.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="invite-page">
        <div className="invite-card invite-card-message">Cargando invitación...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-card invite-card-message" role="alert">
          <h1>Invitación no disponible</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const { event } = invitation;
  const status = invitation.rsvp_status;
  const image = mediaUrl(event.image);
  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null;
  const pendingSuggestion = invitation.can_respond && suggested && suggested !== status;

  return (
    <div className="invite-page">
      <article className="invite-card">
        {image && <img className="invite-image" src={image} alt="" />}

        <div className="invite-body">
          <p className="invite-greeting">
            Hola {invitation.first_name}, <strong>{event.organizer_name}</strong> te invita a:
          </p>
          <h1 className="invite-title">{event.title}</h1>

          <ul className="invite-details">
            <li>
              <span aria-hidden="true">📅</span>
              {formatDate(event.event_date)}
              {event.event_time && ` · ${event.event_time.slice(0, 5)} h`}
            </li>
            {event.location && (
              <li>
                <span aria-hidden="true">📍</span>
                <a href={mapsUrl} target="_blank" rel="noreferrer">{event.location}</a>
              </li>
            )}
          </ul>

          {event.description && <p className="invite-description">{event.description}</p>}

          <section className="invite-rsvp" aria-labelledby="rsvp-title">
            <h2 id="rsvp-title">¿Vas a poder ir?</h2>
            <p className={`invite-status invite-status-${status}`}>{STATUS_TEXT[status]}</p>

            {invitation.can_respond ? (
              <>
                {pendingSuggestion && (
                  <p className="invite-hint">
                    Tocá el botón para {suggested === 'confirmed' ? 'confirmar tu asistencia' : 'avisar que no vas'}.
                  </p>
                )}
                <div className="invite-buttons">
                  <button
                    type="button"
                    className={`btn invite-btn-yes ${suggested === 'confirmed' ? 'invite-btn-suggested' : ''}`}
                    onClick={() => respond('confirmed')}
                    disabled={saving || status === 'confirmed'}
                  >
                    {status === 'confirmed' ? '✓ Confirmado' : 'Confirmo asistencia'}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-secondary ${suggested === 'rejected' ? 'invite-btn-suggested' : ''}`}
                    onClick={() => respond('rejected')}
                    disabled={saving || status === 'rejected'}
                  >
                    {status === 'rejected' ? 'No voy' : 'No voy a poder ir'}
                  </button>
                </div>
                {status !== 'pending' && (
                  <p className="invite-note">Si cambiás de idea, podés cambiar tu respuesta desde esta misma página.</p>
                )}
              </>
            ) : (
              <p className="invite-closed">{invitation.closed_reason}</p>
            )}
            {actionError && <p className="invite-error" role="alert">{actionError}</p>}
          </section>

          {invitation.qr_code && (
            <section className="invite-qr" aria-labelledby="qr-title">
              <h2 id="qr-title">{invitation.attended ? 'Ya ingresaste al evento' : 'Tu código de ingreso'}</h2>
              {!invitation.attended && <p>Mostralo en la entrada del evento.</p>}
              {qrImage && <img src={qrImage} alt="Código QR de ingreso" width="240" height="240" />}
              <code>{invitation.qr_code}</code>
              {qrImage && !invitation.attended && (
                <a className="btn btn-secondary" href={qrImage} download="codigo-ingreso.png">
                  Descargar código
                </a>
              )}
            </section>
          )}
        </div>
      </article>
      <p className="invite-footer">EventPro</p>
    </div>
  );
}
