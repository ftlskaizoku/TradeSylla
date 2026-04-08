# TradeSylla — Batch 2 Deployment Guide

## Root Cause: EA Connects but Sends No Data

### The 3-way token fragmentation bug

Your app had 3 token columns in `profiles`: `user_token`, `admin_token`, `ea_token`.
Depending on which page you generated your token from, it was saved to a different column:
- Old BrokerSync page → saved to `ea_token`
- New BrokerSync page → saved to `user_token`  
- Settings → API Keys → saved to `user_token` + `admin_token`

But `api/ea-sync.js` only checked `user_token` — so anyone who had generated
their token from the old BrokerSync had it in `ea_token` → 401 auth failure every time.

Additionally, `api/mt5-sync.js` reads `body.token` (from JSON body) but the EA
sends the token in the `Authorization: Bearer` header. These two never matched.

### The fixes

**`api/ea-sync.js` v5.0:**
- Reads token from `Authorization: Bearer` header (correct — matches EA)
- Tries all 3 columns: `user_token` → `ea_token` → `admin_token`
- Works for every user regardless of which page they generated from

**`api/sylledge-market.js` v3.0:**
- Same multi-column fix: `admin_token` → `user_token` → `ea_token`

**`src/pages/BrokerSync.jsx`:**
- Token generation now saves to BOTH `user_token` AND `ea_token`
- Guarantees any version of ea-sync.js can find it

**`src/pages/Settings.jsx` → API Keys:**
- Shows both tokens clearly with which EA + which field each belongs to

---

## Files to Replace

| File | Priority |
|------|----------|
| `api/ea-sync.js` | 🔴 CRITICAL |
| `api/sylledge-market.js` | 🔴 CRITICAL |
| `src/pages/BrokerSync.jsx` | 🟡 Important |
| `src/pages/Sylledge.jsx` | 🟢 Visual upgrade |
| `src/pages/Backtesting.jsx` | 🟢 Visual upgrade |
| `src/pages/Settings.jsx` | 🟢 Visual upgrade |

---

## After Deploying

1. **Go to Settings → API Keys** in TradeSylla
2. Click **Regenerate** on both tokens (this saves to both `user_token` AND `ea_token`)
3. Copy the **Sync EA Token** → paste into `UserToken` in `TradeSylla_Sync.mq5` inputs
4. Copy the **Market Data EA Token** → paste into `AdminToken` in `TradeSylla_MarketData.mq5`
5. In MT5: remove the EA from the chart, re-attach it, confirm smiley face appears
6. Check the MT5 Experts tab — you should see HTTP 200 responses within 30 seconds

---

## MT5 WebRequest Whitelist (required once)
Tools → Options → Expert Advisors → Allow WebRequest → add:
```
https://tradesylla.vercel.app
```

---

## Supabase — Run if columns are missing
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS user_token  text UNIQUE,
  ADD COLUMN IF NOT EXISTS admin_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS ea_token    text UNIQUE;
```
