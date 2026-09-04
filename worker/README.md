# realty-api — Worker

Бэкенд доски объявлений: Cloudflare Worker, D1 для объявлений, R2 для фотографий.
Фронт лежит на уровень выше и ходит сюда, когда задана `VITE_API_BASE`.

## Развёртывание

```bash
cd worker
npm install

wrangler d1 create realty                 # идентификатор из вывода вписать в wrangler.toml
wrangler r2 bucket create realty-photos

wrangler secret put BOT_TOKEN             # токен бота: из него выводится ключ проверки initData
wrangler secret put INGEST_TOKEN          # общий секрет для парсера, любая длинная случайная строка

wrangler d1 migrations apply realty --remote
wrangler deploy
```

После первого развёртывания вписать в `wrangler.toml`:

- `PUBLIC_BASE` — адрес самого Worker, из него собираются ссылки на фотографии;
- `ALLOWED_ORIGINS` — адрес фронта на Pages вместо звёздочки.

```toml
ALLOWED_ORIGINS = "https://имя-проекта.pages.dev"   # правильно
ALLOWED_ORIGINS = "https://имя-проекта.pages.dev/"  # тоже сработает, слэш срезается
```

Заголовок `Origin`, который присылает браузер, — это всегда «схема://хост», без
косой черты и без пути. Раньше строгое сравнение с адресом из настроек молча роняло
весь фронт: браузер не получал `Access-Control-Allow-Origin` и показывал это как
обрыв связи. Теперь адреса приводятся к одному виду с обеих сторон, а несовпадение
пишется в лог — видно через `wrangler tail`.

Несколько адресов перечисляются через запятую (например, домен Pages и свой домен).

Фронт собирается с `VITE_API_BASE=https://realty-api.<аккаунт>.workers.dev`.

## Разработка и тесты

```bash
npm run migrate:local
npm run dev                # workerd + локальные D1 и R2
npm test                   # 30 тестов по живому Worker, в соседнем терминале
```

Секреты для локального запуска — в `.dev.vars` (в git не попадает):

```
BOT_TOKEN=123456:TEST-BOT-TOKEN-FOR-LOCAL-ONLY
INGEST_TOKEN=local-ingest-secret
ALLOWED_ORIGINS=https://cianksa.pages.dev/
```

Значения из `.dev.vars` перекрывают `[vars]` из `wrangler.toml` только локально.

## Контракт

```
GET  /listings?deal&city&district&rooms&priceMin&priceMax&q&cursor&limit
     → { items, nextCursor, total }
GET  /listings/:id                 → { item }
POST /listings                     → { ok, id, status }   Authorization: tma <initData>
POST /listings/:id/report          → { ok }               Authorization: tma <initData>
```

Сверх контракта:

```
GET  /facets?deal=rent             → { cityCounts }       сколько объявлений в каждом городе
GET  /my/listings                  → { items, total }     Authorization: tma <initData>
POST /ingest                       → { ok, upserted, skipped }   Authorization: Bearer <INGEST_TOKEN>
PUT  /photos/:key                  → { ok, key, url }            Authorization: Bearer <INGEST_TOKEN>
GET  /photos/:key                  → сама картинка
GET  /health                       → { ok }
```

## Порядок выдачи

`src/schema.js` — **побайтовая копия** `../src/lib/schema.js`. Одинаковость проверяется
командой `diff ../src/lib/schema.js src/schema.js`; расхождение означает, что после
переезда лента перетасуется.

Порядок ленты — сначала `verified`, потом по `publishedAt` вниз, при равенстве по `id` —
задан в `compareListings` на клиенте и в `FEED_ORDER` в `src/db.js` на сервере.
Совпадение проверяется тестом «порядок и состав ленты совпадают с клиентским
queryListings»: он гоняет семь наборов фильтров через HTTP и сравнивает
идентификаторы с результатом клиентской функции на тех же данных.

Проверка заявки от человека (`validateSubmission`) тоже живёт в общей схеме: клиент
показывает ошибку сразу, Worker проверяет заново, потому что клиенту верить нельзя.
Правила при этом ровно одни.

Поиск устроен так же честно: `searchText()` из общей схемы кладётся при записи
в колонку `search`, а запрос разбирается тем же `searchWords()` и ищется через
`LIKE` по каждому слову. Поэтому «харам квартира» находит одно и то же и в браузере,
и в базе.

`nextCursor` непрозрачен: сейчас это смещение, потом станет идентификатором записи.
Клиент его только возвращает обратно.

## Загрузка из парсера

Парсер шлёт тот же JSON, что раньше писал в `public/listings.json`:

```bash
curl -X POST https://realty-api.<аккаунт>.workers.dev/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data @listings.json
```

Запись обновляется по `id`, поэтому повторный прогон парсера не плодит дублей.
Записи без `id` или без известного города пропускаются и считаются в `skipped` —
одна битая строка из чата не роняет всю загрузку.

Фотографии кладутся отдельно, до загрузки объявлений:

```bash
curl -X PUT https://realty-api.<аккаунт>.workers.dev/photos/<ключ>.jpg \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg
```

В ответе — `url`, который кладётся в поле `photos` объявления. В качестве ключа удобно
брать хеш содержимого: он не меняется, а раздача помечена `immutable`.

Принимаются только `image/jpeg`, `image/png` и `image/webp` до 5 МБ. SVG не принимается
намеренно: это исполняемый документ, а не картинка.

## Что решено сверх задания

Эти вещи в промпте не описаны, но без них Worker либо неполон, либо небезопасен.

- **Заявки уходят на модерацию.** `POST /listings` создаёт объявление со статусом
  `pending`: в ленте его нет, автору оно видно, постороннему — нет. Публиковать
  что попало от кого угодно на доске, где остальное собрано парсером, нельзя.
  Одобрение пока делается руками:

  ```bash
  wrangler d1 execute realty --remote \
    --command "UPDATE listings SET status='published' WHERE id='<id>'"
  ```

  Список ожидающих:

  ```bash
  wrangler d1 execute realty --remote \
    --command "SELECT id, city, address, price_year, created_at FROM listings WHERE status='pending' ORDER BY created_at"
  ```
- **Сервер сам назначает часть полей.** Заявка не может объявить себя `verified`,
  подделать `source` или задать себе срок жизни — иначе значок «проверено» ничего не стоит.
- **Жалобы считаются по людям, а не по нажатиям.** Пара (объявление, человек) уникальна;
  при `REPORT_THRESHOLD` разных жалобщиков объявление скрывается само.
- **Ограничение частоты**: пять заявок и двадцать жалоб в час на человека.
- **Ночная уборка** (`crons = ["0 3 * * *"]`) удаляет объявления парсера, просроченные
  больше 60 дней назад, и осиротевшие жалобы. Заявки людей не трогает.
- **`/facets`** — счётчики по городам. Без них мини-приложение не может подписать
  пустые города «пока нет объявлений»: по `GET /listings` этого не узнать.

## Чего здесь нет

Редактирования и удаления своих объявлений, интерфейса модерации, загрузки фотографий
из мини-приложения (`PUT /photos` требует секрет парсера, человеку он не выдаётся),
проверки телефона, платежей. Всё это добавляется, когда станет понятно, идут ли заявки.

Проверка `initData` сделана по HMAC-SHA256 с токеном бота. Сторонняя проверка
по Ed25519-подписи (поле `signature`) не реализована — она нужна, только если данные
мини-приложения будет проверять кто-то, у кого нет токена бота.
