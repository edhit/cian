import { haptic } from '../lib/telegram.js';

/** Строка сгруппированного списка: подпись сверху, поле снизу. */
export function Field({ label, hint, invalid, children }) {
  return (
    <div className="border-t border-separator px-4 py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <span className={`text-caption ${invalid ? 'text-danger' : 'text-label-2'}`}>{label}</span>
        {hint ? <span className="text-caption text-label-3">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-[9px] bg-fill px-3 py-2 text-body text-label outline-none placeholder:text-label-3';

export function TextInput({ value, onChange, placeholder, maxLength, invalid }) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} ${invalid ? 'ring-1 ring-danger' : ''}`}
    />
  );
}

export function NumberInput({ value, onChange, placeholder, invalid }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      value={value || ''}
      placeholder={placeholder}
      onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      className={`nums ${inputClass} ${invalid ? 'ring-1 ring-danger' : ''} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
    />
  );
}

export function TextArea({ value, onChange, placeholder, maxLength }) {
  return (
    <textarea
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      rows={5}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} resize-none`}
    />
  );
}

export function Toggle({ value, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => {
        haptic('select');
        onChange(!value);
      }}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-body text-label">{label}</span>
      <span
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${
          value ? 'bg-accent' : 'bg-fill'
        }`}
      >
        <span
          className={`absolute top-[2px] size-[27px] rounded-full bg-white transition-[left] ${
            value ? 'left-[22px]' : 'left-[2px]'
          }`}
        />
      </span>
    </button>
  );
}

/** Выбор одного значения из набора. Пустой id — «не указано». */
export function PickOne({ options, value, onChange, invalid }) {
  return (
    <div className={`flex flex-wrap gap-2 ${invalid ? 'rounded-[9px] ring-1 ring-danger' : ''}`}>
      {options.map((option) => {
        const active = String(option.id) === String(value);
        return (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => {
              haptic('select');
              onChange(option.id);
            }}
            className={`rounded-full px-3.5 py-1.5 text-[15px] leading-5 ${
              active ? 'bg-accent text-white' : 'bg-fill text-label'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function PickMany({ options, values, onChange }) {
  const selected = new Set(values);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              haptic('select');
              const next = new Set(selected);
              if (active) next.delete(option.id);
              else next.add(option.id);
              onChange([...next]);
            }}
            className={`rounded-full px-3.5 py-1.5 text-[15px] leading-5 ${
              active ? 'bg-accent text-white' : 'bg-fill text-label'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
