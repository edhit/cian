import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListing } from '../src/lib/schema.js';
import {
  buildComparison,
  buildVerdict,
  firstYearCost,
  moveInCost,
  splitByDeal,
} from '../src/lib/compare.js';

const make = (patch) =>
  normalizeListing({
    dealType: 'rent', city: 'medina', district: 'quba', priceYear: 36000,
    deposit: 3000, commission: 1200, utilities: 200, rooms: 2, area: 60,
    publishedAt: new Date().toISOString(), ...patch,
  });

const row = (rows, key) => rows.find((r) => r.key === key);
// Intl ставит неразрывный пробел — для сравнения с литералом его надо привести.
const plain = (text) => text.replace(/\s/g, ' ');

test('итог в месяц считается по общей формуле схемы', () => {
  const cheap = make({ id: 'a', priceYear: 24000, commission: 1200, utilities: 150 });
  const dear = make({ id: 'b', priceYear: 36000, commission: 0, utilities: 100 });
  const { rows } = buildComparison([cheap, dear]);

  // (24000 + 1200) / 12 + 150 = 2250
  assert.equal(row(rows, 'trueMonthly').values[0].value, 2250);
  assert.equal(plain(row(rows, 'trueMonthly').values[0].text), '2 250 SAR');
  assert.equal(row(rows, 'trueMonthly').values[0].best, true);
  assert.equal(row(rows, 'trueMonthly').values[1].best, false);
});

test('разовые деньги и первый год считаются отдельно от месячных', () => {
  const l = make({ id: 'a', priceYear: 36000, deposit: 3000, commission: 1200, utilities: 200 });
  assert.equal(moveInCost(l), 4200);
  // Залог в годовые расходы не входит: он возвращается.
  assert.equal(firstYearCost(l), 36000 + 1200 + 200 * 12);
});

test('дешёвая помесячно, но дорогая на въезде — разные победители', () => {
  // a: (24000 + 3600) / 12 + 100 = 2400 в месяц, но 11 600 при въезде
  // b: (30000 + 0) / 12 + 100 = 2600 в месяц, но всего 1 000 при въезде
  const a = make({ id: 'a', priceYear: 24000, commission: 3600, deposit: 8000, utilities: 100 });
  const b = make({ id: 'b', priceYear: 30000, commission: 0, deposit: 1000, utilities: 100 });
  const { rows } = buildComparison([a, b]);

  assert.equal(row(rows, 'trueMonthly').values[0].best, true, 'по итогу дешевле a');
  assert.equal(row(rows, 'moveIn').values[1].best, true, 'на въезде дешевле b');
});

test('ноль отличается от «неизвестно»', () => {
  const withoutCommission = make({ id: 'a', commission: 0 });
  const withoutArea = make({ id: 'b', area: 0 });
  const { rows } = buildComparison([withoutCommission, withoutArea]);

  // Комиссии нет — это значение, а не пробел.
  assert.equal(row(rows, 'commissionMonthly').values[0].text, 'нет');
  // Площадь неизвестна — прочерк, и в ранжировании не участвует.
  assert.equal(row(rows, 'area').values[1].text, '—');
  assert.equal(row(rows, 'area').values[1].best, false);
  assert.equal(row(rows, 'perMetre').values[1].text, '—');
});

test('неизвестная площадь не делает объявление победителем по цене за метр', () => {
  const known = make({ id: 'a', area: 100, priceYear: 36000 });
  const unknown = make({ id: 'b', area: 0, priceYear: 12000 });
  const { rows } = buildComparison([known, unknown]);

  const metre = row(rows, 'perMetre');
  assert.equal(metre.values[1].text, '—');
  // Единственное известное значение не подсвечивается: сравнивать не с чем.
  assert.equal(metre.values[0].best, false);
});

test('одинаковые строки помечаются как совпадающие', () => {
  const a = make({ id: 'a', rooms: 2, priceYear: 24000 });
  const b = make({ id: 'b', rooms: 2, priceYear: 36000 });
  const { rows } = buildComparison([a, b]);

  assert.equal(row(rows, 'rooms').same, true);
  assert.equal(row(rows, 'trueMonthly').same, false);
});

test('при полной ничье лучшего нет', () => {
  const a = make({ id: 'a' });
  const b = make({ id: 'b' });
  const { rows } = buildComparison([a, b]);
  assert.deepEqual(row(rows, 'trueMonthly').values.map((v) => v.best), [false, false]);
});

test('строки подбираются под тип сделки', () => {
  const sale = normalizeListing({ id: 's1', dealType: 'sale', city: 'medina', priceYear: 800000, area: 100 });
  const sale2 = normalizeListing({ id: 's2', dealType: 'sale', city: 'medina', priceYear: 900000, area: 100 });
  const { rows, deal } = buildComparison([sale, sale2]);

  assert.equal(deal, 'sale');
  assert.ok(row(rows, 'price'), 'у продажи есть цена');
  assert.equal(row(rows, 'trueMonthly'), undefined, 'месячной стоимости у продажи нет');
  assert.equal(row(rows, 'deposit'), undefined, 'залога у продажи нет');
});

test('выводы называют победителя и не повторяют его дважды', () => {
  const a = make({ id: 'a', priceYear: 24000, commission: 3600, deposit: 8000, area: 50 });
  const b = make({ id: 'b', priceYear: 30000, commission: 0, deposit: 1000, area: 90 });
  const lines = buildVerdict([a, b]);

  const cheapest = lines.find((l) => l.key === 'cheapest');
  assert.equal(cheapest.id, 'a');
  assert.equal(lines.find((l) => l.key === 'movein').id, 'b');
  assert.equal(lines.find((l) => l.key === 'space').id, 'b');
  // Про самое просторное не пишем, если оно же и самое дешёвое.
  assert.ok(lines.every((l) => l.text.length < 200));
});

test('вывода нет, когда сравнивать нечего или всё одинаково', () => {
  assert.deepEqual(buildVerdict([make({ id: 'a' })]), []);
  const same = buildVerdict([make({ id: 'a' }), make({ id: 'b' })]);
  assert.equal(same.find((l) => l.key === 'cheapest'), undefined);
});

test('оценка человека попадает и в строки, и в выводы', () => {
  const a = make({ id: 'a' });
  const b = make({ id: 'b' });
  const notes = { a: { rating: 5, text: 'Понравилась' }, b: { rating: 2, text: '' } };

  const { rows } = buildComparison([a, b], notes);
  assert.equal(row(rows, 'rating').values[0].text, '5 из 5');
  assert.equal(row(rows, 'rating').values[0].best, true);
  assert.equal(row(rows, 'note').values[0].text, 'Понравилась');
  assert.equal(row(rows, 'note').values[1].text, '—');

  assert.equal(buildVerdict([a, b], notes).find((l) => l.key === 'rating').id, 'a');
});

test('битое объявление не роняет сравнение', () => {
  const broken = normalizeListing({ id: 'x', city: 'medina' });
  const good = make({ id: 'a' });
  const { rows } = buildComparison([broken, good]);

  assert.equal(row(rows, 'trueMonthly').values[0].text, '—');
  assert.equal(row(rows, 'firstYear').values[0].text, '—');
  assert.ok(buildVerdict([broken, good]).every((l) => typeof l.text === 'string'));
});

test('аренда и продажа разводятся по разным наборам', () => {
  const groups = splitByDeal([
    make({ id: 'a' }),
    normalizeListing({ id: 's', dealType: 'sale', city: 'medina', priceYear: 800000 }),
  ]);
  assert.equal(groups.rent.length, 1);
  assert.equal(groups.sale.length, 1);
});
