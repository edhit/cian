import { Check } from 'lucide-react';
import { Sheet, useSheet } from './Sheet.jsx';
import { activeCities } from '../lib/schema.js';

function CityRow({ city, counts, selected, onSelect }) {
  const close = useSheet();
  // counts === null — режим Worker, посчитать нечем: молчим, а не врём.
  const count = counts ? counts[city.id] || 0 : null;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(city.id);
        close();
      }}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-label">{city.label}</span>
        {count === 0 ? (
          <span className="block text-caption text-label-3">пока нет объявлений</span>
        ) : null}
      </span>
      {selected ? <Check size={20} className="shrink-0 text-accent" /> : null}
    </button>
  );
}

export function CitySheet({ open, onClose, city, counts, onSelect }) {
  return (
    <Sheet open={open} onClose={onClose} title="Город">
      <div className="p-4">
        <div className="overflow-hidden rounded-[10px] bg-card">
          {activeCities().map((item, index) => (
            <div key={item.id} className={index > 0 ? 'border-t border-separator' : ''}>
              <CityRow city={item} counts={counts} selected={item.id === city} onSelect={onSelect} />
            </div>
          ))}
        </div>
        <p className="px-1 pt-2 text-caption text-label-3">
          Выбранный город запоминается и переезжает вместе с аккаунтом Telegram.
        </p>
      </div>
    </Sheet>
  );
}
