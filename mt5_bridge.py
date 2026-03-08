#!/usr/bin/env python3
"""
TradeSylla MT5 Bridge v2.0
Run this on your Windows PC with MetaTrader 5 installed.
Listens on http://localhost:5001

NEW in v2.0:
  - /api/chart     → OHLCV candle data for any symbol/timeframe
  - /api/context   → Full AI context bundle (account + trades + positions + charts)
  - /api/symbols   → All symbols the user has traded
  - Better trade mapping (entry + exit prices, proper pips)

SETUP:
  python -m pip install MetaTrader5 pandas
  python mt5_bridge.py
"""

import json
import threading
import time
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import MetaTrader5 as mt5
    import pandas as pd
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("WARNING: Run: python -m pip install MetaTrader5 pandas")

# ── Global state ──────────────────────────────────────────────────────────────
connected_account = None
last_sync         = None
cached_trades     = []
cached_account    = {}
cached_positions  = []
SYNC_INTERVAL     = 60

# ── Timeframe map (from FBSBot data_feed.py) ─────────────────────────────────
TIMEFRAMES = {
    "M1":  1,   # mt5.TIMEFRAME_M1
    "M5":  5,
    "M15": 15,
    "H1":  16385,
    "H4":  16388,
    "D1":  16408,
}

def get_tf_constant(tf_str):
    """Convert string timeframe to MT5 constant."""
    if not MT5_AVAILABLE:
        return 16385  # H1 default
    mapping = {
        "M1":  mt5.TIMEFRAME_M1,
        "M5":  mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "H1":  mt5.TIMEFRAME_H1,
        "H4":  mt5.TIMEFRAME_H4,
        "D1":  mt5.TIMEFRAME_D1,
        "W1":  mt5.TIMEFRAME_W1,
    }
    return mapping.get(tf_str.upper(), mt5.TIMEFRAME_H1)

# ── Helpers ───────────────────────────────────────────────────────────────────
def outcome_from_profit(profit):
    if profit > 0.001:  return "WIN"
    if profit < -0.001: return "LOSS"
    return "BREAKEVEN"

def get_session(hour):
    if  0 <= hour <  8: return "ASIAN"
    if  8 <= hour < 12: return "LONDON"
    if 12 <= hour < 17: return "NEW_YORK"
    if 12 <= hour < 14: return "LONDON_NY"
    return "SYDNEY"

def calc_pips(symbol, price_diff):
    """Convert price difference to pips for a given symbol."""
    if not MT5_AVAILABLE:
        return 0
    try:
        info   = mt5.symbol_info(symbol)
        digits = info.digits
        point  = info.point
        pip    = point * 10 if digits in (5, 3) else point
        return round(price_diff / pip, 1) if pip > 0 else 0
    except:
        return 0

# ── Chart data (from FBSBot data_feed.py) ─────────────────────────────────────
def get_ohlcv(symbol, timeframe="H1", bars=100):
    """
    Fetch OHLCV candles from MT5.
    Returns a list of dicts: [{time, open, high, low, close, volume}, ...]
    Used by SYLLEDGE AI to analyse chart context around trades.
    """
    if not MT5_AVAILABLE or not connected_account:
        return []
    try:
        tf    = get_tf_constant(timeframe)
        rates = mt5.copy_rates_from_pos(symbol, tf, 0, bars)
        if rates is None or len(rates) == 0:
            return []
        # Convert to plain list of dicts (no pandas dependency for JSON serialisation)
        result = []
        for r in rates:
            dt = datetime.fromtimestamp(r[0], tz=timezone.utc)
            result.append({
                "time":   dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "open":   round(float(r[1]), 5),
                "high":   round(float(r[2]), 5),
                "low":    round(float(r[3]), 5),
                "close":  round(float(r[4]), 5),
                "volume": int(r[5]),
            })
        return result
    except Exception as e:
        print(f"[Chart] Error fetching {symbol} {timeframe}:", e)
        return []

def get_live_price(symbol):
    """Live bid/ask for a symbol."""
    if not MT5_AVAILABLE or not connected_account:
        return {}
    try:
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {}
        return {
            "symbol": symbol,
            "bid":    tick.bid,
            "ask":    tick.ask,
            "spread": round((tick.ask - tick.bid) * 10000, 1),
        }
    except:
        return {}

