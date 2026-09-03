import { useEffect, useState } from 'react';

/** Значение, отстающее от ввода: поиск не должен дёргать выдачу на каждой букве. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
