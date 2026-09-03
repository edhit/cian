import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Sheet } from './Sheet.jsx';
import { ListingList } from './ListingCard.jsx';
import { ListSkeleton } from './Skeletons.jsx';
import { getListingsByIds } from '../lib/api.js';
import { isExpired } from '../lib/schema.js';

export function FavoritesSheet({ open, onClose, ids, isFavorite, onToggleFavorite, onOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);

    getListingsByIds(ids)
      .then((found) => {
        if (!cancelled) setItems(found);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Список перечитывается только при открытии: снятое сердце не должно
    // выдёргивать карточку из-под пальца.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const missing = ids.length - items.length;

  return (
    <Sheet open={open} onClose={onClose} title="Избранное">
      <div className="p-4">
        {loading ? (
          <ListSkeleton count={3} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Heart size={28} className="text-label-3" />
            <p className="text-body text-label">Пока пусто</p>
            <p className="text-caption text-label-2">
              Нажимайте на сердце в карточке — список сохранится в вашем аккаунте Telegram.
            </p>
          </div>
        ) : (
          <>
            <ListingList
              items={items}
              isFavorite={isFavorite}
              onToggleFavorite={onToggleFavorite}
              onOpen={onOpen}
            />
            {items.some((item) => isExpired(item)) ? (
              <p className="px-1 pt-2 text-caption text-label-3">
                Часть объявлений уже просрочена — они остаются в избранном, но в ленте их нет.
              </p>
            ) : null}
            {missing > 0 ? (
              <p className="px-1 pt-2 text-caption text-label-3">
                Ещё {missing} из избранного больше нет в базе.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
