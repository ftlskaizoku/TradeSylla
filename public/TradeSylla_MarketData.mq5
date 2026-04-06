//+------------------------------------------------------------------+
//| TradeSylla_MarketData.mq5   v3.0                                 |
//|                                                                    |
//| FIX vs v2.0:                                                       |
//|  SyncAllHistory() was called in OnInit() synchronously.           |
//|  308 symbols × 6 TFs = 1848 HTTP calls blocked the main thread.  |
//|  MT5 terminates EAs whose OnInit() runs too long → "Abnormal      |
//|  termination" after only ~1 symbol synced.                        |
//|                                                                    |
//|  NEW: OnInit() returns immediately. A progressive timer-based     |
//|  sync processes one symbol per timer tick, cycling through all    |
//|  symbols until every one has been synced for every timeframe.     |
//|  Live candle updates continue in the background.                  |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "3.00"

input string AdminToken      = "";
input string ServerURL       = "https://tradesylla.vercel.app";
input bool   FullHistorySync = true;   // sync all symbols on start
input int    PollInterval    = 10;     // SYLLEDGE command poll (seconds)
input int    LiveInterval    = 60;     // live candle push interval (seconds)
input int    SyncDelay       = 100;    // ms between HTTP calls (be gentle on broker)

ENUM_TIMEFRAMES TFS[]    = { PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1 };
string          TFNAMES[]= { "M1","M5","M15","H1","H4","D1" };

datetime g_lastLive    = 0;
datetime g_lastPoll    = 0;
bool     g_histDone    = false;   // full history sync complete flag
int      g_symIdx      = 0;       // which symbol we're currently syncing
int      g_tfIdx       = 0;       // which timeframe we're currently syncing
string   g_syms[];               // all symbols
int      g_symCount    = 0;

