-- ============================================================
-- TradeSylla — DEFINITIVE EA SYNC MIGRATION
-- Adds every column the EA sends, so inserts never fail again.
-- Safe to run multiple times (IF NOT EXISTS on everything).
--
-- Supabase → SQL Editor → New Query → paste all → Run
-- ============================================================

-- ── 1. All EA trade columns ───────────────────────────────────────────────────
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mt5_ticket        text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_login     text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS lot_size          numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS swap              numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS commission        numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS total_pnl         numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS gross_pnl         numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sl                numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tp                numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rr                numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sl_pips           numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tp_pips           numeric  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS duration_min      integer  DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_time         timestamptz;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_withdrawal     boolean  DEFAULT false;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS withdrawal_amount numeric  DEFAULT 0;

-- ── 2. Indexes for fast dedup lookups ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_mt5_ticket
  ON trades (user_id, mt5_ticket);

CREATE INDEX IF NOT EXISTS idx_trades_account_login
  ON trades (user_id, account_login);

-- ── 3. Verify — you should see all columns listed ─────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'trades'
  AND column_name IN (
    'mt5_ticket','account_login','lot_size','swap','commission',
    'total_pnl','gross_pnl','sl','tp','rr','duration_min',
    'exit_time','is_withdrawal','withdrawal_amount'
  )
ORDER BY column_name;
