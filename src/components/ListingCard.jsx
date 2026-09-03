import { BadgeCheck, Heart } from 'lucide-react';
import { Photo } from './Photo.jsx';
import { monthlyRent, trueMonthly, districtLabel } from '../lib/schema.js';
import {
  money,
  moneyPerMonth,
  area as formatArea,
  placeParts,
  relativeDate,
  rooms as formatRooms,
} from '../lib/format.js';

export function ListingCard({ listing, favorite, onToggleFavorite, onOpen }) {
  const isSale = listing.dealType === 'sale';
  const price = isSale ? money(listing.priceYear) : moneyPerMonth(monthlyRent(listing));
  const withExtras = trueMonthly(listing);

  const place = placeParts([districtLabel(listing.city, listing.district), listing.address]);

  const meta = [formatRooms(listing.rooms), formatArea(listing.area), relativeDate(listing.publishedAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpen(listing)}
        className="flex w-full gap-3 px-4 py-3 text-left active:bg-fill"
      >
        <Photo src={listing.photos[0]} alt="" className="w-20 shrink-0 self-start" ratio="1 / 1" />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[3px]">
          {/* Отступ только под сердцем: строка «с комиссией...» должна помещаться целиком. */}
          <div className="flex items-center gap-1.5 pr-7">
            <span className="nums text-[19px] leading-6 font-semibold whitespace-nowrap text-label">
              {price}
            </span>
            {listing.verified ? (
              <BadgeCheck size={16} className="shrink-0 text-accent" aria-label="Проверено" />
            ) : null}
          </div>

          {!isSale && withExtras > 0 ? (
            <span className="nums text-caption text-label-2">
              с комиссией и коммуналкой — {moneyPerMonth(withExtras)}
            </span>
          ) : null}

          {place ? <span className="truncate text-[15px] leading-5 text-label">{place}</span> : null}
          {meta ? <span className="nums truncate text-caption text-label-3">{meta}</span> : null}
        </div>
      </button>

      <button
        type="button"
        aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(listing.id)}
        className="absolute top-2.5 right-3 flex size-7 items-center justify-center rounded-full active:opacity-60"
      >
        <Heart
          size={20}
          strokeWidth={2}
          className={favorite ? 'fill-accent text-accent' : 'text-label-3'}
        />
      </button>
    </div>
  );
}

/** Сгруппированный список в стиле системных таблиц: разделители между строками. */
export function ListingList({ items, isFavorite, onToggleFavorite, onOpen }) {
  return (
    <div className="overflow-hidden rounded-[10px] bg-card">
      {items.map((listing, index) => (
        <div key={listing.id} className={index > 0 ? 'border-t border-separator' : ''}>
          <ListingCard
            listing={listing}
            favorite={isFavorite(listing.id)}
            onToggleFavorite={onToggleFavorite}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  );
}
