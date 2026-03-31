//+------------------------------------------------------------------+
//| TradeSylla_Sync.mq5   v4.4                                       |
//| ROOT FIX: ServerURL now defaults to the stable production URL    |
//| + auto-fallback to deployment URL if production fails            |
//| + detailed Experts tab logging for every failure                 |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "4.40"

input string UserToken       = "";
input string ServerURL       = "https://tradesylla.vercel.app";
input string FallbackURL     = "";   // paste your current Vercel deploy URL here as backup
input bool   ForceResync     = false;
input int    SyncInterval    = 5;

datetime g_lastSync   = 0;
string   g_syncedFile = "ts_synced_v44.txt";
string   g_activeURL  = "";

//+------------------------------------------------------------------+
int OnInit() {
   Print("========================================");
   Print("TradeSylla Sync v4.4 starting...");
   Print("Primary URL:  ", ServerURL);
   Print("Fallback URL: ", FallbackURL != "" ? FallbackURL : "(none set)");
   Print("Token length: ", StringLen(UserToken), " chars");
   Print("Account:      ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("Connected:    ", TerminalInfoInteger(TERMINAL_CONNECTED) ? "YES" : "NO");
   Print("========================================");

   if(UserToken == "") {
      Print("FATAL: UserToken is empty.");
      Print("  → Go to TradeSylla Settings → API Keys");
      Print("  → Generate your Sync EA Token");
      Print("  → Paste it into UserToken input of this EA");
      Alert("TradeSylla: Set UserToken first. See Experts tab.");
      return INIT_FAILED;
   }

   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) {
      Print("WARNING: Terminal not connected to broker. Sync will retry on timer.");
   }

   // Find a working URL
   g_activeURL = FindWorkingURL();
   if(g_activeURL == "") {
      Print("FATAL: Cannot reach TradeSylla server.");
      Print("  → In MT5: Tools → Options → Expert Advisors → Allow WebRequest");
      Print("  → Make sure BOTH these URLs are whitelisted:");
      Print("    ", ServerURL);
      if(FallbackURL != "") Print("    ", FallbackURL);
      Print("  → After whitelisting, remove and re-attach this EA");
      Alert("TradeSylla: Server unreachable. See Experts tab for whitelist instructions.");
      return INIT_FAILED;
   }

   Print("Active URL: ", g_activeURL);

   if(ForceResync) {
      FileDelete(g_syncedFile);
      Print("ForceResync=true: cache cleared, will resync all history");
   }

   Print("Starting history sync...");
   SyncAllHistory();

   EventSetTimer(SyncInterval);
   Print("Sync EA ready. Timer: every ", SyncInterval, "s");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int r) { EventKillTimer(); }

void OnTimer() {
   if(TimeCurrent() - g_lastSync < SyncInterval) return;
   g_lastSync = TimeCurrent();
   SyncRecentTrades();
}

//+------------------------------------------------------------------+
// Try primary URL first, then fallback URL
//+------------------------------------------------------------------+
string FindWorkingURL() {
   Print("Testing URL: ", ServerURL, " ...");
   if(TestURL(ServerURL)) return ServerURL;

   if(FallbackURL != "") {
      Print("Primary failed. Testing fallback: ", FallbackURL, " ...");
      if(TestURL(FallbackURL)) return FallbackURL;
   }

   return "";
}

bool TestURL(string url) {
   string hdr  = "Content-Type: application/json\r\nAuthorization: Bearer " + UserToken;
   char   post[]; char res[]; string resH;
   string body = "{}";
   StringToCharArray(body, post, 0, StringLen(body));

   int code = WebRequest("POST", url + "/api/ea-sync", hdr, 5000, post, res, resH);

   if(code == -1) {
      int err = GetLastError();
      if(err == 4060)
         Print("  ERROR 4060 — URL not whitelisted: ", url);
      else if(err == 5203)
         Print("  ERROR 5203 — SSL error for: ", url);
      else
         Print("  ERROR ", err, " — cannot reach: ", url);
      return false;
   }

   string resp = CharArrayToString(res);
   Print("  HTTP ", code, " — server responded: ", StringSubstr(resp,0,80));
   // Any HTTP response (even 400/401) = server reachable
   return true;
}

