// Подготовка фотографии к отправке. Снимок с телефона весит 5–10 МБ, а Worker
// принимает до пяти: уменьшаем в браузере, иначе загрузка будет отказывать.

const MAX_SIDE = 1600;
const QUALITY = 0.82;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('не изображение'));
    };
    image.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * @returns {Promise<Blob>} уменьшенный снимок либо исходный файл,
 * если уменьшить не вышло, но он и так помещается.
 */
export async function preparePhoto(file) {
  if (!(file instanceof Blob)) throw new Error('не файл');

  try {
    const image = await readImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));

    // Маленький файл нет смысла пережимать — только потеряем качество.
    if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await toBlob(canvas, 'image/jpeg', QUALITY);
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
    if (blob && blob.size < file.size) return blob;
  } catch {
    // Ниже разберёмся по размеру: браузер мог не осилить формат.
  }

  if (file.size > MAX_UPLOAD_BYTES) throw new Error('слишком большой файл');
  return file;
}
