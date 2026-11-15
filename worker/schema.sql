-- D1 Database schema for Sticker & Emoji Factory
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  stickers_count INTEGER DEFAULT 0,
  is_pro INTEGER DEFAULT 0,
  current_pack TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);

