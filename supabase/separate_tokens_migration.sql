-- ================================================================
-- MIGRATION: Separate EA tokens + admin check fix
-- Run this in Supabase SQL Editor
-- ================================================================

-- 1. Add separate token columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_token  text UNIQUE,
  ADD COLUMN IF NOT EXISTS admin_token text UNIQUE;

-- 2. Copy existing ea_token into user_token for existing users
UPDATE profiles
SET user_token = ea_token
WHERE ea_token IS NOT NULL AND user_token IS NULL;

-- 3. Add is_admin column if not already there
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- 4. Make YOU admin (replace with your actual user ID from Supabase Auth)
-- Go to Supabase → Authentication → Users → copy your UUID → paste below
-- UPDATE profiles SET is_admin = true WHERE id = 'YOUR-USER-ID-HERE';

-- 5. Alternatively: make admin by email (safer)
UPDATE profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'khalifadylla@gmail.com' LIMIT 1
);

-- 6. Verify
SELECT id, email, is_admin, user_token IS NOT NULL as has_user_token, admin_token IS NOT NULL as has_admin_token
FROM profiles
JOIN auth.users ON profiles.id = auth.users.id;
