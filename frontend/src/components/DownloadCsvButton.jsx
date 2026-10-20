import { useState } from 'react';
import api from '../services/api';
import './DownloadCsvButton.css';

// 'attachment; filename="gastos-asado-2026-10-20.csv"' -> 'gastos-asado-2026-10-20.csv'
function fileNameFrom(disposition, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || '');
  return match ? match[1] : fallback;
}

// Con responseType 'blob', el error de la API tambien llega como Blob
async function blobErrorMessage(err) {
  try {
    const data = JSON.parse(await err.response.data.text());
    return data.detail || data.error || null;
  } catch {
    return null;
  }
}

/**
 * Boton que descarga un CSV generado por la API. La descarga pasa por el
 * cliente de la API para enviar el token: un enlace comun no lo enviaria.
 */
export default function DownloadCsvButton({ url, params, fallbackName = 'reporte.csv', label = 'Descargar CSV' }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setDownloading(true);
    setError('');
    try {
      const response = await api.get(url, { params, responseType: 'blob' });
      const name = fileNameFrom(response.headers['content-disposition'], fallbackName);
      const href = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (err) {
      setError((await blobErrorMessage(err)) || 'No se pudo descargar el archivo.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className="download-csv">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleClick}
        disabled={downloading}
        title="Archivo para abrir en Excel"
      >
        {downloading ? 'Descargando...' : `⬇️ ${label}`}
      </button>
      {error && <span className="download-csv-error" role="alert">{error}</span>}
    </span>
  );
}
