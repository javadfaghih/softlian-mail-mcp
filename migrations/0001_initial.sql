CREATE TABLE IF NOT EXISTS mail_accounts (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS send_limits (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
