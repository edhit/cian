import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Sheet } from './Sheet.jsx';
import { ListingList } from './ListingCard.jsx';
import { ListSkeleton } from './Skeletons.jsx';
import { getMyListings } from '../lib/api.js';

const STATUS = {
  pending: { label: 'На проверке', className: 'bg-fill text-label-2' },
  published: { label: 'Опубликовано', className: 'bg-accent-2 text-accent' },
  hidden: { label: 'Скрыто', className: 'bg-fill text-danger' },
};

const REASONS = {
  unauthorized: 'Telegram не подтвердил, кто вы. Откройте приложение заново.',
  'no-backend': 'Приём заявок пока не подключён.',
  network: 'Не получилось связаться с сервером.',
  server: 'Сервер не ответил.',
};

export function MyListingsSheet({ open, onClose, reloadKey, isFavorite, onToggleFavorite, onOpen }) {
  const [state, setState] = useState({ items: [], loading: true, reason: null });

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    getMyListings().then((response) => {
      if (cancelled) return;
      setState({ items: response.items, loading: false, reason: response.reason || null });
    });

    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  // Статус живёт рядом со списком, а не внутри карточки: в ленте его нет.
  const groups = ['pending', 'published', 'hidden']
    .map((status) => ({ status, items: state.items.filter((item) => item.status === status) }))
    .filter((group) => group.items.length > 0);

  return (
    <Sheet open={open} onClose={onClose} title="Мои объявления">
      <div className="space-y-4 p-4">
        {state.loading ? (
          <ListSkeleton count={2} />
        ) : state.reason ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-body text-label">Не удалось загрузить</p>
            <p className="text-caption text-label-2">{REASONS[state.reason] || REASONS.server}</p>
          </div>
        ) : state.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <FileText size={28} className="text-label-3" strokeWidth={1.5} />
            <p className="text-body text-label">Вы ещё ничего не подавали</p>
            <p className="text-caption text-label-2">
              Заявки появятся здесь вместе со статусом проверки.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.status}>
              <div className="flex items-center gap-2 px-1 pb-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-caption ${STATUS[group.status].className}`}
                >
                  {STATUS[group.status].label}
                </span>
                <span className="nums text-caption text-label-3">{group.items.length}</span>
              </div>
              <ListingList
                items={group.items}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
                onOpen={onOpen}
              />
              {group.status === 'hidden' ? (
                <p className="px-1 pt-2 text-caption text-label-3">
                  Скрыто по жалобам. Напишите в чат-первоисточник, если это ошибка.
                </p>
              ) : null}
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}
