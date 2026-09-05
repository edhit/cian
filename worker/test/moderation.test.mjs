import test from 'node:test';
import assert from 'node:assert/strict';
import { api, initDataFor, uid, rid, INGEST_TOKEN, BASE } from './helpers.mjs';

const TELEGRAM = 'http://localhost:8899';
const WEBHOOK_SECRET = 'local-webhook-secret';
const ADMIN = 555001;

const botCalls = async () => (await fetch(`${TELEGRAM}/__calls`)).json();
const resetBot = () => fetch(`${TELEGRAM}/__reset`);

const valid = (patch = {}) => ({
  dealType: 'rent', city: 'medina', district: 'quba', address: 'дом 1',
  priceYear: 30000, deposit: 2000, commission: 1500, utilities: 200,
  rooms: 2, area: 60, description: 'Заявка для проверки модерации',
  contact: { telegram: '@zayavitel' }, ...patch,
});

function webhook(body, secret = WEBHOOK_SECRET) {
  return fetch(`${BASE}/telegram/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify(body),
  });
}

const callback = (data, from = ADMIN) => webhook({
  callback_query: { id: 'cb1', from: { id: from, first_name: 'Админ' }, data },
});

const command = (text, from = ADMIN) => webhook({
  message: { message_id: 1, chat: { id: from }, from: { id: from, first_name: 'Админ' }, text },
});

test('заявка уходит всем админам с кнопками', async () => {
  await resetBot();
  const res = await api('/listings', { method: 'POST', initData: initDataFor({ id: uid(21) }), body: valid() });
  assert.equal(res.status, 201);

  const calls = await botCalls();
  const sent = calls.filter((c) => c.method === 'sendMessage');
  assert.equal(sent.length, 2, 'сообщение каждому из двух админов');
  assert.deepEqual(sent.map((c) => c.payload.chat_id).sort(), [555001, 555002]);

  const buttons = sent[0].payload.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(buttons, [`ok:${res.body.id}`, `no:${res.body.id}`, `okt:${res.body.id}`]);
  assert.match(sent[0].payload.text, /Заявка на проверку/);
  assert.match(sent[0].payload.text, /@zayavitel/);
});

test('вебхук без секретного заголовка отклоняется', async () => {
  assert.equal((await webhook({}, 'wrong-secret')).status, 403);
  const bare = await fetch(`${BASE}/telegram/webhook`, { method: 'POST', body: '{}' });
  assert.equal(bare.status, 403);
});

test('не-админ не может ничего решить', async () => {
  await resetBot();
  const created = await api('/listings', { method: 'POST', initData: initDataFor({ id: uid(22) }), body: valid() });

  await callback(`ok:${created.body.id}`, 999999);
  const answers = (await botCalls()).filter((c) => c.method === 'answerCallbackQuery');
  assert.match(answers[answers.length - 1].payload.text, /админ/i);

  // Объявление осталось на проверке.
  const feed = await api('/listings?deal=rent&city=medina&limit=50');
  assert.ok(!feed.body.items.some((i) => i.id === created.body.id));
});

test('одобрение публикует объявление и убирает кнопки', async () => {
  await resetBot();
  const created = await api('/listings', { method: 'POST', initData: initDataFor({ id: uid(23) }), body: valid() });

  const res = await callback(`ok:${created.body.id}`);
  assert.equal(res.status, 200);

  const feed = await api('/listings?deal=rent&city=medina&limit=50');
  const published = feed.body.items.find((i) => i.id === created.body.id);
  assert.ok(published, 'объявление появилось в ленте');
  // Одобрение означает «не мусор», а не личное знакомство.
  assert.equal(published.verified, false);

  const edits = (await botCalls()).filter((c) => c.method === 'editMessageText');
  assert.equal(edits.length, 2, 'поправлены сообщения у обоих админов');
  assert.deepEqual(edits[0].payload.reply_markup, { inline_keyboard: [] });
  assert.match(edits[0].payload.text, /одобрено/);
});

test('отклонение прячет объявление', async () => {
  const created = await api('/listings', { method: 'POST', initData: initDataFor({ id: uid(24) }), body: valid() });
  await callback(`no:${created.body.id}`);

  const feed = await api('/listings?deal=rent&city=medina&limit=50');
  assert.ok(!feed.body.items.some((i) => i.id === created.body.id));
});

test('«одобрить и доверять» ставит плашку и доверяет автору впредь', async () => {
  const handle = `agent${uid(25)}`;
  const first = await api('/listings', {
    method: 'POST', initData: initDataFor({ id: uid(25) }),
    body: valid({ contact: { telegram: `@${handle}` } }),
  });
  await callback(`okt:${first.body.id}`);

  const feed = await api('/listings?deal=rent&city=medina&limit=50');
  const published = feed.body.items.find((i) => i.id === first.body.id);
  assert.equal(published.verified, true, 'плашка «проверено» появилась');

  // Следующая заявка того же автора получает плашку сразу.
  const second = await api('/listings', {
    method: 'POST', initData: initDataFor({ id: uid(26) }),
    body: valid({ contact: { telegram: `@${handle}` } }),
  });
  const own = await api(`/listings/${second.body.id}`, { initData: initDataFor({ id: uid(26) }) });
  assert.equal(own.body.item.verified, true);
});

test('команда /trust помечает и уже загруженные объявления', async () => {
  const handle = `rieltor${uid(27)}`;
  const id = rid('trusted');
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: {
    items: [{ id, city: 'medina', dealType: 'rent', priceYear: 40000,
      publishedAt: new Date().toISOString(), contact: { telegram: handle } }],
  } });

  const before = await api(`/listings/${id}`);
  assert.equal(before.body.item.verified, false, 'парсер сам плашку не ставит');

  await resetBot();
  await command(`/trust @${handle}`);
  const reply = (await botCalls()).find((c) => c.method === 'sendMessage');
  assert.match(reply.payload.text, /Добавлен в доверенные/);

  const after = await api(`/listings/${id}`);
  assert.equal(after.body.item.verified, true);

  // И новая загрузка парсера сохраняет плашку.
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: {
    items: [{ id, city: 'medina', dealType: 'rent', priceYear: 41000,
      publishedAt: new Date().toISOString(), contact: { telegram: handle } }],
  } });
  const reingested = await api(`/listings/${id}`);
  assert.equal(reingested.body.item.verified, true, 'повторная загрузка не сбрасывает плашку');
});

test('команда /untrust снимает плашку', async () => {
  const handle = `bad${uid(28)}`;
  const id = rid('untrust');
  await command(`/trust @${handle}`);
  await api('/ingest', { method: 'POST', ingest: INGEST_TOKEN, body: {
    items: [{ id, city: 'medina', priceYear: 20000, publishedAt: new Date().toISOString(),
      contact: { telegram: handle } }],
  } });
  assert.equal((await api(`/listings/${id}`)).body.item.verified, true);

  await command(`/untrust @${handle}`);
  assert.equal((await api(`/listings/${id}`)).body.item.verified, false);
});

test('команды доступны только админам', async () => {
  await resetBot();
  await command('/trusted', 424242);
  assert.deepEqual(await botCalls(), [], 'постороннему бот не отвечает');
});

test('/pending показывает заявки на проверке', async () => {
  await api('/listings', { method: 'POST', initData: initDataFor({ id: uid(29) }), body: valid() });
  await resetBot();
  await command('/pending');
  const reply = (await botCalls()).find((c) => c.method === 'sendMessage');
  assert.match(reply.payload.text, /Ожидают проверки/);
});
