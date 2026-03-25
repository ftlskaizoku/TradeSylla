-- Migration: support multi-account dedup in ea-sync v4.0
-- Run in Supabase → SQL Editor

-- 1. Make sure account_login column exists
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_login TEXT DEFAULT NULL;

-- 2. Drop the old single-account unique constraint if it exists
--    (old constraint was on user_id + mt5_ticket alone — breaks multi-account)
DROP INDEX IF EXISTS trades_user_id_mt5_ticket_key;

-- 3. Add the new multi-account-aware unique constraint
--    (same ticket number from two different MT5 accounts = two valid rows)
ALTER TABLE trades
  DROP CONSTRAINT IF EXISTS trades_user_account_ticket_unique;

ALTER TABLE trades
  ADD CONSTRAINT trades_user_account_ticket_unique
  UNIQUE (user_id, account_login, mt5_ticket);

-- 4. Index for fast per-account filtering
CREATE INDEX IF NOT EXISTS idx_trades_account_login
  ON trades(user_id, account_login);

-- 5. Index for fast dedup lookups
CREATE INDEX IF NOT EXISTS idx_trades_mt5_ticket
  ON trades(user_id, mt5_ticket)
  WHERE mt5_ticket IS NOT NULL;
