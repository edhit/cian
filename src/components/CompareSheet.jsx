import { useEffect, useMemo, useState } from 'react';
import { Scale, Sparkles } from 'lucide-react';
import { Sheet } from './Sheet.jsx';
import { Photo } from './Photo.jsx';
import { Segmented } from './Chips.jsx';
import { Toggle } from './Form.jsx';
import { ListSkeleton } from './Skeletons.jsx';
import { getListingsByIds } from '../lib/api.js';
import { MAX_COMPARE, buildComparison, buildVerdict, splitByDeal } from '../lib/compare.js';
import { districtLabel, monthlyRent } from '../lib/schema.js';
import { money, moneyPerMonth } from '../lib/format.js';
import { haptic } from '../lib/telegram.js';

const COLUMN = 'min-w-[132px] w-[132px]';

function Column({ item, onOpen }) {
  const price = item.dealType === 'sale' ? money(item.priceYear) : moneyPerMonth(monthlyRent(item));
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`${COLUMN} shrink-0 px-2 pt-2 pb-3 text-left active:opacity-60`}
    >
      <Photo src={item.photos[0]} alt="" className="w-full" ratio="4 / 3" />
      <span className="nums mt-1.5 block text-[15px] leading-5 font-semibold text-label">{price}</span>
      <span className="block truncate text-caption text-label-2">
        {districtLabel(item.city, item.district) || item.address || '—'}
      </span>
    </button>
  );
}

function chipLabel(item) {
  const place = districtLabel(item.city, item.district) || item.address || 'Без района';
  const price = item.dealType === 'sale' ? money(item.priceYear) : moneyPerMonth(monthlyRent(item));
  // В одном районе может быть несколько вариантов — цена их различает.
  return price === '—' ? place : `${place} · ${price}`;
}

function Picker({ pool, selected, onToggle }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      {pool.map((item) => {
        const active = selected.includes(item.id);
        const full = selected.length >= MAX_COMPARE && !active;
        return (
          <button
            key={item.id}
            type="button"
            disabled={full}
            aria-pressed={active}
            onClick={() => {
              haptic('select');
              onToggle(item.id);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[15px] leading-5 whitespace-nowrap ${
              active ? 'bg-accent text-white' : 'bg-fill text-label'
            } ${full ? 'opacity-40' : ''}`}
          >
            {chipLabel(item)}
          </button>
        );
      })}
    </div>
  );
}

export function CompareSheet({ open, onClose, ids, notes, onOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deal, setDeal] = useState('rent');
  const [selected, setSelected] = useState([]);
  const [onlyDiff, setOnlyDiff] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);

    getListingsByIds(ids)
      .then((found) => {
        if (cancelled) return;
        setItems(found);
        // Начинаем с того типа сделки, которого в избранном больше.
        const groups = splitByDeal(found);
        const start = groups.sale.length > groups.rent.length ? 'sale' : 'rent';
        setDeal(start);
        setSelected(groups[start].slice(0, 3).map((item) => item.id));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = useMemo(() => splitByDeal(items), [items]);
  const pool = groups[deal];

  const chosen = useMemo(
    () => pool.filter((item) => selected.includes(item.id)),
    [pool, selected],
  );

  const { rows } = useMemo(() => buildComparison(chosen, notes), [chosen, notes]);
  const verdict = useMemo(() => buildVerdict(chosen, notes), [chosen, notes]);

  const switchDeal = (next) => {
    setDeal(next);
    setSelected(groups[next].slice(0, 3).map((item) => item.id));
  };

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  const visibleRows = onlyDiff ? rows.filter((row) => !row.same) : rows;
  const hiddenCount = rows.length - visibleRows.length;
  const bothDeals = groups.rent.length > 0 && groups.sale.length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Сравнение" full>
      <div className="space-y-4 p-4 pb-6">
        {loading ? (
          <ListSkeleton count={2} />
        ) : pool.length < 2 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Scale size={28} className="text-label-3" strokeWidth={1.5} />
            <p className="text-body text-label">Нужно хотя бы два варианта</p>
            <p className="text-caption text-label-2">
              Добавьте в избранное ещё одну квартиру того же типа сделки — аренду с продажей
              сравнивать не с чем.
            </p>
          </div>
        ) : (
          <>
            {bothDeals ? (
              <Segmented
                options={[
                  { id: 'rent', label: `Аренда · ${groups.rent.length}` },
                  { id: 'sale', label: `Продажа · ${groups.sale.length}` },
                ]}
                value={deal}
                onChange={switchDeal}
              />
            ) : null}

            <div>
              <div className="flex items-baseline justify-between gap-2 px-1 pb-1.5">
                <span className="text-caption text-label-2">Что сравниваем</span>
                <span className="nums text-caption text-label-3">
                  {selected.length} из {Math.min(pool.length, MAX_COMPARE)}
                </span>
              </div>
              <Picker pool={pool} selected={selected} onToggle={toggle} />
            </div>

            {chosen.length < 2 ? (
              <p className="px-1 py-8 text-center text-caption text-label-2">
                Выберите хотя бы два варианта.
              </p>
            ) : (
              <>
                {verdict.length > 0 ? (
                  <section className="rounded-[10px] bg-accent-2 px-4 py-3">
                    <div className="flex items-center gap-2 pb-1.5">
                      <Sparkles size={16} className="shrink-0 text-accent" />
                      <span className="text-caption font-medium text-accent">Коротко</span>
                    </div>
                    <ul className="space-y-1.5">
                      {verdict.map((line) => (
                        <li key={line.key} className="text-[15px] leading-5 text-label">
                          {line.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* Таблица шире экрана — прокручивается вбок, подписи строк остаются на месте. */}
                <div className="overflow-hidden rounded-[10px] bg-card">
                  <div className="overflow-x-auto">
                    <div className="min-w-max">
                      <div className="flex border-b border-separator">
                        <div className={`sticky left-0 z-10 w-[124px] shrink-0 bg-card`} />
                        {chosen.map((item) => (
                          <Column key={item.id} item={item} onOpen={onOpen} />
                        ))}
                      </div>

                      {visibleRows.map((row) => (
                        <div key={row.key} className="flex border-t border-separator first:border-t-0">
                          <div className="sticky left-0 z-10 w-[124px] shrink-0 bg-card px-3 py-2.5">
                            <span
                              className={`block text-caption ${row.lead ? 'text-label' : 'text-label-2'}`}
                            >
                              {row.label}
                            </span>
                            {row.hint ? (
                              <span className="block text-[11px] leading-[14px] text-label-3">
                                {row.hint}
                              </span>
                            ) : null}
                          </div>

                          {row.values.map((value) => (
                            <div key={value.id} className={`${COLUMN} shrink-0 px-2 py-2.5`}>
                              <span
                                className={`nums block text-[15px] leading-5 ${
                                  value.best
                                    ? 'font-semibold text-accent'
                                    : value.text === '—'
                                      ? 'text-label-3'
                                      : 'text-label'
                                }`}
                              >
                                {value.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[10px] bg-card px-4 py-3">
                  <Toggle
                    value={onlyDiff}
                    onChange={setOnlyDiff}
                    label={
                      hiddenCount > 0 && onlyDiff
                        ? `Только различия · скрыто ${hiddenCount}`
                        : 'Только различия'
                    }
                  />
                </div>

                <p className="px-1 text-caption text-label-3">
                  Зелёным отмечено лучшее значение в строке. Прочерк — данных нет
                  в объявлении, и в сравнении такая строка не участвует.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
