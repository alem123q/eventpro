import jsQR from 'jsqr';

/** Busca un codigo QR en una imagen ya dibujada en el canvas. */
export function decodeCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, width, height);
  const found = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  return found?.data?.trim() || null;
}

/** Lee un codigo QR desde un archivo de imagen (foto tomada con el celular). */
export async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  // Se reduce la imagen: las fotos del celular son muy grandes y el QR se lee igual.
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, width, height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data?.trim() || null;
}
