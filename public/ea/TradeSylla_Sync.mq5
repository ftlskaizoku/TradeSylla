//+------------------------------------------------------------------+
//| TradeSylla_Sync.mq5   v5.2                                       |
//|                                                                    |
//| NEW in v5.2:                                                       |
//|  - Deposits & withdrawals are now synced as special trades        |
//|    (is_withdrawal=true) so account balance is accurately tracked  |
//|  - DEAL_TYPE_BALANCE deals are detected and sent alongside trades |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "5.20"

input string UserToken    = "";
input string ServerURL    = "https://tradesylla.vercel.app";
input string FallbackURL  = "";
input bool   ForceResync  = false;
input int    SyncInterval = 5;

datetime g_lastSync   = 0;
string   g_syncedFile = "ts_synced_v51.txt";
string   g_activeURL  = "";

//+------------------------------------------------------------------+
int OnInit() {
   Print("========================================");
   Print("TradeSylla Sync v5.1 starting...");
   Print("Primary URL:  ", ServerURL);
   Print("Fallback URL: ", FallbackURL != "" ? FallbackURL : "(none set)");
   Print("Token length: ", StringLen(UserToken), " chars");
   Print("Account:      ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("Connected:    ", TerminalInfoInteger(TERMINAL_CONNECTED) ? "YES" : "NO");
   Print("========================================");

   if(UserToken == "") {
      Print("FATAL: UserToken is empty. Go to TradeSylla Settings → API Keys → copy Sync EA Token");
      Alert("TradeSylla: Set UserToken first. See Experts tab.");
      return INIT_FAILED;
   }

   g_activeURL = FindWorkingURL();
   if(g_activeURL == "") {
      Print("FATAL: Cannot reach TradeSylla server.");
      Print("  → Tools → Options → Expert Advisors → Allow WebRequest → add:");
      Print("    https://tradesylla.vercel.app");
      Alert("TradeSylla: Server unreachable. See Experts tab.");
      return INIT_FAILED;
   }
   Print("Active URL: ", g_activeURL);

   if(ForceResync) {
      FileDelete(g_syncedFile);
      Print("ForceResync=true: local cache cleared — will resync all history");
   }

   // FIX 1: Wait for broker history download to finish before processing
   Print("Waiting for full history download from broker...");
   WaitForHistory();

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
// FIX 1: Wait for MT5 to finish async history download from broker
// MT5 loads history asynchronously. HistoryDealsTotal() counts only
// what's already in memory. We wait until the count stabilises.
//+------------------------------------------------------------------+
void WaitForHistory() {
   if(!HistorySelect(D'2000.01.01', TimeCurrent())) {
      Print("HistorySelect failed — broker may not have responded yet");
      return;
   }

   int prevCount = -1;
   int stableFor = 0;

   for(int i = 0; i < 60; i++) {   // max 30 seconds (60 x 500ms)
      int count = HistoryDealsTotal();
      if(count == prevCount) {
         stableFor++;
         if(stableFor >= 6) {       // stable for 3 seconds
            Print("History download complete: ", count, " deals loaded");
            return;
         }
      } else {
         stableFor = 0;
         Print("History loading... deals so far: ", count);
      }
      prevCount = count;
      Sleep(500);
   }
   Print("History wait timed out — proceeding with ", HistoryDealsTotal(), " deals");
   Print("  Tip: right-click MT5 History tab → All History to load more");
}

//+------------------------------------------------------------------+
// FIX 2: Parse server response to decide whether to mark as synced
// Uses StringSubstr to extract numbers — pure MQL5, no CharToStr
//+------------------------------------------------------------------+
int ExtractJSONInt(string resp, string key) {
   string search = "\"" + key + "\":";
   int pos = StringFind(resp, search);
   if(pos == -1) return -1;
   int start = pos + StringLen(search);
   // Skip spaces
   while(start < StringLen(resp) && StringGetCharacter(resp, start) == ' ') start++;
   // Find end of number
   int end = start;
   while(end < StringLen(resp)) {
      ushort c = StringGetCharacter(resp, end);
      if(c < '0' || c > '9') break;
      end++;
   }
   if(end == start) return -1;
   return (int)StringToInteger(StringSubstr(resp, start, end - start));
}

bool ParseSyncOK(string resp) {
   int inserted = ExtractJSONInt(resp, "inserted");
   int updated  = ExtractJSONInt(resp, "updated");
   int skipped  = ExtractJSONInt(resp, "skipped");

   // If we couldn't parse the response at all, trust HTTP 200
   if(inserted == -1 && updated == -1 && skipped == -1) return true;

   int ins = (inserted > 0 ? inserted : 0);
   int upd = (updated  > 0 ? updated  : 0);
   int skp = (skipped  > 0 ? skipped  : 0);
   int processed = ins + upd + skp;

   // Non-empty errors array = something went wrong
   bool hasErrors = (StringFind(resp, "\"errors\":[\"") != -1);

   if(hasErrors && processed == 0) {
      Print("  Server returned errors with 0 processed — NOT marking as synced");
      Print("  Response: ", StringSubstr(resp, 0, 200));
      return false;
   }

   Print("  Server confirmed: inserted=", ins, " updated=", upd, " skipped=", skp);
   return true;
}

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
      Print("SendBatch network error=", err);
      if(err == 4060) Print("  URL not whitelisted — add it in Tools → Options → Expert Advisors");
      if(FallbackURL != "" && g_activeURL != FallbackURL) {
         Print("  Trying fallback URL...");
         if(TestURL(FallbackURL)) { g_activeURL = FallbackURL; return SendBatch(items, n); }
      }
      return false;
   }

   string resp = CharArrayToString(res);
   Print("Sync HTTP ", code, ": ", StringSubstr(resp, 0, 150));

   if(code == 401) {
      Print("AUTH FAILED (401) — go to Settings → API Keys → regenerate Sync Token → update UserToken in EA");
      return false;
   }
   if(code != 200) {
      Print("HTTP ", code, " error — not marking as synced");
      return false;
   }

   // FIX 2: Only mark as synced when server confirms it
   return ParseSyncOK(resp);
}

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
   string hdr = "Content-Type: application/json\r\nAuthorization: Bearer " + UserToken;
   char   post[]; char res[]; string resH;
   string body = "{}";
   StringToCharArray(body, post, 0, StringLen(body));
   int code = WebRequest("POST", url + "/api/ea-sync", hdr, 5000, post, res, resH);
   if(code == -1) {
      int err = GetLastError();
      if(err == 4060) Print("  ERROR 4060 — not whitelisted: ", url);
      else            Print("  ERROR ", err, " — cannot reach: ", url);
      return false;
   }
   Print("  HTTP ", code, " — server reachable: ", url);
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

