# TradeSylla — Final Fix Batch

## Files to deploy

| File | Path in project | Fix |
|------|----------------|-----|
| `supabaseStore.js` | `src/api/supabaseStore.js` | Fixes ReferenceError in list() — was making ALL queries return [] |
| `supabase.js` | `src/lib/supabase.js` | Removes storageKey conflict — fixes refresh → auth page |
| `TradeSylla_MarketData.mq5` | `public/ea/TradeSylla_MarketData.mq5` | Progressive sync — fixes abnormal termination after 1 symbol |

---

## Issue 1 — Trades in DB but dashboard shows 0

**Root cause:** `supabaseStore.js` had a scoping bug in the `list()` function:

```js
while (true) {
  const { data: page, error } = await q.range(...)  // error scoped HERE
  ...
}
const data = allData
if (error) { ... return [] }  // ← ReferenceError: error is not defined
```

`const { error }` inside the loop block is not accessible outside it.
This threw `ReferenceError` on every list() call → caught by catch(e) → returned `[]`
→ Journal, Dashboard, Analytics all showed empty even though trades exist in Supabase.

**Fix:** renamed to `pageError` inside the loop. Removed the dead `if (error)` after the loop.

---

## Issue 2 — Refresh sends to auth page

**Root cause:** Two `supabase.js` files existed with different storage keys:
- `src/lib/supabase.js`: `storageKey: "tradesylla_auth"`
- Other version: default Supabase key (`sb-[ref]-auth-token`)

Sign-in stored the JWT under one key; the app on refresh read from the other key — session not found → user = null → Navigate to /auth.

**Fix:** Removed `storageKey` override so both clients use Supabase's default key.

**Also required — Supabase dashboard settings:**
1. Go to: Supabase → Authentication → Settings
2. Set **JWT Expiry** to `604800` (7 days)
3. Set **Refresh Token Reuse Interval** to `10`
4. Make sure **Enable refresh token rotation** is ON

---

## Issue 3 — MarketData only synced 1 symbol (BTCJPY)

**Root cause:** `SyncAllHistory()` was called synchronously in `OnInit()`.
308 symbols × 6 TFs × multiple HTTP calls = MT5 terminates the EA
after `OnInit()` runs too long → "Abnormal termination" printed in Experts tab.

**Fix (v3.0):** `OnInit()` now returns immediately. A 1-second timer calls
`ProgressiveSyncStep()` which processes exactly ONE timeframe per tick:
- Tick 1: EURUSD M1 history
- Tick 2: EURUSD M5 history
- ...
- Tick 6: EURUSD D1 history
- Tick 7: GBPUSD M1 history
- ... and so on for all 308 symbols

You'll see progress in the Experts tab: `"History sync progress: 50/308 (16%)"`
Full sync takes ~30 minutes (308 × 6 ticks, 1 second each + HTTP time).

**Do NOT remove the EA while syncing.** Once done it prints:
`"=== History sync COMPLETE: all 308 symbols × 6 TFs ==="`

After that, live candle updates run every 60 seconds automatically.

---

## After deploying

1. Deploy all 3 files
2. Update Supabase JWT settings (above)
3. In Supabase SQL Editor, verify trades exist:
   ```sql
   SELECT count(*), user_id FROM trades GROUP BY user_id;
   ```
   You should see your trade count > 0
4. Log out of TradeSylla and log back in (clears old session key)
5. Your Journal/Dashboard should now show all trades
6. Recompile and re-attach TradeSylla_MarketData.mq5 in MT5
