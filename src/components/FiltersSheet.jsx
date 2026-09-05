import { useEffect, useState } from 'react';
import { Sheet } from './Sheet.jsx';
import { Segmented } from './Chips.jsx';
import {
  DEAL_TYPES,
  EMPTY_FILTERS,
  ROOM_OPTIONS,
  activeCities,
  districtsOf,
} from '../lib/schema.js';
import { haptic } from '../lib/telegram.js';

function Row({ label, children }) {
  return (
    <div className="border-t border-separator px-4 py-3 first:border-t-0">
      <div className="pb-2 text-caption text-label-2">{label}</div>
      {children}
    </div>
  );
}

function OptionGrid({ options, value, onChange, allLabel = 'Любой' }) {
  const all = [{ id: '', label: allLabel }, ...options];
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((option) => {
        const active = String(option.id) === String(value);
        return (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => {
              haptic('select');
              onChange(option.id);
            }}
            className={`rounded-full px-3.5 py-1.5 text-[15px] leading-5 ${
              active ? 'bg-accent text-white' : 'bg-fill text-label'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PriceInput({ value, onChange, placeholder }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      value={value || ''}
      placeholder={placeholder}
      onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      className="nums w-full rounded-[9px] bg-fill px-3 py-2 text-body text-label outline-none placeholder:text-label-3 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

/** Шторка работает с копией: отмена не должна менять текущие фильтры. */
export function FiltersSheet({ open, onClose, filters, onApply, total }) {
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const patch = (fields) => setDraft((prev) => ({ ...prev, ...fields }));

  const districts = districtsOf(draft.city).map((d) => ({ id: d.id, label: d.label }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Фильтры"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setDraft({ ...EMPTY_FILTERS, city: draft.city, q: draft.q });
            }}
            className="flex-1 rounded-[10px] bg-fill py-3 text-body font-medium text-label active:opacity-60"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onApply(draft);
            }}
            className="flex-[1.4] rounded-[10px] bg-accent py-3 text-body font-medium text-white active:opacity-80"
          >
            Показать
          </button>
        </div>
      }
    >
      <div className="p-4">
        <div className="overflow-hidden rounded-[10px] bg-card">
          <Row label="Тип сделки">
            <Segmented
              options={DEAL_TYPES}
              value={draft.deal}
              onChange={(deal) => patch({ deal })}
            />
          </Row>

          <Row label="Город">
            <OptionGrid
              options={activeCities()}
              value={draft.city}
              allLabel="Все"
              onChange={(city) =>
                // Районы у городов разные — при смене города выбор района теряет смысл.
                patch({ city: city || draft.city, district: '' })
              }
            />
          </Row>

          <Row label="Район">
            <OptionGrid
              options={districts}
              value={draft.district}
              onChange={(district) => patch({ district })}
            />
          </Row>

          <Row label="Комнаты">
            <OptionGrid
              options={ROOM_OPTIONS}
              value={draft.rooms || ''}
              onChange={(rooms) => patch({ rooms: Number(rooms) || 0 })}
            />
          </Row>

          <Row label={draft.deal === 'sale' ? 'Цена, SAR' : 'Цена за год, SAR'}>
            <div className="flex items-center gap-2">
              <PriceInput value={draft.priceMin} placeholder="от" onChange={(priceMin) => patch({ priceMin })} />
              <span className="text-label-3">—</span>
              <PriceInput value={draft.priceMax} placeholder="до" onChange={(priceMax) => patch({ priceMax })} />
            </div>
          </Row>
        </div>

        {typeof total === 'number' ? (
          <p className="nums px-1 pt-2 text-caption text-label-3">
            Сейчас в ленте: {total}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
