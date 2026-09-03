// Единственный источник правды о полях объявления.
// Файл копируется в проект Worker без изменений — никаких импортов и браузерных API.

export const CITIES = [
  { id: 'medina', label: 'Медина' },
  { id: 'makkah', label: 'Мекка' },
  { id: 'jeddah', label: 'Джидда' },
  { id: 'riyadh', label: 'Эр-Рияд' },
  { id: 'dammam', label: 'Даммам' },
  { id: 'taif', label: 'Таиф' },
  { id: 'yanbu', label: 'Янбу' },
];

export const DISTRICTS = {
  medina: [
    { id: 'awali', label: 'Аль-Авали', aliases: ['العوالي', 'al awali', 'авали'] },
    { id: 'haram', label: 'У Харама', aliases: ['الحرم', 'haram', 'харам'] },
    { id: 'quba', label: 'Куба', aliases: ['قباء', 'quba', 'куба'] },
    { id: 'aziziyah', label: 'Аль-Азизия', aliases: ['العزيزية', 'азизия'] },
    { id: 'salam', label: 'Ас-Салям', aliases: ['السلام', 'салям'] },
    { id: 'khalidiyah', label: 'Аль-Халидия', aliases: ['الخالدية', 'халидия'] },
  ],
  makkah: [
    { id: 'aziziyah', label: 'Аль-Азизия', aliases: ['العزيزية'] },
    { id: 'shisha', label: 'Аш-Шиша', aliases: ['الشيشة'] },
    { id: 'misfalah', label: 'Аль-Мисфаля', aliases: ['المسفلة'] },
    { id: 'haram', label: 'У Харама', aliases: ['الحرم'] },
  ],
  jeddah: [
    { id: 'salamah', label: 'Ас-Салама', aliases: ['السلامة'] },
    { id: 'rawdah', label: 'Ар-Рауда', aliases: ['الروضة'] },
    { id: 'hamra', label: 'Аль-Хамра', aliases: ['الحمراء'] },
  ],
  riyadh: [
    { id: 'olaya', label: 'Аль-Улайя', aliases: ['العليا'] },
    { id: 'malaz', label: 'Аль-Малаз', aliases: ['الملز'] },
  ],
};

export const OTHER_DISTRICT = { id: 'other', label: 'Другой', aliases: [] };

export const DEFAULT_CITY = 'medina';

export const DEAL_TYPES = [
  { id: 'rent', label: 'Аренда' },
  { id: 'sale', label: 'Продажа' },
];

export const ROOM_OPTIONS = [
  { id: 1, label: '1' },
  { id: 2, label: '2' },
  { id: 3, label: '3' },
  { id: 4, label: '4+' },
];

export const FEATURE_LABELS = {
  ac: 'Кондиционер',
  parking: 'Парковка',
  elevator: 'Лифт',
  kitchen: 'Кухня',
  balcony: 'Балкон',
  wifi: 'Интернет',
  washer: 'Стиральная машина',
  separate_entrance: 'Отдельный вход',
  women_only: 'Только для женщин',
  family_only: 'Только для семей',
};

/** Всегда массив: у города может не быть своего списка районов. */
export function districtsOf(city) {
  return [...(DISTRICTS[city] || []), OTHER_DISTRICT];
}

export function cityLabel(city) {
  const found = CITIES.find((c) => c.id === city);
  return found ? found.label : '';
}

export function districtLabel(city, district) {
  if (!district) return '';
  const found = districtsOf(city).find((d) => d.id === district);
  return found ? found.label : '';
}

export function featureLabel(feature) {
  return FEATURE_LABELS[feature] || String(feature);
}

/* ---------- приведение типов: запись из чата не должна ронять страницу ---------- */

function toStr(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function toNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter((v) => toStr(v) !== '').map(toStr);
  if (toStr(value) !== '') return [toStr(value)];
  return [];
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'да', 'yes'].includes(value.toLowerCase());
  return Boolean(value);
}

