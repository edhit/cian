import { useCallback, useEffect, useRef, useState } from 'react';
import { getListings } from '../lib/api.js';

const PAGE_SIZE = 20;

/** Лента с подгрузкой по курсору. Смена фильтров начинает выдачу заново. */
export function useListings(filters) {
  const [state, setState] = useState({
    items: [],
    total: 0,
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  });

  // Ответ устаревшего запроса не должен перетереть свежую выдачу.
  const requestId = useRef(0);
  const key = JSON.stringify(filters);

  useEffect(() => {
    const id = (requestId.current += 1);
    let cancelled = false;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    getListings(filters, null, PAGE_SIZE)
      .then((page) => {
        if (cancelled || id !== requestId.current) return;
        setState({
          items: page.items,
          total: page.total,
          nextCursor: page.nextCursor,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled || id !== requestId.current) return;
        setState({
          items: [],
          total: 0,
          nextCursor: null,
          loading: false,
          loadingMore: false,
          error: 'Не удалось загрузить объявления',
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.loading || prev.loadingMore || !prev.nextCursor) return prev;

      const id = requestId.current;
      const cursor = prev.nextCursor;

      getListings(filters, cursor, PAGE_SIZE)
        .then((page) => {
          if (id !== requestId.current) return;
          setState((current) => {
            const seen = new Set(current.items.map((item) => item.id));
            return {
              ...current,
              items: [...current.items, ...page.items.filter((item) => !seen.has(item.id))],
              total: page.total || current.total,
              nextCursor: page.nextCursor,
              loadingMore: false,
            };
          });
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setState((current) => ({ ...current, loadingMore: false, nextCursor: null }));
        });

      return { ...prev, loadingMore: true };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...state, hasMore: Boolean(state.nextCursor), loadMore };
}
