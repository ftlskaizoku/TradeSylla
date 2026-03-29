//+------------------------------------------------------------------+
//| TradeSylla_Sync.mq5   v4.3                                       |
//| Added: full diagnostic logging so you can see exactly why        |
//| sync fails — check Experts tab in MT5 for error messages         |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "4.30"

input string UserToken    = "";
input string ServerURL    = "https://tradesylla.vercel.app";
input bool   ForceResync  = false;
input int    SyncInterval = 5;

datetime g_lastSync   = 0;
string   g_syncedFile = "ts_synced_v43.txt";
bool     g_skipLog    = false;

int OnInit() {
   Print("=== TradeSylla Sync v4.3 DIAGNOSTIC START ===");
   Print("ServerURL: ", ServerURL);
   Print("Token set: ", UserToken != "" ? "YES (length=" + IntegerToString(StringLen(UserToken)) + ")" : "NO - PLEASE SET UserToken!");
   Print("Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("Terminal connected: ", TerminalInfoInteger(TERMINAL_CONNECTED) ? "YES" : "NO");

   if(UserToken == "") {
      Alert("TradeSylla: UserToken is empty! Go to Settings → API Keys, generate your Sync token, paste it here.");
      return INIT_FAILED;
   }

   // Test connectivity first
   Print("Testing server connection...");
   if(!TestConnection()) {
      Print("CONNECTION FAILED - check MT5 WebRequest whitelist:");
      Print("  MT5 → Tools → Options → Expert Advisors → Allow WebRequest for URLs:");
      Print("  Add: ", ServerURL);
      Print("  Also add: https://tradesylla-oj6xmr364-ftlskaizokus-projects.vercel.app");
      Alert("TradeSylla: Cannot reach server. See Experts tab for instructions.");
      return INIT_FAILED;
   }
   Print("Server connection: OK");

   if(ForceResync) {
      FileDelete(g_syncedFile);
      Print("ForceResync: cleared synced cache");
   }

   g_skipLog = true;
   SyncAllHistory();
   g_skipLog = false;

   EventSetTimer(SyncInterval);
   Print("=== Init complete — syncing every ", SyncInterval, "s ===");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int r) { EventKillTimer(); }

void OnTimer() {
   if(TimeCurrent() - g_lastSync < SyncInterval) return;
   g_lastSync = TimeCurrent();
   SyncRecentTrades();
}

//── Test server reachability ─────────────────────────────────────────────────
bool TestConnection() {
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + UserToken;
   char   post[]; char res[]; string resH;
   // Send empty body to trigger a response (will get 400 but that proves connectivity)
   string testBody = "{}";
   StringToCharArray(testBody, post, 0, StringLen(testBody));
   int code = WebRequest("POST", ServerURL + "/api/ea-sync", headers, 5000, post, res, resH);
   if(code == -1) {
      int err = GetLastError();
      Print("WebRequest error code: ", err);
      if(err == 4060) Print("ERROR 4060: URL not in whitelist. Add ", ServerURL, " to MT5 allowed URLs");
      if(err == 5203) Print("ERROR 5203: SSL/TLS error — try adding http:// version too");
      return false;
   }
   // Any HTTP response (even 400/401) means we reached the server
   string response = CharArrayToString(res);
   Print("Server responded (HTTP ", code, "): ", StringSubstr(response, 0, 100));
   return true;
}

//── Synced ticket cache ───────────────────────────────────────────────────────
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

//── Helpers ───────────────────────────────────────────────────────────────────
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
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d", d.year, d.mon, d.day, d.hour, d.min, d.sec);
}
double Pips(string sym, long type, double ep, double xp) {
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
   int    dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double m  = (dg == 3 || dg == 5) ? 10.0 : 1.0;
   double raw = (type == POSITION_TYPE_BUY) ? (xp - ep) : (ep - xp);
   return raw / pt / m;
}

//── Build JSON ────────────────────────────────────────────────────────────────
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
      posId, IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
      sym, (type == POSITION_TYPE_BUY ? "BUY" : "SELL"),
      ep, xp, lots, pnl, swp, comm, pnl + swp + comm, pips,
      GetSession(et), GetTF(et, xt), ISO(et), ISO(xt)
   );
}

//── Send batch ────────────────────────────────────────────────────────────────
bool SendBatch(string &items[], int n) {
   if(n == 0) return true;
   string body = "[";
   for(int i = 0; i < n; i++) { body += items[i]; if(i < n-1) body += ","; }
   body += "]";

   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + UserToken;
   char   post[];  StringToCharArray(body, post, 0, StringLen(body));
   char   res[];   string resH;

   int code = WebRequest("POST", ServerURL + "/api/ea-sync", headers, 15000, post, res, resH);
   if(code == -1) {
      int err = GetLastError();
      if(!g_skipLog) Print("SendBatch FAILED. WinError=", err, " | Add ", ServerURL, " to MT5 WebRequest whitelist");
      return false;
   }

   string response = CharArrayToString(res);
   if(!g_skipLog) Print("Sync response (", code, "): ", response);

   if(code != 200) {
      if(!g_skipLog) Print("ERROR: Server returned HTTP ", code, " — check token is correct");
      return false;
   }
   return true;
}

//── Aggregate position deals ──────────────────────────────────────────────────
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
      double price = HistoryDealGetDouble(t, DEAL_PRICE);
      double vol   = HistoryDealGetDouble(t, DEAL_VOLUME);
      datetime tm  = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
      long dir     = HistoryDealGetInteger(t, DEAL_TYPE);
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

//── Collect closed position IDs ───────────────────────────────────────────────
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

//── Full history sync ─────────────────────────────────────────────────────────
void SyncAllHistory() {
   if(!HistorySelect(D'2000.01.01', TimeCurrent())) {
      Print("HistorySelect failed");
      return;
   }
   ulong synced[]; LoadSynced(synced);
   ulong posIds[]; int n = CollectPositions(posIds, synced, !ForceResync);
   Print("History sync: ", n, " positions to send (ForceResync=", ForceResync, ")");
   if(n == 0) {
      Print("Nothing to sync — all trades already synced or no history found");
      return;
   }

   string batch[50]; int bSize = 0;
   for(int i = 0; i < n; i++) {
      string sym; long type; double ep, xp, lots, pnl, swp, comm; datetime et, xt;
      if(!AggregatePos(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm, et, xt)) continue;
      batch[bSize++] = BuildJSON(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm,
                                 Pips(sym, type, ep, xp), et, xt);
      if(bSize == 50 || i == n-1) {
         if(SendBatch(batch, bSize))
            for(int j = i - bSize + 1; j <= i; j++) SaveSynced(posIds[j]);
         bSize = 0;
      }
   }
   Print("History sync complete");
}

//── Recent trades (live timer) ────────────────────────────────────────────────
void SyncRecentTrades() {
   if(!HistorySelect(TimeCurrent() - 86400 * 7, TimeCurrent())) return;
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
      Print("Live sync: +", bSize, " trades");
   }
}
