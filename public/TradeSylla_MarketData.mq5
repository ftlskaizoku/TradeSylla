//+------------------------------------------------------------------+
//|                                    TradeSylla_MarketData.mq5   |
//|              SYLLEDGE Market Data Feed — ADMIN ONLY             |
//|            Fetches ALL broker pairs: D1, H4, M15, M1            |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property link      "https://tradesylla.vercel.app"
#property version   "1.0"
#property description "SYLLEDGE market data feed. Admin-only EA. Sends OHLCV candles for all broker pairs across D1, H4, M15, M1 to the SYLLEDGE engine."

//── Inputs ────────────────────────────────────────────────────────────────────
input string AdminToken      = "";     // Admin token (required — from TradeSylla admin panel)
input int    CandlesPerTF    = 500;    // Candles per timeframe per symbol (max 1000)
input int    SyncIntervalMin = 60;     // How often to resync in minutes (default 1 hour)
input bool   SyncOnStartup   = true;   // Full sync on EA attach
input bool   VerboseLogging  = false;  // Log every symbol (noisy — keep false normally)
input string CustomSymbols   = "";     // Optional: comma-separated override list (empty = all broker symbols)

//── Constants ─────────────────────────────────────────────────────────────────
#define ENDPOINT_MARKET  "https://tradesylla.vercel.app/api/sylledge-market"
#define EA_VERSION       "1.0"
#define MAX_SYMBOLS      200   // safety cap
#define BATCH_SYMBOLS    5     // symbols per HTTP batch (keep payload size manageable)

//── Timeframes to fetch ───────────────────────────────────────────────────────
ENUM_TIMEFRAMES g_timeframes[4] = { PERIOD_D1, PERIOD_H4, PERIOD_M15, PERIOD_M1 };
string          g_tf_names[4]   = { "D1", "H4", "M15", "M1" };

//── Globals ───────────────────────────────────────────────────────────────────
datetime g_last_sync = 0;
string   g_symbols[];
int      g_symbol_count = 0;

//+------------------------------------------------------------------+
//| Init                                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(AdminToken) < 10)
   {
      Alert("TradeSylla MarketData: AdminToken not set. This EA is for admins only.");
      return INIT_FAILED;
   }

   // Load symbol list
   LoadSymbols();

   EventSetTimer(60); // tick every minute, check if sync needed

   Print("TradeSylla MarketData EA v", EA_VERSION, " initialized.");
   Print("Symbols to sync: ", g_symbol_count,
         " | TFs: D1, H4, M15, M1 | Candles per TF: ", CandlesPerTF,
         " | Sync interval: ", SyncIntervalMin, " min");

   if(SyncOnStartup)
   {
      Print("TradeSylla MarketData: Starting initial full sync...");
      SyncAllSymbols();
   }

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   // Check if sync interval has elapsed
   int elapsed_min = (int)(TimeCurrent() - g_last_sync) / 60;
   if(elapsed_min >= SyncIntervalMin)
   {
      Print("TradeSylla MarketData: Scheduled sync starting (", elapsed_min, "min since last)...");
      SyncAllSymbols();
   }
}

//+------------------------------------------------------------------+
//| Load symbol list from broker or custom input                     |
//+------------------------------------------------------------------+
void LoadSymbols()
{
   ArrayResize(g_symbols, 0);
   g_symbol_count = 0;

   if(StringLen(CustomSymbols) > 5)
   {
      // Parse comma-separated custom list
      string parts[];
      int n = StringSplit(CustomSymbols, ',', parts);
      for(int i = 0; i < n && g_symbol_count < MAX_SYMBOLS; i++)
      {
         string sym = parts[i];
         StringTrimLeft(sym); StringTrimRight(sym);
         if(StringLen(sym) > 0)
         {
            ArrayResize(g_symbols, g_symbol_count + 1);
            g_symbols[g_symbol_count] = sym;
            g_symbol_count++;
         }
      }
      Print("TradeSylla MarketData: Custom symbol list — ", g_symbol_count, " symbols");
      return;
   }

   // Get ALL symbols available from broker
   int total = SymbolsTotal(false); // false = all symbols, not just market watch
   Print("TradeSylla MarketData: Broker has ", total, " total symbols available");

   for(int i = 0; i < total && g_symbol_count < MAX_SYMBOLS; i++)
   {
      string sym = SymbolName(i, false);
      if(StringLen(sym) < 2) continue;

      // Add to market watch so we can fetch data
      SymbolSelect(sym, true);

      ArrayResize(g_symbols, g_symbol_count + 1);
      g_symbols[g_symbol_count] = sym;
      g_symbol_count++;

      if(VerboseLogging) Print("  Added: ", sym);
   }

   Print("TradeSylla MarketData: Loaded ", g_symbol_count, " symbols");
}

