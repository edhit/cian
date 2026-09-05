-- Проверенные контакты: те, кого владелец доски знает лично.
-- Их объявления получают плашку «проверено» автоматически.
CREATE TABLE trusted_contacts (
  handle     TEXT PRIMARY KEY,   -- ник в нижнем регистре без @ либо телефон в виде +9665...
  kind       TEXT NOT NULL,      -- telegram | phone
  note       TEXT NOT NULL DEFAULT '',
  added_by   INTEGER,
  created_at TEXT NOT NULL
);

-- Сообщения модерации: по какому объявлению какому админу что отправлено.
-- Нужно, чтобы после решения поправить исходное сообщение в боте.
CREATE TABLE moderation_messages (
  listing_id TEXT    NOT NULL,
  chat_id    INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (listing_id, chat_id)
);

-- Кто и как решил. Пригодится, когда решений станет много.
ALTER TABLE listings ADD COLUMN moderated_by INTEGER;
ALTER TABLE listings ADD COLUMN moderated_at TEXT;

-- Фотографии, загруженные людьми: нужен учёт, чтобы ограничивать частоту.
CREATE TABLE user_photos (
  key        TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_user_photos_user ON user_photos (user_id, created_at DESC);
