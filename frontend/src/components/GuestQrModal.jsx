import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import './GuestQrModal.css';

/**
 * Muestra el codigo QR de la invitacion de un invitado, para descargarlo,
 * imprimirlo o copiar el codigo. Es el mismo codigo que se usa en el check-in.
 */
export default function GuestQrModal({ guest, eventTitle, onClose }) {
  const [qrImage, setQrImage] = useState('');
  const [copied, setCopied] = useState(false);
  const fullName = `${guest.first_name} ${guest.last_name}`.trim();

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(guest.qr_hash, { width: 320, margin: 2 })
      .then((url) => { if (!cancelled) setQrImage(url); })
      .catch(() => { if (!cancelled) setQrImage(''); });
    return () => { cancelled = true; };
  }, [guest.qr_hash]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 'Juan Díaz' -> 'qr-juan-diaz.png' (sin acentos ni espacios)
  const slug = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fileName = `qr-${slug || guest.id}.png`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guest.qr_hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) return;
    const escape = (text) => String(text || '').replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
    win.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Invitación - ${escape(fullName)}</title>
<style>
  body { font-family: Arial, sans-serif; text-align: center; padding: 32px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; font-weight: normal; margin: 0 0 24px; color: #444; }
  img { width: 280px; height: 280px; }
  code { display: block; margin-top: 16px; font-size: 13px; letter-spacing: 1px; }
  p { font-size: 13px; color: #555; }
</style></head>
<body>
  <h1>${escape(eventTitle)}</h1>
  <h2>${escape(fullName)}</h2>
  <img src="${qrImage}" alt="Código QR">
  <code>${escape(guest.qr_hash)}</code>
  <p>Presentá este código al ingresar al evento.</p>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`);
    win.document.close();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Código QR de la invitación</h2>
        <p className="qr-guest-name">{fullName}</p>
        {eventTitle && <p className="qr-event-title">{eventTitle}</p>}

        <div className="qr-image-box">
          {qrImage ? (
            <img src={qrImage} alt={`Código QR de ${fullName}`} className="qr-image" />
          ) : (
            <span className="qr-loading">Generando código...</span>
          )}
        </div>

        <div className="qr-code-text">
          <code>{guest.qr_hash}</code>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleCopy}>
            {copied ? 'Copiado ✓' : 'Copiar'}
          </button>
        </div>

        {guest.rsvp_status !== 'confirmed' && (
          <p className="qr-warning">
            Este invitado todavía no confirmó asistencia: el check-in solo funciona con invitados confirmados.
          </p>
        )}

        <div className="form-actions qr-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="btn btn-secondary" onClick={handlePrint} disabled={!qrImage}>
            Imprimir
          </button>
          <a
            className={`btn btn-primary${qrImage ? '' : ' disabled'}`}
            href={qrImage || undefined}
            download={fileName}
          >
            Descargar PNG
          </a>
        </div>
      </div>
    </div>
  );
}
