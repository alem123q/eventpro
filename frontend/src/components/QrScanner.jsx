import { useEffect, useRef, useState } from 'react';
import { decodeCanvas } from '../utils/qr';
import './QrScanner.css';

// Cuanto tiempo se muestra el resultado antes de volver a escanear, y cuanto
// se ignora el mismo codigo para no registrarlo varias veces seguidas.
const RESULT_PAUSE_MS = 2500;
const SAME_CODE_COOLDOWN_MS = 6000;
const SCAN_INTERVAL_MS = 150;

const CAMERA_ERRORS = {
  NotAllowedError: 'No se dio permiso para usar la cámara. Habilitalo desde el ícono del candado en la barra de direcciones y volvé a intentar.',
  NotFoundError: 'No se encontró ninguna cámara en este dispositivo.',
  NotReadableError: 'La cámara está siendo usada por otra aplicación. Cerrala y volvé a intentar.',
  OverconstrainedError: 'No se pudo usar la cámara seleccionada.',
};

/**
 * Escaner de codigos QR con la camara. Queda abierto y sigue escaneando
 * despues de cada lectura, para poder registrar a varios invitados seguidos
 * en la puerta del evento.
 *
 * onDetected(code) debe devolver { type: 'success'|'warning'|'error', text }.
 */
export default function QrScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const camerasRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef({ code: null, at: 0 });
  const onDetectedRef = useRef(onDetected);

  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const [result, setResult] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [cameraIndex, setCameraIndex] = useState(0);

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const scanFrame = async () => {
      const video = videoRef.current;
      if (busyRef.current || !video || video.readyState < 2 || !video.videoWidth) return;
      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      const canvas = canvasRef.current;
      // Se analiza una version reducida del cuadro: alcanza y es mas rapido.
      const scale = Math.min(1, 640 / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, width, height);
      const code = decodeCanvas(canvas, width, height);
      if (!code) return;

      const now = Date.now();
      const last = lastCodeRef.current;
      if (code === last.code && now - last.at < SAME_CODE_COOLDOWN_MS) return;
      lastCodeRef.current = { code, at: now };

      busyRef.current = true;
      navigator.vibrate?.(80);
      setResult({ type: 'info', text: 'Código leído, registrando...' });
      const outcome = await onDetectedRef.current(code);
      if (cancelled) return;
      setResult(outcome);
      setTimeout(() => {
        if (cancelled) return;
        busyRef.current = false;
        setResult(null);
      }, RESULT_PAUSE_MS);
    };

    const start = async () => {
      setStarting(true);
      setError('');
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('La cámara solo funciona si la página se abre desde «localhost» o con HTTPS. Usá «Leer desde una foto» o pegá el código.');
        setStarting(false);
        return;
      }
      try {
        const deviceId = camerasRef.current[cameraIndex]?.deviceId;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        if (camerasRef.current.length === 0) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          camerasRef.current = videoInputs;
          if (!cancelled && videoInputs.length > 1) setCameras(videoInputs);
        }
        timerRef.current = setInterval(scanFrame, SCAN_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setError(CAMERA_ERRORS[err?.name] || 'No se pudo acceder a la cámara.');
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [cameraIndex]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scanner-header">
          <h2>Escanear código QR</h2>
          {cameras.length > 1 && (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setCameraIndex((i) => (i + 1) % cameras.length)}
            >
              Cambiar cámara
            </button>
          )}
        </div>

        {error ? (
          <div className="scanner-error" role="alert">{error}</div>
        ) : (
          <div className="scanner-viewport">
            <video ref={videoRef} className="scanner-video" muted playsInline />
            <div className="scanner-frame" aria-hidden="true" />
            {starting && <div className="scanner-status">Abriendo la cámara...</div>}
            {result && (
              <div className={`scanner-result scanner-result-${result.type}`} role="status">
                {result.text}
              </div>
            )}
          </div>
        )}

        <p className="scanner-hint">
          Apuntá la cámara al código del invitado. Después de cada lectura, el escáner sigue
          abierto para el siguiente.
        </p>

        <div className="form-actions scanner-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Terminar
          </button>
        </div>
      </div>
    </div>
  );
}
