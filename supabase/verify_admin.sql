-- ================================================================
-- Fixed verify query — run this in Supabase SQL Editor
-- (the previous one had an ambiguous "id" column reference)
-- ================================================================

SELECT 
  profiles.id,
  auth.users.email,
  profiles.is_admin,
  profiles.user_token  IS NOT NULL AS has_user_token,
  profiles.admin_token IS NOT NULL AS has_admin_token
FROM profiles
JOIN auth.users ON profiles.id = auth.users.id;
