-- Migration: Add account details to broker_connections + link trades to accounts

-- 1. Add missing columns to broker_connections
alter table broker_connections
  add column if not exists balance    numeric(15,2) default 0,
  add column if not exists equity     numeric(15,2) default 0,
  add column if not exists currency   text          default 'USD',
  add column if not exists leverage   integer       default 0,
  add column if not exists is_demo    boolean       default false,
  add column if not exists mt5_login  text          default '';

-- 2. Add account_login to trades so we can filter by account
alter table trades
  add column if not exists account_login text default null;

-- 3. Index for fast filtering
create index if not exists idx_trades_account_login on trades(user_id, account_login);
create index if not exists idx_brokers_mt5_login    on broker_connections(user_id, mt5_login);

-- Add commission and swap columns to trades
alter table trades
  add column if not exists commission  numeric default 0,
  add column if not exists swap        numeric default 0,
  add column if not exists gross_pnl   numeric default 0;

-- Update existing trades: gross_pnl = pnl (before we had separate commission)
update trades set gross_pnl = pnl where gross_pnl = 0;
