// Перевод между строкой D1 и объектом объявления из schema.js.

import { normalizeListing, searchText, searchWords } from './schema.js';

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Строка D1 -> объявление в том виде, в каком его ждёт фронт. */
export function rowToListing(row) {
  return normalizeListing({
    id: row.id,
    dealType: row.deal_type,
    city: row.city,
    district: row.district,
    address: row.address,
    priceYear: row.price_year,
    deposit: row.deposit,
    commission: row.commission,
    utilities: row.utilities,
    rooms: row.rooms,
    area: row.area,
    floor: row.floor,
    furnished: Boolean(row.furnished),
    features: parseJsonArray(row.features),
    description: row.description,
    photos: parseJsonArray(row.photos),
    contact: { telegram: row.contact_telegram, phone: row.contact_phone },
    source: { chat: row.source_chat, url: row.source_url },
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    verified: Boolean(row.verified),
  });
}

/** Объявление -> плоские поля для записи. Поисковая строка считается тут же. */
export function listingToRow(listing, extra = {}) {
  const item = normalizeListing(listing);
  const now = new Date().toISOString();

  return {
    id: item.id,
    deal_type: item.dealType,
    city: item.city,
    district: item.district,
    address: item.address,
    price_year: Math.round(item.priceYear),
    deposit: Math.round(item.deposit),
    commission: Math.round(item.commission),
    utilities: Math.round(item.utilities),
    rooms: Math.round(item.rooms),
    area: Math.round(item.area),
    floor: item.floor,
    furnished: item.furnished ? 1 : 0,
    features: JSON.stringify(item.features),
    description: item.description,
    photos: JSON.stringify(item.photos),
    contact_telegram: item.contact.telegram,
    contact_phone: item.contact.phone,
    source_chat: item.source.chat,
    source_url: item.source.url,
    published_at: item.publishedAt,
    expires_at: item.expiresAt,
    verified: item.verified ? 1 : 0,
    status: extra.status || 'published',
    origin: extra.origin || 'parser',
    author_id: extra.authorId ?? null,
    search: searchText(item),
    created_at: extra.createdAt || now,
    updated_at: now,
  };
}

const COLUMNS = [
  'id', 'deal_type', 'city', 'district', 'address', 'price_year', 'deposit', 'commission',
  'utilities', 'rooms', 'area', 'floor', 'furnished', 'features', 'description', 'photos',
  'contact_telegram', 'contact_phone', 'source_chat', 'source_url', 'published_at', 'expires_at',
  'verified', 'status', 'origin', 'author_id', 'search', 'created_at', 'updated_at',
];

export function upsertStatement(db, row) {
  const placeholders = COLUMNS.map(() => '?').join(', ');
  // created_at при обновлении сохраняем: это дата первого появления записи.
  const updates = COLUMNS.filter((c) => c !== 'id' && c !== 'created_at')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  return db
    .prepare(
      `INSERT INTO listings (${COLUMNS.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
    )
    .bind(...COLUMNS.map((c) => row[c]));
}

/** Экранирование под LIKE: % и _ в запросе человека — обычные символы. */
function likePattern(word) {
  return `%${word.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Условия выборки ленты. Повторяют matchesFilters из schema.js:
 * если здесь и там разойдётся — после переезда лента перетасуется.
 */
export function feedConditions(filters, now = new Date().toISOString()) {
  const where = ["status = 'published'", "(expires_at = '' OR expires_at >= ?)"];
  const binds = [now];

  if (filters.deal) {
    where.push('deal_type = ?');
    binds.push(filters.deal);
  }
  if (filters.city) {
    where.push('city = ?');
    binds.push(filters.city);
  }
  if (filters.district) {
    where.push('district = ?');
    binds.push(filters.district);
  }
  if (filters.rooms) {
    // Четвёрка в фильтре означает «четыре и больше».
    if (filters.rooms >= 4) {
      where.push('rooms >= 4');
    } else {
      where.push('rooms = ?');
      binds.push(filters.rooms);
    }
  }
  if (filters.priceMin) {
    where.push('price_year >= ?');
    binds.push(filters.priceMin);
  }
  if (filters.priceMax) {
    where.push('price_year <= ?');
    binds.push(filters.priceMax);
  }
  for (const word of searchWords(filters.q)) {
    where.push("search LIKE ? ESCAPE '\\'");
    binds.push(likePattern(word));
  }

  return { where: where.join(' AND '), binds };
}

// Тот же порядок, что compareListings: сначала verified, потом свежие, потом id.
// Пустая published_at при сортировке по убыванию оказывается в конце — как и нулевая
// отметка времени на клиенте.
export const FEED_ORDER = 'verified DESC, published_at DESC, id ASC';