# ── Trade history ─────────────────────────────────────────────────────────────
def build_trade(close_deal, open_deal=None):
    """
    Build a TradeSylla trade dict from a close deal.
    Uses open_deal for proper entry price and direction.
    """
    try:
        dt = datetime.fromtimestamp(close_deal.time, tz=timezone.utc)

        entry_price = open_deal.price  if open_deal else close_deal.price
        direction   = "SELL" if close_deal.type == mt5.DEAL_TYPE_BUY else "BUY"
        if open_deal:
            direction = "BUY" if open_deal.type == mt5.DEAL_TYPE_BUY else "SELL"

        close_price = close_deal.price
        pnl         = round(float(close_deal.profit + close_deal.swap + close_deal.commission), 2)

        price_diff  = (close_price - entry_price) if direction == "BUY" else (entry_price - close_price)
        pips        = calc_pips(close_deal.symbol, price_diff)

        return {
            "mt5_ticket":  str(close_deal.order),
            "symbol":      close_deal.symbol or "UNKNOWN",
            "direction":   direction,
            "entry_price": round(float(entry_price), 5),
            "exit_price":  round(float(close_price), 5),
            "pnl":         pnl,
            "pips":        pips,
            "volume":      float(close_deal.volume),
            "outcome":     outcome_from_profit(pnl),
            "session":     get_session(dt.hour),
            "timeframe":   "H1",
            "entry_time":  dt.isoformat(),
            "notes":       f"MT5 auto-import | {close_deal.comment or ''}".strip(" |"),
        }
    except Exception as e:
        print("build_trade error:", e)
        return None

def sync_trades():
    """Fetch full trade history, matching close deals with their open deals."""
    global cached_trades, last_sync
    if not MT5_AVAILABLE or not connected_account:
        return cached_trades
    try:
        date_from = datetime(2000, 1, 1, tzinfo=timezone.utc)
        date_to   = datetime.now(tz=timezone.utc) + timedelta(days=1)
        all_deals = mt5.history_deals_get(date_from, date_to)
        if all_deals is None:
            all_deals = []

        # Build position_id → open deal map
        open_deals = {}
        for d in all_deals:
            if d.entry == mt5.DEAL_ENTRY_IN:
                open_deals[d.position_id] = d

        trades = []
        for d in all_deals:
            if d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY):
                open = open_deals.get(d.position_id)
                t = build_trade(d, open)
                if t:
                    trades.append(t)

        cached_trades = trades
        last_sync = datetime.now(tz=timezone.utc).isoformat()
        print(f"[Sync] {len(trades)} closed trades")
        return trades
    except Exception as e:
        print("sync_trades error:", e)
        return cached_trades

def get_positions():
    """All currently open positions."""
    if not MT5_AVAILABLE or not connected_account:
        return []
    try:
        positions = mt5.positions_get() or []
        result = []
        for p in positions:
            result.append({
                "ticket":       p.ticket,
                "symbol":       p.symbol,
                "direction":    "BUY" if p.type == 0 else "SELL",
                "volume":       p.volume,
                "entry_price":  p.price_open,
                "current_price":p.price_current,
                "profit":       round(p.profit, 2),
                "swap":         p.swap,
                "sl":           p.sl,
                "tp":           p.tp,
                "open_time":    datetime.fromtimestamp(p.time, tz=timezone.utc).isoformat(),
            })
        return result
    except Exception as e:
        print("positions error:", e)
        return []

def get_traded_symbols():
    """All unique symbols the user has traded."""
    symbols = list({t["symbol"] for t in cached_trades if t.get("symbol")})
    return sorted(symbols)

# ── AI Context Bundle ─────────────────────────────────────────────────────────
def build_ai_context(symbols=None, timeframe="H1", bars=50):
    """
    Build the full context bundle that SYLLEDGE AI will receive.
    Includes: account info, full trade history, open positions,
    and OHLCV chart data for each symbol the user trades.
    This gives the AI everything it needs for deep analysis.
    """
    traded = symbols or get_traded_symbols()

    # Limit to 5 most-traded symbols to keep context size reasonable
    from collections import Counter
    symbol_counts = Counter(t["symbol"] for t in cached_trades)
    top_symbols   = [s for s, _ in symbol_counts.most_common(5)]
    if not top_symbols:
        top_symbols = traded[:5]

    charts = {}
    prices = {}
    for sym in top_symbols:
        charts[sym] = get_ohlcv(sym, timeframe, bars)
        prices[sym] = get_live_price(sym)

    return {
        "account":    cached_account,
        "trades":     cached_trades,
        "positions":  get_positions(),
        "charts":     charts,       # symbol → [OHLCV candles]
        "prices":     prices,       # symbol → {bid, ask, spread}
        "symbols":    top_symbols,
        "last_sync":  last_sync,
        "generated":  datetime.now(tz=timezone.utc).isoformat(),
    }

# ── Connection ────────────────────────────────────────────────────────────────
def connect_mt5(login, password, server):
    global connected_account, cached_account
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MetaTrader5 not installed. Run: pip install MetaTrader5"}
    try:
        mt5.shutdown()
        ok = mt5.initialize(login=int(login), password=str(password), server=str(server))
        if not ok:
            return {"success": False, "error": "Connection failed: " + str(mt5.last_error())}
        info = mt5.account_info()
        if info is None:
            return {"success": False, "error": "Could not get account info. Check credentials."}
        connected_account = {"login": login, "password": password, "server": server}
        cached_account = {
            "login":        info.login,
            "name":         info.name,
            "server":       info.server,
            "broker":       info.company,
            "balance":      info.balance,
            "equity":       info.equity,
            "profit":       info.profit,
            "currency":     info.currency,
            "leverage":     info.leverage,
            "account_type": "demo" if info.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else "live",
        }
        print(f"[MT5] Connected: {info.name} @ {info.server}")
        sync_trades()
        return {"success": True, "account": cached_account}
    except Exception as e:
        return {"success": False, "error": str(e)}

