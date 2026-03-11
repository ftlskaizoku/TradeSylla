-- Add AI memory table for SYLLEDGE persistent context
create table if not exists sylledge_memory (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  key        text not null,           -- e.g. 'chat_history', 'ai_profile'
  value      jsonb not null default '{}',
  updated_at timestamptz default now()
);
create unique index if not exists idx_sylledge_memory_user_key on sylledge_memory(user_id, key);
alter table sylledge_memory enable row level security;
create policy "User owns memory" on sylledge_memory for all using (auth.uid() = user_id);

-- Add ea_token to profiles if missing
alter table profiles add column if not exists ea_token text;

-- Add exit_time and new columns to trades if not already done
alter table trades add column if not exists exit_time   timestamptz default null;
alter table trades add column if not exists sl          numeric     default 0;
alter table trades add column if not exists tp          numeric     default 0;
alter table trades add column if not exists sl_pips     numeric     default 0;
alter table trades add column if not exists tp_pips     numeric     default 0;
alter table trades add column if not exists rr          numeric     default 0;
alter table trades add column if not exists commission  numeric     default 0;
alter table trades add column if not exists swap        numeric     default 0;
alter table trades add column if not exists gross_pnl   numeric     default 0;
alter table trades add column if not exists duration_min integer    default 0;
alter table trades add column if not exists account_login text      default null;
