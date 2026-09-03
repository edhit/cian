import { ChevronDown, Heart, Search, SlidersHorizontal, X } from 'lucide-react';
import { cityLabel } from '../lib/schema.js';

export function Header({
  city,
  onOpenCity,
  onOpenFilters,
  onOpenFavorites,
  activeFilters,
  favoritesCount,
  query,
  onQueryChange,
}) {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex items-center gap-2 px-4 pt-2 pb-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-caption text-label-2">Жильё в Саудовской Аравии</div>
          <button
            type="button"
            onClick={onOpenCity}
            className="-ml-0.5 flex max-w-full items-center gap-1 px-0.5 py-0.5 active:opacity-60"
          >
            <span className="truncate text-[22px] leading-7 font-bold text-label">
              {cityLabel(city) || 'Город'}
            </span>
            <ChevronDown size={18} className="shrink-0 text-label-2" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenFavorites}
          aria-label="Избранное"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-card active:opacity-60"
        >
          <Heart size={19} className="text-label" />
          {favoritesCount > 0 ? (
            <span className="nums absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[11px] leading-4 font-semibold text-white">
              {favoritesCount}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onOpenFilters}
          aria-label="Фильтры"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-card active:opacity-60"
        >
          <SlidersHorizontal size={19} className="text-label" />
          {activeFilters > 0 ? (
            <span className="nums absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[11px] leading-4 font-semibold text-white">
              {activeFilters}
            </span>
          ) : null}
        </button>
      </div>

      <div className="px-4 pt-1 pb-2">
        <label className="flex items-center gap-2 rounded-[10px] bg-card px-3 py-2">
          <Search size={17} className="shrink-0 text-label-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Район, адрес, описание"
            className="min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => onQueryChange('')}
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-fill text-label-2"
            >
              <X size={13} strokeWidth={3} />
            </button>
          ) : null}
        </label>
      </div>
    </header>
  );
}
