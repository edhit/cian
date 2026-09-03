import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api, initDataFor, signInitData, INGEST_TOKEN, BOT_TOKEN } from './helpers.mjs';
import { normalizeListing, queryListings } from '../src/schema.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../public/listings.json', import.meta.url), 'utf8'));
const local = fixture.items.map(normalizeListing);

test('парсер загружает объявления', async () => {
  const res = await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: fixture });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.upserted, fixture.items.length);
  assert.equal(res.body.skipped, 0);
});

test('загрузка идемпотентна: повторный прогон не плодит дубли', async () => {
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: fixture });
  const res = await api('/listings?deal=rent&city=medina&limit=50');
  const ids = res.body.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('без секрета парсера загрузка отклоняется', async () => {
  const res = await api('/ingest', { method: 'POST', body: fixture });
  assert.equal(res.status, 401);
  const wrong = await api('/ingest', { method: 'POST', ingest: 'wrong-secret', body: fixture });
  assert.equal(wrong.status, 401);
});

test('битые записи пропускаются, а не роняют загрузку', async () => {
  const res = await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: {
    items: [ {}, { city: 'yanbu' }, { id: 'ok-1', city: 'yanbu', priceYear: '30 000', rooms: 'две', contact: null } ],
  } });
  assert.equal(res.status, 200);
  assert.equal(res.body.upserted, 1);
  assert.equal(res.body.skipped, 2);
  await api(`/listings/ok-1`); // не должно падать
});

test('порядок и состав ленты совпадают с клиентским queryListings', async () => {
  const cases = [
    { deal: 'rent', city: 'medina' },
    { deal: 'rent', city: 'medina', district: 'haram' },
    { deal: 'rent', city: 'medina', rooms: 4 },
    { deal: 'rent', city: 'medina', priceMin: 30000, priceMax: 60000 },
    { deal: 'sale', city: 'medina' },
    { deal: 'rent', city: 'jeddah', q: 'море' },
    { deal: 'rent', city: 'medina', q: 'харам квартира' },
  ];

  for (const filters of cases) {
    const params = new URLSearchParams({ ...filters, limit: '50' });
    const res = await api(`/listings?${params}`);
    assert.equal(res.status, 200, JSON.stringify(filters));

    const expected = queryListings(local, { ...filters, q: filters.q || '' }, null, 50);
    assert.deepEqual(
      res.body.items.map((i) => i.id),
      expected.items.map((i) => i.id),
      `порядок разошёлся на ${JSON.stringify(filters)}`,
    );
    assert.equal(res.body.total, expected.total, `total разошёлся на ${JSON.stringify(filters)}`);
  }
});

test('пагинация по курсору выдаёт каждое объявление ровно один раз', async () => {
  const collected = [];
  let cursor = null;
  let guard = 0;

  do {
    const params = new URLSearchParams({ deal: 'rent', city: 'medina', limit: '7' });
    if (cursor) params.set('cursor', cursor);
    const res = await api(`/listings?${params}`);
    collected.push(...res.body.items.map((i) => i.id));
    cursor = res.body.nextCursor;
    assert.ok((guard += 1) < 20, 'курсор не сходится');
  } while (cursor);

  const expected = queryListings(local, { deal: 'rent', city: 'medina' }, null, 1000);
  assert.deepEqual(collected, expected.items.map((i) => i.id));
  assert.equal(new Set(collected).size, collected.length);
});

test('просроченные объявления в ленту не попадают', async () => {
  const res = await api('/listings?deal=rent&city=medina&limit=50');
  const expired = res.body.items.filter((i) => i.expiresAt && new Date(i.expiresAt) < new Date());
  assert.deepEqual(expired, []);
});

test('деталь объявления доступна и после истечения срока', async () => {
  const expiredId = local.find((i) => i.expiresAt && new Date(i.expiresAt) < new Date()).id;
  const res = await api(`/listings/${expiredId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.item.id, expiredId);
});

test('несуществующее объявление даёт 404', async () => {
  const res = await api('/listings/нет-такого');
  assert.equal(res.status, 404);
});

test('счётчики по городам совпадают с подсчётом по тем же правилам', async () => {
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: fixture });
  const res = await api('/facets?deal=rent');
  assert.equal(res.status, 200);

  const now = Date.now();
  for (const city of ['medina', 'makkah', 'jeddah', 'riyadh']) {
    const expected = local.filter(
      (i) => i.dealType === 'rent' && i.city === city && (!i.expiresAt || new Date(i.expiresAt).getTime() >= now),
    ).length;
    assert.equal(res.body.cityCounts[city] || 0, expected, `город ${city}`);
  }
  // Нулевых значений в ответе быть не должно: город без объявлений просто
  // отсутствует, и фронт трактует это как ноль.
  for (const [city, n] of Object.entries(res.body.cityCounts)) {
    assert.ok(Number.isInteger(n) && n > 0, `город ${city} с бессмысленным счётчиком ${n}`);
  }
});
