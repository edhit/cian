import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.jsx';
import { Chips } from './components/Chips.jsx';
import { ListingList } from './components/ListingCard.jsx';
import { ListSkeleton, CardSkeleton } from './components/Skeletons.jsx';
import { EmptyState } from './components/EmptyState.jsx';
import { CitySheet } from './components/CitySheet.jsx';
import { FiltersSheet } from './components/FiltersSheet.jsx';
import { ListingSheet } from './components/ListingSheet.jsx';
import { FavoritesSheet } from './components/FavoritesSheet.jsx';
import { SubmitSheet } from './components/SubmitSheet.jsx';
import { MyListingsSheet } from './components/MyListingsSheet.jsx';
import { useListings } from './hooks/useListings.js';
import { useFavorites } from './hooks/useFavorites.js';
import { useDebounced } from './hooks/useDebounced.js';
import { getCityCounts, hasBackend } from './lib/api.js';
import { CITIES, EMPTY_FILTERS, districtsOf, countActiveFilters, makeFilters } from './lib/schema.js';
import { plural } from './lib/format.js';
import { storage } from './lib/storage.js';
import { haptic } from './lib/telegram.js';

export default function App() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Стопка открытых шторок: из избранного можно открыть объявление
  // и вернуться обратно в избранное, а не в ленту.
  const [sheets, setSheets] = useState([]);
  const [openListing, setOpenListing] = useState(null);
  const [cityCounts, setCityCounts] = useState(null);
  // Меняется после отправки заявки, чтобы «Мои объявления» перечитали список.
  const [submittedAt, setSubmittedAt] = useState(0);

  const favorites = useFavorites();
  const debouncedQuery = useDebounced(query, 350);

  // Восстановление настроек. Пока не загрузились — фильтры не сохраняем,
  // иначе умолчание затрёт сохранённый город.
  useEffect(() => {
    let cancelled = false;
    Promise.all([storage.loadCity(), storage.loadFilters()]).then(([city, saved]) => {
      if (cancelled) return;
      const restored = makeFilters(saved);
      if (city && CITIES.some((c) => c.id === city)) restored.city = city;
      restored.q = '';
      setFilters(restored);
      setSettingsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    storage.saveCity(filters.city);
    storage.saveFilters({ ...filters, q: '' });
  }, [filters, settingsLoaded]);

  useEffect(() => {
    let cancelled = false;
    getCityCounts(filters.deal).then((counts) => {
      if (!cancelled) setCityCounts(counts);
    });
    return () => {
      cancelled = true;
    };
  }, [filters.deal]);

  const effectiveFilters = useMemo(
    () => ({ ...filters, q: debouncedQuery.trim() }),
    [filters, debouncedQuery],
  );

  const { items, total, loading, loadingMore, hasMore, loadMore, error } =
    useListings(effectiveFilters);

  // Подгрузка следующей страницы по мере прокрутки.
  const sentinel = useRef(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  const setCity = useCallback((city) => {
    // Районы у городов разные — старый выбор после смены города бессмыслен.
    setFilters((prev) => ({ ...prev, city, district: '' }));
  }, []);

  const districtOptions = useMemo(
    () => [{ id: '', label: 'Все районы' }, ...districtsOf(filters.city)],
    [filters.city],
  );

  const activeFilters = countActiveFilters(filters);

  const openSheet = useCallback((name) => {
    setSheets((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const closeSheet = useCallback((name) => {
    setSheets((prev) => prev.filter((item) => item !== name));
  }, []);

  const openCard = useCallback(
    (listing) => {
      haptic('light');
      setOpenListing(listing);
      openSheet('listing');
    },
    [openSheet],
  );

  return (
    <div className="min-h-dvh bg-bg">
      <Header
        city={filters.city}
        onOpenCity={() => openSheet('city')}
        onOpenFilters={() => openSheet('filters')}
        onOpenFavorites={() => openSheet('favorites')}
        onOpenSubmit={hasBackend ? () => openSheet('submit') : null}
        activeFilters={activeFilters}
        favoritesCount={favorites.ids.length}
        query={query}
        onQueryChange={setQuery}
      />

      <Chips
        options={districtOptions}
        value={filters.district}
        onChange={(district) => setFilters((prev) => ({ ...prev, district }))}
        className="pb-3"
      />

      <main className="px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <EmptyState title="Не удалось загрузить" hint={error} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Здесь пока пусто"
            hint={
              activeFilters > 0 || effectiveFilters.q
                ? 'Попробуйте убрать часть фильтров или изменить запрос.'
                : 'В этом городе объявлений ещё нет. Загляните позже — лента обновляется автоматически.'
            }
            actionLabel={activeFilters > 0 ? 'Сбросить фильтры' : undefined}
            action={
              activeFilters > 0
                ? () => setFilters((prev) => ({ ...EMPTY_FILTERS, city: prev.city }))
                : undefined
            }
          />
        ) : (
          <>
            <ListingList
              items={items}
              isFavorite={favorites.has}
              onToggleFavorite={favorites.toggle}
              onOpen={openCard}
            />

            <div ref={sentinel} aria-hidden="true" className="h-1" />

            {loadingMore ? (
              <div className="mt-2 overflow-hidden rounded-[10px] bg-card">
                <CardSkeleton />
              </div>
            ) : null}

            {!hasMore ? (
              <p className="nums px-1 pt-3 text-center text-caption text-label-3">
                {total} {plural(total, ['объявление', 'объявления', 'объявлений'])} — это всё
              </p>
            ) : null}
          </>
        )}
      </main>

      <CitySheet
        open={sheets.includes('city')}
        onClose={() => closeSheet('city')}
        city={filters.city}
        counts={cityCounts}
        onSelect={setCity}
      />

      <FiltersSheet
        open={sheets.includes('filters')}
        onClose={() => closeSheet('filters')}
        filters={filters}
        total={loading ? undefined : total}
        onApply={(next) => {
          setFilters({ ...next, q: filters.q });
          closeSheet('filters');
        }}
      />

      <FavoritesSheet
        open={sheets.includes('favorites')}
        onClose={() => closeSheet('favorites')}
        ids={favorites.ids}
        isFavorite={favorites.has}
        onToggleFavorite={favorites.toggle}
        onOpen={openCard}
      />

      <SubmitSheet
        open={sheets.includes('submit')}
        onClose={() => closeSheet('submit')}
        city={filters.city}
        onSubmitted={() => setSubmittedAt(Date.now())}
        onOpenMine={() => openSheet('mine')}
      />

      <MyListingsSheet
        open={sheets.includes('mine')}
        onClose={() => closeSheet('mine')}
        reloadKey={submittedAt}
        isFavorite={favorites.has}
        onToggleFavorite={favorites.toggle}
        onOpen={openCard}
      />

      <ListingSheet
        open={sheets.includes('listing')}
        onClose={() => closeSheet('listing')}
        listing={openListing}
        favorite={openListing ? favorites.has(openListing.id) : false}
        onToggleFavorite={favorites.toggle}
      />
    </div>
  );
}