def do_disconnect():
    global connected_account, cached_account, cached_trades, cached_positions
    if MT5_AVAILABLE:
        mt5.shutdown()
    connected_account = None
    cached_account    = {}
    cached_trades     = []
    cached_positions  = []

def sync_loop():
    while True:
        time.sleep(SYNC_INTERVAL)
        if connected_account:
            sync_trades()

threading.Thread(target=sync_loop, daemon=True).start()

# ── HTTP Server ───────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access logs

    def send_json(self, code, data):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type",                  "application/json")
        self.send_header("Access-Control-Allow-Origin",   "*")
        self.send_header("Access-Control-Allow-Methods",  "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",  "Content-Type")
        self.send_header("Content-Length",                str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        qs     = parse_qs(parsed.query)

        if path == "/api/status":
            self.send_json(200, {
                "running":       True,
                "mt5_available": MT5_AVAILABLE,
                "connected":     connected_account is not None,
                "last_sync":     last_sync,
                "trade_count":   len(cached_trades),
                "account":       cached_account if cached_account else None,
            })

        elif path == "/api/account":
            if not cached_account:
                self.send_json(400, {"error": "Not connected"})
            else:
                self.send_json(200, cached_account)

        elif path == "/api/trades":
            self.send_json(200, {
                "trades":    cached_trades,
                "count":     len(cached_trades),
                "last_sync": last_sync,
            })

        elif path == "/api/sync":
            trades = sync_trades()
            self.send_json(200, {
                "trades":    trades,
                "count":     len(trades),
                "last_sync": last_sync,
            })

        elif path == "/api/positions":
            self.send_json(200, {"positions": get_positions()})

        elif path == "/api/symbols":
            self.send_json(200, {"symbols": get_traded_symbols()})

        # ── NEW: Chart data endpoint ──────────────────────────────────
        elif path == "/api/chart":
            symbol    = qs.get("symbol",    [cached_account.get("default_symbol", "EURUSD")])[0]
            timeframe = qs.get("timeframe", ["H1"])[0]
            bars      = int(qs.get("bars",  ["100"])[0])
            bars      = min(bars, 500)  # cap at 500 candles

            if not connected_account:
                self.send_json(400, {"error": "Not connected"})
            else:
                candles = get_ohlcv(symbol, timeframe, bars)
                price   = get_live_price(symbol)
                self.send_json(200, {
                    "symbol":    symbol,
                    "timeframe": timeframe,
                    "bars":      len(candles),
                    "candles":   candles,
                    "price":     price,
                })

        # ── NEW: Full AI context bundle ───────────────────────────────
        elif path == "/api/context":
            timeframe = qs.get("timeframe", ["H1"])[0]
            bars      = int(qs.get("bars",  ["50"])[0])
            if not connected_account:
                self.send_json(400, {"error": "Not connected"})
            else:
                ctx = build_ai_context(timeframe=timeframe, bars=bars)
                self.send_json(200, ctx)

        elif path == "/api/disconnect":
            do_disconnect()
            self.send_json(200, {"success": True})

        else:
            self.send_json(404, {"error": "Endpoint not found"})

    def do_POST(self):
        path   = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

        if path == "/api/connect":
            login    = str(body.get("login",    "")).strip()
            password = str(body.get("password", "")).strip()
            server   = str(body.get("server",   "")).strip()
            if not login or not password or not server:
                self.send_json(400, {"success": False, "error": "login, password and server are required"})
                return
            result = connect_mt5(login, password, server)
            self.send_json(200, result)
        else:
            self.send_json(404, {"error": "Endpoint not found"})


if __name__ == "__main__":
    PORT = 5001
    print("")
    print("╔══════════════════════════════════════╗")
    print("║   TradeSylla MT5 Bridge v2.0         ║")
    print(f"║   Running on http://localhost:{PORT}   ║")
    print("╚══════════════════════════════════════╝")
    print("")
    print("Endpoints:")
    print("  GET  /api/status            → Connection status")
    print("  GET  /api/trades            → Full trade history")
    print("  GET  /api/positions         → Open positions")
    print("  GET  /api/symbols           → All traded symbols")
    print("  GET  /api/chart?symbol=EURUSD&timeframe=H1&bars=100  → OHLCV candles")
    print("  GET  /api/context           → Full AI context bundle (trades + charts)")
    print("  POST /api/connect           → Connect with {login, password, server}")
    print("  GET  /api/disconnect        → Disconnect")
    print("")
    if not MT5_AVAILABLE:
        print("⚠️  MetaTrader5 not installed! Run: pip install MetaTrader5 pandas")
    else:
        print("✅ MetaTrader5 package: OK")
        print(f"✅ Auto-sync interval: {SYNC_INTERVAL}s")
    print("")
    server = HTTPServer(("localhost", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBridge stopped.")
        if MT5_AVAILABLE:
            mt5.shutdown()
