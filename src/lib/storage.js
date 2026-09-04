// Настройки живут в CloudStorage телеграма и переезжают между устройствами сами.
// Без телеграма это localStorage — тот же интерфейс.

import { cloud } from './telegram.js';

const KEYS = {
  city: 'city',
  filters: 'filters',
  favorites: 'favorites',
  notes: 'notes',
};

// CloudStorage телеграма хранит не больше 4096 символов на ключ, поэтому заметки
// ограничены и по одной, и в сумме: лучше потерять самую старую, чем всё разом.
export const NOTE_MAX_LENGTH = 300;
const NOTES_MAX_BYTES = 3800;

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

/** Убирает самые старые заметки, пока запись не влезет в ограничение хранилища. */
function fitNotes(notes) {
  const entries = Object.entries(notes).filter(([, note]) => note && (note.text || note.rating));
  entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));

  const kept = {};
  for (const [id, note] of entries) {
    const candidate = { ...kept, [id]: note };
    if (JSON.stringify(candidate).length > NOTES_MAX_BYTES) break;
    kept[id] = note;
  }
  return kept;
}

export const storage = {
  loadCity: () => cloud.get(KEYS.city),
  saveCity: (city) => cloud.set(KEYS.city, city),

  loadFilters: () => loadJSON(KEYS.filters, null),
  saveFilters: (filters) => saveJSON(KEYS.filters, filters),

  loadNotes: async () => {
    const map = await loadJSON(KEYS.notes, {});
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};

    const clean = {};
    for (const [id, note] of Object.entries(map)) {
      if (!note || typeof note !== 'object') continue;
      clean[id] = {
        text: String(note.text || '').slice(0, NOTE_MAX_LENGTH),
        rating: Number(note.rating) > 0 ? Math.min(5, Math.round(Number(note.rating))) : 0,
        updatedAt: Number(note.updatedAt) || 0,
      };
    }
    return clean;
  },
  saveNotes: (notes) => saveJSON(KEYS.notes, fitNotes(notes)),

  loadFavorites: async () => {
    const list = await loadJSON(KEYS.favorites, []);
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  },
  saveFavorites: (ids) => saveJSON(KEYS.favorites, ids),
};
