-- ═══════════════════════════════════════════════════════════════
-- Enable real-time sync on all TradeSylla tables
-- Run in: Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- Enable real-time replication for all tables
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table playbooks;
alter publication supabase_realtime add table backtest_sessions;
alter publication supabase_realtime add table broker_connections;
alter publication supabase_realtime add table sylledge_insights;
