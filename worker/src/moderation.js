// Модерация через бота: заявка уходит админам с кнопками «одобрить» и «отклонить».

import { bot, escapeHtml, adminIds, isAdmin } from './telegram.js';
import { cityLabel, districtLabel, monthlyRent, trueMonthly } from './schema.js';
import { rowToListing } from './db.js';

const money = (value) =>
  value > 0 ? `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} SAR` : '—';

/* --------------------------- проверенные контакты -------------------------- */

/** Ник без @ в нижнем регистре либо телефон только из цифр и плюса. */
export function normalizeHandle(value, kind) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (kind === 'phone') {
    const digits = raw.replace(/[^\d+]/g, '');
    return digits.length >= 6 ? digits : '';
  }
  return raw.replace(/^@/, '').toLowerCase();
}

/** Есть ли контакт объявления в списке доверенных. */
export async function isTrusted(env, contact) {
  const handles = [
    normalizeHandle(contact.telegram, 'telegram'),
    normalizeHandle(contact.phone, 'phone'),
  ].filter(Boolean);
  if (handles.length === 0) return false;

  const placeholders = handles.map(() => '?').join(', ');
  const row = await env.DB.prepare(
    `SELECT handle FROM trusted_contacts WHERE handle IN (${placeholders}) LIMIT 1`,
  )
    .bind(...handles)
    .first();

  return Boolean(row);
}

/** Множество доверенных контактов — одним запросом, для пакетной загрузки парсера. */
export async function trustedSet(env) {
  const rows = await env.DB.prepare('SELECT handle FROM trusted_contacts').all();
  return new Set((rows.results || []).map((row) => row.handle));
}

export function matchesTrusted(set, contact) {
  if (set.size === 0) return false;
  const telegram = normalizeHandle(contact.telegram, 'telegram');
  const phone = normalizeHandle(contact.phone, 'phone');
  return (telegram && set.has(telegram)) || (phone && set.has(phone));
}

/* ----------------------------- карточка для бота --------------------------- */

function describe(listing) {
  const place = [cityLabel(listing.city), districtLabel(listing.city, listing.district), listing.address]
    .filter(Boolean)
    .join(', ');

  const lines = [
    `<b>${listing.dealType === 'sale' ? 'Продажа' : 'Аренда'}</b> · ${escapeHtml(place || 'место не указано')}`,
    listing.dealType === 'sale'
      ? `Цена: <b>${money(listing.priceYear)}</b>`
      : `В месяц: <b>${money(monthlyRent(listing))}</b>, с комиссией и коммунальными ${money(trueMonthly(listing))}`,
  ];

  if (listing.dealType === 'rent') {
    lines.push(
      `За год ${money(listing.priceYear)} · залог ${money(listing.deposit)} · комиссия ${money(listing.commission)}`,
    );
  }

  const specs = [
    listing.rooms > 0 ? `${listing.rooms} комн.` : '',
    listing.area > 0 ? `${listing.area} м²` : '',
    listing.floor ? `этаж ${escapeHtml(listing.floor)}` : '',
    listing.furnished ? 'с мебелью' : '',
  ].filter(Boolean);
  if (specs.length > 0) lines.push(specs.join(' · '));

  const contacts = [
    listing.contact.telegram ? `@${escapeHtml(listing.contact.telegram)}` : '',
    listing.contact.phone ? escapeHtml(listing.contact.phone) : '',
  ].filter(Boolean);
  lines.push(`Связь: ${contacts.join(', ') || '—'}`);

  if (listing.description) {
    lines.push('', escapeHtml(listing.description.slice(0, 600)));
  }
  if (listing.photos.length > 0) {
    lines.push('', `Фотографий: ${listing.photos.length}`);
  }

  return lines.join('\n');
}

function keyboard(id) {
  return {
    inline_keyboard: [
      [
        { text: '✓ Одобрить', callback_data: `ok:${id}` },
        { text: '✕ Отклонить', callback_data: `no:${id}` },
      ],
      [{ text: '✓✓ Одобрить и доверять автору', callback_data: `okt:${id}` }],
    ],
  };
}

/**
 * Отправляет заявку всем админам. Ошибки телеграма не должны отражаться
 * на человеке: заявка уже сохранена, модерация просто задержится.
 */
