import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink, Flag, Heart, MessageCircle, Phone, TriangleAlert } from 'lucide-react';
import { Sheet } from './Sheet.jsx';
import { NoteEditor } from './NoteEditor.jsx';
import { Photo } from './Photo.jsx';
import { getListing, hasBackend, reportListing } from '../lib/api.js';
import { cityLabel, districtLabel, featureLabel, monthlyRent, trueMonthly } from '../lib/schema.js';
import {
  area as formatArea,
  money,
  moneyPerMonth,
  placeParts,
  relativeDate,
  rooms as formatRooms,
} from '../lib/format.js';
import { haptic, openLink } from '../lib/telegram.js';

function MoneyRow({ label, value, strong = false, muted = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-separator px-4 py-2.5 first:border-t-0">
      <span className={`text-[15px] leading-5 ${muted ? 'text-label-2' : 'text-label'}`}>{label}</span>
      <span
        className={`nums shrink-0 text-right ${
          strong ? 'text-body font-semibold text-label' : 'text-[15px] leading-5 text-label-2'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Spec({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-separator px-4 py-2.5 first:border-t-0">
      <span className="text-[15px] leading-5 text-label-2">{label}</span>
      <span className="nums shrink-0 text-right text-[15px] leading-5 text-label">{value}</span>
    </div>
  );
}

function Photos({ photos }) {
  if (photos.length === 0) {
    return <Photo className="w-full" ratio="4 / 3" rounded="rounded-[10px]" />;
  }
  if (photos.length === 1) {
    return <Photo src={photos[0]} className="w-full" ratio="4 / 3" rounded="rounded-[10px]" />;
  }
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
      {photos.map((src, index) => (
        <Photo
          key={`${src}-${index}`}
          src={src}
          className="w-[86%] shrink-0 snap-center"
          ratio="4 / 3"
          rounded="rounded-[10px]"
        />
      ))}
    </div>
  );
}

export function ListingSheet({ open, onClose, listing: initial, favorite, onToggleFavorite, note, onNoteChange }) {
  const [listing, setListing] = useState(initial);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    setListing(initial);
    setReported(false);
  }, [initial]);

  useEffect(() => {
    if (!open || !initial || !initial.id) return undefined;
    let cancelled = false;
    // Карточка из ленты уже полная, но с Worker деталь может быть свежее.
    getListing(initial.id).then((fresh) => {
      if (!cancelled && fresh) setListing(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, [open, initial]);

  if (!listing) return null;

  const isSale = listing.dealType === 'sale';
  const perMonth = monthlyRent(listing);
  const total = trueMonthly(listing);
  const commissionMonthly = listing.commission > 0 ? listing.commission / 12 : 0;

  const place = placeParts([
    cityLabel(listing.city),
    districtLabel(listing.city, listing.district),
    listing.address,
  ]);

  const specs = [
    listing.rooms > 0 ? { label: 'Комнаты', value: formatRooms(listing.rooms) } : null,
    listing.area > 0 ? { label: 'Площадь', value: formatArea(listing.area) } : null,
    listing.floor ? { label: 'Этаж', value: listing.floor } : null,
    { label: 'Мебель', value: listing.furnished ? 'Есть' : 'Нет' },
    listing.features.length > 0
      ? { label: 'Особенности', value: listing.features.map(featureLabel).join(', ') }
      : null,
    listing.publishedAt ? { label: 'Опубликовано', value: relativeDate(listing.publishedAt) } : null,
  ].filter(Boolean);

  const telegramUrl = listing.contact.telegram ? `https://t.me/${listing.contact.telegram}` : '';

  const report = async () => {
    haptic('warning');
    const result = await reportListing(listing.id, 'user-report');
    if (result.ok) setReported(true);
  };

  return (
    <Sheet open={open} onClose={onClose} title={isSale ? 'Продажа' : 'Аренда'} full>
      <div className="space-y-4 p-4 pb-6">
        <Photos photos={listing.photos} />

        <div>
          <div className="flex items-center gap-2">
            <span className="nums text-[28px] leading-8 font-bold text-label">
              {isSale ? money(listing.priceYear) : moneyPerMonth(perMonth)}
            </span>
            {listing.verified ? <BadgeCheck size={20} className="shrink-0 text-accent" /> : null}
          </div>
          {place ? <p className="pt-1 text-[15px] leading-5 text-label-2">{place}</p> : null}
        </div>

        {!isSale ? (
          <section>
            <h3 className="px-1 pb-1.5 text-caption text-label-2">Настоящая стоимость</h3>
            <div className="overflow-hidden rounded-[10px] bg-card">
              <MoneyRow label="Аренда за год" value={money(listing.priceYear)} />
              <MoneyRow label="Аренда в месяц" value={money(perMonth)} />
              <MoneyRow
                label="Комиссия в месяц"
                value={commissionMonthly > 0 ? money(commissionMonthly) : 'нет'}
              />
              <MoneyRow
                label="Коммунальные в месяц"
                value={listing.utilities > 0 ? money(listing.utilities) : 'нет'}
              />
              <MoneyRow label="Итого в месяц" value={money(total)} strong />
              <MoneyRow
                label="Залог (возвращается)"
                value={listing.deposit > 0 ? money(listing.deposit) : 'нет'}
                muted
              />
            </div>
          </section>
        ) : null}

        {specs.length > 0 ? (
          <section>
            <h3 className="px-1 pb-1.5 text-caption text-label-2">Характеристики</h3>
            <div className="overflow-hidden rounded-[10px] bg-card">
              {specs.map((spec) => (
                <Spec key={spec.label} label={spec.label} value={spec.value} />
              ))}
            </div>
          </section>
        ) : null}

        {listing.description ? (
          <section>
            <h3 className="px-1 pb-1.5 text-caption text-label-2">Описание</h3>
            <p className="rounded-[10px] bg-card px-4 py-3 text-body whitespace-pre-line text-label">
              {listing.description}
            </p>
          </section>
        ) : null}

        {note ? <NoteEditor note={note} onChange={(patch) => onNoteChange(listing.id, patch)} /> : null}

        <div className="flex items-start gap-2.5 rounded-[10px] bg-accent-2 px-4 py-3">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-caption text-label-2">
            Не переводите деньги до осмотра жилья и подписания договора. Мы не участвуем в сделке
            и не проверяем платежи: объявление собрано из чата и опубликовано со ссылкой
            на первоисточник.
          </p>
        </div>

        <div className="flex gap-2">
          {telegramUrl ? (
            <button
              type="button"
              onClick={() => {
                haptic('light');
                openLink(telegramUrl);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-accent py-3 text-body font-medium text-white active:opacity-80"
            >
              <MessageCircle size={18} />
              Написать
            </button>
          ) : null}

          {listing.contact.phone ? (
            <button
              type="button"
              onClick={() => {
                haptic('light');
                openLink(`tel:${listing.contact.phone.replace(/[^\d+]/g, '')}`);
              }}
              className={`flex items-center justify-center gap-2 rounded-[10px] py-3 text-body font-medium active:opacity-60 ${
                telegramUrl ? 'flex-1 bg-fill text-label' : 'flex-1 bg-accent text-white'
              }`}
            >
              <Phone size={18} />
              Позвонить
            </button>
          ) : null}
        </div>

        {!telegramUrl && !listing.contact.phone ? (
          <p className="px-1 text-caption text-label-3">
            Контактов в объявлении нет — напишите в чат-первоисточник.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-[10px] bg-card">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onToggleFavorite(listing.id);
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-body text-label active:bg-fill"
          >
            <Heart size={18} className={favorite ? 'fill-accent text-accent' : 'text-label-2'} />
            {favorite ? 'В избранном' : 'В избранное'}
          </button>

          {listing.source.url ? (
            <button
              type="button"
              onClick={() => openLink(listing.source.url)}
              className="flex w-full items-center gap-3 border-t border-separator px-4 py-3 text-left text-body text-label active:bg-fill"
            >
              <ExternalLink size={18} className="shrink-0 text-label-2" />
              <span className="min-w-0 flex-1 truncate">
                Первоисточник{listing.source.chat ? ` · ${listing.source.chat}` : ''}
              </span>
            </button>
          ) : null}

          {/* Без Worker жалобу отправлять некуда — кнопку не показываем вовсе. */}
          {hasBackend ? (
            <button
              type="button"
              onClick={report}
              disabled={reported}
              className="flex w-full items-center gap-3 border-t border-separator px-4 py-3 text-left text-body text-danger active:bg-fill disabled:text-label-3"
            >
              <Flag size={18} className="shrink-0" />
              {reported ? 'Жалоба отправлена' : 'Пожаловаться'}
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