//+------------------------------------------------------------------+
int OnInit() {
   if(AdminToken == "") {
      Alert("TradeSylla MarketData: Set AdminToken in EA inputs");
      return INIT_FAILED;
   }
   Print("TradeSylla MarketData v3.0 starting...");
   Print("ServerURL: ", ServerURL);
   Print("FullHistorySync: ", FullHistorySync ? "YES" : "NO");

   // Load symbol list ONCE
   g_symCount = GetSymbols(g_syms);
   Print("Symbols found: ", g_symCount);

   if(FullHistorySync && g_symCount > 0) {
      Print("Progressive history sync will start on first timer tick.");
      Print("  → ", g_symCount, " symbols × ", ArraySize(TFS), " TFs = ",
            g_symCount * ArraySize(TFS), " batches total");
      Print("  → Progress shown in Experts tab. Do NOT remove EA until complete.");
      g_histDone = false;
      g_symIdx   = 0;
      g_tfIdx    = 0;
   } else {
      g_histDone = true;
   }

   EventSetTimer(1);  // 1-second timer — fast enough for both tasks
   Print("MarketData EA ready.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int r) {
   EventKillTimer();
   Print("MarketData EA stopped. Symbols synced so far: ", g_symIdx, "/", g_symCount);
}

//+------------------------------------------------------------------+
void OnTimer() {
   datetime now = TimeCurrent();

   // ── Task 1: Progressive history sync (one TF per tick) ──────────
   if(!g_histDone && FullHistorySync) {
      ProgressiveSyncStep();
      return;  // don't do live/poll during history sync — focus bandwidth
   }

   // ── Task 2: Poll SYLLEDGE commands ──────────────────────────────
   if(now - g_lastPoll >= PollInterval) {
      g_lastPoll = now;
      PollCommands();
   }

   // ── Task 3: Push latest candle for each symbol ───────────────────
   if(now - g_lastLive >= LiveInterval) {
      g_lastLive = now;
      PushLive();
   }
}

//+------------------------------------------------------------------+
// Progressive sync — advances one timeframe per call
// Full cycle: g_symCount × ArraySize(TFS) calls
//+------------------------------------------------------------------+
void ProgressiveSyncStep() {
   if(g_symIdx >= g_symCount) {
      g_histDone = true;
      Print("=== History sync COMPLETE: all ", g_symCount, " symbols × ", ArraySize(TFS), " TFs ===");
      return;
   }

   string sym   = g_syms[g_symIdx];
   int    tfIdx = g_tfIdx;

   // Print progress every 10 symbols
   if(g_tfIdx == 0 && g_symIdx % 10 == 0) {
      Print("History sync progress: ", g_symIdx, "/", g_symCount,
            " (", (int)((double)g_symIdx/g_symCount*100), "%)");
   }

   SyncSymbol(sym, TFS[tfIdx], TFNAMES[tfIdx]);
   Sleep(SyncDelay);

   // Advance to next TF, or next symbol
   g_tfIdx++;
   if(g_tfIdx >= ArraySize(TFS)) {
      g_tfIdx = 0;
      g_symIdx++;
   }
}

//+------------------------------------------------------------------+
// Sync one symbol/TF: all candles from 2015 to now in 500-bar batches
//+------------------------------------------------------------------+
void SyncSymbol(string sym, ENUM_TIMEFRAMES tf, string tfName) {
   MqlRates rates[];
   int loaded = CopyRates(sym, tf, D'2015.01.01', TimeCurrent(), rates);
   if(loaded <= 0) return;

   for(int start = 0; start < loaded; start += 500) {
      int n = MathMin(500, loaded - start);
      MqlRates batch[];
      ArrayResize(batch, n);
      ArrayCopy(batch, rates, 0, start, n);
      string resp = POST("/api/sylledge-market", CandlesJSON(sym, tfName, batch, n));
      if(StringFind(resp, "\"success\":true") == -1 && resp != "") {
         Print("SyncSymbol warning: ", sym, " ", tfName, " -> ", StringSubstr(resp, 0, 80));
      }
      Sleep(SyncDelay);
   }
}

//+------------------------------------------------------------------+
// Push latest 2 candles for every symbol (keeps charts live)
//+------------------------------------------------------------------+
void PushLive() {
   for(int s = 0; s < g_symCount; s++) {
      for(int t = 0; t < ArraySize(TFS); t++) {
         MqlRates r[2];
         if(CopyRates(g_syms[s], TFS[t], 0, 2, r) < 2) continue;
         MqlRates bar[1]; bar[0] = r[1];
         POST("/api/sylledge-market", CandlesJSON(g_syms[s], TFNAMES[t], bar, 1));
         Sleep(10);
      }
   }
}

//+------------------------------------------------------------------+
int GetSymbols(string &syms[]) {
   int total = SymbolsTotal(false), n = 0;
   for(int i = 0; i < total; i++) {
      string name = SymbolName(i, false);
      if(name == "" || StringGetCharacter(name, 0) == '#') continue;
      ArrayResize(syms, n+1);
      syms[n++] = name;
   }
   return n;
}

//+------------------------------------------------------------------+
// HTTP helpers
//+------------------------------------------------------------------+
string POST(string path, string body) {
   string hdr = "Content-Type: application/json\r\nAuthorization: Bearer " + AdminToken;
   char   post[]; StringToCharArray(body, post, 0, StringLen(body));
   char   res[];  string rh;
   int c = WebRequest("POST", ServerURL + path, hdr, 15000, post, res, rh);
   if(c == -1) {
      int err = GetLastError();
      if(err == 4060) Print("POST error: URL not whitelisted: ", ServerURL);
      else            Print("POST error ", err, " on ", path);
      return "";
   }
   return CharArrayToString(res);
}

string HTTGET(string path) {
   string hdr = "Authorization: Bearer " + AdminToken;
   char   empty[1]; char res[]; string rh;
   int c = WebRequest("GET", ServerURL + path, hdr, 10000, empty, res, rh);
   if(c == -1) { Print("GET error ", GetLastError(), " on ", path); return ""; }
   return CharArrayToString(res);
}

//+------------------------------------------------------------------+
// JSON builders
//+------------------------------------------------------------------+
string CandlesJSON(string sym, string tf, MqlRates &r[], int n) {
   string s = "{\"symbol\":\"" + sym + "\",\"timeframe\":\"" + tf + "\",\"candles\":[";
   for(int i = 0; i < n; i++) {
      s += StringFormat(
         "{\"t\":\"%s\",\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%I64u}",
         ISO(r[i].time), r[i].open, r[i].high, r[i].low, r[i].close, r[i].tick_volume
      );
      if(i < n-1) s += ",";
   }
   return s + "]}";
}

string ISO(datetime t) {
   MqlDateTime d; TimeToStruct(t, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",
      d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

//+------------------------------------------------------------------+
// SYLLEDGE command system
//+------------------------------------------------------------------+
void PollCommands() {
   string resp = HTTGET("/api/sylledge-commands/pending");
   if(resp == "" || resp == "[]" || resp == "null") return;

   int pos = 0;
   while(pos < StringLen(resp)) {
      int s = StringFind(resp, "{", pos); if(s == -1) break;
      int e = FindClosingBrace(resp, s);  if(e == -1) break;
      ExecCommand(StringSubstr(resp, s, e - s + 1));
      pos = e + 1;
   }
}

int FindClosingBrace(string s, int start) {
   int depth = 0;
   for(int i = start; i < StringLen(s); i++) {
      ushort c = StringGetCharacter(s, i);
      if(c == '{') depth++;
      if(c == '}') { depth--; if(depth == 0) return i; }
   }
   return -1;
}

void ExecCommand(string cmd) {
   string id   = ExtractJSON(cmd, "id");
   string type = ExtractJSON(cmd, "type");
   string sym  = ExtractJSON(cmd, "symbol");
   string tf   = ExtractJSON(cmd, "timeframe");
   string from = ExtractJSON(cmd, "from");
   string to   = ExtractJSON(cmd, "to");
   string limS = ExtractJSON(cmd, "limit");
   int    lim  = limS != "" ? (int)StringToInteger(limS) : 500;
   if(lim <= 0) lim = 500;
   if(id == "" || type == "") return;

   if(type == "fetch_candles")    CmdFetchCandles(id, sym, tf, from, to, lim);
   else if(type == "fetch_symbols")CmdFetchSymbols(id);
   else if(type == "overview")    CmdOverview(id, sym, tf == "" ? "H1" : tf);
}

void CmdFetchCandles(string id, string sym, string tfName, string fromS, string toS, int lim) {
   ENUM_TIMEFRAMES tf = NameTF(tfName);
   datetime from = fromS != "" ? (datetime)StringToTime(fromS) : TimeCurrent() - 86400*30;
   datetime to   = toS   != "" ? (datetime)StringToTime(toS)   : TimeCurrent();
   MqlRates r[]; int n = CopyRates(sym, tf, from, to, r);
   if(n <= 0) { POST("/api/sylledge-commands/ack", "{\"command_id\":\"" + id + "\",\"status\":\"no_data\"}"); return; }
   if(n > lim) n = lim;
   string body = "{\"command_id\":\"" + id + "\",\"type\":\"candles\",\"symbol\":\"" + sym + "\",\"timeframe\":\"" + tfName + "\",\"candles\":[";
   for(int i = 0; i < n; i++) {
      body += StringFormat("{\"t\":\"%s\",\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%I64u}",
         ISO(r[i].time), r[i].open, r[i].high, r[i].low, r[i].close, r[i].tick_volume);
      if(i < n-1) body += ",";
   }
   POST("/api/sylledge-commands/response", body + "]}");
}

void CmdFetchSymbols(string id) {
   string syms[]; int n = GetSymbols(syms);
   string body = "{\"command_id\":\"" + id + "\",\"type\":\"symbols\",\"symbols\":[";
   for(int i = 0; i < n; i++) { body += "\"" + syms[i] + "\""; if(i < n-1) body += ","; }
   POST("/api/sylledge-commands/response", body + "]}");
}

void CmdOverview(string id, string sym, string tfName) {
   ENUM_TIMEFRAMES tf = NameTF(tfName);
   MqlRates r[20]; int n = CopyRates(sym, tf, 0, 20, r);
   if(n <= 0) { POST("/api/sylledge-commands/ack", "{\"command_id\":\"" + id + "\",\"status\":\"no_data\"}"); return; }
   double hi = 0, lo = 1e9;
   for(int i = 0; i < n; i++) { if(r[i].high > hi) hi = r[i].high; if(r[i].low < lo) lo = r[i].low; }
   POST("/api/sylledge-commands/response", StringFormat(
      "{\"command_id\":\"%s\",\"type\":\"overview\",\"symbol\":\"%s\",\"close\":%.5f,\"high20\":%.5f,\"low20\":%.5f}",
      id, sym, r[n-1].close, hi, lo));
}

ENUM_TIMEFRAMES NameTF(string n) {
   if(n == "M1")  return PERIOD_M1;
   if(n == "M5")  return PERIOD_M5;
   if(n == "M15") return PERIOD_M15;
   if(n == "H1")  return PERIOD_H1;
   if(n == "H4")  return PERIOD_H4;
   if(n == "D1")  return PERIOD_D1;
   return PERIOD_H1;
}

string ExtractJSON(string json, string key) {
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos == -1) return "";
   int start = pos + StringLen(search);
   int end   = StringFind(json, "\"", start);
   if(end == -1) return "";
   return StringSubstr(json, start, end - start);
}
