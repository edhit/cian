import { haptic } from '../lib/telegram.js';

/** Горизонтальная лента выбора одним нажатием. */
export function Chips({ options, value, onChange, className = '' }) {
  return (
    <div className={`no-scrollbar flex gap-2 overflow-x-auto px-4 ${className}`}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => {
              haptic('select');
              onChange(option.id);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[15px] leading-5 whitespace-nowrap transition-colors ${
              active ? 'bg-accent text-white' : 'bg-card text-label'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Сегменты в одном блоке — для выбора из двух-четырёх равнозначных вариантов. */
export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-1 rounded-[9px] bg-fill p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => {
              haptic('select');
              onChange(option.id);
            }}
            className={`flex-1 rounded-[7px] px-2 py-1.5 text-[15px] leading-5 ${
              active ? 'bg-card font-medium text-label' : 'text-label-2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
