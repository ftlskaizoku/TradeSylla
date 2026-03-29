-- Add both admins
UPDATE profiles SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('khalifadylla@gmail.com', 'zoumxyz@gmail.com')
);

-- Verify
SELECT auth.users.email, profiles.is_admin
FROM profiles
JOIN auth.users ON profiles.id = auth.users.id
WHERE auth.users.email IN ('khalifadylla@gmail.com', 'zoumxyz@gmail.com');