function toIsoDate(value) {
  const raw = toStr(value);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function toDealType(value) {
  return toStr(value).toLowerCase() === 'sale' ? 'sale' : 'rent';
}

function toCity(value) {
  const raw = toStr(value).toLowerCase();
  return CITIES.some((c) => c.id === raw) ? raw : '';
}

function toDistrict(city, value) {
  const raw = toStr(value).toLowerCase();
  if (!raw) return '';
  return districtsOf(city).some((d) => d.id === raw) ? raw : OTHER_DISTRICT.id;
}

let fallbackId = 0;

/** Заполняет значениями по умолчанию все поля, включая вложенные объекты. */
export function normalizeListing(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const city = toCity(source.city);
  const contact = source.contact && typeof source.contact === 'object' ? source.contact : {};
  const src = source.source && typeof source.source === 'object' ? source.source : {};

  return {
    id: toStr(source.id) || `tmp-${(fallbackId += 1)}`,
    dealType: toDealType(source.dealType),
    city,
    district: toDistrict(city, source.district),
    address: toStr(source.address),
    priceYear: toNum(source.priceYear),
    deposit: toNum(source.deposit),
    commission: toNum(source.commission),
    utilities: toNum(source.utilities),
    rooms: toNum(source.rooms),
    area: toNum(source.area),
    floor: toStr(source.floor),
    furnished: toBool(source.furnished),
    features: toArray(source.features),
    description: toStr(source.description),
    photos: toArray(source.photos),
    contact: {
      telegram: toStr(contact.telegram).replace(/^@/, ''),
      phone: toStr(contact.phone),
    },
    source: {
      chat: toStr(src.chat),
      url: toStr(src.url),
    },
    publishedAt: toIsoDate(source.publishedAt),
    expiresAt: toIsoDate(source.expiresAt),
    verified: toBool(source.verified),
  };
}

/* ---------------------------- расчёты стоимости ---------------------------- */

/** Цена за год, делённая на 12. Для продажи месячной цены нет. */
export function monthlyRent(listing) {
  if (!listing || listing.dealType === 'sale') return 0;
  return listing.priceYear > 0 ? listing.priceYear / 12 : 0;
}

/**
 * Настоящая месячная стоимость: аренда с комиссией, разложенные на год,
 * плюс коммуналка. Залог сюда не входит — он возвращается.
 */
export function trueMonthly(listing) {
  if (!listing || listing.dealType === 'sale') return 0;
  const rentPart = (listing.priceYear + listing.commission) / 12;
  return (rentPart > 0 ? rentPart : 0) + (listing.utilities > 0 ? listing.utilities : 0);
}

export function isExpired(listing, now = Date.now()) {
  if (!listing || !listing.expiresAt) return false;
  const ts = new Date(listing.expiresAt).getTime();
  return Number.isFinite(ts) && ts < now;
}

/* --------------------------- фильтрация и порядок --------------------------- */

export const EMPTY_FILTERS = {
  deal: 'rent',
  city: DEFAULT_CITY,
  district: '',
  rooms: 0,
  priceMin: 0,
  priceMax: 0,
  q: '',
};

export function makeFilters(patch) {
  return { ...EMPTY_FILTERS, ...(patch || {}) };
}

/** Сколько фильтров человек поменял относительно умолчания — для счётчика на кнопке. */
export function countActiveFilters(filters) {
  const f = makeFilters(filters);
  let count = 0;
  if (f.deal !== EMPTY_FILTERS.deal) count += 1;
  if (f.district) count += 1;
  if (f.rooms) count += 1;
  if (f.priceMin) count += 1;
  if (f.priceMax) count += 1;
  return count;
}

function haystack(listing) {
  return [
    listing.address,
    listing.description,
    districtLabel(listing.city, listing.district),
    cityLabel(listing.city),
  ]
    .join(' ')
    .toLowerCase();
}

export function matchesFilters(listing, filters) {
  const f = makeFilters(filters);
  if (f.deal && listing.dealType !== f.deal) return false;
  if (f.city && listing.city !== f.city) return false;
  if (f.district && listing.district !== f.district) return false;
  // 4 в фильтре означает «четыре и больше».
  if (f.rooms) {
    if (f.rooms >= 4 ? listing.rooms < 4 : listing.rooms !== f.rooms) return false;
  }
  if (f.priceMin && listing.priceYear < f.priceMin) return false;
  if (f.priceMax && listing.priceYear > f.priceMax) return false;
  if (f.q) {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const text = haystack(listing);
    if (!words.every((w) => text.includes(w))) return false;
  }
  return true;
}

/** Сначала проверенные, потом свежие. Порядок обязан совпадать с Worker. */
export function compareListings(a, b) {
  if (a.verified !== b.verified) return a.verified ? -1 : 1;
  const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  if (bt !== at) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Полный путь выдачи: отсев протухших, фильтры, порядок, страница.
 * cursor непрозрачен для вызывающего — сейчас это смещение в массиве.
 */
export function queryListings(all, filters, cursor, limit = 20, now = Date.now()) {
  const matched = all
    .filter((item) => !isExpired(item, now))
    .filter((item) => matchesFilters(item, filters))
    .sort(compareListings);

  const offset = Number.parseInt(cursor, 10) || 0;
  const items = matched.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    nextCursor: nextOffset < matched.length ? String(nextOffset) : null,
    total: matched.length,
  };
}
