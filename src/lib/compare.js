// Сравнение отобранных квартир. Считается целиком в браузере: ни базы, ни запросов.
//
// Главная мысль: сравнивать надо не цены из объявлений, а деньги, которые человек
// на самом деле отдаст. Поэтому строки — производные (итог в месяц, цена за метр,
// сколько нужно на въезд), а не переписанные поля.

import { monthlyRent, trueMonthly, featureLabel, districtLabel } from './schema.js';
import { area as formatArea, money, relativeDate, rooms as formatRooms } from './format.js';

export const MAX_COMPARE = 4;

const MISSING = null;

/** Разовые деньги при въезде: залог возвращается, но заплатить его нужно сразу. */
export function moveInCost(listing) {
  return listing.deposit + listing.commission;
}

/** Всё, что уйдёт за первый год. Залог не входит — он возвращается. */
export function firstYearCost(listing) {
  if (listing.priceYear <= 0) return MISSING;
  return listing.priceYear + listing.commission + listing.utilities * 12;
}

function perSquareMetre(value, listing) {
  if (value === MISSING || listing.area <= 0) return MISSING;
  return value / listing.area;
}

const yesNo = (v) => (v ? 'Есть' : 'Нет');

/**
 * Описание строк сравнения. `better` говорит, какое значение лучше;
 * `zeroIsValue` отличает «комиссии нет» от «мы не знаем цену».
 */
const METRICS = [
  {
    key: 'trueMonthly',
    label: 'Итого в месяц',
    deals: ['rent'],
    better: 'low',
    value: (l) => (l.priceYear > 0 ? trueMonthly(l) : MISSING),
    format: money,
    lead: true,
  },
  {
    key: 'price',
    label: 'Цена',
    deals: ['sale'],
    better: 'low',
    value: (l) => (l.priceYear > 0 ? l.priceYear : MISSING),
    format: money,
    lead: true,
  },
  {
    key: 'perMetre',
    label: 'За м² в месяц',
    deals: ['rent'],
    better: 'low',
    value: (l) => perSquareMetre(l.priceYear > 0 ? trueMonthly(l) : MISSING, l),
    format: (v) => money(Math.round(v)),
  },
  {
    key: 'perMetreSale',
    label: 'За м²',
    deals: ['sale'],
    better: 'low',
    value: (l) => perSquareMetre(l.priceYear > 0 ? l.priceYear : MISSING, l),
    format: (v) => money(Math.round(v)),
  },
  {
    key: 'rent',
    label: 'Аренда в месяц',
    deals: ['rent'],
    better: 'low',
    value: (l) => (l.priceYear > 0 ? monthlyRent(l) : MISSING),
    format: money,
  },
  {
    key: 'commissionMonthly',
    label: 'Комиссия в месяц',
    deals: ['rent'],
    better: 'low',
    zeroIsValue: true,
    value: (l) => l.commission / 12,
    format: (v) => (v > 0 ? money(v) : 'нет'),
  },
  {
    key: 'utilities',
    label: 'Коммунальные в месяц',
    deals: ['rent'],
    better: 'low',
    zeroIsValue: true,
    value: (l) => l.utilities,
    format: (v) => (v > 0 ? money(v) : 'нет'),
  },
  {
    key: 'moveIn',
    label: 'Нужно при въезде',
    hint: 'залог и комиссия',
    deals: ['rent'],
    better: 'low',
    zeroIsValue: true,
    value: moveInCost,
    format: (v) => (v > 0 ? money(v) : 'нет'),
  },
  {
    key: 'firstYear',
    label: 'За первый год',
    hint: 'без залога',
    deals: ['rent'],
    better: 'low',
    value: firstYearCost,
    format: money,
  },
  {
    key: 'deposit',
    label: 'Залог',
    hint: 'возвращается',
    deals: ['rent'],
    better: 'low',
    zeroIsValue: true,
    value: (l) => l.deposit,
    format: (v) => (v > 0 ? money(v) : 'нет'),
  },
  {
    key: 'commissionSale',
    label: 'Комиссия',
    deals: ['sale'],
    better: 'low',
    zeroIsValue: true,
    value: (l) => l.commission,
    format: (v) => (v > 0 ? money(v) : 'нет'),
  },
  {
    key: 'rooms',
    label: 'Комнаты',
    deals: ['rent', 'sale'],
    better: 'high',
    value: (l) => (l.rooms > 0 ? l.rooms : MISSING),
    format: formatRooms,
  },
  {
    key: 'area',
    label: 'Площадь',
    deals: ['rent', 'sale'],
    better: 'high',
    value: (l) => (l.area > 0 ? l.area : MISSING),
    format: formatArea,
  },
  {
    key: 'district',
    label: 'Район',
    deals: ['rent', 'sale'],
    better: null,
    value: (l) => districtLabel(l.city, l.district) || MISSING,
    format: (v) => v,
  },
  {
    key: 'floor',
    label: 'Этаж',
    deals: ['rent', 'sale'],
    better: null,
    value: (l) => l.floor || MISSING,
    format: (v) => v,
  },
  {
    key: 'furnished',
    label: 'Мебель',
    deals: ['rent', 'sale'],
    better: 'high',
    zeroIsValue: true,
    value: (l) => (l.furnished ? 1 : 0),
    format: yesNo,
  },
  {
    key: 'features',
    label: 'Особенности',
    deals: ['rent', 'sale'],
    better: null,
    value: (l) => (l.features.length > 0 ? l.features.map(featureLabel).join(', ') : MISSING),
    format: (v) => v,
  },
  {
    key: 'verified',
    label: 'Проверено',
    deals: ['rent', 'sale'],
    better: 'high',
    zeroIsValue: true,
    value: (l) => (l.verified ? 1 : 0),
    format: yesNo,
  },
  {
    key: 'published',
    label: 'Опубликовано',
    deals: ['rent', 'sale'],
    better: null,
    value: (l) => l.publishedAt || MISSING,
    format: relativeDate,
  },
  {
    key: 'rating',
    label: 'Ваша оценка',
    deals: ['rent', 'sale'],
    better: 'high',
    value: (l, notes) => {
      const rating = notes[l.id] && notes[l.id].rating;
      return rating > 0 ? rating : MISSING;
    },
    format: (v) => `${v} из 5`,
  },
  {
    key: 'note',
    label: 'Ваша заметка',
    deals: ['rent', 'sale'],
    better: null,
    value: (l, notes) => (notes[l.id] && notes[l.id].text) || MISSING,
    format: (v) => v,
  },
];

