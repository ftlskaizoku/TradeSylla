-- ═══════════════════════════════════════════════════════════════
-- TradeSylla — Admin & Analytics Schema
-- Run this in Supabase → SQL Editor AFTER schema.sql
-- ═══════════════════════════════════════════════════════════════

-- ── PROFILES (auto-created on signup via trigger) ─────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz default now(),
  last_seen   timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
-- Allow insert from trigger (uses security definer)
create policy "Service can insert profiles"
  on profiles for insert with check (true);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Update last_seen on login
create or replace function handle_user_login()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles set last_seen = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute procedure handle_user_login();

-- ── PAGE VIEWS (visit tracking) ───────────────────────────────────────────────
create table if not exists page_views (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  page        text not null,
  referrer    text,
  created_at  timestamptz default now()
);

alter table page_views enable row level security;
-- Anyone authenticated can insert a page view
create policy "Authenticated users can track views"
  on page_views for insert with check (auth.uid() is not null);
-- Only the owner can read all views (checked by email in app)
create policy "Users can read own views"
  on page_views for select using (auth.uid() = user_id);

-- ── ADMIN RPC FUNCTIONS ───────────────────────────────────────────────────────
-- Returns global stats (used by admin dashboard)
create or replace function get_admin_stats()
returns json language plpgsql security definer as $$
declare
  result json;
begin
  select json_build_object(
    'total_users',      (select count(*) from profiles),
    'new_users_24h',    (select count(*) from profiles where created_at > now() - interval '24 hours'),
    'new_users_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'new_users_30d',    (select count(*) from profiles where created_at > now() - interval '30 days'),
    'active_24h',       (select count(*) from profiles where last_seen > now() - interval '24 hours'),
    'active_7d',        (select count(*) from profiles where last_seen > now() - interval '7 days'),
    'total_trades',     (select count(*) from trades),
    'new_trades_7d',    (select count(*) from trades where created_at > now() - interval '7 days'),
    'new_trades_24h',   (select count(*) from trades where created_at > now() - interval '24 hours'),
    'total_playbooks',  (select count(*) from playbooks),
    'total_backtests',  (select count(*) from backtest_sessions),
    'total_views',      (select count(*) from page_views),
    'views_24h',        (select count(*) from page_views where created_at > now() - interval '24 hours'),
    'views_7d',         (select count(*) from page_views where created_at > now() - interval '7 days')
  ) into result;
  return result;
end;
$$;

-- Signups per day (last 30 days)
create or replace function get_signups_per_day()
returns json language plpgsql security definer as $$
begin
  return (
    select json_agg(row_to_json(t)) from (
      select
        to_char(date_trunc('day', created_at), 'MM/DD') as date,
        count(*) as signups
      from profiles
      where created_at > now() - interval '30 days'
      group by date_trunc('day', created_at)
      order by date_trunc('day', created_at)
    ) t
  );
end;
$$;

-- Page views per day (last 30 days)
create or replace function get_views_per_day()
returns json language plpgsql security definer as $$
begin
  return (
    select json_agg(row_to_json(t)) from (
      select
        to_char(date_trunc('day', created_at), 'MM/DD') as date,
        count(*) as views,
        count(distinct user_id) as unique_users
      from page_views
      where created_at > now() - interval '30 days'
      group by date_trunc('day', created_at)
      order by date_trunc('day', created_at)
    ) t
  );
end;
$$;

-- Top pages
create or replace function get_top_pages()
returns json language plpgsql security definer as $$
begin
  return (
    select json_agg(row_to_json(t)) from (
      select page, count(*) as views
      from page_views
      where created_at > now() - interval '30 days'
      group by page
      order by views desc
      limit 10
    ) t
  );
end;
$$;

-- Trades per day (last 30 days)
create or replace function get_trades_per_day()
returns json language plpgsql security definer as $$
begin
  return (
    select json_agg(row_to_json(t)) from (
      select
        to_char(date_trunc('day', created_at), 'MM/DD') as date,
        count(*) as trades
      from trades
      where created_at > now() - interval '30 days'
      group by date_trunc('day', created_at)
      order by date_trunc('day', created_at)
    ) t
  );
end;
$$;
