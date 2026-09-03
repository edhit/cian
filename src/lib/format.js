const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${numberFormat.format(Math.round(n))} SAR`;
}

export function moneyPerMonth(value) {
  const text = money(value);
  return text === '—' ? text : `${text}/мес`;
}

export function area(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${numberFormat.format(n)} м²` : '';
}

const ROOM_FORMS = ['комната', 'комнаты', 'комнат'];

export function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (tail > 1 && tail < 5) return forms[1];
  if (tail === 1) return forms[0];
  return forms[2];
}

export function rooms(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n} ${plural(n, ROOM_FORMS)}`;
}

const DAY = 86400000;

/** «сегодня», «вчера», «3 дня назад», дальше — дата. */
export function relativeDate(iso) {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday.getTime() - ts) / DAY) + (ts > startOfToday.getTime() ? 0 : 1);

  if (ts >= startOfToday.getTime()) return 'сегодня';
  if (days <= 1) return 'вчера';
  if (days < 7) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;

  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(ts));
}

/**
 * Место одной строкой. Парсер часто дублирует район внутри адреса
 * («Аль-Авали, Аль-Авали, 61») — такие повторы склеиваем.
 */
export function placeParts(parts) {
  const result = [];
  for (const raw of parts) {
    const part = String(raw || '').trim();
    if (!part) continue;
    const lower = part.toLowerCase();
    const duplicate = result.some((kept) => {
      const other = kept.toLowerCase();
      return other === lower || other.includes(lower) || lower.startsWith(`${other},`) || lower.startsWith(`${other} `);
    });
    if (duplicate) {
      // Более подробный вариант вытесняет короткий: «Куба» -> «Куба, 12».
      const index = result.findIndex((kept) => lower.startsWith(kept.toLowerCase()));
      if (index !== -1 && part.length > result[index].length) result[index] = part;
      continue;
    }
    result.push(part);
  }
  return result.join(', ');
}
