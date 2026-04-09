//+------------------------------------------------------------------+
//| TradeSylla_MarketData.mq5   v3.5                                 |
//|                                                                    |
//| NEW in v3.5 — PERIODIC GAP-FILL:                                 |
//|  After the initial sync completes, the EA restarts the gap-fill  |
//|  every ReSyncHours hours automatically. This means even if data  |
//|  stopped in 2023, it will catch up on next restart — without     |
//|  deleting any existing records (pure upsert, no duplicates).     |
//|                                                                    |
//| v3.4 — INCREMENTAL SYNC:                                         |
//|  Before loading bars for each sym/tf, queries the API for the    |
//|  latest candle_time already stored. Only fetches bars AFTER      |
//|  that timestamp → fills gaps without re-sending existing data.   |
//|                                                                    |
//|  FullHistorySync=true  → gap-fill from last stored bar           |
//|  FullHistorySync=false → live push only (no gap-fill)            |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "3.50"

input string AdminToken      = "";
input string ServerURL       = "https://tradesylla.vercel.app";
input bool   FullHistorySync = true;
input int    PollInterval    = 10;
input int    LiveInterval    = 60;
input int    SyncDelay       = 80;
input int    ReSyncHours     = 4;   // re-run gap-fill every N hours (0 = disable)

ENUM_TIMEFRAMES TFS[]    = { PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1 };
string          TFNAMES[]= { "M1","M5","M15","H1","H4","D1" };
int HIST_WINDOW[] = { 604800, 2592000, 7776000, 31536000, 94608000, 0 };

// ── Target symbols: canonical name + broker alias candidates ─────────────────
// The EA tries each alias until one resolves in Market Watch.
// Data is always sent using the CANONICAL name so the DB stays consistent.
#define TARGET_COUNT 11
string TARGET_CANONICAL[TARGET_COUNT] = {
   "EURUSD","GBPUSD","XAUUSD","BTCUSD","ETHUSD",
   "US30","US100","UK100","GER30","USOIL","UKOIL"
};
string TARGET_ALIASES[TARGET_COUNT][8] = {
   { "EURUSD","EURUSDm","EURUSD.","EURUSD+","","","","" },
   { "GBPUSD","GBPUSDm","GBPUSD.","GBPUSD+","","","","" },
   { "XAUUSD","XAUUSDm","GOLD","GOLDm","XAUUSD.","","","" },
   { "BTCUSD","BTCUSDm","BTCUSD.","BTC/USD","BTCUSDT","","","" },
   { "ETHUSD","ETHUSDm","ETHUSD.","ETH/USD","ETHUSDT","","","" },
   { "US30","DJ30","DJIA","WS30","USA30","US30m","DJI","" },
   { "USTEC","US100","NAS100","NASDAQ","NAS100m","NDX","US100m","USTECH" },  // Exness = USTEC
   { "UK100","FTSE100","UK100m","FTSE","GBR100","UK100.","","" },
   { "DE30","GER30","GER40","DAX","DAX40","GER30m","GER40m","DE40" },       // Exness = DE30
   { "USOIL","WTI","XTIUSD","CL","OIL","USOILm","USOIL.","" },
   { "UKOIL","BRENT","XBRUSD","UKOIL.","UKOILm","BRN","BRENTOIL","" }
};

// Resolved broker names — filled at OnInit
string g_brokerSym[TARGET_COUNT];
int    g_symCount    = 0;

datetime g_lastLive    = 0;
datetime g_lastPoll    = 0;
datetime g_lastResync  = 0;   // tracks when we last triggered a gap-fill
bool     g_histDone    = false;
int      g_symIdx      = 0;
int      g_tfIdx       = 0;
MqlRates g_rates[];
int      g_ratesLoaded = 0;
int      g_batchStart  = 0;
int      g_retryCount  = 0;
int      MAX_RETRIES   = 3;

