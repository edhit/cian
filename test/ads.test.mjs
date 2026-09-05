import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAds, adColor, buildFeed } from '../src/lib/adsFeed.js';
import { ads, archive, placeholderAd } from '../src/ads.js';

const listing = (id) => ({ id });
const many = (n) => Array.from({ length: n }, (_, i) => listing(`l${i}`));
const strip = (patch = {}) => ({ type: 'strip', color: 'gold', title: 'т', url: 'https://x', ...patch });

test('файл рекламы разбирается и содержит рабочие объявления', () => {
  assert.ok(Array.isArray(ads) && ads.length > 0);
  assert.deepEqual(archive, []);
  assert.equal(activeAds(ads).length, ads.length, 'все действующие объявления проходят отбор');
  assert.equal(placeholderAd.placeholder, true);
});

test('цвет берётся из палитры, своим значением или подстраховкой', () => {
  assert.equal(adColor('blue'), '#0A6CFF');
  assert.equal(adColor('#aaa'), '#aaa');
  assert.equal(adColor('#0A6CFF'), '#0A6CFF');
  // Мусор не должен ломать вёрстку.
  assert.equal(adColor('такого-нет'), adColor('green'));
  assert.equal(adColor(undefined), adColor('green'));
});

test('истёкшие объявления уходят из показа, будущие остаются', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');
  const list = [
    strip({ title: 'вчера', until: '2026-09-04' }),
    strip({ title: 'сегодня', until: '2026-09-05' }),
    strip({ title: 'завтра', until: '2026-09-06' }),
    strip({ title: 'бессрочно' }),
  ];
  assert.deepEqual(
    activeAds(list, now).map((a) => a.title),
    ['сегодня', 'завтра', 'бессрочно'],
  );
});

test('негодные записи отсеиваются, а не рисуются пустыми', () => {
  const list = [
    strip(),
    { type: 'strip', title: 'без ссылки' },
    { type: 'что-то', title: 'чужой тип', url: 'https://x' },
    null,
    'строка',
  ];
  assert.equal(activeAds(list).length, 1);
});

test('битая дата не прячет объявление молча', () => {
  assert.equal(activeAds([strip({ until: 'вчера вечером' })]).length, 1);
});

test('первая реклама идёт после третьего объявления, дальше через шесть', () => {
  const blocks = buildFeed(many(20), [strip({ title: 'A' }), strip({ title: 'B' })], { hasMore: true });
  const sizes = blocks.map((b) => (b.type === 'ad' ? `реклама:${b.ad.title}` : b.items.length));
  assert.deepEqual(sizes, [3, 'реклама:A', 6, 'реклама:B', 6, 'реклама:A', 5, 'реклама:B']);
});

test('реклама не повисает в хвосте, когда список кончился', () => {
  const blocks = buildFeed(many(3), [strip()], { hasMore: false });
  assert.deepEqual(blocks.map((b) => b.type), ['listings']);

  // Но если ниже есть что подгружать, разделитель уместен.
  const more = buildFeed(many(3), [strip()], { hasMore: true });
  assert.deepEqual(more.map((b) => b.type), ['listings', 'ad']);
});

test('без рекламы и без объявлений лента не ломается', () => {
  assert.deepEqual(buildFeed(many(5), []), [{ type: 'listings', items: many(5) }]);
  assert.deepEqual(buildFeed([], [strip()]), []);
  assert.deepEqual(buildFeed(null, null), []);
});

test('все объявления попадают в блоки ровно один раз', () => {
  const items = many(25);
  const blocks = buildFeed(items, [strip(), strip()], { hasMore: true });
  const flat = blocks.filter((b) => b.type === 'listings').flatMap((b) => b.items.map((i) => i.id));
  assert.deepEqual(flat, items.map((i) => i.id));
});

test('у блоков рекламы ключи не повторяются', () => {
  const blocks = buildFeed(many(30), [strip()], { hasMore: true });
  const keys = blocks.filter((b) => b.type === 'ad').map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('картинкой считается только то, что браузер сможет показать', async () => {
  const { isUsableImage } = await import('../src/lib/adsFeed.js');
  assert.equal(isUsableImage('https://example.com/a.jpg'), true);
  // Ровно такой обрезок лежит в ads.js — грузить его нельзя, будет ошибка в консоли.
  assert.equal(isUsableImage('data:image/jpeg;base64,/9j/4AAQSkZJR'), false);
  assert.equal(isUsableImage(`data:image/png;base64,${'A'.repeat(200)}`), true);
  assert.equal(isUsableImage(''), false);
  assert.equal(isUsableImage(undefined), false);
  assert.equal(isUsableImage('просто текст'), false);
});
