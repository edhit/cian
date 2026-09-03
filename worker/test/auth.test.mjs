import test from 'node:test';
import assert from 'node:assert/strict';
import { api, initDataFor, signInitData, uid, rid, INGEST_TOKEN } from './helpers.mjs';

const valid = {
  dealType: 'rent', city: 'medina', district: 'quba', address: 'дом 1',
  priceYear: 30000, deposit: 2000, commission: 1500, utilities: 200,
  rooms: 2, area: 60, floor: '2 из 4', furnished: true, features: ['ac'],
  description: 'Тестовая заявка', contact: { telegram: '@tester' },
};

// Заявки и жалобы меняют состояние базы, поэтому нужные объявления
// каждый тест кладёт сам, а не рассчитывает на общую фикстуру.
async function seed(id, patch = {}) {
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: {
    items: [{ id, dealType: 'rent', city: 'dammam', priceYear: 30000, rooms: 2,
      publishedAt: new Date().toISOString(), contact: { telegram: 'seed' }, ...patch }],
  } });
}

test('заявка без initData отклоняется', async () => {
  const res = await api('/listings', { method: 'POST', body: valid });
  assert.equal(res.status, 401);
});

test('подделанный hash отклоняется', async () => {
  const good = initDataFor();
  const forged = good.replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
  const res = await api('/listings', { method: 'POST', initData: forged, body: valid });
  assert.equal(res.status, 401);
});

test('подпись чужим токеном отклоняется', async () => {
  const other = signInitData(
    { user: JSON.stringify({ id: 1 }), auth_date: String(Math.floor(Date.now() / 1000)) },
    '999:ЧУЖОЙ-ТОКЕН',
  );
  const res = await api('/listings', { method: 'POST', initData: other, body: valid });
  assert.equal(res.status, 401);
});

test('изменённые данные при верном hash отклоняются', async () => {
  // Подписываем одного пользователя, подставляем другого — hash перестаёт сходиться.
  const initData = initDataFor({ id: 42, first_name: 'Тест' });
  const tampered = initData.replace(/user=[^&]+/, `user=${encodeURIComponent(JSON.stringify({ id: 999 }))}`);
  const res = await api('/listings', { method: 'POST', initData: tampered, body: valid });
  assert.equal(res.status, 401);
});

test('просроченный auth_date отклоняется', async () => {
  const old = signInitData({
    user: JSON.stringify({ id: 42 }),
    auth_date: String(Math.floor(Date.now() / 1000) - 90000), // больше суток назад
  });
  const res = await api('/listings', { method: 'POST', initData: old, body: valid });
  assert.equal(res.status, 401);
});

test('initData без пользователя отклоняется', async () => {
  const noUser = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAA' });
  const res = await api('/listings', { method: 'POST', initData: noUser, body: valid });
  assert.equal(res.status, 401);
});

test('корректная заявка принимается и уходит на модерацию', async () => {
  const initData = initDataFor({ id: uid(1), first_name: 'Автор' });
  const res = await api('/listings', { method: 'POST', initData, body: valid });
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.status, 'pending');
  assert.ok(res.body.id);

  // В ленту заявка не попадает до проверки...
  const feed = await api('/listings?deal=rent&city=medina&limit=50');
  assert.ok(!feed.body.items.some((i) => i.id === res.body.id));

  // ...но автору она видна.
  const own = await api(`/listings/${res.body.id}`, { initData });
  assert.equal(own.status, 200);

  // А постороннему — нет.
  const stranger = await api(`/listings/${res.body.id}`, { initData: initDataFor({ id: uid(2) }) });
  assert.equal(stranger.status, 404);

  const mine = await api('/my/listings', { initData });
  assert.ok(mine.body.items.some((i) => i.id === res.body.id && i.status === 'pending'));
});

test('заявка не может объявить себя проверенной или подделать источник', async () => {
  const initData = initDataFor({ id: uid(3) });
  const res = await api('/listings', { method: 'POST', initData, body: {
    ...valid, verified: true, source: { chat: 'Официальный', url: 'https://t.me/fake/1' },
  } });
  assert.equal(res.status, 201);

  const created = await api(`/listings/${res.body.id}`, { initData });
  assert.equal(created.body.item.verified, false);
  assert.equal(created.body.item.source.url, '');
});

test('заявка без контактов и без цены отклоняется', async () => {
  const initData = initDataFor({ id: uid(4) });
  const noContact = await api('/listings', { method: 'POST', initData, body: { ...valid, contact: {} } });
  assert.equal(noContact.status, 422);
  assert.ok(noContact.body.fields.includes('contact'));

  const noPrice = await api('/listings', { method: 'POST', initData, body: { ...valid, priceYear: 0 } });
  assert.equal(noPrice.status, 422);
  assert.ok(noPrice.body.fields.includes('priceYear'));

  const badCity = await api('/listings', { method: 'POST', initData, body: { ...valid, city: 'париж' } });
  assert.equal(badCity.status, 422);
});

test('частота заявок ограничена', async () => {
  const initData = initDataFor({ id: uid(5) });
  const codes = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await api('/listings', { method: 'POST', initData, body: valid });
    codes.push(res.status);
  }
  assert.equal(codes.filter((c) => c === 201).length, 5);
  assert.ok(codes.includes(429));
});

test('жалоба требует авторизации, повторная не удваивается, порог скрывает объявление', async () => {
  const target = rid('report');
  await seed(target);

  const anon = await api(`/listings/${target}/report`, { method: 'POST', body: { reason: 'спам' } });
  assert.equal(anon.status, 401);

  // Порог — пять разных людей. Один человек, сколько бы ни жаловался, не скрывает.
  const one = initDataFor({ id: uid(11) });
  for (let i = 0; i < 6; i += 1) {
    const res = await api(`/listings/${target}/report`, { method: 'POST', initData: one, body: { reason: 'спам' } });
    assert.equal(res.status, 200);
  }
  let feed = await api('/listings?deal=rent&city=dammam&limit=50');
  assert.ok(feed.body.items.some((i) => i.id === target), 'одна жалоба не должна скрывать');

  for (const id of [uid(12), uid(13), uid(14), uid(15)]) {
    await api(`/listings/${target}/report`, { method: 'POST', initData: initDataFor({ id }), body: { reason: 'спам' } });
  }
  feed = await api('/listings?deal=rent&city=dammam&limit=50');
  assert.ok(!feed.body.items.some((i) => i.id === target), 'после пяти жалоб объявление скрыто');
});

test('жалоба на несуществующее объявление даёт 404', async () => {
  const res = await api('/listings/нет-такого/report', { method: 'POST', initData: initDataFor(), body: {} });
  assert.equal(res.status, 404);
});
