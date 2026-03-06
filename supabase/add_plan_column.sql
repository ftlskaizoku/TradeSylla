-- Add plan tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free' 
  CHECK (plan IN ('free','pro','elite'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_sub_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

-- Also add SUPABASE_SERVICE_ROLE_KEY to Vercel env vars (not anon key)
-- Vercel → Settings → Environment Variables → add SUPABASE_SERVICE_ROLE_KEY

-- Add EA token column to profiles (for MT5 EA authentication)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ea_token text UNIQUE;

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_profiles_ea_token ON profiles(ea_token);
