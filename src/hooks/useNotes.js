import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTE_MAX_LENGTH, storage } from '../lib/storage.js';

const SAVE_DELAY = 600;

/**
 * Личные заметки и оценки к объявлениям. Живут в CloudStorage, поэтому переезжают
 * вместе с аккаунтом. Бэкенд для этого не нужен и не используется.
 */
export function useNotes() {
  const [notes, setNotes] = useState({});
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    storage.loadNotes().then((loaded) => {
      if (cancelled) return;
      setNotes(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
      clearTimeout(saveTimer.current);
    };
  }, []);

  // Запись откладывается: человек печатает, а не нажимает «сохранить».
  const scheduleSave = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => storage.saveNotes(next), SAVE_DELAY);
  }, []);

  const update = useCallback(
    (id, patch) => {
      if (!id) return;
      setNotes((prev) => {
        const current = prev[id] || { text: '', rating: 0, updatedAt: 0 };
        const merged = {
          text: String(patch.text ?? current.text).slice(0, NOTE_MAX_LENGTH),
          rating: Math.max(0, Math.min(5, Math.round(patch.rating ?? current.rating))),
          updatedAt: Date.now(),
        };

        const next = { ...prev };
        if (!merged.text && !merged.rating) delete next[id];
        else next[id] = merged;

        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const get = useCallback((id) => notes[id] || { text: '', rating: 0, updatedAt: 0 }, [notes]);

  return { notes, get, update, ready };
}
