-- Enable Supabase Realtime on ALL TradeSylla tables
-- Safe to run multiple times — ADD TABLE is idempotent if already added

ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE playbooks;
ALTER PUBLICATION supabase_realtime ADD TABLE backtest_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE broker_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_insights;
ALTER PUBLICATION supabase_realtime ADD TABLE sylledge_memory;

-- Verify which tables are enabled
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
