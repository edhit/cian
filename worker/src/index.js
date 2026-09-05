// Контракт (см. README):
//   GET  /listings?deal&city&district&rooms&priceMin&priceMax&q&cursor&limit
//   GET  /listings/:id
//   POST /listings                 Authorization: tma <initData>
//   POST /listings/:id/report      Authorization: tma <initData>
// Сверх контракта: /facets для счётчиков по городам, /my/listings для «ваших
// объявлений», /ingest для парсера, /photos/* для фотографий в R2,
// /telegram/webhook для модерации через бота.

import { authenticate, authenticateIngest } from './auth.js';
import { FEED_ORDER, feedConditions, listingToRow, rowToListing, upsertStatement } from './db.js';
import { corsHeaders, error, json, readJson } from './http.js';
import { normalizeListing, validateSubmission } from './schema.js';
import { handleWebhook, isTrusted, matchesTrusted, notifyAdmins, trustedSet } from './moderation.js';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const SUBMIT_LIMIT_PER_HOUR = 5;
const REPORT_LIMIT_PER_HOUR = 20;
const DEFAULT_TTL_DAYS = 30;

/**
 * Без привязки к D1 любой запрос падал с необработанным исключением, а Cloudflare
 * отвечал своей страницей Error 1101 — без CORS-заголовков и без намёка на причину.
 * Лучше честно сказать, что база не подключена.
 */
function requireDb(request, env) {
  if (env && env.DB && typeof env.DB.prepare === 'function') return null;
  console.error(
    'Привязка D1 (DB) недоступна. Проверьте database_id в wrangler.toml — ' +
      'по умолчанию там заглушка из нулей — и что миграции применены с --remote.',
  );
  return error(503, 'no-database', { request, env });
}

function requireBucket(request, env) {
  if (env && env.PHOTOS && typeof env.PHOTOS.get === 'function') return null;
  console.error('Привязка R2 (PHOTOS) недоступна. Создайте бакет и проверьте bucket_name.');
  return error(503, 'no-bucket', { request, env });
}

/** Что настроено, а что нет. Значения секретов наружу не отдаются — только факт. */
async function health(request, env) {
  const checks = {
    ok: true,
    db: 'нет привязки',
    r2: 'нет привязки',
    botToken: Boolean(env && env.BOT_TOKEN),
    ingestToken: Boolean(env && env.INGEST_TOKEN),
    allowedOrigins: String((env && env.ALLOWED_ORIGINS) || '*'),
  };

  if (env && env.DB && typeof env.DB.prepare === 'function') {
    try {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM listings').first();
      checks.db = 'ок';
      checks.listings = Number(row && row.n) || 0;
    } catch (cause) {
      const message = String((cause && cause.message) || cause);
      checks.db = /no such table/i.test(message)
        ? 'таблиц нет — примените миграции: wrangler d1 migrations apply realty --remote'
        : `ошибка: ${message}`;
      checks.ok = false;
    }
  } else {
    checks.ok = false;
  }

  if (env && env.PHOTOS && typeof env.PHOTOS.head === 'function') {
    try {
      await env.PHOTOS.head('__health__');
      checks.r2 = 'ок';
    } catch (cause) {
      checks.r2 = `ошибка: ${(cause && cause.message) || cause}`;
    }
  }

  return json(checks, { request, env, status: checks.ok ? 200 : 503 });
}

function parseFilters(url) {
  const p = url.searchParams;
  return {
    deal: p.get('deal') || '',
    city: p.get('city') || '',
    district: p.get('district') || '',
    rooms: Number(p.get('rooms')) || 0,
    priceMin: Number(p.get('priceMin')) || 0,
    priceMax: Number(p.get('priceMax')) || 0,
    q: (p.get('q') || '').trim(),
  };
}

/* --------------------------------- лента --------------------------------- */

