import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, INGEST_TOKEN } from './helpers.mjs';

// Однопиксельный PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function put(key, body, { type = 'image/png', token = INGEST_TOKEN, raw = false } = {}) {
  const headers = { 'Content-Type': type };
  if (token) headers.Authorization = `Bearer ${token}`;
  // fetch схлопывает ../ в адресе ещё до отправки, поэтому ключ кодируем.
  const path = raw ? key : encodeURIComponent(key);
  const res = await fetch(`${BASE}/photos/${path}`, { method: 'PUT', headers, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('фотография загружается и отдаётся обратно', async () => {
  const res = await put('abc123.png', PNG, { raw: true });
  assert.equal(res.status, 200);
  assert.ok(res.body.url.endsWith('/photos/abc123.png'));

  const got = await fetch(`${BASE}/photos/abc123.png`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('Content-Type'), 'image/png');
  assert.match(got.headers.get('Cache-Control'), /immutable/);
  assert.equal(Buffer.from(await got.arrayBuffer()).length, PNG.length);
});

test('загрузка без секрета отклоняется', async () => {
  assert.equal((await put('nope.png', PNG, { token: '' })).status, 401);
});

test('не-картинки отклоняются', async () => {
  assert.equal((await put('evil.png', 'alert(1)', { type: 'application/javascript' })).status, 415);
  assert.equal((await put('evil2.png', '<svg onload=alert(1)>', { type: 'image/svg+xml' })).status, 415);
});

test('ключ с выходом за каталог отклоняется', async () => {
  assert.equal((await put('../secret', PNG)).status, 400);
  assert.equal((await put('.hidden', PNG)).status, 400);
});

test('слишком большой файл отклоняется', async () => {
  assert.equal((await put('big.png', Buffer.alloc(6 * 1024 * 1024)).catch(() => ({ status: 413 }))).status, 413);
});

test('отсутствующая фотография даёт 404', async () => {
  const res = await fetch(`${BASE}/photos/нет.png`);
  assert.equal(res.status, 404);
});

test('CORS: предварительный запрос разрешён', async () => {
  const res = await fetch(`${BASE}/listings`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://cianksa.pages.dev', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('неизвестный маршрут даёт 404, а не пятисотку', async () => {
  const res = await fetch(`${BASE}/чего-то-нет`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not-found');
});

test('CORS: адрес с косой чертой в конце всё равно совпадает', async () => {
  // Origin от браузера — «схема://хост», а в настройках почти всегда пишут
  // адрес сайта целиком, со слэшем. Строгое сравнение ломало бы весь фронт.
  const { normalizeOrigin } = await import('../src/http.js');
  assert.equal(normalizeOrigin('https://cianksa.pages.dev/'), 'https://cianksa.pages.dev');
  assert.equal(normalizeOrigin('  https://cianksa.pages.dev  '), 'https://cianksa.pages.dev');
  assert.equal(normalizeOrigin('https://cianksa.pages.dev/app/'), 'https://cianksa.pages.dev');
  assert.equal(normalizeOrigin('*'), '*');
  assert.equal(normalizeOrigin(''), '');
  assert.equal(normalizeOrigin(null), '');
});

test('CORS: настроенный источник получает заголовок', async () => {
  // Соответствие адреса со слэшем на конце проверяется юнит-тестом normalizeOrigin
  // выше: подставить сюда свой ALLOWED_ORIGINS тест не может — это настройка сервера.
  const origin = 'https://cianksa.pages.dev';
  const res = await fetch(`${BASE}/listings?limit=1`, { headers: { Origin: origin } });
  const allow = res.headers.get('Access-Control-Allow-Origin');
  assert.ok(allow === '*' || allow === origin, `неожиданный Access-Control-Allow-Origin: ${allow}`);
});
