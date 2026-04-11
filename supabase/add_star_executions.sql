-- ─── Add star_rating and executions columns to trades ───────────────────────
-- Run in Supabase SQL Editor

ALTER TABLE trades ADD COLUMN IF NOT EXISTS star_rating  int     DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS executions   jsonb   DEFAULT '[]';

-- star_rating: 0 = unrated, 1–5 stars
-- executions:  array of { type, direction, price, volume, time, pnl }
--              populated automatically by TradeSylla_Sync EA for partial fills
--              or manually from MT5 history import

CREATE INDEX IF NOT EXISTS trades_star_rating_idx ON trades(star_rating) WHERE star_rating > 0;
