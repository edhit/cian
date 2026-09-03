// Единственное место, которое знает, откуда берутся данные.
// Компоненты вызывают функции и об источнике не знают.

import { normalizeListing, queryListings } from './schema.js';
import { getInitData } from './telegram.js';

const BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

/** Есть ли куда писать. Интерфейс прячет кнопки записи, когда бэкенда нет. */
export const hasBackend = Boolean(BASE);

const NO_BACKEND = { ok: false, reason: 'no-backend' };

function authHeaders() {
  const initData = getInitData();
  // Заголовок безвреден и без Worker, зато переезд не потребует правок компонентов.
  return initData ? { Authorization: `tma ${initData}` } : {};
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
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

/** Сколько объявлений в каждом городе. null, когда посчитать нельзя (режим Worker). */
export async function getCityCounts(deal) {
  if (hasBackend) return null;
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

export async function submitListing(payload) {
  if (!hasBackend) return NO_BACKEND;
  try {
    const data = await request('/listings', { method: 'POST', body: JSON.stringify(payload) });
    return { ok: Boolean(data && data.ok), id: (data && data.id) || null };
  } catch {
    return { ok: false, reason: 'network' };
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
