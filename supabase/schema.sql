-- ═══════════════════════════════════════════════════════════════
-- TradeSylla — Supabase Schema
-- Run this entire file in: Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- ── TRADES ────────────────────────────────────────────────────────────────────
create table if not exists trades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  symbol          text not null default 'UNKNOWN',
  direction       text not null default 'BUY' check (direction in ('BUY','SELL')),
  entry_price     numeric default 0,
  exit_price      numeric default 0,
  pnl             numeric default 0,
  pips            numeric default 0,
  outcome         text default 'BREAKEVEN' check (outcome in ('WIN','LOSS','BREAKEVEN')),
  session         text default 'LONDON',
  timeframe       text default 'H1',
  quality         integer default 5 check (quality between 1 and 10),
  entry_time      timestamptz default now(),
  notes           text default '',
  chart_url       text default '',
  playbook_id     uuid,
  screenshots     jsonb default '[]',
  mt5_ticket      text,
  volume          numeric default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── PLAYBOOKS ─────────────────────────────────────────────────────────────────
create table if not exists playbooks (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  name            text not null,
  category        text default 'Price Action',
  status          text default 'active' check (status in ('active','inactive','testing')),
  description     text default '',
  sessions        jsonb default '[]',
  timeframes      jsonb default '[]',
  pairs           jsonb default '[]',
  custom_pairs    text default '',
  entry_rules     jsonb default '[]',
  exit_rules      jsonb default '[]',
  risk_rules      jsonb default '[]',
  buy_rules       jsonb default '[]',
  sell_rules      jsonb default '[]',
  buy_images      jsonb default '[]',
  sell_images     jsonb default '[]',
  notes           text default '',
  win_rate        numeric,
  profit_factor   numeric,
  avg_rr          numeric,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── BACKTEST SESSIONS ─────────────────────────────────────────────────────────
create table if not exists backtest_sessions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  name            text not null,
  symbol          text default 'EURUSD',
  timeframe       text default 'H1',
  session         text default 'LONDON',
  date_from       date,
  date_to         date,
  initial_balance numeric default 10000,
  description     text default '',
  trades          jsonb default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── BROKER CONNECTIONS ────────────────────────────────────────────────────────
create table if not exists broker_connections (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  broker_name     text not null,
  broker_color    text default '#6c63ff',
  account_number  text default '',
  account_name    text default '',
  server          text default '',
  type            text default 'demo' check (type in ('live','demo')),
  status          text default 'connected',
  is_mt5_live     boolean default false,
  last_sync       timestamptz,
  notes           text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── SYLLEDGE INSIGHTS ─────────────────────────────────────────────────────────
create table if not exists sylledge_insights (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  title           text not null,
  content         text not null,
  category        text default 'General',
  tags            jsonb default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── ROW LEVEL SECURITY (users only see their own data) ────────────────────────
alter table trades             enable row level security;
alter table playbooks          enable row level security;
alter table backtest_sessions  enable row level security;
alter table broker_connections enable row level security;
alter table sylledge_insights  enable row level security;

-- Trades RLS
create policy "Users can manage own trades"
  on trades for all using (auth.uid() = user_id);

-- Playbooks RLS
create policy "Users can manage own playbooks"
  on playbooks for all using (auth.uid() = user_id);

-- Backtest sessions RLS
create policy "Users can manage own backtest_sessions"
  on backtest_sessions for all using (auth.uid() = user_id);

-- Broker connections RLS
create policy "Users can manage own broker_connections"
  on broker_connections for all using (auth.uid() = user_id);

-- Sylledge insights RLS
create policy "Users can manage own sylledge_insights"
  on sylledge_insights for all using (auth.uid() = user_id);

-- ── INDEXES (faster queries) ──────────────────────────────────────────────────
create index if not exists idx_trades_user_id      on trades(user_id);
create index if not exists idx_trades_entry_time   on trades(entry_time desc);
create index if not exists idx_playbooks_user_id   on playbooks(user_id);
create index if not exists idx_backtests_user_id   on backtest_sessions(user_id);
create index if not exists idx_brokers_user_id     on broker_connections(user_id);
create index if not exists idx_insights_user_id    on sylledge_insights(user_id);

-- ── ADMIN VIEW (for your analytics dashboard) ─────────────────────────────────
-- This view is only accessible with the service_role key, never the anon key
create or replace view admin_stats as
select
  (select count(*) from auth.users)                    as total_users,
  (select count(*) from trades)                        as total_trades,
  (select count(*) from playbooks)                     as total_playbooks,
  (select count(*) from auth.users
   where created_at > now() - interval '7 days')       as new_users_7d,
  (select count(*) from trades
   where created_at > now() - interval '7 days')       as new_trades_7d,
  (select count(*) from auth.users
   where last_sign_in_at > now() - interval '24 hours') as active_users_24h;
