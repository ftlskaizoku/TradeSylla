#!/usr/bin/env python3
"""
TradeSylla MT5 Bridge v1.0
Run this on your Windows PC with MetaTrader 5 installed.
Listens on http://localhost:5001

SETUP:
  python -m pip install MetaTrader5
  python mt5_bridge.py
"""

import json
import threading
import time
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("WARNING: MetaTrader5 not installed. Run: python -m pip install MetaTrader5")

# Global state
connected_account = None
last_sync = None
cached_trades = []
cached_account = {}
SYNC_INTERVAL = 60

def outcome_from_profit(profit):
    if profit > 0:
        return "WIN"
    if profit < 0:
        return "LOSS"
    return "BREAKEVEN"

def get_session(hour):
    if 7 <= hour < 16:
        return "LONDON"
    if 13 <= hour < 22:
        return "NEW_YORK"
    if 0 <= hour < 9:
        return "ASIAN"
    return "SYDNEY"

def deal_to_trade(deal):
    try:
        dt = datetime.fromtimestamp(deal.time, tz=timezone.utc)
        return {
            "mt5_ticket":  str(deal.order),
            "symbol":      deal.symbol or "UNKNOWN",
            "direction":   "BUY" if deal.type == mt5.DEAL_TYPE_BUY else "SELL",
            "entry_price": round(float(deal.price), 5),
            "exit_price":  round(float(deal.price), 5),
            "pnl":         round(float(deal.profit), 2),
            "pips":        0,
            "volume":      float(deal.volume),
            "outcome":     outcome_from_profit(deal.profit),
            "session":     get_session(dt.hour),
            "timeframe":   "H1",
            "entry_time":  dt.isoformat(),
            "notes":       "MT5 auto-import",
        }
    except Exception as e:
        print("deal_to_trade error:", e)
        return None

def connect_mt5(login, password, server):
    global connected_account, cached_account
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MetaTrader5 package not installed."}
    try:
        mt5.shutdown()
        ok = mt5.initialize(login=int(login), password=str(password), server=str(server))
        if not ok:
            err = mt5.last_error()
            return {"success": False, "error": "Connection failed: " + str(err)}
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
        print("Connected:", info.name, "@", info.server)
        sync_trades()
        return {"success": True, "account": cached_account}
    except Exception as e:
        return {"success": False, "error": str(e)}

def sync_trades():
    global cached_trades, last_sync
    if not MT5_AVAILABLE or not connected_account:
        return cached_trades
    try:
        date_from = datetime(2000, 1, 1, tzinfo=timezone.utc)
        date_to = datetime.now(tz=timezone.utc) + timedelta(days=1)
        deals = mt5.history_deals_get(date_from, date_to)
        if deals is None:
            deals = []
        trades = []
        for d in deals:
            if hasattr(d, "entry") and d.entry == mt5.DEAL_ENTRY_OUT:
                t = deal_to_trade(d)
                if t:
                    trades.append(t)
        cached_trades = trades
        last_sync = datetime.now(tz=timezone.utc).isoformat()
        print("Synced", len(trades), "trades")
        return trades
    except Exception as e:
        print("Sync error:", e)
        return cached_trades

def get_positions():
    if not MT5_AVAILABLE or not connected_account:
        return []
    try:
        positions = mt5.positions_get() or []
        result = []
        for p in positions:
            result.append({
                "ticket":  p.ticket,
                "symbol":  p.symbol,
                "type":    "BUY" if p.type == 0 else "SELL",
                "volume":  p.volume,
                "price":   p.price_open,
                "current": p.price_current,
                "profit":  round(p.profit, 2),
                "swap":    p.swap,
                "time":    datetime.fromtimestamp(p.time, tz=timezone.utc).isoformat(),
            })
        return result
    except Exception as e:
        print("Positions error:", e)
        return []

def do_disconnect():
    global connected_account, cached_account, cached_trades
    if MT5_AVAILABLE:
        mt5.shutdown()
    connected_account = None
    cached_account = {}
    cached_trades = []

def sync_loop():
    while True:
        time.sleep(SYNC_INTERVAL)
        if connected_account:
            sync_trades()

threading.Thread(target=sync_loop, daemon=True).start()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_json(self, code, data):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
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
        elif path == "/api/disconnect":
            do_disconnect()
            self.send_json(200, {"success": True})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        if path == "/api/connect":
            login    = str(body.get("login", "")).strip()
            password = str(body.get("password", "")).strip()
            server   = str(body.get("server", "")).strip()
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
    print("TradeSylla MT5 Bridge v1.0")
    print("Running on http://localhost:" + str(PORT))
    print("Keep this window open while TradeSylla is open.")
    print("")
    if not MT5_AVAILABLE:
        print("MetaTrader5 not installed! Run: python -m pip install MetaTrader5")
    else:
        print("MetaTrader5 package: OK")
        print("Auto-sync interval:", SYNC_INTERVAL, "seconds")
    print("")
    server = HTTPServer(("localhost", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Bridge stopped.")
        if MT5_AVAILABLE:
            mt5.shutdown()
