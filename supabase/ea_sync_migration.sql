-- ═══════════════════════════════════════════════════════════════════
-- TradeSylla — EA Sync Migration (FIXED)
-- Run this in Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Profiles table ────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  ea_token   text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add ea_token column if profiles already existed without it
alter table profiles add column if not exists ea_token text unique;

-- RLS
alter table profiles enable row level security;

-- Drop first (avoids "already exists" error), then create
drop policy if exists "Users can manage own profile" on profiles;
create policy "Users can manage own profile"
  on profiles for all using (auth.uid() = id);

-- ── 2. Add balance/equity/currency to broker_connections ─────────────────────
alter table broker_connections add column if not exists balance  numeric default 0;
alter table broker_connections add column if not exists equity   numeric default 0;
alter table broker_connections add column if not exists currency text    default 'USD';

-- ── 3. trade_charts table ────────────────────────────────────────────────────
create table if not exists trade_charts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  trade_id   uuid references trades(id)     on delete cascade,
  symbol     text not null,
  timeframe  text default 'H1',
  candles    jsonb default '[]',
  created_at timestamptz default now()
);

alter table trade_charts enable row level security;

drop policy if exists "Users can manage own trade_charts" on trade_charts;
create policy "Users can manage own trade_charts"
  on trade_charts for all using (auth.uid() = user_id);

-- Indexes
create index if not exists idx_trade_charts_user_id  on trade_charts(user_id);
create index if not exists idx_trade_charts_trade_id on trade_charts(trade_id);
create index if not exists idx_trade_charts_symbol   on trade_charts(symbol, timeframe);
create index if not exists idx_profiles_ea_token     on profiles(ea_token);

-- ── 4. Auto-create profile on user signup ────────────────────────────────────
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