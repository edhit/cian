// Эти проверки идут в обход HTTP: обработчик вызывается напрямую с пустым env,
// потому что нам нужно поведение именно тогда, когда привязок нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ORIGIN = 'https://cianksa.pages.dev';

const call = (path, init = {}) =>
  worker.fetch(new Request(`https://realty-api.example${path}`, {
    headers: { Origin: ORIGIN, ...(init.headers || {}) },
    ...init,
  }), init.env ?? {});

test('без привязки к базе запрос не падает, а объясняет причину', async () => {
  const res = await call('/listings?deal=rent&city=medina');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'no-database');
});

test('CORS-заголовок есть даже когда ничего не настроено', async () => {
  // Без него браузер показывает «Missing Allow Origin» и настоящая причина теряется.
  const res = await call('/listings');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('предварительный запрос отвечает без базы', async () => {
  const res = await call('/listings', { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.ok(res.headers.get('Access-Control-Allow-Origin'));
});

test('/health перечисляет, что настроено, и не выдаёт секретов', async () => {
  const res = await call('/health');
  assert.equal(res.status, 503, 'без базы состояние не «здоровое»');

  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.db, 'нет привязки');
  assert.equal(body.botToken, false);
  assert.equal(body.ingestToken, false);

  const text = JSON.stringify(body);
  assert.ok(!text.includes('TEST-BOT-TOKEN'), 'значение токена наружу не уходит');
});

test('/health видит заданные секреты, но показывает только факт', async () => {
  const res = await call('/health', { env: { BOT_TOKEN: 'сек:рет', INGEST_TOKEN: 'другой' } });
  const body = await res.json();
  assert.equal(body.botToken, true);
  assert.equal(body.ingestToken, true);
  assert.ok(!JSON.stringify(body).includes('сек:рет'));
});

test('/health сообщает про непринятые миграции', async () => {
  const env = {
    DB: {
      prepare: () => ({ first: async () => { throw new Error('D1_ERROR: no such table: listings'); } }),
    },
  };
  const body = await (await call('/health', { env })).json();
  assert.match(body.db, /миграции/);
});

test('фотографии без бакета тоже отвечают понятно', async () => {
  const res = await call('/photos/x.png');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'no-bucket');
});

test('исключение внутри обработчика не уходит наружу голым', async () => {
  const env = { DB: { prepare: () => { throw new Error('внезапно'); } } };
  const res = await call('/listings?city=medina', { env });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'internal');
  // Главное: ответ остаётся нашим, с заголовками, а не страницей Cloudflare.
  assert.ok(res.headers.get('Access-Control-Allow-Origin'));
});

test('битый адрес не роняет обработчик', async () => {
  const res = await worker.fetch(new Request('https://realty-api.example/listings?q=%'), {});
  assert.ok(res.status === 503 || res.status === 500);
  assert.ok(res.headers.get('Access-Control-Allow-Origin'));
});

test('отставшая схема базы называется по имени, а не «внутренней ошибкой»', async () => {
  // Именно так это выглядело у пользователя: в wrangler tail «Ok», а в интерфейсе
  // безликое «сервер не принял файл».
  const env = {
    PHOTOS: { get: async () => null, put: async () => {} },
    DB: { prepare: () => { throw new Error('D1_ERROR: no such table: user_photos'); } },
  };
  const res = await call('/listings?city=medina', { env });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'no-migration');
});

test('/health перечисляет недостающие таблицы поимённо', async () => {
  const present = ['listings', 'reports'];
  const env = {
    DB: {
      prepare: (sql) => ({
        first: async () => ({ n: 5 }),
        all: async () =>
          sql.includes('sqlite_master') ? { results: present.map((name) => ({ name })) } : { results: [] },
      }),
    },
  };

  const body = await (await call('/health', { env })).json();
  assert.equal(body.ok, false);
  assert.match(body.db, /не хватает таблиц/);
  for (const missing of ['trusted_contacts', 'moderation_messages', 'user_photos']) {
    assert.match(body.db, new RegExp(missing));
  }
  assert.match(body.db, /migrations apply/);
});

test('полная схема считается здоровой', async () => {
  const all = ['listings', 'reports', 'trusted_contacts', 'moderation_messages', 'user_photos'];
  const env = {
    DB: {
      prepare: (sql) => ({
        first: async () => ({ n: 7 }),
        all: async () =>
          sql.includes('sqlite_master') ? { results: all.map((name) => ({ name })) } : { results: [] },
      }),
    },
  };
  const res = await call('/health', { env });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).db, 'ок');
});
