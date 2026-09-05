import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { api, INGEST_TOKEN } from './helpers.mjs';
import {
  compareListings,
  isExpired,
  matchesFilters,
  normalizeListing,
  queryListings,
} from '../src/schema.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../public/listings.json', import.meta.url), 'utf8'));
const local = fixture.items.map(normalizeListing);

/** Собирает всю выдачу постранично: сервер отдаёт не больше 50 записей за раз. */
async function collectAll(filters) {
  const items = [];
  let cursor = null;
  let guard = 0;
  do {
    const params = new URLSearchParams({ ...filters, limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const res = await api(`/listings?${params}`);
    items.push(...res.body.items);
    cursor = res.body.nextCursor;
    assert.ok((guard += 1) < 100, 'курсор не сходится');
  } while (cursor);
  return items;
}

test('парсер загружает объявления', async () => {
  const res = await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: fixture });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.upserted, fixture.items.length);
  assert.equal(res.body.skipped, 0);
});

test('загрузка идемпотентна: повторный прогон не плодит дубли', async () => {
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: fixture });
  const ids = (await collectAll({ deal: 'rent', city: 'medina' })).map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('без секрета парсера загрузка отклоняется', async () => {
  assert.equal((await api('/ingest', { method: 'POST', body: fixture })).status, 401);
  assert.equal((await api('/ingest', { method: 'POST', ingest: 'wrong-secret', body: fixture })).status, 401);
});

test('битые записи пропускаются, а не роняют загрузку', async () => {
  const res = await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: {
    items: [{}, { city: 'yanbu' }, { id: 'ok-1', city: 'yanbu', priceYear: '30 000', rooms: 'две', contact: null }],
  } });
  assert.equal(res.status, 200);
  assert.equal(res.body.upserted, 1);
  assert.equal(res.body.skipped, 2);
  await api('/listings/ok-1');
});

test('порядок и состав ленты совпадают с клиентскими правилами', async () => {
  // Сравниваем не с фикстурой, а с самими же выданными записями: база общая
  // на весь прогон, и другие тесты в неё пишут. Инвариант от этого не страдает —
  // выдача сервера обязана быть уже отсортированной так, как отсортировал бы клиент,
  // и содержать только то, что клиент считает подходящим.
  const cases = [
    { deal: 'rent', city: 'medina' },
    { deal: 'rent', city: 'medina', district: 'haram' },
    { deal: 'rent', city: 'medina', rooms: 4 },
    { deal: 'rent', city: 'medina', priceMin: 30000, priceMax: 60000 },
    { deal: 'sale', city: 'medina' },
    { deal: 'rent', city: 'makkah' },
    { deal: 'rent', city: 'medina', q: 'харам квартира' },
  ];

  for (const filters of cases) {
    const params = new URLSearchParams({ ...filters, limit: '50' });
    const res = await api(`/listings?${params}`);
    assert.equal(res.status, 200, JSON.stringify(filters));

    const items = res.body.items;
    const where = JSON.stringify(filters);
    const full = { ...filters, q: filters.q || '' };

    assert.deepEqual(
      [...items].sort(compareListings).map((i) => i.id),
      items.map((i) => i.id),
      `порядок сервера расходится с compareListings на ${where}`,
    );

    for (const item of items) {
      assert.ok(matchesFilters(item, full), `лишняя запись на ${where}: ${item.id}`);
      assert.ok(!isExpired(item), `просроченная запись на ${where}: ${item.id}`);
    }

    const page = queryListings(items, full, null, 50);
    assert.deepEqual(page.items.map((i) => i.id), items.map((i) => i.id), `состав расходится на ${where}`);
  }
});

test('сервер не отдаёт больше 50 записей за раз', async () => {
  const res = await api('/listings?deal=rent&city=medina&limit=500');
  assert.ok(res.body.items.length <= 50, 'предел страницы не соблюдён');
});

test('вся живая фикстура парсера попадает в ленту', async () => {
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: fixture });
  const returned = new Set((await collectAll({ deal: 'rent', city: 'medina' })).map((i) => i.id));

  const expected = local.filter((i) => i.dealType === 'rent' && i.city === 'medina' && !isExpired(i));
  assert.ok(expected.length > 0);
  for (const item of expected) {
    assert.ok(returned.has(item.id), `фикстурная запись ${item.id} пропала из ленты`);
  }
});

test('пагинация по курсору выдаёт каждое объявление ровно один раз', async () => {
  const collected = [];
  let cursor = null;
  let total = 0;
  let guard = 0;

  do {
    const params = new URLSearchParams({ deal: 'rent', city: 'medina', limit: '7' });
    if (cursor) params.set('cursor', cursor);
    const res = await api(`/listings?${params}`);
    collected.push(...res.body.items);
    total = res.body.total;
    cursor = res.body.nextCursor;
    assert.ok((guard += 1) < 100, 'курсор не сходится');
  } while (cursor);

  const ids = collected.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'записи повторяются между страницами');
  assert.equal(ids.length, total, 'выдано не столько, сколько обещал total');
  // Склейка страниц обязана оставаться единым отсортированным списком.
  assert.deepEqual([...collected].sort(compareListings).map((i) => i.id), ids);
});

test('просроченные объявления в ленту не попадают', async () => {
  const all = await collectAll({ deal: 'rent', city: 'medina' });
  assert.deepEqual(all.filter((i) => isExpired(i)), []);
});

test('деталь объявления доступна и после истечения срока', async () => {
  const expiredId = local.find((i) => i.expiresAt && new Date(i.expiresAt) < new Date()).id;
  const res = await api(`/listings/${expiredId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.item.id, expiredId);
});

test('несуществующее объявление даёт 404', async () => {
  assert.equal((await api('/listings/net-takogo')).status, 404);
});

test('счётчики по городам совпадают с выдачей ленты', async () => {
  const res = await api('/facets?deal=rent');
  assert.equal(res.status, 200);

  for (const city of ['medina', 'makkah']) {
    const feed = await api(`/listings?deal=rent&city=${city}&limit=1`);
    assert.equal(res.body.cityCounts[city] || 0, feed.body.total, `город ${city}`);
  }

  // Нулевых значений в ответе быть не должно: город без объявлений просто
  // отсутствует, и фронт трактует это как ноль.
  for (const [city, n] of Object.entries(res.body.cityCounts)) {
    assert.ok(Number.isInteger(n) && n > 0, `город ${city} с бессмысленным счётчиком ${n}`);
  }
});