//+------------------------------------------------------------------+
//| Sync all symbols — batched to avoid timeouts                     |
//+------------------------------------------------------------------+
void SyncAllSymbols()
{
   if(g_symbol_count == 0) { Print("TradeSylla MarketData: No symbols to sync"); return; }

   int total_batches = (int)MathCeil((double)g_symbol_count / BATCH_SYMBOLS);
   int sent = 0;

   Print("TradeSylla MarketData: Syncing ", g_symbol_count, " symbols in ",
         total_batches, " batches...");

   for(int batch = 0; batch < total_batches; batch++)
   {
      int start = batch * BATCH_SYMBOLS;
      int end   = MathMin(start + BATCH_SYMBOLS, g_symbol_count);

      string batch_data = BuildBatchJSON(start, end);
      if(StringLen(batch_data) < 10) continue;

      string payload = "{\"admin_token\":\"" + AdminToken + "\""
                     + ",\"type\":\"market_data\""
                     + ",\"ea_version\":\"" + EA_VERSION + "\""
                     + ",\"data\":" + batch_data + "}";

      string resp = SendToTradeSylla(payload, ENDPOINT_MARKET);
      sent += (end - start);

      if(VerboseLogging)
         Print("TradeSylla MarketData: Batch ", batch + 1, "/", total_batches,
               " sent (symbols ", start, "-", end, ") → ", StringSubstr(resp, 0, 80));

      // Pause between batches to avoid overwhelming the server
      Sleep(1000);
   }

   g_last_sync = TimeCurrent();
   Print("TradeSylla MarketData: Sync complete — ", sent, " symbols synced at ",
         TimeToString(g_last_sync, TIME_DATE | TIME_MINUTES));
}

//+------------------------------------------------------------------+
//| Build JSON for a batch of symbols                                |
//+------------------------------------------------------------------+
string BuildBatchJSON(int start, int end)
{
   string json = "[";
   bool first_sym = true;

   for(int si = start; si < end; si++)
   {
      string sym = g_symbols[si];
      if(StringLen(sym) == 0) continue;

      // Ensure symbol is in market watch
      if(!SymbolInfoInteger(sym, SYMBOL_SELECT))
         SymbolSelect(sym, true);

      string sym_json = BuildSymbolJSON(sym);
      if(StringLen(sym_json) < 5) continue;

      if(!first_sym) json += ",";
      json += sym_json;
      first_sym = false;
   }

   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Build JSON for a single symbol across all timeframes             |
//+------------------------------------------------------------------+
string BuildSymbolJSON(string sym)
{
   string j = "{";
   j += "\"symbol\":\"" + EscapeJSON(sym) + "\"";
   j += ",\"timeframes\":{";

   bool first_tf = true;
   for(int ti = 0; ti < 4; ti++)
   {
      ENUM_TIMEFRAMES tf = g_timeframes[ti];
      string tf_name     = g_tf_names[ti];

      string candles_json = GetCandlesJSON(sym, tf, CandlesPerTF);
      if(StringLen(candles_json) < 3 || candles_json == "[]") continue;

      if(!first_tf) j += ",";
      j += "\"" + tf_name + "\":" + candles_json;
      first_tf = false;
   }

   j += "}";

   // Add current price
   MqlTick tick;
   if(SymbolInfoTick(sym, tick))
   {
      j += ",\"bid\":"    + DoubleToString(tick.bid, 5);
      j += ",\"ask\":"    + DoubleToString(tick.ask, 5);
      j += ",\"spread\":" + DoubleToString((tick.ask - tick.bid) * 10000, 1);
   }

   j += ",\"synced_at\":\"" + TimeToISO(TimeCurrent()) + "\"";
   j += "}";
   return j;
}

//+------------------------------------------------------------------+
//| Fetch OHLCV candles for a symbol/timeframe                       |
//+------------------------------------------------------------------+
string GetCandlesJSON(string symbol, ENUM_TIMEFRAMES tf, int count)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(symbol, tf, 0, count, rates);
   if(copied <= 0)
   {
      if(VerboseLogging)
         Print("TradeSylla MarketData: No candles for ", symbol, " ", EnumToString(tf));
      return "[]";
   }

   // Reverse to chronological order
   ArraySetAsSeries(rates, false);

   string json = "[";
   for(int i = 0; i < copied; i++)
   {
      if(i > 0) json += ",";
      json += "{";
      json += "\"t\":\"" + TimeToISO(rates[i].time) + "\"";
      json += ",\"o\":"  + DoubleToString(rates[i].open,  5);
      json += ",\"h\":"  + DoubleToString(rates[i].high,  5);
      json += ",\"l\":"  + DoubleToString(rates[i].low,   5);
      json += ",\"c\":"  + DoubleToString(rates[i].close, 5);
      json += ",\"v\":"  + IntegerToString(rates[i].tick_volume);
      json += "}";
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| HTTP POST                                                        |
//+------------------------------------------------------------------+
string SendToTradeSylla(string json_payload, string endpoint)
{
   char   post_data[], result_data[];
   string result_headers;
   string headers = "Content-Type: application/json\r\nX-EA-Version: " + EA_VERSION + "\r\n";

   StringToCharArray(json_payload, post_data, 0, StringLen(json_payload));

   int res = WebRequest("POST", endpoint, headers, 30000, post_data, result_data, result_headers);

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Print("TradeSylla MarketData: WebRequest blocked! Add to whitelist: ", endpoint,
               " in MT5 → Tools → Options → Expert Advisors");
      else
         Print("TradeSylla MarketData: WebRequest error: ", err);
      return "ERROR";
   }

   string response = CharArrayToString(result_data);
   if(res != 200 && res != 201)
      Print("TradeSylla MarketData: HTTP ", res, " → ", StringSubstr(response, 0, 100));

   return response;
}

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string TimeToISO(datetime t)
{
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
      dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

string EscapeJSON(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}
//+------------------------------------------------------------------+