export async function notifyAdmins(env, listing, author) {
  const admins = adminIds(env);
  if (admins.length === 0) {
    console.warn('ADMIN_IDS не заданы: заявка сохранена, но никто о ней не узнает');
    return;
  }

  const from = author && author.id ? `\n\nПодал: ${escapeHtml(author.firstName || '')} (id ${author.id})` : '';
  const text = `🆕 Заявка на проверку\n\n${describe(listing)}${from}`;
  const photo = listing.photos.find((url) => /^https?:\/\//i.test(url));

  const saves = [];
  for (const chatId of admins) {
    const sent = photo
      ? await bot.sendPhoto(env, {
          chat_id: chatId,
          photo,
          caption: text.slice(0, 1024),
          reply_markup: keyboard(listing.id),
        })
      : await bot.sendMessage(env, { chat_id: chatId, text, reply_markup: keyboard(listing.id) });

    if (sent.ok && sent.result && sent.result.message_id) {
      saves.push(
        env.DB.prepare(
          `INSERT INTO moderation_messages (listing_id, chat_id, message_id, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(listing_id, chat_id) DO UPDATE SET message_id = excluded.message_id`,
        ).bind(listing.id, chatId, sent.result.message_id, new Date().toISOString()),
      );
    }
  }

  if (saves.length > 0) await env.DB.batch(saves);
}

/* --------------------------------- решение -------------------------------- */

const DECISIONS = {
  ok: { status: 'published', label: 'одобрено', trust: false },
  okt: { status: 'published', label: 'одобрено, автор в доверенных', trust: true },
  no: { status: 'hidden', label: 'отклонено', trust: false },
};

async function applyDecision(env, action, listingId, admin) {
  const decision = DECISIONS[action];
  if (!decision) return null;

  const row = await env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(listingId).first();
  if (!row) return { text: 'Объявление не найдено — возможно, его уже убрали.' };

  const listing = rowToListing(row);
  const now = new Date().toISOString();
  const statements = [];

  if (decision.trust) {
    const handle = normalizeHandle(listing.contact.telegram, 'telegram');
    const phone = normalizeHandle(listing.contact.phone, 'phone');
    const chosen = handle ? { handle, kind: 'telegram' } : phone ? { handle: phone, kind: 'phone' } : null;
    if (chosen) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO trusted_contacts (handle, kind, note, added_by, created_at)
           VALUES (?, ?, '', ?, ?) ON CONFLICT(handle) DO NOTHING`,
        ).bind(chosen.handle, chosen.kind, admin.id, now),
      );
    }
  }

  // Плашка «проверено» ставится, только когда автор в доверенных: одобрение
  // само по себе означает лишь «не мусор», а не личное знакомство.
  const verified = decision.trust || (await isTrusted(env, listing.contact));

  statements.push(
    env.DB.prepare(
      `UPDATE listings SET status = ?, verified = ?, moderated_by = ?, moderated_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(decision.status, verified ? 1 : 0, admin.id, now, now, listingId),
  );

  await env.DB.batch(statements);

  return {
    text: `${decision.label} · ${admin.name || admin.id}`,
    listing,
    decision,
    verified,
  };
}

/** Правит исходные сообщения у всех админов, чтобы решение было видно каждому. */
async function markDecided(env, listingId, listing, summary) {
  const rows = await env.DB.prepare(
    'SELECT chat_id, message_id FROM moderation_messages WHERE listing_id = ?',
  )
    .bind(listingId)
    .all();

  const suffix = `\n\n— ${escapeHtml(summary)}`;
  const hasPhoto = listing && listing.photos.some((url) => /^https?:\/\//i.test(url));

  for (const row of rows.results || []) {
    const payload = { chat_id: row.chat_id, message_id: row.message_id, reply_markup: { inline_keyboard: [] } };
    if (hasPhoto) {
      await bot.editMessageCaption(env, {
        ...payload,
        caption: `${describe(listing).slice(0, 900)}${suffix}`,
      });
    } else {
      await bot.editMessageText(env, { ...payload, text: `${describe(listing)}${suffix}` });
    }
  }

  await env.DB.prepare('DELETE FROM moderation_messages WHERE listing_id = ?').bind(listingId).run();
}

/* --------------------------------- команды -------------------------------- */

async function handleCommand(env, message) {
  const text = String(message.text || '').trim();
  const chatId = message.chat && message.chat.id;
  const from = message.from || {};
  const reply = (body) => bot.sendMessage(env, { chat_id: chatId, text: body });

  const [command, ...rest] = text.split(/\s+/);
  const argument = rest.join(' ').trim();

  if (command === '/start' || command === '/help') {
    return reply(
      'Бот модерации доски объявлений.\n\n' +
        '/pending — заявки, ожидающие проверки\n' +
        '/trust @ник или телефон — добавить в доверенные\n' +
        '/untrust @ник — убрать\n' +
        '/trusted — список доверенных',
    );
  }

  if (command === '/pending') {
    const rows = await env.DB.prepare(
      "SELECT id, city, address, price_year FROM listings WHERE status = 'pending' ORDER BY created_at LIMIT 20",
    ).all();
    const items = rows.results || [];
    if (items.length === 0) return reply('Заявок на проверке нет.');
    return reply(
      `Ожидают проверки: ${items.length}\n\n` +
        items
          .map((row) => `• ${cityLabel(row.city)} ${row.address || ''} — ${money(row.price_year)} (${row.id})`)
          .join('\n'),
    );
  }

  if (command === '/trust') {
    if (!argument) return reply('Укажите ник или телефон: /trust @username');
    const kind = argument.startsWith('+') || /^\d[\d\s()-]+$/.test(argument) ? 'phone' : 'telegram';
    const handle = normalizeHandle(argument, kind);
    if (!handle) return reply('Не разобрал контакт.');

    await env.DB.prepare(
      `INSERT INTO trusted_contacts (handle, kind, note, added_by, created_at)
       VALUES (?, ?, '', ?, ?) ON CONFLICT(handle) DO NOTHING`,
    )
      .bind(handle, kind, from.id || null, new Date().toISOString())
      .run();

    // Уже загруженные объявления этого автора тоже становятся проверенными.
    const column = kind === 'phone' ? 'contact_phone' : 'contact_telegram';
    const updated = await env.DB.prepare(
      `UPDATE listings SET verified = 1, updated_at = ? WHERE LOWER(${column}) = ?`,
    )
      .bind(new Date().toISOString(), handle)
      .run();

    return reply(
      `Добавлен в доверенные: ${handle}\n` +
        `Помечено проверенными объявлений: ${(updated.meta && updated.meta.changes) || 0}`,
    );
  }

  if (command === '/untrust') {
    const kind = argument.startsWith('+') ? 'phone' : 'telegram';
    const handle = normalizeHandle(argument, kind);
    if (!handle) return reply('Укажите ник или телефон: /untrust @username');

    await env.DB.prepare('DELETE FROM trusted_contacts WHERE handle = ?').bind(handle).run();
    const column = kind === 'phone' ? 'contact_phone' : 'contact_telegram';
    await env.DB.prepare(
      `UPDATE listings SET verified = 0, updated_at = ? WHERE LOWER(${column}) = ?`,
    )
      .bind(new Date().toISOString(), handle)
      .run();

    return reply(`Убран из доверенных: ${handle}`);
  }

  if (command === '/trusted') {
    const rows = await env.DB.prepare(
      'SELECT handle, kind FROM trusted_contacts ORDER BY created_at DESC LIMIT 50',
    ).all();
    const items = rows.results || [];
    if (items.length === 0) return reply('Список доверенных пуст.');
    return reply(
      `Доверенные (${items.length}):\n` +
        items.map((row) => `• ${row.kind === 'phone' ? row.handle : `@${row.handle}`}`).join('\n'),
    );
  }

  return undefined;
}

/* --------------------------------- вебхук --------------------------------- */

/**
 * Обновления от телеграма. Подлинность проверяется по секретному заголовку,
 * который телеграм присылает с каждым запросом; права — по списку ADMIN_IDS.
 */
export async function handleWebhook(request, env) {
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || '');
  if (!expected) {
    console.error('TELEGRAM_WEBHOOK_SECRET не задан — вебхук отключён');
    return new Response('null', { status: 403 });
  }
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== expected) {
    return new Response('null', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('null', { status: 200 });
  }

  const query = update && update.callback_query;
  if (query) {
    const from = query.from || {};
    if (!isAdmin(env, from.id)) {
      await bot.answerCallbackQuery(env, { callback_query_id: query.id, text: 'Только для админов' });
      return new Response('null', { status: 200 });
    }

    const [action, listingId] = String(query.data || '').split(':');
    const admin = { id: from.id, name: from.first_name || from.username || String(from.id) };
    const result = await applyDecision(env, action, listingId, admin);

    if (!result) {
      await bot.answerCallbackQuery(env, { callback_query_id: query.id, text: 'Неизвестное действие' });
      return new Response('null', { status: 200 });
    }

    await bot.answerCallbackQuery(env, { callback_query_id: query.id, text: result.text });
    if (result.listing) await markDecided(env, listingId, result.listing, result.text);
    return new Response('null', { status: 200 });
  }

  const message = update && update.message;
  if (message && message.text && isAdmin(env, message.from && message.from.id)) {
    await handleCommand(env, message);
  }

  return new Response('null', { status: 200 });
}