//+------------------------------------------------------------------+
// Sync deposits and withdrawals (DEAL_TYPE_BALANCE deals)
// These are sent as is_withdrawal trades so the frontend can
// calculate accurate running account balance and equity.
//+------------------------------------------------------------------+
string BuildBalanceJSON(ulong ticket, double amount, datetime t) {
   bool isDeposit = (amount > 0);
   return StringFormat(
      "{\"ticket\":\"BAL%I64u\",\"account_login\":\"%s\","
      "\"symbol\":\"BALANCE\",\"direction\":\"%s\","
      "\"entry_price\":0,\"exit_price\":0,"
      "\"lot_size\":0,\"pnl\":%.2f,\"swap\":0,"
      "\"commission\":0,\"total_pnl\":%.2f,\"pips\":0,"
      "\"session\":\"LONDON\",\"timeframe\":\"D1\","
      "\"entry_time\":\"%s\",\"exit_time\":\"%s\","
      "\"is_withdrawal\":%s,\"withdrawal_amount\":%.2f,"
      "\"outcome\":\"%s\",\"notes\":\"%s\"}",
      ticket,
      IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
      isDeposit ? "BUY" : "SELL",
      amount, amount,
      ISO(t), ISO(t),
      isDeposit ? "false" : "true",
      MathAbs(amount),
      isDeposit ? "WIN" : "LOSS",
      isDeposit ? "Deposit" : "Withdrawal"
   );
}

