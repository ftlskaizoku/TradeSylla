-- ═══════════════════════════════════════════════════════════════
-- TradeSylla — SYLLEDGE Market Data + Memory Migration
-- Run in Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. SYLLEDGE Market Data table (admin-only candle store)
CREATE TABLE IF NOT EXISTS sylledge_market_data (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol      text NOT NULL,
  timeframe   text NOT NULL,
  candles     jsonb DEFAULT '[]',
  bid         numeric,
  ask         numeric,
  spread      numeric,
  ea_version  text DEFAULT '1.0',
  updated_at  timestamptz DEFAULT now()
);

-- Unique per symbol+timeframe (upsert target)
ALTER TABLE sylledge_market_data
  DROP CONSTRAINT IF EXISTS sylledge_market_data_symbol_tf_unique;
ALTER TABLE sylledge_market_data
  ADD CONSTRAINT sylledge_market_data_symbol_tf_unique
  UNIQUE (symbol, timeframe);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON sylledge_market_data(symbol, timeframe);

-- RLS: readable by all authenticated users, writable only via service role
ALTER TABLE sylledge_market_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read market data" ON sylledge_market_data;
CREATE POLICY "Authenticated users can read market data"
  ON sylledge_market_data FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. SYLLEDGE Memory table (if not already created)
CREATE TABLE IF NOT EXISTS sylledge_memory (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key        text NOT NULL,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sylledge_memory_user_key
  ON sylledge_memory(user_id, key);

ALTER TABLE sylledge_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User owns memory" ON sylledge_memory;
CREATE POLICY "User owns memory" ON sylledge_memory
  FOR ALL USING (auth.uid() = user_id);

-- 3. Add withdrawal tracking to trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_withdrawal boolean DEFAULT false;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS withdrawal_amount numeric DEFAULT 0;

-- 4. Add insight type column for SYLLEDGE insights (if missing)
ALTER TABLE sylledge_insights ADD COLUMN IF NOT EXISTS type text DEFAULT 'general';

-- 5. Enable realtime on market data for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_market_data;
