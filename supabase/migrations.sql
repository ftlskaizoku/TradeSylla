-- ============================================================
-- 1. SAFE REALTIME ENABLE  (run each table separately)
-- Each ALTER runs independently — if one fails, others still work
-- ============================================================

-- trades is already in — skip it (or the error means it's fine)
-- Run these one by one in Supabase SQL Editor:

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE trades;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE playbooks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE backtest_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE broker_connections;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_insights;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_memory;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verify
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================================
-- 2. SYLLEDGE COMMANDS TABLE
-- SYLLEDGE writes commands here → EA polls and responds
-- ============================================================

CREATE TABLE IF NOT EXISTS sylledge_commands (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL,        -- fetch_candles | fetch_symbols | overview
  symbol       text,
  timeframe    text,
  "from"       timestamptz,
  "to"         timestamptz,
  "limit"      int DEFAULT 500,
  status       text DEFAULT 'pending', -- pending | processing | done | error
  response     jsonb,                -- EA fills this in
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE sylledge_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own commands"
  ON sylledge_commands FOR ALL
  USING (auth.uid() = user_id);

-- Enable realtime on commands too
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_commands;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. ADD entry_time / exit_time columns to trades if missing
-- ============================================================

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS entry_time timestamptz,
  ADD COLUMN IF NOT EXISTS exit_time  timestamptz;
