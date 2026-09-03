import { Inbox } from 'lucide-react';

export function EmptyState({ title, hint, action, actionLabel }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <Inbox size={30} className="text-label-3" strokeWidth={1.5} />
      <p className="text-body text-label">{title}</p>
      {hint ? <p className="max-w-xs text-caption text-label-2">{hint}</p> : null}
      {action ? (
        <button
          type="button"
          onClick={action}
          className="mt-2 rounded-full bg-fill px-4 py-2 text-[15px] leading-5 text-accent active:opacity-60"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
