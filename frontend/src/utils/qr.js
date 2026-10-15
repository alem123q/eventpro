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
 * busca el codigo. La reduccion se hace de a mitades: asi se promedian los
 * pixeles y se borra el "moire" o la grilla del monitor que aparecen al
 * fotografiar una pantalla (reducir de un solo paso los deja visibles).
 */
function decodeRegion(bitmap, canvas, sx, sy, sw, sh, targetMax) {
  const scale = Math.min(1.5, targetMax / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  let source = bitmap;
  let srcRect = [sx, sy, sw, sh];
  let curW = sw;
  let curH = sh;
  while (curW / 2 >= width && curH / 2 >= height) {
    curW = Math.round(curW / 2);
    curH = Math.round(curH / 2);
    const step = document.createElement('canvas');
    step.width = curW;
    step.height = curH;
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(source, ...srcRect, 0, 0, curW, curH);
    source = step;
    srcRect = [0, 0, curW, curH];
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, ...srcRect, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const found = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (found?.data) return found.data.trim();
  // Segundo intento: blanco y negro puro con umbral automatico (Otsu). Ayuda
  // con fotos de pantalla de bajo contraste o con brillo desparejo.
  binarizeOtsu(data);
  return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data?.trim() || null;
}

/** Convierte la imagen (RGBA) a blanco y negro con el umbral de Otsu. */
function binarizeOtsu(data) {
  const n = data.length / 4;
  const gray = new Uint8Array(n);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < n; i += 1) {
    const g = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000 | 0;
    gray[i] = g;
    hist[g] += 1;
  }
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  for (let i = 0; i < n; i += 1) {
    const v = gray[i] > threshold ? 255 : 0;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v;
  }
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

    // 1) La foto completa a distintos tamanos. Los tamanos chicos sirven
    //    cuando el QR llena la foto: al achicarla se borra la grilla de
    //    pixeles del monitor que aparece al fotografiar una pantalla de cerca.
    for (const size of [600, 1200, 400, 800]) attempts.push([0, 0, W, H, size]);

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
