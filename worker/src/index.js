// Контракт (см. README):
//   GET  /listings?deal&city&district&rooms&priceMin&priceMax&q&cursor&limit
//   GET  /listings/:id
//   POST /listings                 Authorization: tma <initData>
//   POST /listings/:id/report      Authorization: tma <initData>
// Сверх контракта: /facets для счётчиков по городам, /my/listings для «ваших
// объявлений», /ingest для парсера, /photos/* для фотографий в R2.

import { authenticate, authenticateIngest } from './auth.js';
import { FEED_ORDER, feedConditions, listingToRow, rowToListing, upsertStatement } from './db.js';
import { corsHeaders, error, json, readJson } from './http.js';
import { validateSubmission } from './validate.js';
import { normalizeListing } from './schema.js';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const SUBMIT_LIMIT_PER_HOUR = 5;
const REPORT_LIMIT_PER_HOUR = 20;
const DEFAULT_TTL_DAYS = 30;

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

  // Заявка ждёт модерации: в ленту она попадёт после проверки, а не сразу.
  const row = listingToRow(item, { status: 'pending', origin: 'user', authorId: user.id });
  await upsertStatement(env.DB, row).run();

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

  const statements = [];
  let skipped = 0;

  for (const raw of items) {
    const item = normalizeListing(raw);
    // Без своего id запись нельзя обновить повторно, без города — нельзя показать.
    if (!raw?.id || !item.city) {
      skipped += 1;
      continue;
    }
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
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (path === '/health') return json({ ok: true }, { request, env });

      if (path === '/listings' && method === 'GET') return listListings(request, env, url);
      if (path === '/facets' && method === 'GET') return facets(request, env, url);
      if (path === '/listings' && method === 'POST') return createListing(request, env);
      if (path === '/my/listings' && method === 'GET') return myListings(request, env);
      if (path === '/ingest' && method === 'POST') return ingest(request, env);

      const report = path.match(/^\/listings\/([^/]+)\/report$/);
      if (report && method === 'POST') return reportListing(request, env, decodeURIComponent(report[1]));

      const detail = path.match(/^\/listings\/([^/]+)$/);
      if (detail && method === 'GET') return getListingById(request, env, decodeURIComponent(detail[1]));

      const photo = path.match(/^\/photos\/(.+)$/);
      if (photo && method === 'PUT') return putPhoto(request, env, decodeURIComponent(photo[1]));
      if (photo && method === 'GET') return getPhoto(request, env, decodeURIComponent(photo[1]));

      return error(404, 'not-found', { request, env });
    } catch (cause) {
      // Наружу — только код. Подробности в логах Worker.
      console.error('unhandled', cause?.stack || cause);
      return error(500, 'internal', { request, env });
    }
  },
};
