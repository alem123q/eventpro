import jsQR from 'jsqr';

/** Busca un codigo QR en una imagen ya dibujada en el canvas. */
export function decodeCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, width, height);
  const found = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  return found?.data?.trim() || null;
}

/**
 * Recorta una region de la imagen, la lleva a un tamano comodo para jsQR y
 * busca el codigo. Al achicar con suavizado se atenua el "moire" que aparece
 * al fotografiar una pantalla.
 */
function decodeRegion(bitmap, canvas, sx, sy, sw, sh, targetMax) {
  const scale = Math.min(1.5, targetMax / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data?.trim() || null;
}

async function decodeWithNativeDetector(bitmap) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('qr_code')) return null;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue?.trim() || null;
  } catch {
    return null;
  }
}

// Tiempo maximo buscando el codigo en una foto. Los primeros intentos (los
// que resuelven casi todas las fotos) caben de sobra; el limite evita que una
// imagen muy "ruidosa" deje la pagina trabada.
const PHOTO_TIME_BUDGET_MS = 4000;

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Lee un codigo QR desde un archivo de imagen. Pensado para fotos tomadas
 * con el celular, donde el codigo puede ocupar una parte chica de la foto o
 * estar fotografiado desde una pantalla. Prueba varias estrategias, de la
 * mas rapida a la mas costosa, y devuelve la primera lectura.
 */
export async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const native = await decodeWithNativeDetector(bitmap);
    if (native) return native;

    const W = bitmap.width;
    const H = bitmap.height;
    const canvas = document.createElement('canvas');
    const attempts = [];

    // 1) La foto completa a distintos tamanos
    for (const size of [1200, 800]) attempts.push([0, 0, W, H, size]);

    // 2) Recortes centrados: el QR suele estar donde se apunto la camara
    for (const frac of [0.6, 0.4, 0.28]) {
      const sw = W * frac;
      const sh = H * frac;
      for (const size of [900, 600]) attempts.push([(W - sw) / 2, (H - sh) / 2, sw, sh, size]);
    }

    // 3) Una grilla de recortes superpuestos, por si el QR no quedo centrado
    const frac = 0.5;
    for (const fx of [0, 0.25, 0.5]) {
      for (const fy of [0, 0.25, 0.5]) attempts.push([W * fx, H * fy, W * frac, H * frac, 800]);
    }

    // 4) Ultimo recurso: la foto completa en alta resolucion
    attempts.push([0, 0, W, H, 1800]);

    const start = performance.now();
    for (const [sx, sy, sw, sh, size] of attempts) {
      if (performance.now() - start > PHOTO_TIME_BUDGET_MS) break;
      const code = decodeRegion(bitmap, canvas, sx, sy, sw, sh, size);
      if (code) return code;
      await nextFrame(); // deja que la pagina siga respondiendo
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}
