import { useCallback, useEffect, useState } from 'react';
import { storage } from '../lib/storage.js';
import { haptic } from '../lib/telegram.js';

/** Единственная функция, которой не нужен бэкенд. */
export function useFavorites() {
  const [ids, setIds] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage.loadFavorites().then((list) => {
      if (cancelled) return;
      setIds(list);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id) => {
    if (!id) return;
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      storage.saveFavorites(next);
      return next;
    });
    haptic('light');
  }, []);

  const has = useCallback((id) => ids.includes(id), [ids]);

  return { ids, has, toggle, ready };
}
