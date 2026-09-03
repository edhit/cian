export function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const anyOrigin = allowed.includes('*');
  const allow = anyOrigin ? '*' : allowed.includes(origin) ? origin : '';

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  // Ответ зависит от Origin — иначе кэш отдаст чужие заголовки.
  if (!anyOrigin) headers.Vary = 'Origin';
  return headers;
}

export function json(data, { status = 200, request, env, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(request ? corsHeaders(request, env) : {}),
      ...headers,
    },
  });
}

export function error(status, reason, context) {
  return json({ ok: false, error: reason }, { ...context, status });
}

export async function readJson(request, limitBytes = 512 * 1024) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > limitBytes) return { tooLarge: true };
  try {
    const text = await request.text();
    if (text.length > limitBytes) return { tooLarge: true };
    return { value: JSON.parse(text) };
  } catch {
    return { invalid: true };
  }
}
