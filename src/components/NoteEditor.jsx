import { Star } from 'lucide-react';
import { NOTE_MAX_LENGTH } from '../lib/storage.js';
import { haptic } from '../lib/telegram.js';

function Rating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`Оценка ${star} из 5`}
          aria-pressed={star <= value}
          onClick={() => {
            haptic('select');
            // Повторное нажатие по текущей оценке снимает её.
            onChange(star === value ? 0 : star);
          }}
          className="p-1 active:opacity-60"
        >
          <Star
            size={24}
            strokeWidth={1.75}
            className={star <= value ? 'fill-warning text-warning' : 'text-label-3'}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Заметка живёт только у человека: ни на сервер, ни в объявление она не уходит.
 * Смысл — вернуться к отобранным вариантам через неделю и вспомнить, что где не так.
 */
export function NoteEditor({ note, onChange }) {
  return (
    <section>
      <h3 className="px-1 pb-1.5 text-caption text-label-2">Ваша заметка</h3>
      <div className="overflow-hidden rounded-[10px] bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-[15px] leading-5 text-label-2">Оценка</span>
          <Rating value={note.rating} onChange={(rating) => onChange({ rating })} />
        </div>

        <div className="border-t border-separator px-4 py-3">
          <textarea
            value={note.text}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            placeholder="Что заметили при осмотре: шум, состояние, что обещал хозяин"
            onChange={(event) => onChange({ text: event.target.value })}
            className="w-full resize-none bg-transparent text-body text-label outline-none placeholder:text-label-3"
          />
          <div className="nums pt-1 text-right text-caption text-label-3">
            {note.text.length} из {NOTE_MAX_LENGTH}
          </div>
        </div>
      </div>
      <p className="px-1 pt-2 text-caption text-label-3">
        Видно только вам. Хранится в вашем аккаунте Telegram и попадает в сравнение.
      </p>
    </section>
  );
}
