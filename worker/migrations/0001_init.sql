-- Объявления. Поля повторяют src/schema.js: snake_case в базе, camelCase в API.
CREATE TABLE listings (
  id               TEXT PRIMARY KEY,
  deal_type        TEXT    NOT NULL DEFAULT 'rent',
  city             TEXT    NOT NULL DEFAULT '',
  district         TEXT    NOT NULL DEFAULT '',
  address          TEXT    NOT NULL DEFAULT '',
  price_year       INTEGER NOT NULL DEFAULT 0,
  deposit          INTEGER NOT NULL DEFAULT 0,
  commission       INTEGER NOT NULL DEFAULT 0,
  utilities        INTEGER NOT NULL DEFAULT 0,
  rooms            INTEGER NOT NULL DEFAULT 0,
  area             INTEGER NOT NULL DEFAULT 0,
  floor            TEXT    NOT NULL DEFAULT '',
  furnished        INTEGER NOT NULL DEFAULT 0,
  features         TEXT    NOT NULL DEFAULT '[]',
  description      TEXT    NOT NULL DEFAULT '',
  photos           TEXT    NOT NULL DEFAULT '[]',
  contact_telegram TEXT    NOT NULL DEFAULT '',
  contact_phone    TEXT    NOT NULL DEFAULT '',
  source_chat      TEXT    NOT NULL DEFAULT '',
  source_url       TEXT    NOT NULL DEFAULT '',
  published_at     TEXT    NOT NULL DEFAULT '',
  expires_at       TEXT    NOT NULL DEFAULT '',
  verified         INTEGER NOT NULL DEFAULT 0,

  -- Служебное, наружу не отдаётся.
  status           TEXT    NOT NULL DEFAULT 'published', -- published | pending | hidden
  origin           TEXT    NOT NULL DEFAULT 'parser',    -- parser | user
  author_id        INTEGER,
  search           TEXT    NOT NULL DEFAULT '',          -- строка из searchText(), уже в нижнем регистре
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

-- Порядок ленты: сначала проверенные, потом свежие. Тот же, что в compareListings.
CREATE INDEX idx_listings_feed
  ON listings (status, deal_type, city, verified DESC, published_at DESC, id);

CREATE INDEX idx_listings_expires ON listings (expires_at);
CREATE INDEX idx_listings_author  ON listings (author_id, created_at DESC);

-- Жалобы. Пара (объявление, человек) уникальна: один человек — один голос.
CREATE TABLE reports (
  listing_id TEXT    NOT NULL,
  user_id    INTEGER NOT NULL,
  reason     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL,
  PRIMARY KEY (listing_id, user_id)
);

CREATE INDEX idx_reports_user ON reports (user_id, created_at DESC);
