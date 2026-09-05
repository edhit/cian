// Вся работа с мини-приложением спрятана здесь. Браузерный путь — основной,
// телеграмный — надстройка: ни одна функция не падает без window.Telegram.

export const tg = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;

export const isTelegram = Boolean(tg && tg.initData);

function safe(fn, fallback = undefined) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/* --------------------------------- тема --------------------------------- */

// Ключ themeParams -> наша CSS-переменная. Остальной код не знает,
// откуда пришёл цвет: из телеграма или из index.css.
const THEME_MAP = {
  '--bg': ['secondary_bg_color', 'bg_color'],
  '--card': ['section_bg_color', 'bg_color'],
  '--label': ['text_color'],
  '--label-2': ['subtitle_text_color', 'hint_color'],
  '--label-3': ['hint_color'],
  '--separator': ['section_separator_color'],
  '--fill': ['secondary_bg_color'],
  '--accent': ['accent_text_color', 'link_color', 'button_color'],
  '--danger': ['destructive_text_color'],
};

function isColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim());
}

function applyTheme() {
  if (!tg) return;
  const params = tg.themeParams || {};
  const root = document.documentElement;

  const pick = (cssVar) => {
    const key = THEME_MAP[cssVar].find((k) => isColor(params[k]));
    return key ? params[key].trim() : null;
  };

  for (const cssVar of Object.keys(THEME_MAP)) {
    const color = pick(cssVar);
    // Пустой themeParams не должен затирать наши значения.
    if (color) root.style.setProperty(cssVar, color);
  }

  const accent = pick('--accent');
  const card = pick('--card');
  // Подложки под акцент в themeParams нет — разбавляем акцент фоном карточки.
  if (accent && card) {
    root.style.setProperty('--accent-2', `color-mix(in srgb, ${accent} 16%, ${card})`);
  }

  if (isColor(params.secondary_bg_color)) {
    safe(() => tg.setBackgroundColor(params.secondary_bg_color));
    safe(() => tg.setHeaderColor(params.secondary_bg_color));
  }
}

/* --------------------------------- запуск -------------------------------- */

let inited = false;

export function initTelegram() {
  if (!tg || inited) return isTelegram;
  inited = true;

  safe(() => tg.ready());
  safe(() => tg.expand());
  safe(() => tg.disableVerticalSwipes && tg.disableVerticalSwipes());
  applyTheme();
  safe(() => tg.onEvent('themeChanged', applyTheme));

  return isTelegram;
}

export function getUser() {
  // initDataUnsafe пригоден только для интерфейса. Настоящая проверка — на Worker.
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (!user || !user.id) return null;
  return {
    id: user.id,
    firstName: user.first_name || '',
    username: user.username || '',
  };
}

export function getInitData() {
  return (tg && tg.initData) || '';
}

/* --------------------------- кнопка «назад» ------------------------------ */

// Шторки могут открываться поверх друг друга, поэтому считаем их стопкой:
// прячем системную кнопку только когда закрылась последняя.
const backStack = [];

function syncBackButton() {
  if (!tg || !tg.BackButton) return;
  if (backStack.length > 0) safe(() => tg.BackButton.show());
  else safe(() => tg.BackButton.hide());
  if (tg.enableClosingConfirmation && tg.disableClosingConfirmation) {
    safe(() => (backStack.length > 0 ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation()));
  }
}

function handleBack() {
  const top = backStack[backStack.length - 1];
  if (top) top();
}

let backBound = false;

/** Показывает системную кнопку «назад» и вешает на неё обработчик. Возвращает снятие. */
export function pushBackHandler(handler) {
  if (!tg || !tg.BackButton) return () => {};
  if (!backBound) {
    backBound = true;
    safe(() => tg.BackButton.onClick(handleBack));
  }
  backStack.push(handler);
  syncBackButton();

  return () => {
    const index = backStack.lastIndexOf(handler);
    if (index !== -1) backStack.splice(index, 1);
    syncBackButton();
  };
}

/* --------------------------------- ссылки -------------------------------- */

export function openLink(url) {
  const href = String(url || '').trim();
  if (!href) return;

  // tel: и mailto: телеграмовский openLink не открывает — только браузерный переход.
  if (/^(tel:|mailto:)/i.test(href)) {
    if (typeof window !== 'undefined') window.location.href = href;
    return;
  }

  if (tg && /^https?:\/\/(t\.me|telegram\.me)\//i.test(href) && tg.openTelegramLink) {
    // Иначе телеграм откроет браузер поверх себя и человек потеряется.
    safe(() => tg.openTelegramLink(href));
    return;
  }

  if (tg && tg.openLink) {
    safe(() => tg.openLink(href, { try_instant_view: false }));
    return;
  }

  if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer');
}

/* -------------------------------- вибрация ------------------------------- */

export function haptic(type = 'light') {
  const hf = tg && tg.HapticFeedback;
  if (!hf) return;
  if (type === 'select') safe(() => hf.selectionChanged());
  else if (['success', 'warning', 'error'].includes(type)) safe(() => hf.notificationOccurred(type));
  else safe(() => hf.impactOccurred(type));
}

/* -------------------------------- хранилище ------------------------------ */

const CLOUD_STORAGE_SINCE = '6.9';

function cloudStorage() {
  const cs = tg && tg.CloudStorage;
  if (!cs || typeof cs.getItem !== 'function' || typeof cs.setItem !== 'function') return null;

  // В клиентах до 6.9 методы существуют, но вместо работы пишут в консоль
  // «CloudStorage is not supported» и не зовут обратный вызов. Без этой проверки
  // каждый ключ ждал бы своего таймаута на старте приложения.
  if (typeof tg.isVersionAtLeast === 'function' && !safe(() => tg.isVersionAtLeast(CLOUD_STORAGE_SINCE), false)) {
    return null;
  }

  return cs;
}

function localGet(key) {
  return safe(() => window.localStorage.getItem(key), null) ?? null;
}

function localSet(key, value) {
  safe(() => window.localStorage.setItem(key, value));
}

export const cloud = {
  /** @returns {Promise<string|null>} */
  get(key) {
    const cs = cloudStorage();
    if (!cs) return Promise.resolve(localGet(key));

    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      // Молчащий клиент не должен вешать загрузку интерфейса.
      const timer = setTimeout(() => done(localGet(key)), 1500);

      try {
        cs.getItem(key, (err, value) => {
          done(err || value === undefined || value === null || value === '' ? localGet(key) : value);
        });
      } catch {
        done(localGet(key));
      }
    });
  },

  /** @returns {Promise<boolean>} */
  set(key, value) {
    const text = String(value);
    localSet(key, text); // локальная копия всегда: она же откат, если облака нет

    const cs = cloudStorage();
    if (!cs) return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), 1500);

      try {
        cs.setItem(key, text, (err, ok) => done(!err && ok !== false));
      } catch {
        done(false);
      }
    });
  },
};
