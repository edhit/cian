/**
 * Заголовок Origin — это всегда «схема://хост[:порт]», без косой черты в конце
 * и без пути. В настройках же почти всегда пишут адрес сайта целиком, вместе
 * с завершающим слэшем, и строгое сравнение молча ломает весь фронт.
 */
export function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '*') return raw;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function corsHeaders(request, env) {
  // Этот вызов стоит и в обработчике ошибок, поэтому сам он падать не имеет права:
  // иначе вместо понятного ответа наружу уйдёт голая пятисотка без заголовков.
  try {
    return buildCorsHeaders(request, env);
  } catch {
    return { 'Access-Control-Allow-Origin': '*' };
  }
}

function buildCorsHeaders(request, env = {}) {
  const allowed = ((env && env.ALLOWED_ORIGINS) || '*')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const origin = normalizeOrigin(request && request.headers && request.headers.get('Origin'));
  const anyOrigin = allowed.includes('*');
  const allow = anyOrigin ? '*' : allowed.includes(origin) ? origin : '';

  // Браузер покажет это как обрыв связи, поэтому причину пишем в лог:
  // без неё отладка сводится к угадыванию. Смотреть через `wrangler tail`.
  if (origin && !allow) {
    console.warn(
      `CORS: origin ${origin} не входит в ALLOWED_ORIGINS (${allowed.join(', ') || 'пусто'})`,
    );
  }

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  // Ответ зависит от Origin — иначе кэш отдаст чужие заголовки.
  if (!anyOrigin) headers.Vary = 'Origin';
  return headers;
}

export function json(data, { status = 200, request, env, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(request ? corsHeaders(request, env) : {}),
      ...headers,
    },
  });
}

export function error(status, reason, context) {
  return json({ ok: false, error: reason }, { ...context, status });
}

export async function readJson(request, limitBytes = 512 * 1024) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > limitBytes) return { tooLarge: true };
  try {
    const text = await request.text();
    if (text.length > limitBytes) return { tooLarge: true };
    return { value: JSON.parse(text) };
  } catch {
    return { invalid: true };
  }
}