//+------------------------------------------------------------------+
// Synced ticket cache
//+------------------------------------------------------------------+
void LoadSynced(ulong &arr[]) {
   int h = FileOpen(g_syncedFile, FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   int n = 0;
   while(!FileIsEnding(h)) {
      string l = FileReadString(h);
      if(l != "") { ArrayResize(arr, n+1); arr[n++] = (ulong)StringToInteger(l); }
   }
   FileClose(h);
}

void SaveSynced(ulong t) {
   int h = FileOpen(g_syncedFile, FILE_WRITE|FILE_READ|FILE_TXT|FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, IntegerToString(t) + "\n");
   FileClose(h);
}

bool IsSynced(ulong &arr[], ulong t) {
   for(int i = 0; i < ArraySize(arr); i++) if(arr[i] == t) return true;
   return false;
}

//+------------------------------------------------------------------+
// Helpers
//+------------------------------------------------------------------+
string GetSession(datetime t) {
   MqlDateTime d; TimeToStruct(t, d); int h = d.hour;
   if(h >= 2  && h < 5)  return "SYDNEY";
   if(h >= 0  && h < 9)  return "ASIAN";
   if(h >= 7  && h < 16) return "LONDON";
   if(h >= 13 && h < 22) return "NEW_YORK";
   return "ASIAN";
}

string GetTF(datetime e, datetime x) {
   int m = (int)((x - e) / 60);
   if(m <= 5)    return "M1";
   if(m <= 20)   return "M5";
   if(m <= 60)   return "M15";
   if(m <= 240)  return "H1";
   if(m <= 1440) return "H4";
   return "D1";
}

string ISO(datetime t) {
   if(t <= 0) return "";
   MqlDateTime d; TimeToStruct(t, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",
      d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

double Pips(string sym, long type, double ep, double xp) {
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   int    dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double m  = (dg == 3 || dg == 5) ? 10.0 : 1.0;
   double raw = (type == POSITION_TYPE_BUY) ? (xp - ep) : (ep - xp);
   return raw / pt / m;
}

//+------------------------------------------------------------------+
// Build JSON payload for one position (NO quality field)
//+------------------------------------------------------------------+
string BuildJSON(ulong posId, string sym, long type,
                 double ep, double xp, double lots,
                 double pnl, double swp, double comm,
                 double pips, datetime et, datetime xt) {
   return StringFormat(
      "{\"ticket\":\"%I64u\",\"account_login\":\"%s\","
      "\"symbol\":\"%s\",\"direction\":\"%s\","
      "\"entry_price\":%.5f,\"exit_price\":%.5f,"
      "\"lot_size\":%.2f,\"pnl\":%.2f,\"swap\":%.2f,"
      "\"commission\":%.2f,\"total_pnl\":%.2f,\"pips\":%.1f,"
      "\"session\":\"%s\",\"timeframe\":\"%s\","
      "\"entry_time\":\"%s\",\"exit_time\":\"%s\"}",
      posId,
      IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
      sym,
      (type == POSITION_TYPE_BUY ? "BUY" : "SELL"),
      ep, xp, lots, pnl, swp, comm,
      pnl + swp + comm, pips,
      GetSession(et), GetTF(et, xt),
      ISO(et), ISO(xt)
   );
}

//+------------------------------------------------------------------+
// Send batch to server
//+------------------------------------------------------------------+
bool SendBatch(string &items[], int n) {
   if(n == 0) return true;
   if(g_activeURL == "") { Print("No active URL — skipping batch"); return false; }

   string body = "[";
   for(int i = 0; i < n; i++) { body += items[i]; if(i < n-1) body += ","; }
   body += "]";

   string hdr = "Content-Type: application/json\r\nAuthorization: Bearer " + UserToken;
   char   post[]; StringToCharArray(body, post, 0, StringLen(body));
   char   res[];  string resH;

   int code = WebRequest("POST", g_activeURL + "/api/ea-sync", hdr, 15000, post, res, resH);

   if(code == -1) {
      int err = GetLastError();
      Print("SendBatch failed. Error=", err);
      if(err == 4060) Print("  URL not whitelisted: ", g_activeURL);
      // Try switching to fallback
      if(FallbackURL != "" && g_activeURL != FallbackURL) {
         Print("  Retrying with fallback URL...");
         if(TestURL(FallbackURL)) {
            g_activeURL = FallbackURL;
            return SendBatch(items, n); // retry once
         }
      }
      return false;
   }

   string resp = CharArrayToString(res);
   Print("Sync HTTP ", code, ": ", resp);

   if(code == 401) {
      Print("AUTH FAILED (401) — token is wrong or expired");
      Print("  → Go to Settings → API Keys → Regenerate Sync Token");
      Print("  → Update UserToken in this EA's inputs");
      return false;
   }
   if(code == 404) {
      Print("NOT FOUND (404) — wrong URL or API not deployed");
      return false;
   }

   return (code == 200);
}

//+------------------------------------------------------------------+
// Aggregate all deals for a position ID
//+------------------------------------------------------------------+
bool AggregatePos(ulong posId, string &sym, long &type,
                  double &ep, double &xp, double &lots,
                  double &pnl, double &swp, double &comm,
                  datetime &et, datetime &xt) {
   sym = ""; type = POSITION_TYPE_BUY;
   ep = 0; xp = 0; lots = 0; pnl = 0; swp = 0; comm = 0; et = 0; xt = 0;
   bool found = false;
   int  total = HistoryDealsTotal();

   for(int i = 0; i < total; i++) {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetInteger(t, DEAL_POSITION_ID) != (long)posId) continue;
      found = true;
      if(sym == "") sym = HistoryDealGetString(t, DEAL_SYMBOL);
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(t, DEAL_ENTRY);
      double price  = HistoryDealGetDouble(t,  DEAL_PRICE);
      double vol    = HistoryDealGetDouble(t,  DEAL_VOLUME);
      datetime tm   = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
      long dir      = HistoryDealGetInteger(t, DEAL_TYPE);
      pnl  += HistoryDealGetDouble(t, DEAL_PROFIT);
      swp  += HistoryDealGetDouble(t, DEAL_SWAP);
      comm += HistoryDealGetDouble(t, DEAL_COMMISSION);
      if(entry == DEAL_ENTRY_IN) {
         ep = price; lots = vol;
         type = (dir == DEAL_TYPE_BUY) ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
         et = tm;
      }
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT) { xp = price; xt = tm; }
   }
   if(found && xt == 0) xt = et;
   return found;
}

//+------------------------------------------------------------------+
// Collect unique closed position IDs
//+------------------------------------------------------------------+
int CollectPositions(ulong &posIds[], ulong &synced[], bool respectCache) {
   int count = 0, total = HistoryDealsTotal();
   for(int i = 0; i < total; i++) {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      ENUM_DEAL_ENTRY e = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(t, DEAL_ENTRY);
      if(e != DEAL_ENTRY_OUT && e != DEAL_ENTRY_INOUT) continue;
      ulong posId = (ulong)HistoryDealGetInteger(t, DEAL_POSITION_ID);
      if(respectCache && IsSynced(synced, posId)) continue;
      bool dup = false;
      for(int j = 0; j < count; j++) if(posIds[j] == posId) { dup = true; break; }
      if(!dup) { ArrayResize(posIds, count+1); posIds[count++] = posId; }
   }
   return count;
}

//+------------------------------------------------------------------+
// Full history sync
//+------------------------------------------------------------------+
void SyncAllHistory() {
   if(!HistorySelect(D'2000.01.01', TimeCurrent())) {
      Print("HistorySelect failed — no history available");
      return;
   }
   ulong synced[]; LoadSynced(synced);
   ulong posIds[]; int n = CollectPositions(posIds, synced, !ForceResync);

   if(n == 0) {
      Print("History sync: nothing new to send (", ArraySize(synced), " already synced)");
      Print("  → If you expect trades, set ForceResync=true, re-attach EA, then set back to false");
      return;
   }

   Print("History sync: sending ", n, " positions...");
   string batch[50]; int bSize = 0;

   for(int i = 0; i < n; i++) {
      string sym; long type; double ep, xp, lots, pnl, swp, comm; datetime et, xt;
      if(!AggregatePos(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm, et, xt)) continue;
      batch[bSize++] = BuildJSON(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm,
                                 Pips(sym, type, ep, xp), et, xt);
      if(bSize == 50 || i == n-1) {
         if(SendBatch(batch, bSize))
            for(int j = i-bSize+1; j <= i; j++) SaveSynced(posIds[j]);
         bSize = 0;
      }
   }
   Print("History sync complete");
}

//+------------------------------------------------------------------+
// Live sync (timer)
//+------------------------------------------------------------------+
void SyncRecentTrades() {
   if(!HistorySelect(TimeCurrent() - 86400*7, TimeCurrent())) return;
   ulong synced[]; LoadSynced(synced);
   ulong posIds[]; int n = CollectPositions(posIds, synced, true);
   if(n == 0) return;

   string batch[]; ArrayResize(batch, n); int bSize = 0;
   for(int i = 0; i < n; i++) {
      string sym; long type; double ep, xp, lots, pnl, swp, comm; datetime et, xt;
      if(!AggregatePos(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm, et, xt)) continue;
      batch[bSize++] = BuildJSON(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm,
                                 Pips(sym, type, ep, xp), et, xt);
   }

   if(SendBatch(batch, bSize)) {
      for(int i = 0; i < n; i++) SaveSynced(posIds[i]);
      Print("Live sync: +", bSize, " new trades sent");
   }
}
