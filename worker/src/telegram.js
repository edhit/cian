// Тонкий клиент Bot API. Адрес вынесен в переменную, чтобы в тестах его можно
// было направить на подставной сервер и не ходить в настоящий телеграм.

function apiBase(env) {
  return (env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
}

async function call(env, method, payload) {
  if (!env.BOT_TOKEN) return { ok: false, reason: 'no-bot-token' };

  try {
    const response = await fetch(`${apiBase(env)}/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!data || data.ok !== true) {
      console.error(`Bot API ${method}: ${(data && data.description) || response.status}`);
      return { ok: false, reason: 'api', description: data && data.description };
    }
    return { ok: true, result: data.result };
  } catch (cause) {
    // Модерация не должна ронять запрос человека: заявка уже сохранена.
    console.error(`Bot API ${method} недоступен: ${(cause && cause.message) || cause}`);
    return { ok: false, reason: 'network' };
  }
}

export const bot = {
  sendMessage: (env, payload) => call(env, 'sendMessage', { parse_mode: 'HTML', ...payload }),
  sendPhoto: (env, payload) => call(env, 'sendPhoto', { parse_mode: 'HTML', ...payload }),
  editMessageText: (env, payload) => call(env, 'editMessageText', { parse_mode: 'HTML', ...payload }),
  editMessageCaption: (env, payload) => call(env, 'editMessageCaption', { parse_mode: 'HTML', ...payload }),
  answerCallbackQuery: (env, payload) => call(env, 'answerCallbackQuery', payload),
};

/** Идентификаторы админов из переменной ADMIN_IDS: «123456789, 987654321». */
export function adminIds(env) {
  return String(env.ADMIN_IDS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function isAdmin(env, userId) {
  return adminIds(env).includes(Number(userId));
}

/** Экранирование под parse_mode HTML: текст объявления пишут люди. */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
