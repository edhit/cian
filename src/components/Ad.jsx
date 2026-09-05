import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { adColor, isUsableImage } from '../lib/adsFeed.js';
import { haptic, openLink } from '../lib/telegram.js';

/** Логотип с запасным вариантом: обрезанный или битый data-URI не должен рвать блок. */
function Logo({ src, title, size = 40, color }) {
  const [failed, setFailed] = useState(false);
  const usable = isUsableImage(src) && !failed;

  if (!usable) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[9px] text-[15px] font-semibold text-white"
        style={{ width: size, height: size, backgroundColor: color }}
        aria-hidden="true"
      >
        {String(title || '?').trim().charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-[9px] object-cover"
      style={{ width: size, height: size }}
    />
  );
}

function Label() {
  return <span className="text-[11px] leading-[14px] tracking-wide text-label-3">Реклама</span>;
}

export function Ad({ ad }) {
  const color = adColor(ad.color);

  const open = () => {
    haptic('light');
    openLink(ad.url);
  };

  if (ad.type === 'image') {
    const source = ad.image || ad.logo;
    // Без годной картинки этот тип показывать нечем — падаем на компактный вид.
    if (isUsableImage(source)) {
      return (
        <button type="button" onClick={open} className="block w-full text-left active:opacity-80">
          <img
            src={source}
            alt={ad.title || ''}
            loading="lazy"
            className="w-full rounded-[10px] object-cover"
            style={{ aspectRatio: '16 / 9' }}
          />
          <span className="block pt-1 pl-1">
            <Label />
          </span>
        </button>
      );
    }
  }

  if (ad.type === 'banner') {
    return (
      <button
        type="button"
        onClick={open}
        className="block w-full rounded-[10px] px-4 py-4 text-left active:opacity-80"
        // Подложка — тот же цвет, разбавленный фоном карточки: работает и в тёмной теме.
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, var(--card))` }}
      >
        <Label />
        <span className="block pt-1 text-body font-semibold" style={{ color }}>
          {ad.title}
        </span>
        {ad.text ? <span className="block pt-1 text-[15px] leading-5 text-label">{ad.text}</span> : null}
        {ad.cta ? (
          <span
            className="mt-3 inline-block rounded-full px-4 py-2 text-[15px] leading-5 font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {ad.cta}
          </span>
        ) : null}
      </button>
    );
  }

  if (ad.type === 'card') {
    return (
      <button
        type="button"
        onClick={open}
        className="flex w-full gap-3 rounded-[10px] bg-card px-4 py-3.5 text-left active:bg-fill"
      >
        <Logo src={ad.logo} title={ad.title} size={48} color={color} />
        <span className="min-w-0 flex-1">
          <Label />
          <span className="block truncate pt-0.5 text-body font-semibold text-label">{ad.title}</span>
          {ad.text ? <span className="block pt-0.5 text-[15px] leading-5 text-label-2">{ad.text}</span> : null}
          {ad.cta ? (
            <span className="block pt-2 text-[15px] leading-5 font-medium" style={{ color }}>
              {ad.cta}
            </span>
          ) : null}
        </span>
      </button>
    );
  }

  // strip — самый компактный вид, он же используется по умолчанию.
  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center gap-3 overflow-hidden rounded-[10px] bg-card py-3 pr-3 pl-4 text-left active:bg-fill"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <Logo src={ad.logo} title={ad.title} size={40} color={color} />
      <span className="min-w-0 flex-1">
        <Label />
        <span className="block truncate text-[15px] leading-5 font-semibold text-label">{ad.title}</span>
        {ad.text ? (
          <span className="block truncate text-caption text-label-2">{ad.text}</span>
        ) : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-label-3" />
    </button>
  );
}
