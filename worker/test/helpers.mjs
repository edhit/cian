import crypto from 'node:crypto';

export const BASE = process.env.WORKER_URL || 'http://localhost:8788';
export const BOT_TOKEN = '123456:TEST-BOT-TOKEN-FOR-LOCAL-ONLY';
export const INGEST_TOKEN = 'local-ingest-secret';

/** Собирает и подписывает initData ровно так, как это делает Telegram. */
export function signInitData(fields, botToken = BOT_TOKEN) {
  const params = new URLSearchParams(fields);
  const pairs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

export function initDataFor(user = { id: 42, first_name: 'Тест', username: 'test' }, extra = {}) {
  return signInitData({
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAA',
    ...extra,
  });
}

// Прогон должен быть повторяемым: локальная база между запусками не очищается,
// поэтому идентификаторы людей и объявлений уникальны для каждого прогона.
export const RUN = Date.now() % 1_000_000;
export const uid = (n) => RUN * 1000 + n;
export const rid = (name) => `t-${RUN}-${name}`;

export async function api(path, { method = 'GET', body, initData, ingest, headers = {} } = {}) {
  const h = { ...headers };
  if (initData) h.Authorization = `tma ${initData}`;
  if (ingest) h.Authorization = `Bearer ${ingest}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON — вернём как есть */ }
  return { status: response.status, body: json, text, headers: response.headers };
}