function bestIndexes(values, better) {
  if (!better) return new Set();
  const numeric = values
    .map((v, index) => ({ v: v.value, index }))
    .filter((entry) => typeof entry.v === 'number' && Number.isFinite(entry.v));
  if (numeric.length < 2) return new Set();

  const target =
    better === 'low'
      ? Math.min(...numeric.map((e) => e.v))
      : Math.max(...numeric.map((e) => e.v));

  // Если все значения одинаковы, лучшего нет — подсвечивать нечего.
  if (numeric.every((e) => e.v === target)) return new Set();
  return new Set(numeric.filter((e) => e.v === target).map((e) => e.index));
}

/**
 * @param {object[]} items — сравниваемые объявления, все одного типа сделки
 * @param {object} notes — { [id]: { text, rating } }
 * @returns {{rows: object[], deal: string}}
 */
export function buildComparison(items, notes = {}) {
  const deal = items.length > 0 ? items[0].dealType : 'rent';

  const rows = METRICS.filter((metric) => metric.deals.includes(deal)).map((metric) => {
    const values = items.map((item) => {
      const raw = metric.value(item, notes);
      const missing = raw === MISSING || (raw === 0 && !metric.zeroIsValue);
      return {
        id: item.id,
        value: missing ? MISSING : raw,
        text: missing ? '—' : metric.format(raw),
      };
    });

    const best = bestIndexes(values, metric.better);
    const known = values.filter((v) => v.value !== MISSING);

    return {
      key: metric.key,
      label: metric.label,
      hint: metric.hint || '',
      lead: Boolean(metric.lead),
      values: values.map((v, index) => ({ ...v, best: best.has(index) })),
      // Строка, одинаковая у всех, ничего не говорит о выборе — её можно скрыть.
      same: values.every((v) => v.text === values[0].text),
      known: known.length,
    };
  });

  return { rows, deal };
}

