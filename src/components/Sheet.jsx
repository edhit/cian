import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { pushBackHandler } from '../lib/telegram.js';

const SheetContext = createContext(() => {});

/** Закрыть шторку изнутри её содержимого, не ломая анимацию. */
export function useSheet() {
  return useContext(SheetContext);
}

const ANIMATION_MS = 260;

// Шторки могут лежать одна на другой (избранное -> объявление).
// Escape и клик по фону должны закрывать только верхнюю.
const escapeStack = [];

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  const top = escapeStack[escapeStack.length - 1];
  if (top) top();
}

function pushEscapeHandler(handler) {
  if (escapeStack.length === 0) document.addEventListener('keydown', handleEscape);
  escapeStack.push(handler);

  return () => {
    const index = escapeStack.lastIndexOf(handler);
    if (index !== -1) escapeStack.splice(index, 1);
    if (escapeStack.length === 0) document.removeEventListener('keydown', handleEscape);
  };
}

/**
 * Шторка снизу вместо модального окна посреди экрана.
 * Внутри телеграма закрывается системной кнопкой «назад».
 */
export function Sheet({ open, onClose, title, children, footer, full = false }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const closingTimer = useRef(null);

  const requestClose = useCallback(() => {
    setShown(false);
    clearTimeout(closingTimer.current);
    closingTimer.current = setTimeout(onClose, ANIMATION_MS);
  }, [onClose]);

  useEffect(() => {
    clearTimeout(closingTimer.current);
    if (open) {
      setMounted(true);
      // Кадр между монтированием и переходом — иначе анимации въезда не будет.
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    closingTimer.current = setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => clearTimeout(closingTimer.current);
  }, [open]);

  useEffect(() => () => clearTimeout(closingTimer.current), []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const removeEscape = pushEscapeHandler(requestClose);
    const removeBack = pushBackHandler(requestClose);

    return () => {
      document.body.style.overflow = previousOverflow;
      removeEscape();
      removeBack();
    };
  }, [open, requestClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Закрыть"
        onClick={requestClose}
        className={`absolute inset-0 w-full cursor-default bg-black/35 transition-opacity duration-[250ms] ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[14px] bg-bg transition-transform duration-[250ms] ease-out ${
          shown ? 'translate-y-0' : 'translate-y-full'
        } ${full ? 'top-[max(24px,env(safe-area-inset-top))]' : 'max-h-[88vh]'}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-separator px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-body font-semibold text-label">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            className="-mr-1 flex size-8 items-center justify-center rounded-full bg-fill text-label-2 active:opacity-60"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SheetContext.Provider value={requestClose}>{children}</SheetContext.Provider>
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-separator bg-card px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <SheetContext.Provider value={requestClose}>{footer}</SheetContext.Provider>
          </div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
        )}
      </div>
    </div>
  );
}
