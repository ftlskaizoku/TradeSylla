-- ================================================================
-- TradeSylla Complete Migration
-- Run this ENTIRE script at once in Supabase SQL Editor
-- Copy all lines, paste, hit Run
-- ================================================================

-- STEP 1: Add columns to profiles (safe - IF NOT EXISTS)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_token  text,
  ADD COLUMN IF NOT EXISTS admin_token text,
  ADD COLUMN IF NOT EXISTS is_admin    boolean DEFAULT false;

-- STEP 2: Add entry/exit time columns to trades if missing
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS entry_time timestamptz,
  ADD COLUMN IF NOT EXISTS exit_time  timestamptz;

-- STEP 3: Set is_admin = true for your account
UPDATE profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'khalifadylla@gmail.com'
  LIMIT 1
);

-- STEP 4: Create sylledge_commands table if missing
CREATE TABLE IF NOT EXISTS sylledge_commands (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL,
  symbol       text,
  timeframe    text,
  "from"       timestamptz,
  "to"         timestamptz,
  "limit"      int DEFAULT 500,
  status       text DEFAULT 'pending',
  response     jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- STEP 5: Enable RLS on sylledge_commands
ALTER TABLE sylledge_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own commands" ON sylledge_commands;
CREATE POLICY "Users manage own commands"
  ON sylledge_commands FOR ALL
  USING (auth.uid() = user_id);

-- STEP 6: Safe realtime enable (no duplicate errors)
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
  ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_commands;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- STEP 7: Verify everything worked
SELECT
  profiles.id,
  auth.users.email,
  profiles.is_admin,
  profiles.user_token  IS NOT NULL AS has_user_token,
  profiles.admin_token IS NOT NULL AS has_admin_token
FROM profiles
JOIN auth.users ON profiles.id = auth.users.id;