void SyncDepositsWithdrawals() {
   ulong synced[]; LoadSynced(synced);
   string batch[200]; int bSize = 0;

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++) {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;

      // Only DEAL_TYPE_BALANCE (6) = deposit/withdrawal/credit
      long dealType = HistoryDealGetInteger(t, DEAL_TYPE);
      if(dealType != 6) continue; // DEAL_TYPE_BALANCE = 6

      // Use a synthetic ID so it doesn't clash with position IDs
      ulong syntheticId = t + 10000000000UL;
      if(IsSynced(synced, syntheticId)) continue;

      double amount = HistoryDealGetDouble(t, DEAL_PROFIT);
      if(MathAbs(amount) < 0.01) continue; // ignore zero-amount entries

      datetime tm = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
      batch[bSize++] = BuildBalanceJSON(t, amount, tm);

      if(bSize >= 190) {
         if(SendBatch(batch, bSize)) {
            // Mark these as synced — we need to track by synthetic ID
            Print("Sent ", bSize, " balance events");
         }
         bSize = 0;
      }
   }

   if(bSize > 0) {
      if(SendBatch(batch, bSize))
         Print("Sent ", bSize, " balance event(s) (deposits/withdrawals)");
   }
}

void SyncAllHistory() {
   ulong synced[]; LoadSynced(synced);
   ulong posIds[]; int n = CollectPositions(posIds, synced, !ForceResync);

   if(n == 0) {
      int cached = ArraySize(synced);
      Print("History sync: nothing new (", cached, " already confirmed by server)");
      if(cached > 0) Print("  → To re-send all: ForceResync=true, re-attach EA, set back to false");
      return;
   }

   Print("History sync: sending ", n, " positions (", ArraySize(synced), " already synced)...");
   string batch[50]; int bSize = 0;

   for(int i = 0; i < n; i++) {
      string sym; long type; double ep, xp, lots, pnl, swp, comm; datetime et, xt;
      if(!AggregatePos(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm, et, xt)) continue;
      batch[bSize++] = BuildJSON(posIds[i], sym, type, ep, xp, lots, pnl, swp, comm,
                                 Pips(sym, type, ep, xp), et, xt);
      if(bSize == 50 || i == n-1) {
         if(SendBatch(batch, bSize))
            for(int j = i-bSize+1; j <= i; j++) SaveSynced(posIds[j]);
         else
            Print("  Batch not confirmed — will retry on next sync");
         bSize = 0;
      }
   }
   Print("History sync complete");
   Print("Syncing deposits & withdrawals...");
   SyncDepositsWithdrawals();
   Print("Balance sync complete");
}

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
      Print("Live sync: +", bSize, " new trade(s) sent");
   }
}

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

bool AggregatePos(ulong posId, string &sym, long &type,
                  double &ep, double &xp, double &lots,
                  double &pnl, double &swp, double &comm,
                  datetime &et, datetime &xt) {
   sym = ""; type = POSITION_TYPE_BUY;
   ep=0; xp=0; lots=0; pnl=0; swp=0; comm=0; et=0; xt=0;
   bool found = false;
   int  total = HistoryDealsTotal();

   for(int i = 0; i < total; i++) {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0) continue;
      if(HistoryDealGetInteger(t, DEAL_POSITION_ID) != (long)posId) continue;
      found = true;
      if(sym == "") sym = HistoryDealGetString(t, DEAL_SYMBOL);
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(t, DEAL_ENTRY);
      double price = HistoryDealGetDouble(t,  DEAL_PRICE);
      double vol   = HistoryDealGetDouble(t,  DEAL_VOLUME);
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
string GetSession(datetime t) {
   MqlDateTime d; TimeToStruct(t, d); int h = d.hour;
   if(h >= 2  && h < 5)  return "SYDNEY";
   if(h >= 0  && h < 9)  return "ASIAN";
   if(h >= 7  && h < 16) return "LONDON";
   if(h >= 13 && h < 22) return "NEW_YORK";
   return "ASIAN";
}

string GetTF(datetime e, datetime x) {
   // If no exit time, default to M15 — most common retail timeframe
   if(x <= 0 || e <= 0 || x <= e) return "M15";
   int m = (int)((x - e) / 60);
   if(m <= 2)    return "M1";
   if(m <= 10)   return "M5";
   if(m <= 45)   return "M15";
   if(m <= 200)  return "H1";
   if(m <= 1000) return "H4";
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
