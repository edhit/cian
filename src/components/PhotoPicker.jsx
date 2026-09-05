import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Photo } from './Photo.jsx';
import { uploadPhoto } from '../lib/api.js';
import { preparePhoto } from '../lib/image.js';
import { haptic } from '../lib/telegram.js';

const REASONS = {
  unauthorized: 'Telegram не подтвердил, кто вы',
  'too-large': 'Файл слишком большой',
  'bad-type': 'Такой формат не принимается',
  'too-many': 'Слишком много загрузок за час',
  network: 'Не удалось связаться с сервером',
  server: 'Сервер не принял файл',
  'no-backend': 'Загрузка пока не подключена',
};

/** Фотографии загружаются сразу при выборе: в заявку попадают уже готовые ссылки. */
export function PhotoPicker({ urls, onChange, max = 10 }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(0);
  const [failed, setFailed] = useState('');

  const pick = async (event) => {
    const files = [...event.target.files].slice(0, max - urls.length);
    // Один и тот же файл иначе не выбрать повторно.
    event.target.value = '';
    if (files.length === 0) return;

    setFailed('');
    setBusy((n) => n + files.length);

    for (const file of files) {
      try {
        const prepared = await preparePhoto(file);
        const result = await uploadPhoto(prepared);
        if (result.ok) {
          onChange((current) => [...current, result.url].slice(0, max));
        } else {
          setFailed(REASONS[result.reason] || REASONS.server);
        }
      } catch {
        setFailed('Не получилось прочитать файл');
      } finally {
        setBusy((n) => Math.max(0, n - 1));
      }
    }
    haptic('light');
  };

  const remove = (url) => {
    haptic('light');
    onChange((current) => current.filter((item) => item !== url));
  };

  const full = urls.length >= max;

  return (
    <div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {urls.map((url) => (
          <div key={url} className="relative w-24 shrink-0">
            <Photo src={url} className="w-full" ratio="1 / 1" />
            <button
              type="button"
              aria-label="Убрать фотографию"
              onClick={() => remove(url)}
              className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-label text-card"
            >
              <X size={13} strokeWidth={3} />
            </button>
          </div>
        ))}

        {Array.from({ length: busy }, (_, index) => (
          <div key={`busy-${index}`} className="skeleton size-24 shrink-0 rounded-[8px]" />
        ))}

        {!full ? (
          <button
            type="button"
            onClick={() => input.current && input.current.click()}
            className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-[8px] bg-fill text-label-2 active:opacity-60"
          >
            <ImagePlus size={22} strokeWidth={1.5} />
            <span className="text-caption">Добавить</span>
          </button>
        ) : null}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={pick}
        className="hidden"
      />

      {failed ? <p className="pt-2 text-caption text-danger">{failed}</p> : null}
      <p className="pt-2 text-caption text-label-3">
        До {max} фотографий. Снимки уменьшаются перед отправкой, чтобы загрузка не отваливалась
        на мобильном интернете.
      </p>
    </div>
  );
}