int OnInit() {
   if(AdminToken == "") { Alert("TradeSylla MarketData: Set AdminToken"); return INIT_FAILED; }
   Print("TradeSylla MarketData v3.5 starting...");
   Print("ServerURL: ", ServerURL);
   Print("FullHistorySync: ", FullHistorySync ? "YES" : "NO");
   Print("ReSyncHours: ", ReSyncHours, " (0=disabled)");

   // Resolve each target symbol to its broker-specific Market Watch name
   g_symCount = 0;
   for(int i = 0; i < TARGET_COUNT; i++) {
      g_brokerSym[i] = "";
      for(int a = 0; a < 8; a++) {
         string alias = TARGET_ALIASES[i][a];
         if(alias == "") break;
         if(SymbolSelect(alias, true)) {
            g_brokerSym[i] = alias;
            Print("  Resolved: ", TARGET_CANONICAL[i], " -> ", alias);
            g_symCount++;
            break;
         }
      }
      if(g_brokerSym[i] == "")
         Print("  WARNING: Could not resolve ", TARGET_CANONICAL[i], " — not in Market Watch");
   }

   Print("Resolved ", g_symCount, "/", TARGET_COUNT, " target symbols");
   if(g_symCount == 0) { Alert("No target symbols found in Market Watch"); return INIT_FAILED; }

   if(FullHistorySync) {
      Print("One-batch-per-tick sync will start on first timer tick.");
      g_histDone = false; g_symIdx = 0; g_tfIdx = 0;
      g_ratesLoaded = 0;  g_batchStart = 0; g_retryCount = 0;
   } else { g_histDone = true; }
   EventSetTimer(1);
   Print("MarketData EA ready.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int r) {
   EventKillTimer();
   Print("MarketData EA stopped. Progress: ", g_symIdx, "/", g_symCount);
}

void OnTimer() {
   datetime now = TimeCurrent();

   // Gap-fill pass (initial or periodic)
   if(!g_histDone && FullHistorySync) { ProgressiveSyncStep(); return; }

   // Periodic re-gap-fill: once g_histDone, restart every ReSyncHours
   if(FullHistorySync && ReSyncHours > 0) {
      datetime resyncInterval = (datetime)(ReSyncHours * 3600);
      if(g_lastResync == 0) g_lastResync = now; // init on first live tick
      if(now - g_lastResync >= resyncInterval) {
         Print("Periodic re-sync triggered (every ", ReSyncHours, "h). Restarting gap-fill...");
         g_histDone = false;
         g_symIdx = 0; g_tfIdx = 0;
         g_ratesLoaded = 0; g_batchStart = 0; g_retryCount = 0;
         g_lastResync = now;
         return;
      }
   }

   if(now - g_lastPoll >= PollInterval) { g_lastPoll = now; PollCommands(); }
   if(now - g_lastLive >= LiveInterval) { g_lastLive = now; PushLive(); }
}

void ProgressiveSyncStep() {
   // Skip unresolved symbols
   while(g_symIdx < TARGET_COUNT && g_brokerSym[g_symIdx] == "") g_symIdx++;

   if(g_symIdx >= TARGET_COUNT) {
      g_histDone = true;
      Print("=== Gap-fill sync COMPLETE: ", TARGET_COUNT, " symbols x ", ArraySize(TFS), " TFs ===");
      return;
   }

   string brokerSym    = g_brokerSym[g_symIdx];
   string canonicalSym = TARGET_CANONICAL[g_symIdx];

   // Phase A: load bars once per sym/tf — from LAST STORED bar, not fixed window
   if(g_ratesLoaded == 0) {
      // Ask the server for the latest candle_time we already have
      datetime lastStored = GetLastStoredTime(canonicalSym, TFNAMES[g_tfIdx]);

      datetime fromDt;
      if(lastStored > 0) {
         // Gap-fill: start 1 bar after what we already have
         fromDt = lastStored + PeriodSeconds(TFS[g_tfIdx]);
         Print("Gap-fill ", canonicalSym, " ", TFNAMES[g_tfIdx],
               " from ", TimeToString(fromDt, TIME_DATE|TIME_MINUTES));
      } else {
         // No data yet — use original history window
         fromDt = (HIST_WINDOW[g_tfIdx] == 0)
            ? D'2015.01.01'
            : TimeCurrent() - HIST_WINDOW[g_tfIdx];
         Print("Full sync ", canonicalSym, " ", TFNAMES[g_tfIdx],
               " from ", TimeToString(fromDt, TIME_DATE|TIME_MINUTES));
      }

      // If fromDt is recent (within 2 bars), nothing to do — skip
      if(fromDt >= TimeCurrent() - PeriodSeconds(TFS[g_tfIdx]) * 2) {
         Print("Already up-to-date: ", canonicalSym, " ", TFNAMES[g_tfIdx]);
         AdvanceSyncIndex(false); return;
      }

      ArrayResize(g_rates, 0);
      g_ratesLoaded = CopyRates(brokerSym, TFS[g_tfIdx], fromDt, TimeCurrent(), g_rates);
      if(g_ratesLoaded <= 0) {
         g_retryCount++;
         if(g_retryCount <= MAX_RETRIES) {
            Print("No new bars: ", canonicalSym, "(", brokerSym, ") ",
                  TFNAMES[g_tfIdx], " retry ", g_retryCount);
            Sleep(300); return;
         }
         Print("Skip ", canonicalSym, " ", TFNAMES[g_tfIdx], " after ", MAX_RETRIES, " retries");
         g_ratesLoaded = 0; g_retryCount = 0;
         AdvanceSyncIndex(false); return;
      }
      g_batchStart = 0; g_retryCount = 0;
      Print("Sending ", g_ratesLoaded, " new bars: ",
            canonicalSym, " ", TFNAMES[g_tfIdx],
            "  [", g_symIdx+1, "/", TARGET_COUNT, "]");
   }

   // Phase B: send exactly one batch — always use canonical symbol name
   int n = MathMin(500, g_ratesLoaded - g_batchStart);
   MqlRates batch[]; ArrayResize(batch, n);
   ArrayCopy(batch, g_rates, 0, g_batchStart, n);
   string resp = POST("/api/sylledge-market", CandlesJSON(canonicalSym, TFNAMES[g_tfIdx], batch, n));
   if(StringFind(resp, "\"success\":true") == -1 && resp != "")
      Print("Batch warn: ", canonicalSym, " ", TFNAMES[g_tfIdx], "@", g_batchStart,
            " -> ", StringSubstr(resp, 0, 120));
   g_batchStart += n;
   Sleep(SyncDelay);

   // Phase C: advance when sym/tf is complete
   if(g_batchStart >= g_ratesLoaded) {
      ArrayResize(g_rates, 0); g_ratesLoaded = 0; g_batchStart = 0;
      AdvanceSyncIndex(false);
   }
}

// Query the API for the latest candle_time stored for a given symbol/TF
// Returns 0 if nothing stored yet
datetime GetLastStoredTime(string sym, string tf) {
   string path = "/api/sylledge-market?symbol=" + sym +
                 "&timeframe=" + tf + "&limit=1&order=desc";
   string resp = HTTGET(path);
   if(resp == "" || resp == "[]" || resp == "null") return 0;

   // Parse first "candle_time" value from JSON array
   string key = "\"candle_time\":\"";
   int pos = StringFind(resp, key);
   if(pos == -1) return 0;
   int start = pos + StringLen(key);
   int end   = StringFind(resp, "\"", start);
   if(end == -1) return 0;

   string dtStr = StringSubstr(resp, start, end - start);
   // dtStr is ISO: "2023-11-15T14:00:00" — convert to datetime
   dtStr = StringSubstr(dtStr, 0, 19); // strip timezone suffix if any
   StringReplace(dtStr, "T", " ");
   return StringToTime(dtStr);
}

void AdvanceSyncIndex(bool skipAll) {
   if(skipAll) { g_symIdx++; g_tfIdx = 0; return; }
   g_tfIdx++;
   if(g_tfIdx >= ArraySize(TFS)) { g_tfIdx = 0; g_symIdx++; }
}

void PushLive() {
   for(int i = 0; i < TARGET_COUNT; i++) {
      if(g_brokerSym[i] == "") continue;
      for(int t = 0; t < ArraySize(TFS); t++) {
         MqlRates r[2];
         if(CopyRates(g_brokerSym[i], TFS[t], 0, 2, r) < 2) continue;
         MqlRates bar[1]; bar[0] = r[1];
         // Always send with canonical name
         POST("/api/sylledge-market", CandlesJSON(TARGET_CANONICAL[i], TFNAMES[t], bar, 1));
         Sleep(10);
      }
   }
}

// CmdFetchSymbols now returns canonical names
void CmdFetchSymbolsInner(string id) {
   string body="{\"command_id\":\""+id+"\",\"type\":\"symbols\",\"symbols\":[";
   int first = 1;
   for(int i = 0; i < TARGET_COUNT; i++) {
      if(g_brokerSym[i] == "") continue;
      if(!first) body += ",";
      body += "\"" + TARGET_CANONICAL[i] + "\"";
      first = 0;
   }
   POST("/api/sylledge-commands/response", body + "]}");
}

string POST(string path, string body) {
   string hdr = "Content-Type: application/json\r\nAuthorization: Bearer " + AdminToken;
   char post[]; StringToCharArray(body, post, 0, StringLen(body));
   char res[]; string rh;
   int c = WebRequest("POST", ServerURL+path, hdr, 15000, post, res, rh);
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
   char empty[1]; char res[]; string rh;
   int c = WebRequest("GET", ServerURL+path, hdr, 10000, empty, res, rh);
   if(c == -1) { Print("GET error ", GetLastError(), " on ", path); return ""; }
   return CharArrayToString(res);
}

string CandlesJSON(string sym, string tf, MqlRates &r[], int n) {
   string s = "{\"symbol\":\""+sym+"\",\"timeframe\":\""+tf+"\",\"candles\":[";
   for(int i = 0; i < n; i++) {
      s += StringFormat("{\"t\":\"%s\",\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%I64u}",
         ISO(r[i].time),r[i].open,r[i].high,r[i].low,r[i].close,r[i].tick_volume);
      if(i < n-1) s += ",";
   }
   return s + "]}";
}

string ISO(datetime t) {
   MqlDateTime d; TimeToStruct(t, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",d.year,d.mon,d.day,d.hour,d.min,d.sec);
}

void PollCommands() {
   string resp = HTTGET("/api/sylledge-commands/pending");
   if(resp == "" || resp == "[]" || resp == "null") return;
   int pos = 0;
   while(pos < StringLen(resp)) {
      int s = StringFind(resp, "{", pos); if(s == -1) break;
      int e = FindClosingBrace(resp, s);  if(e == -1) break;
      ExecCommand(StringSubstr(resp, s, e-s+1)); pos = e+1;
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
   string id=ExtractJSON(cmd,"id"), type=ExtractJSON(cmd,"type");
   string sym=ExtractJSON(cmd,"symbol"), tf=ExtractJSON(cmd,"timeframe");
   string from=ExtractJSON(cmd,"from"), to=ExtractJSON(cmd,"to");
   string limS=ExtractJSON(cmd,"limit");
   int lim = limS!="" ? (int)StringToInteger(limS) : 500;
   if(lim<=0) lim=500;
   if(id=="" || type=="") return;
   if(type=="fetch_candles")     CmdFetchCandles(id,sym,tf,from,to,lim);
   else if(type=="fetch_symbols") CmdFetchSymbolsInner(id);
   else if(type=="overview")     CmdOverview(id,sym,tf==""?"H1":tf);
}

void CmdFetchCandles(string id,string sym,string tfName,string fromS,string toS,int lim) {
   ENUM_TIMEFRAMES tf=NameTF(tfName);
   datetime from=fromS!=""?(datetime)StringToTime(fromS):TimeCurrent()-86400*30;
   datetime to=toS!=""?(datetime)StringToTime(toS):TimeCurrent();
   MqlRates r[]; int n=CopyRates(sym,tf,from,to,r);
   if(n<=0){POST("/api/sylledge-commands/ack","{\"command_id\":\""+id+"\",\"status\":\"no_data\"}");return;}
   if(n>lim) n=lim;
   string body="{\"command_id\":\""+id+"\",\"type\":\"candles\",\"symbol\":\""+sym+
               "\",\"timeframe\":\""+tfName+"\",\"candles\":[";
   for(int i=0;i<n;i++){
      body+=StringFormat("{\"t\":\"%s\",\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%I64u}",
         ISO(r[i].time),r[i].open,r[i].high,r[i].low,r[i].close,r[i].tick_volume);
      if(i<n-1) body+=",";
   }
   POST("/api/sylledge-commands/response",body+"]}");
}

void CmdOverview(string id,string sym,string tfName) {
   ENUM_TIMEFRAMES tf=NameTF(tfName);
   MqlRates r[20]; int n=CopyRates(sym,tf,0,20,r);
   if(n<=0){POST("/api/sylledge-commands/ack","{\"command_id\":\""+id+"\",\"status\":\"no_data\"}");return;}
   double hi=0,lo=1e9;
   for(int i=0;i<n;i++){if(r[i].high>hi)hi=r[i].high;if(r[i].low<lo)lo=r[i].low;}
   POST("/api/sylledge-commands/response",StringFormat(
      "{\"command_id\":\"%s\",\"type\":\"overview\",\"symbol\":\"%s\",\"close\":%.5f,\"high20\":%.5f,\"low20\":%.5f}",
      id,sym,r[n-1].close,hi,lo));
}

ENUM_TIMEFRAMES NameTF(string n) {
   if(n=="M1")  return PERIOD_M1; if(n=="M5")  return PERIOD_M5;
   if(n=="M15") return PERIOD_M15; if(n=="H1") return PERIOD_H1;
   if(n=="H4")  return PERIOD_H4; if(n=="D1")  return PERIOD_D1;
   return PERIOD_H1;
}

string ExtractJSON(string json,string key) {
   string search="\""+key+"\":\"";
   int pos=StringFind(json,search); if(pos==-1) return "";
   int start=pos+StringLen(search);
   int end=StringFind(json,"\"",start); if(end==-1) return "";
   return StringSubstr(json,start,end-start);
}
