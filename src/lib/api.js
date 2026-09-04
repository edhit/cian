// Единственное место, которое знает, откуда берутся данные.
// Компоненты вызывают функции и об источнике не знают.

import { normalizeListing, queryListings } from './schema.js';
import { getInitData } from './telegram.js';

/**
 * Адрес Worker из переменной сборки. Значение приходит из .env или из настроек
 * Pages, где легко оставить кавычки или лишний пробел, — такие символы срезаем,
 * иначе fetch падает, а человек видит «проверьте соединение».
 */
function readApiBase() {
  const raw = String(import.meta.env.VITE_API_BASE || '')
    .trim()
    // Кавычки любых видов, включая «умные» и ¨ с нестандартных раскладок.
    .replace(/^["'`«»„“”‘’¨]+|["'`«»„“”‘’¨]+$/g, '')
    .trim()
    .replace(/\/+$/, '');

  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    return raw;
  } catch {
    // Разбирать нечего: адрес неверен. Молча делать вид, что бэкенда нет, нельзя —
    // поэтому громко пишем в консоль и работаем в режиме локального файла.
    console.error(
      `VITE_API_BASE не похож на адрес: ${JSON.stringify(import.meta.env.VITE_API_BASE)}. ` +
        'Ожидается https://имя.workers.dev без кавычек. Пока читаем listings.json.',
    );
    return '';
  }
}

const BASE = readApiBase();

/** Адрес бэкенда после разбора — пустая строка означает работу из файла. */
export const apiBase = BASE;

/** Есть ли куда писать. Интерфейс прячет кнопки записи, когда бэкенда нет. */
export const hasBackend = Boolean(BASE);

const NO_BACKEND = { ok: false, reason: 'no-backend' };

function authHeaders() {
  const initData = getInitData();
  // Заголовок безвреден и без Worker, зато переезд не потребует правок компонентов.
  return initData ? { Authorization: `tma ${initData}` } : {};
}

function buildHeaders(options) {
  return {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...authHeaders(),
    ...(options.headers || {}),
  };
}

/**
 * Браузер не показывает разницу между «сервер недоступен» и «CORS не пропустил»:
 * в обоих случаях это одинаковый TypeError. Подсказку пишем в консоль — иначе
 * забытый ALLOWED_ORIGINS выглядит как проблема со связью.
 */
function explainFetchFailure(path, cause) {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  console.error(
    `Запрос ${BASE}${path} не выполнен: ${cause && cause.message}. ` +
      (online
        ? 'Сеть на месте — проверьте ALLOWED_ORIGINS у Worker: в нём должен быть адрес ' +
          `${typeof location === 'undefined' ? 'этого сайта' : location.origin} и адрес самого Worker должен отвечать.`
        : 'Похоже, устройство не в сети.'),
  );
}

/** Запрос, который не бросает на 4xx: вызывающему нужен разбор причины. */
async function requestRaw(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { ...options, headers: buildHeaders(options) });
  } catch (cause) {
    explainFetchFailure(path, cause);
    throw cause;
  }
  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data };
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { ...options, headers: buildHeaders(options) });
  } catch (cause) {
    explainFetchFailure(path, cause);
    throw cause;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/* ------------------------- локальный источник ---------------------------- */

let localCache = null;

function loadLocal() {
  if (!localCache) {
    localCache = fetch(`${import.meta.env.BASE_URL}listings.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const items = data && Array.isArray(data.items) ? data.items : [];
        return {
          generatedAt: (data && data.generatedAt) || '',
          items: items.map(normalizeListing),
        };
      })
      .catch(() => ({ generatedAt: '', items: [] }));
  }
  return localCache;
}

/* ----------------------------- чтение ------------------------------------ */

function toQuery(filters, cursor, limit) {
  const f = filters || {};
  const params = new URLSearchParams();
  if (f.deal) params.set('deal', f.deal);
  if (f.city) params.set('city', f.city);
  if (f.district) params.set('district', f.district);
  if (f.rooms) params.set('rooms', String(f.rooms));
  if (f.priceMin) params.set('priceMin', String(f.priceMin));
  if (f.priceMax) params.set('priceMax', String(f.priceMax));
  if (f.q) params.set('q', f.q);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return params.toString();
}

/** @returns {Promise<{items: object[], nextCursor: string|null, total: number}>} */
export async function getListings(filters, cursor = null, limit = 20) {
  if (hasBackend) {
    const data = await request(`/listings?${toQuery(filters, cursor, limit)}`);
    return {
      items: (Array.isArray(data.items) ? data.items : []).map(normalizeListing),
      nextCursor: data.nextCursor || null,
      total: Number(data.total) || 0,
    };
  }

  const { items } = await loadLocal();
  return queryListings(items, filters, cursor, limit);
}

/** @returns {Promise<object|null>} */
export async function getListing(id) {
  if (!id) return null;

  if (hasBackend) {
    try {
      const data = await request(`/listings/${encodeURIComponent(id)}`);
      return data && data.item ? normalizeListing(data.item) : null;
    } catch {
      return null;
    }
  }

  const { items } = await loadLocal();
  return items.find((item) => item.id === id) || null;
}

/** Объявления из избранного — по списку идентификаторов, включая протухшие. */
export async function getListingsByIds(ids) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return [];

  if (hasBackend) {
    const found = await Promise.all(list.map((id) => getListing(id)));
    return found.filter(Boolean);
  }

  const { items } = await loadLocal();
  const byId = new Map(items.map((item) => [item.id, item]));
  return list.map((id) => byId.get(id)).filter(Boolean);
}

/** Сколько объявлений в каждом городе. null, когда посчитать не удалось. */
export async function getCityCounts(deal) {
  if (hasBackend) {
    try {
      const data = await request(`/facets?deal=${encodeURIComponent(deal || '')}`);
      return data && data.cityCounts && typeof data.cityCounts === 'object' ? data.cityCounts : null;
    } catch {
      // Счётчики — подсказка, а не содержимое: молчим, но ленту не ломаем.
      return null;
    }
  }

  const { items } = await loadLocal();
  const now = Date.now();
  const counts = {};
  for (const item of items) {
    if (deal && item.dealType !== deal) continue;
    if (item.expiresAt && new Date(item.expiresAt).getTime() < now) continue;
    counts[item.city] = (counts[item.city] || 0) + 1;
  }
  return counts;
}

/* ------------------------------ запись ----------------------------------- */

/**
 * @returns {Promise<{ok: true, id: string, status: string}
 *                 | {ok: false, reason: string, fields?: string[]}>}
 */
export async function submitListing(payload) {
  if (!hasBackend) return NO_BACKEND;

  try {
    const { status, ok, data } = await requestRaw('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Причину показываем человеку словами, поэтому коды разбираем здесь, а не в шторке.
    if (status === 401) return { ok: false, reason: 'unauthorized' };
    if (status === 422) return { ok: false, reason: 'invalid', fields: (data && data.fields) || [] };
    if (status === 429) return { ok: false, reason: 'too-many' };
    if (!ok || !data || !data.ok) return { ok: false, reason: 'server' };

    return { ok: true, id: data.id, status: data.status || 'pending' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Объявления, поданные этим человеком, вместе со статусом модерации. */
export async function getMyListings() {
  if (!hasBackend) return { items: [], reason: 'no-backend' };

  try {
    const { status, ok, data } = await requestRaw('/my/listings');
    if (status === 401) return { items: [], reason: 'unauthorized' };
    if (!ok || !data) return { items: [], reason: 'server' };

    return {
      items: (Array.isArray(data.items) ? data.items : []).map((item) => ({
        ...normalizeListing(item),
        status: item.status || 'published',
      })),
    };
  } catch {
    return { items: [], reason: 'network' };
  }
}

export async function reportListing(id, reason) {
  if (!hasBackend) return NO_BACKEND;
  try {
    const data = await request(`/listings/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return { ok: Boolean(data && data.ok) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
