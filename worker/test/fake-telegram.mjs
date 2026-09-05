// Подставной Bot API: тесты модерации не должны ходить в настоящий телеграм.
// Адрес подставляется через TELEGRAM_API_BASE в .dev.vars.
import http from 'node:http';

export const TELEGRAM_PORT = 8899;

export function startFakeTelegram(port = TELEGRAM_PORT) {
  const calls = [];
  let messageId = 1000;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const method = new URL(req.url, 'http://x').pathname.split('/').pop();
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch {
        /* пустое тело — тоже вызов */
      }
      calls.push({ method, payload });

      const result =
        method === 'sendMessage' || method === 'sendPhoto'
          ? { message_id: (messageId += 1), chat: { id: payload.chat_id } }
          : true;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    });
  });

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });

  return {
    ready,
    calls: () => calls,
    reset: () => {
      calls.length = 0;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
