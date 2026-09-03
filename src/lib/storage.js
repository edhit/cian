// Настройки живут в CloudStorage телеграма и переезжают между устройствами сами.
// Без телеграма это localStorage — тот же интерфейс.

import { cloud } from './telegram.js';

const KEYS = {
  city: 'city',
  filters: 'filters',
  favorites: 'favorites',
};

export async function loadJSON(key, fallback) {
  const raw = await cloud.get(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  return cloud.set(key, JSON.stringify(value));
}

export const storage = {
  loadCity: () => cloud.get(KEYS.city),
  saveCity: (city) => cloud.set(KEYS.city, city),

  loadFilters: () => loadJSON(KEYS.filters, null),
  saveFilters: (filters) => saveJSON(KEYS.filters, filters),

  loadFavorites: async () => {
    const list = await loadJSON(KEYS.favorites, []);
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  },
  saveFavorites: (ids) => saveJSON(KEYS.favorites, ids),
};
