// Проверка подлинности мини-приложения.
// initDataUnsafe на клиенте — только для интерфейса; доверять можно лишь тому,
// что проверено здесь: HMAC-SHA256 от initData ключом, выведенным из токена бота.

const encoder = new TextEncoder();

async function hmac(keyMaterial, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Сравнение без ранних выходов: время не должно зависеть от того, где разошлось. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * @returns {Promise<{ok: true, user: object|null, authDate: number} | {ok: false, reason: string}>}
 */
export async function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!botToken) return { ok: false, reason: 'no-bot-token' };
  if (!initData || typeof initData !== 'string') return { ok: false, reason: 'no-init-data' };

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no-hash' };

  // Из строки исключается только hash. Поле signature (проверка сторонними
  // сервисами через Ed25519) в подсчёт HMAC входит наравне с остальными.
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();

  const secretKey = await hmac(encoder.encode('WebAppData'), botToken);
  const expected = toHex(await hmac(secretKey, pairs.join('\n')));

  if (!timingSafeEqual(expected, hash.toLowerCase())) return { ok: false, reason: 'bad-hash' };

  // Подпись без срока годности — это украденная ссылка, работающая вечно.
  const authDate = Number(params.get('auth_date')) || 0;
  if (!authDate) return { ok: false, reason: 'no-auth-date' };
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSeconds) return { ok: false, reason: 'expired' };
  if (age < -300) return { ok: false, reason: 'from-future' };

  let user = null;
  try {
    const raw = params.get('user');
    if (raw) user = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'bad-user' };
  }
  if (!user || !Number.isFinite(user.id)) return { ok: false, reason: 'no-user' };

  return { ok: true, user, authDate };
}

/** Достаёт initData из заголовка `Authorization: tma <initData>`. */
export function initDataFromRequest(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^tma\s+(.+)$/i);
  return match ? match[1] : '';
}

/** @returns {Promise<{id:number, firstName:string, username:string}|null>} */
export async function authenticate(request, env) {
  const result = await verifyInitData(
    initDataFromRequest(request),
    env.BOT_TOKEN,
    Number(env.INIT_DATA_MAX_AGE) || 86400,
  );
  if (!result.ok) return null;
  return {
    id: result.user.id,
    firstName: result.user.first_name || '',
    username: result.user.username || '',
  };
}

/** Общий секрет парсера: `Authorization: Bearer <INGEST_TOKEN>`. */
export function authenticateIngest(request, env) {
  const token = (env.INGEST_TOKEN || '').trim();
  if (!token) return false;
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match) && timingSafeEqual(match[1].trim(), token);
}