async function listListings(request, env, url) {
  const filters = parseFilters(url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  // Курсор непрозрачен для клиента: сейчас это смещение, потом станет идентификатором.
  const offset = Math.max(Number.parseInt(url.searchParams.get('cursor'), 10) || 0, 0);

  const { where, binds } = feedConditions(filters);

  const [countRow, page] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM listings WHERE ${where}`).bind(...binds).first(),
    env.DB.prepare(`SELECT * FROM listings WHERE ${where} ORDER BY ${FEED_ORDER} LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all(),
  ]);

  const items = (page.results || []).map(rowToListing);
  const total = Number(countRow?.total) || 0;
  const nextOffset = offset + items.length;

  return json(
    { items, nextCursor: nextOffset < total ? String(nextOffset) : null, total },
    { request, env },
  );
}

/**
 * Сколько объявлений в каждом городе. Без этого мини-приложение не может честно
 * подписать пустые города «пока нет объявлений» и молчит вместо подсказки.
 */
async function facets(request, env, url) {
  const deal = url.searchParams.get('deal') || '';
  const { where, binds } = feedConditions({ deal, city: '', district: '', rooms: 0, priceMin: 0, priceMax: 0, q: '' });

  const rows = await env.DB.prepare(
    `SELECT city, COUNT(*) AS n FROM listings WHERE ${where} GROUP BY city`,
  )
    .bind(...binds)
    .all();

  const cityCounts = {};
  for (const row of rows.results || []) cityCounts[row.city] = Number(row.n) || 0;

  return json({ cityCounts }, { request, env });
}

async function getListingById(request, env, id) {
  const row = await env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(id).first();
  if (!row) return error(404, 'not-found', { request, env });

  if (row.status !== 'published') {
    // Своё объявление на модерации человек видеть должен, чужое — нет.
    const user = await authenticate(request, env);
    if (!user || row.author_id !== user.id) return error(404, 'not-found', { request, env });
  }

  return json({ item: rowToListing(row) }, { request, env });
}

/* ------------------------------ заявка от человека ------------------------ */

