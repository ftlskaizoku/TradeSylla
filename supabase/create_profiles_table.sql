-- ── Step 1: Create profiles table ───────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  ea_token   text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Step 2: Enable RLS ────────────────────────────────────────────────
alter table profiles enable row level security;

drop policy if exists "Users can manage own profile" on profiles;
create policy "Users can manage own profile"
  on profiles for all using (auth.uid() = id);

-- ── Step 3: Create a profile row for every user that already exists ──
-- (without this, existing users like you would have no profile row)
insert into profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ── Step 4: Auto-create profile for every NEW user going forward ─────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Step 5: Index for fast token lookups ─────────────────────────────
create index if not exists idx_profiles_ea_token on profiles(ea_token);
