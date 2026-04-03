-- ============================================================
-- RUN THIS IN TWO SEPARATE STEPS IN SUPABASE SQL EDITOR
-- Copy STEP 1 first → Run → then copy STEP 2 → Run
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- STEP 1 — Paste this block alone and click Run
-- Fixes: trades table missing lot_size and other EA columns
-- ════════════════════════════════════════════════════════════

ALTER TABLE trades ADD COLUMN IF NOT EXISTS lot_size       numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS swap           numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS commission     numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS total_pnl      numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sl             numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tp             numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rr             numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS duration_min   integer  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_login  text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mt5_ticket     text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_time      timestamptz;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS session        text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS timeframe      text;


-- ════════════════════════════════════════════════════════════
-- STEP 2 — Paste this block alone and click Run
-- Fixes: sylledge_market_data table (drops old broken version,
--        recreates with correct candle_time column name)
-- ════════════════════════════════════════════════════════════

-- Drop the old table (it exists but has wrong column names)
DROP TABLE IF EXISTS sylledge_market_data;

-- Recreate with correct schema
CREATE TABLE sylledge_market_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      text        NOT NULL,
  timeframe   text        NOT NULL,
  candle_time timestamptz NOT NULL,
  open_price  numeric,
  high_price  numeric,
  low_price   numeric,
  close_price numeric,
  volume      bigint      DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (symbol, timeframe, candle_time)
);

-- Enable RLS
ALTER TABLE sylledge_market_data ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read
CREATE POLICY "Authenticated users can read market data"
  ON sylledge_market_data FOR SELECT TO authenticated USING (true);

-- Indexes for fast chart queries
CREATE INDEX idx_market_data_lookup
  ON sylledge_market_data (symbol, timeframe, candle_time);

CREATE INDEX idx_market_data_symbol
  ON sylledge_market_data (symbol);