async function countRecent(env, table, userId, hours = 1) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const column = table === 'listings' ? 'author_id' : 'user_id';
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ? AND created_at >= ?`,
  )
    .bind(userId, since)
    .first();
  return Number(row?.n) || 0;
}

async function createListing(request, env) {
  const user = await authenticate(request, env);
  if (!user) return error(401, 'unauthorized', { request, env });

  const body = await readJson(request);
  if (body.tooLarge) return error(413, 'too-large', { request, env });
  if (body.invalid) return error(400, 'bad-json', { request, env });

  const checked = validateSubmission(body.value);
  if (!checked.ok) {
    return json({ ok: false, error: 'invalid', fields: checked.errors }, { request, env, status: 422 });
  }

  if ((await countRecent(env, 'listings', user.id)) >= SUBMIT_LIMIT_PER_HOUR) {
    return error(429, 'too-many-submissions', { request, env });
  }

  const now = new Date();
  const item = checked.item;
  item.id = crypto.randomUUID();
  item.publishedAt = now.toISOString();
  item.expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 86400_000).toISOString();

  // Плашку «проверено» получает только тот, кого владелец доски знает лично.
  item.verified = await isTrusted(env, item.contact);

  // Заявка ждёт модерации: в ленту она попадёт после проверки, а не сразу.
  const row = listingToRow(item, { status: 'pending', origin: 'user', authorId: user.id });
  await upsertStatement(env.DB, row).run();

  // Сбой телеграма не должен отражаться на человеке: заявка уже сохранена.
  await notifyAdmins(env, item, user);

  return json({ ok: true, id: item.id, status: 'pending' }, { request, env, status: 201 });
}

async function myListings(request, env) {
  const user = await authenticate(request, env);
  if (!user) return error(401, 'unauthorized', { request, env });

  const page = await env.DB.prepare(
    'SELECT * FROM listings WHERE author_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(user.id)
    .all();

  const items = (page.results || []).map((row) => ({
    ...rowToListing(row),
    status: row.status,
  }));

  return json({ items, total: items.length }, { request, env });
}

/* --------------------------------- жалобы -------------------------------- */

async function reportListing(request, env, id) {
  const user = await authenticate(request, env);
  if (!user) return error(401, 'unauthorized', { request, env });

  const exists = await env.DB.prepare('SELECT id FROM listings WHERE id = ?').bind(id).first();
  if (!exists) return error(404, 'not-found', { request, env });

  if ((await countRecent(env, 'reports', user.id)) >= REPORT_LIMIT_PER_HOUR) {
    return error(429, 'too-many-reports', { request, env });
  }

  const body = await readJson(request);
  const reason = String(body.value?.reason || '').slice(0, 200);

  // Пара (объявление, человек) уникальна — повторная жалоба ничего не добавляет.
  await env.DB.prepare(
    `INSERT INTO reports (listing_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(listing_id, user_id) DO UPDATE SET reason = excluded.reason`,
  )
    .bind(id, user.id, reason, new Date().toISOString())
    .run();

  const threshold = Number(env.REPORT_THRESHOLD) || 5;
  const counted = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE listing_id = ?')
    .bind(id)
    .first();

  if ((Number(counted?.n) || 0) >= threshold) {
    await env.DB.prepare("UPDATE listings SET status = 'hidden', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), id)
      .run();
  }

  return json({ ok: true }, { request, env });
}

/* --------------------------------- парсер -------------------------------- */

async function ingest(request, env) {
  if (!authenticateIngest(request, env)) return error(401, 'unauthorized', { request, env });

  const body = await readJson(request, 8 * 1024 * 1024);
  if (body.tooLarge) return error(413, 'too-large', { request, env });
  if (body.invalid) return error(400, 'bad-json', { request, env });

  const items = Array.isArray(body.value?.items) ? body.value.items : [];
  if (items.length === 0) return json({ ok: true, upserted: 0, skipped: 0 }, { request, env });

  const trusted = await trustedSet(env);
  const statements = [];
  let skipped = 0;

  for (const raw of items) {
    const item = normalizeListing(raw);
    // Без своего id запись нельзя обновить повторно, без города — нельзя показать.
    if (!raw?.id || !item.city) {
      skipped += 1;
      continue;
    }
    // Парсер не решает, кто проверенный: это определяет список доверенных контактов.
    item.verified = matchesTrusted(trusted, item.contact);
    statements.push(upsertStatement(env.DB, listingToRow(item, { status: 'published', origin: 'parser' })));
  }

  // D1 ограничивает размер пакета — режем на части.
  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }

  return json({ ok: true, upserted: statements.length, skipped }, { request, env });
}

/* ------------------------------ фотографии ------------------------------- */

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const USER_PHOTOS_PER_HOUR = 30;

/**
 * Загрузка фотографии из мини-приложения. Секрет парсера человеку не выдаётся,
 * поэтому здесь права подтверждает initData, а имя файла назначает сервер.
 */
async function uploadUserPhoto(request, env) {
  const user = await authenticate(request, env);
  if (!user) return error(401, 'unauthorized', { request, env });

  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!PHOTO_TYPES.has(type)) return error(415, 'bad-type', { request, env });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return error(400, 'empty', { request, env });
  if (bytes.byteLength > MAX_PHOTO_BYTES) return error(413, 'too-large', { request, env });

  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM user_photos WHERE user_id = ? AND created_at >= ?',
  )
    .bind(user.id, since)
    .first();
  if ((Number(recent && recent.n) || 0) >= USER_PHOTOS_PER_HOUR) {
    return error(429, 'too-many-photos', { request, env });
  }

  const key = `u${user.id}-${crypto.randomUUID()}.${PHOTO_EXT[type]}`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare(
    'INSERT INTO user_photos (key, user_id, bytes, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(key, user.id, bytes.byteLength, new Date().toISOString())
    .run();

  const base = (env.PUBLIC_BASE || '').replace(/\/+$/, '') || new URL(request.url).origin;
  return json({ ok: true, key, url: `${base}/photos/${key}` }, { request, env, status: 201 });
}

async function putPhoto(request, env, key) {
  if (!authenticateIngest(request, env)) return error(401, 'unauthorized', { request, env });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) return error(400, 'bad-key', { request, env });

  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!PHOTO_TYPES.has(type)) return error(415, 'bad-type', { request, env });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return error(400, 'empty', { request, env });
  if (bytes.byteLength > MAX_PHOTO_BYTES) return error(413, 'too-large', { request, env });

  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });

  const base = (env.PUBLIC_BASE || '').replace(/\/+$/, '') || new URL(request.url).origin;
  return json({ ok: true, key, url: `${base}/photos/${key}` }, { request, env });
}

async function getPhoto(request, env, key) {
  const object = await env.PHOTOS.get(key);
  if (!object) return error(404, 'not-found', { request, env });

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      // Ключ содержит хеш содержимого, поэтому картинку можно кэшировать надолго.
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
      ...corsHeaders(request, env),
    },
  });
}

/* -------------------------------- маршруты ------------------------------- */

// Сколько дней хранить объявление после того, как истёк его срок.
const KEEP_EXPIRED_DAYS = 60;

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (path === '/health') return health(request, env);

  // Вебхук телеграма проверяет себя сам по секретному заголовку.
  if (path === '/telegram/webhook' && method === 'POST') {
    const missing = requireDb(request, env);
    if (missing) return missing;
    return handleWebhook(request, env);
  }

  const photo = path.match(/^\/photos\/(.+)$/);
  if (photo && (method === 'PUT' || method === 'GET')) {
    const missing = requireBucket(request, env);
    if (missing) return missing;
    return method === 'PUT'
      ? putPhoto(request, env, decodeURIComponent(photo[1]))
      : getPhoto(request, env, decodeURIComponent(photo[1]));
  }

  if (path === '/photos' && method === 'POST') {
    const noBucket = requireBucket(request, env);
    if (noBucket) return noBucket;
    const noDb = requireDb(request, env);
    if (noDb) return noDb;
    return uploadUserPhoto(request, env);
  }

  // Всё остальное читает или пишет базу.
  const missingDb = requireDb(request, env);
  if (missingDb) return missingDb;

  if (path === '/listings' && method === 'GET') return listListings(request, env, url);
  if (path === '/facets' && method === 'GET') return facets(request, env, url);
  if (path === '/listings' && method === 'POST') return createListing(request, env);
  if (path === '/my/listings' && method === 'GET') return myListings(request, env);
  if (path === '/ingest' && method === 'POST') return ingest(request, env);

  const report = path.match(/^\/listings\/([^/]+)\/report$/);
  if (report && method === 'POST') return reportListing(request, env, decodeURIComponent(report[1]));

  const detail = path.match(/^\/listings\/([^/]+)$/);
  if (detail && method === 'GET') return getListingById(request, env, decodeURIComponent(detail[1]));

  return error(404, 'not-found', { request, env });
}

export default {
  /** Ночная уборка: без неё база растёт вечно. */
  async scheduled(event, env) {
    const cutoff = new Date(Date.now() - KEEP_EXPIRED_DAYS * 86400_000).toISOString();
    const removed = await env.DB.prepare(
      `DELETE FROM listings
       WHERE origin = 'parser' AND expires_at != '' AND expires_at < ?`,
    )
      .bind(cutoff)
      .run();

    // Жалобы на удалённые объявления держать незачем.
    await env.DB.prepare(
      'DELETE FROM reports WHERE listing_id NOT IN (SELECT id FROM listings)',
    ).run();

    console.log('уборка:', removed.meta?.changes ?? 0, 'объявлений удалено');
  },

  async fetch(request, env) {
    // Перехват охватывает и разбор адреса, и предварительный запрос: всё, что
    // вылетит отсюда, Cloudflare покажет как Error 1101 без единого заголовка.
    try {
      return await route(request, env);
    } catch (cause) {
      // Наружу — только код. Подробности в логах: wrangler tail.
      console.error('unhandled', (cause && cause.stack) || cause);
      return error(500, 'internal', { request, env });
    }
  },
};