function winner(items, pick, better = 'low') {
  const scored = items
    .map((item) => ({ item, value: pick(item) }))
    .filter((entry) => typeof entry.value === 'number' && Number.isFinite(entry.value));
  if (scored.length < 2) return null;

  scored.sort((a, b) => (better === 'low' ? a.value - b.value : b.value - a.value));
  // Ничья — не вывод.
  if (scored[0].value === scored[1].value) return null;
  return { ...scored[0], runnerUp: scored[1], spread: Math.abs(scored[0].value - scored[scored.length - 1].value) };
}

function shortName(item) {
  return districtLabel(item.city, item.district) || item.address || 'без названия';
}

/**
 * Короткие выводы вместо таблицы, которую нужно читать глазами.
 * Каждый вывод — только когда победитель один и он действительно отличается.
 */
export function buildVerdict(items, notes = {}) {
  if (items.length < 2) return [];
  const deal = items[0].dealType;
  const lines = [];

  const monthly = winner(items, (l) => (l.priceYear > 0 ? (deal === 'sale' ? l.priceYear : trueMonthly(l)) : NaN));
  if (monthly) {
    const diff = monthly.runnerUp.value - monthly.value;
    lines.push({
      key: 'cheapest',
      id: monthly.item.id,
      text:
        deal === 'sale'
          ? `Дешевле всех — ${shortName(monthly.item)}: на ${money(diff)} меньше следующей.`
          : `По итогу дешевле всех — ${shortName(monthly.item)}: на ${money(diff)} в месяц меньше следующей.`,
    });
  }

  const metre = winner(items, (l) =>
    perSquareMetre(l.priceYear > 0 ? (deal === 'sale' ? l.priceYear : trueMonthly(l)) : MISSING, l) ?? NaN,
  );
  if (metre && (!monthly || metre.item.id !== monthly.item.id)) {
    lines.push({
      key: 'metre',
      id: metre.item.id,
      text: `Выгоднее за метр — ${shortName(metre.item)}, хотя в месяц она и не самая дешёвая.`,
    });
  }

  if (deal === 'rent') {
    const moveIn = winner(items, moveInCost);
    if (moveIn && (!monthly || moveIn.item.id !== monthly.item.id)) {
      lines.push({
        key: 'movein',
        id: moveIn.item.id,
        text: `Дешевле въехать в ${shortName(moveIn.item)}: ${money(moveInCost(moveIn.item))} против ${money(moveInCost(moveIn.runnerUp.item))}.`,
      });
    }

    const year = winner(items, (l) => firstYearCost(l) ?? NaN);
    if (year && year.spread > 0) {
      lines.push({
        key: 'spread',
        id: null,
        text: `Разница за первый год между крайними вариантами — ${money(year.spread)}.`,
      });
    }
  }

  const space = winner(items, (l) => (l.area > 0 ? l.area : NaN), 'high');
  if (space && (!monthly || space.item.id !== monthly.item.id)) {
    lines.push({
      key: 'space',
      id: space.item.id,
      text: `Просторнее всех — ${shortName(space.item)}: ${formatArea(space.item.area)}.`,
    });
  }

  const rated = winner(items, (l) => {
    const rating = notes[l.id] && notes[l.id].rating;
    return rating > 0 ? rating : NaN;
  }, 'high');
  if (rated) {
    lines.push({
      key: 'rating',
      id: rated.item.id,
      text: `Выше всех вы оценили ${shortName(rated.item)} — ${rated.value} из 5.`,
    });
  }

  return lines;
}

/** Разбивка избранного по типу сделки: аренду с продажей сравнивать бессмысленно. */
export function splitByDeal(items) {
  return {
    rent: items.filter((item) => item.dealType === 'rent'),
    sale: items.filter((item) => item.dealType === 'sale'),
  };
}
