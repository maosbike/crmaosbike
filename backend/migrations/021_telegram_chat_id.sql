-- Add telegram_chat_id to users for Telegram notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(50);
