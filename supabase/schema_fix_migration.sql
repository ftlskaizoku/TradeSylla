-- ============================================================
-- TradeSylla — Schema Fix Migration
-- Run this in: Supabase → SQL Editor → New Query → Run
--
-- Fixes two issues:
--   1. trades table missing lot_size column   → EA inserts fail
--   2. sylledge_market_data table missing     → Market Charts empty
-- ============================================================


-- ── FIX 1: Add missing columns to the trades table ───────────────────────────
-- These are all the columns the EA sends that may not exist yet.
-- IF NOT EXISTS means this is safe to run multiple times.

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


-- ── FIX 2: Create sylledge_market_data table ─────────────────────────────────
-- This table stores the OHLCV candle data uploaded by TradeSylla_MarketData.mq5
-- and displayed in Market Charts + used by SYLLEDGE AI for analysis.

CREATE TABLE IF NOT EXISTS sylledge_market_data (
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

  -- Prevent duplicate candles for the same symbol/timeframe/time
  UNIQUE (symbol, timeframe, candle_time)
);

-- RLS: enable it
ALTER TABLE sylledge_market_data ENABLE ROW LEVEL SECURITY;

-- Policy: any authenticated user can READ market data
DROP POLICY IF EXISTS "Authenticated users can read market data" ON sylledge_market_data;
CREATE POLICY "Authenticated users can read market data"
  ON sylledge_market_data
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: service role can do everything (EA uses the service role key)
-- The service role bypasses RLS by default — no extra policy needed.

-- Indexes for fast queries (symbol picker + chart loading)
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_tf_time
  ON sylledge_market_data (symbol, timeframe, candle_time);

CREATE INDEX IF NOT EXISTS idx_market_data_symbol
  ON sylledge_market_data (symbol);


-- ── VERIFY: check what was created ───────────────────────────────────────────
-- After running, you should see:
--   - lot_size and other columns in the trades table
--   - sylledge_market_data table with the correct columns

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trades'
  AND column_name IN ('lot_size','swap','commission','total_pnl','sl','tp','rr','mt5_ticket','account_login','session','timeframe')
ORDER BY column_name;

SELECT table_name
FROM information_schema.tables
WHERE table_name = 'sylledge_market_data';
