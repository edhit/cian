// Отбор и расстановка рекламы. Чистый модуль без React: правила проверяются тестами.

export const AD_COLORS = {
  green: '#1B7F5A',
  blue: '#0A6CFF',
  purple: '#7B4DFF',
  orange: '#FF8A00',
  red: '#E03131',
  gold: '#B8860B',
  teal: '#0E8A8A',
  pink: '#D6336C',
  dark: '#3A3A3C',
};

const AD_TYPES = new Set(['card', 'banner', 'strip', 'image']);

// Обрезанный data-URI («data:image/jpeg;base64,/9j/4AAQSkZJR») браузер пытается
// загрузить и ругается в консоль. Столько данных не хватит ни на какую картинку,
// поэтому такие ссылки отсеиваем до отрисовки.
const MIN_BASE64_PAYLOAD = 128;

export function isUsableImage(src) {
  const raw = String(src || '').trim();
  if (/^https?:\/\//i.test(raw)) return true;

  const match = raw.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return Boolean(match) && match[1].length >= MIN_BASE64_PAYLOAD;
}

/** Имя из палитры либо любой свой цвет. Мусор не должен ломать вёрстку. */
export function adColor(color) {
  const raw = String(color || '').trim();
  if (AD_COLORS[raw]) return AD_COLORS[raw];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  return AD_COLORS.green;
}

function isLive(ad, now) {
  if (!ad.until) return true;
  const ts = new Date(`${ad.until}T23:59:59Z`).getTime();
  // Неразобранная дата не должна прятать объявление молча.
  return Number.isNaN(ts) ? true : ts >= now;
}

/** Годные объявления: с известным типом, ссылкой и не истёкшим сроком. */
export function activeAds(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).filter(
    (ad) => ad && typeof ad === 'object' && AD_TYPES.has(ad.type) && ad.url && isLive(ad, now),
  );
}

const FIRST_AFTER = 3;
const THEN_EVERY = 6;

/**
 * Раскладывает ленту на блоки объявлений и рекламы.
 * Реклама не ставится в самый конец: это выглядит как обрыв списка.
 *
 * @returns {Array<{type: 'listings', items: object[]} | {type: 'ad', ad: object, key: string}>}
 */
export function buildFeed(listings, ads, { hasMore = false } = {}) {
  const items = Array.isArray(listings) ? listings : [];
  const pool = Array.isArray(ads) ? ads : [];
  if (items.length === 0 || pool.length === 0) {
    return items.length > 0 ? [{ type: 'listings', items }] : [];
  }

  const blocks = [];
  let shown = 0;
  let index = 0;
  let cut = 0;

  while (cut < items.length) {
    const size = shown === 0 ? FIRST_AFTER : THEN_EVERY;
    const chunk = items.slice(cut, cut + size);
    cut += chunk.length;
    blocks.push({ type: 'listings', items: chunk });

    // Ниже уже ничего нет и подгружать нечего — реклама повисла бы в хвосте.
    if (cut >= items.length && !hasMore) break;

    const ad = pool[index % pool.length];
    blocks.push({ type: 'ad', ad, key: `ad-${index}` });
    index += 1;
    shown += 1;
  }

  return blocks;
}
