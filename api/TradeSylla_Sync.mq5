//+------------------------------------------------------------------+
//|                                         TradeSylla_Sync.mq5    |
//|                         Auto-sync trades + charts to TradeSylla |
//|                              https://tradesylla.vercel.app      |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property link      "https://tradesylla.vercel.app"
#property version   "2.0"
#property description "Syncs closed trades and chart context to TradeSylla."

//── Input parameters ────────────────────────────────────────────────
input string UserToken        = "";    // Your TradeSylla User Token (required)
input bool   SyncHistory      = true;  // Sync full account history on first run
input int    CandlesBefore    = 50;    // Candles before trade entry to include
input int    CandlesAfter     = 20;    // Candles after trade exit to include
input string ChartTimeframe   = "H1"; // Timeframe for chart context (M1/M5/M15/H1/H4/D1)
input int    SyncIntervalSec  = 30;   // How often to check for new closed trades (seconds)
input bool   VerboseLogging   = true;  // Print sync details to Experts log

//── Constants ────────────────────────────────────────────────────────
#define ENDPOINT       "https://tradesylla.vercel.app/api/ea-sync"
#define EA_VERSION     "2.0"
#define MAX_BATCH_SIZE 50  // trades per HTTP request (history batching)

//── Globals ──────────────────────────────────────────────────────────
datetime g_last_bar_time   = 0;
bool     g_history_synced  = false;
ulong    g_synced_tickets[];  // tracks which deal tickets we already sent

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(UserToken) < 10)
   {
      Alert("TradeSylla: UserToken is not set. Please enter your token in EA settings.");
      return INIT_FAILED;
   }

   ArrayResize(g_synced_tickets, 0);
   EventSetTimer(SyncIntervalSec);

   if(VerboseLogging)
      Print("TradeSylla EA v", EA_VERSION, " initialized. Token: ", StringSubstr(UserToken,0,8), "...");

   // Send a heartbeat so the user sees "EA Connected" in the app
   SendHeartbeat();

   // Sync full history on first attach (if enabled)
   if(SyncHistory && !g_history_synced)
   {
      Print("TradeSylla: Starting full history sync...");
      SyncFullHistory();
      g_history_synced = true;
   }

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
}

//+------------------------------------------------------------------+
//| Timer — periodic heartbeat so app knows EA is alive             |
//+------------------------------------------------------------------+
void OnTimer()
{
   SendHeartbeat();
}

//+------------------------------------------------------------------+
//| Trade transaction — fires immediately when a trade closes        |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
{
   // Only care about new deals being added
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   ulong deal_ticket = trans.deal;
   if(deal_ticket == 0) return;

   // Select the deal in history
   if(!HistoryDealSelect(deal_ticket)) return;

   // Only process closing deals (DEAL_ENTRY_OUT = position close)
   long entry = HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) return;

   // Skip if already synced
   if(IsTicketSynced(deal_ticket)) return;

   if(VerboseLogging)
      Print("TradeSylla: Trade closed, syncing deal #", deal_ticket);

   SyncDeal(deal_ticket);
   MarkTicketSynced(deal_ticket);
}

//+------------------------------------------------------------------+
//| Sync a single closed deal (with candles)                         |
//+------------------------------------------------------------------+
void SyncDeal(ulong deal_ticket)
{
   if(!HistoryDealSelect(deal_ticket))
   {
      // Try to load it from full history
      datetime from = D'2000.01.01';
      datetime to   = TimeCurrent() + 86400;
      HistorySelect(from, to);
      if(!HistoryDealSelect(deal_ticket)) return;
   }

   string symbol    = HistoryDealGetString(deal_ticket, DEAL_SYMBOL);
   double price     = HistoryDealGetDouble(deal_ticket, DEAL_PRICE);
   double profit    = HistoryDealGetDouble(deal_ticket, DEAL_PROFIT);
   double swap      = HistoryDealGetDouble(deal_ticket, DEAL_SWAP);
   double commission= HistoryDealGetDouble(deal_ticket, DEAL_COMMISSION);
   double volume    = HistoryDealGetDouble(deal_ticket, DEAL_VOLUME);
   ulong  order     = HistoryDealGetInteger(deal_ticket, DEAL_ORDER);
   ulong  pos_id    = HistoryDealGetInteger(deal_ticket, DEAL_POSITION_ID);
   datetime close_time = (datetime)HistoryDealGetInteger(deal_ticket, DEAL_TIME);

   double total_pnl = profit + swap + commission;

   // Find the matching open deal for entry price & direction
   double entry_price = price;
   string direction   = "BUY";
   datetime entry_time = close_time;

   // Search all deals for this position's opening deal
   int total_deals = HistoryDealsTotal();
   for(int i = 0; i < total_deals; i++)
   {
      ulong h_ticket = HistoryDealGetTicket(i);
      if(h_ticket == 0) continue;
      ulong h_pos = HistoryDealGetInteger(h_ticket, DEAL_POSITION_ID);
      if(h_pos != pos_id) continue;
      long h_entry = HistoryDealGetInteger(h_ticket, DEAL_ENTRY);
      if(h_entry == DEAL_ENTRY_IN)
      {
         entry_price = HistoryDealGetDouble(h_ticket, DEAL_PRICE);
         entry_time  = (datetime)HistoryDealGetInteger(h_ticket, DEAL_TIME);
         long h_type = HistoryDealGetInteger(h_ticket, DEAL_TYPE);
         direction   = (h_type == DEAL_TYPE_BUY) ? "BUY" : "SELL";
         break;
      }
   }

   // Calculate pips
   double pips = CalcPips(symbol, MathAbs(price - entry_price));

   // Determine outcome
   string outcome = "BREAKEVEN";
   if(total_pnl > 0.001)  outcome = "WIN";
   if(total_pnl < -0.001) outcome = "LOSS";

   // Session based on entry hour (UTC)
   MqlDateTime dt_struct;
   TimeToStruct(entry_time, dt_struct);
   string session = GetSession(dt_struct.hour);

   // Get chart candles around this trade
   ENUM_TIMEFRAMES tf = StringToTimeframe(ChartTimeframe);
   string candles_json = GetCandlesJSON(symbol, tf, entry_time, close_time);

   // Build trade JSON
   string trade_json = "{";
   trade_json += "\"mt5_ticket\":\""   + IntegerToString((long)order) + "\",";
   trade_json += "\"symbol\":\""       + EscapeJSON(symbol) + "\",";
   trade_json += "\"direction\":\""    + direction + "\",";
   trade_json += "\"entry_price\":"    + DoubleToString(entry_price, 5) + ",";
   trade_json += "\"exit_price\":"     + DoubleToString(price, 5) + ",";
   trade_json += "\"pnl\":"            + DoubleToString(NormalizeDouble(total_pnl,2), 2) + ",";
   trade_json += "\"pips\":"           + DoubleToString(pips, 1) + ",";
   trade_json += "\"volume\":"         + DoubleToString(volume, 2) + ",";
   trade_json += "\"outcome\":\""      + outcome + "\",";
   trade_json += "\"session\":\""      + session + "\",";
   trade_json += "\"timeframe\":\""    + ChartTimeframe + "\",";
   trade_json += "\"entry_time\":\""   + TimeToISO(entry_time) + "\",";
   trade_json += "\"exit_time\":\""    + TimeToISO(close_time) + "\",";
   trade_json += "\"quality\":5,";
   trade_json += "\"notes\":\"MT5 auto-sync\",";
   trade_json += "\"candles\":"        + candles_json;
   trade_json += "}";

   // Wrap in payload
   string payload = "{";
   payload += "\"token\":\""  + UserToken + "\",";
   payload += "\"type\":\"trade\",";
   payload += "\"trades\":["  + trade_json + "]";
   payload += "}";

   SendToTradeSylla(payload);
}

//+------------------------------------------------------------------+
//| Sync full account history (all closed trades)                    |
//+------------------------------------------------------------------+
void SyncFullHistory()
{
   datetime from = D'2000.01.01';
   datetime to   = TimeCurrent() + 86400;

   if(!HistorySelect(from, to))
   {
      Print("TradeSylla: Failed to load history.");
      return;
   }

   int total_deals = HistoryDealsTotal();
   if(VerboseLogging)
      Print("TradeSylla: Processing ", total_deals, " historical deals...");

   // Build a map of position_id → open deal info
   // We collect all ENTRY_IN deals first
   struct OpenDealInfo { double price; datetime time; int type; };

   // Then process ENTRY_OUT deals in batches
   string trades_batch = "";
   int    batch_count  = 0;
   int    total_sent   = 0;

   for(int i = 0; i < total_deals; i++)
   {
      ulong h_ticket = HistoryDealGetTicket(i);
      if(h_ticket == 0) continue;

      long entry = HistoryDealGetInteger(h_ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      string symbol    = HistoryDealGetString(h_ticket,  DEAL_SYMBOL);
      double price     = HistoryDealGetDouble(h_ticket,  DEAL_PRICE);
      double profit    = HistoryDealGetDouble(h_ticket,  DEAL_PROFIT);
      double swap      = HistoryDealGetDouble(h_ticket,  DEAL_SWAP);
      double commission= HistoryDealGetDouble(h_ticket,  DEAL_COMMISSION);
      double volume    = HistoryDealGetDouble(h_ticket,  DEAL_VOLUME);
      ulong  order     = HistoryDealGetInteger(h_ticket, DEAL_ORDER);
      ulong  pos_id    = HistoryDealGetInteger(h_ticket, DEAL_POSITION_ID);
      datetime close_t = (datetime)HistoryDealGetInteger(h_ticket, DEAL_TIME);

      double total_pnl = profit + swap + commission;

      // Find matching open deal
      double entry_price = price;
      string direction   = "BUY";
      datetime entry_t   = close_t;

      for(int j = 0; j < total_deals; j++)
      {
         ulong jt = HistoryDealGetTicket(j);
         if(jt == 0) continue;
         if(HistoryDealGetInteger(jt, DEAL_POSITION_ID) != (long)pos_id) continue;
         if(HistoryDealGetInteger(jt, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         entry_price = HistoryDealGetDouble(jt, DEAL_PRICE);
         entry_t     = (datetime)HistoryDealGetInteger(jt, DEAL_TIME);
         direction   = (HistoryDealGetInteger(jt, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
         break;
      }

      double pips    = CalcPips(symbol, MathAbs(price - entry_price));
      string outcome = (total_pnl > 0.001) ? "WIN" : (total_pnl < -0.001) ? "LOSS" : "BREAKEVEN";

      MqlDateTime dt_struct;
      TimeToStruct(entry_t, dt_struct);
      string session = GetSession(dt_struct.hour);

      // Get candles
      ENUM_TIMEFRAMES tf = StringToTimeframe(ChartTimeframe);
      string candles_json = GetCandlesJSON(symbol, tf, entry_t, close_t);

      string trade_json = "{";
      trade_json += "\"mt5_ticket\":\""  + IntegerToString((long)order) + "\",";
      trade_json += "\"symbol\":\""      + EscapeJSON(symbol) + "\",";
      trade_json += "\"direction\":\""   + direction + "\",";
      trade_json += "\"entry_price\":"   + DoubleToString(entry_price, 5) + ",";
      trade_json += "\"exit_price\":"    + DoubleToString(price, 5) + ",";
      trade_json += "\"pnl\":"           + DoubleToString(NormalizeDouble(total_pnl,2), 2) + ",";
      trade_json += "\"pips\":"          + DoubleToString(pips, 1) + ",";
      trade_json += "\"volume\":"        + DoubleToString(volume, 2) + ",";
      trade_json += "\"outcome\":\""     + outcome + "\",";
      trade_json += "\"session\":\""     + session + "\",";
      trade_json += "\"timeframe\":\""   + ChartTimeframe + "\",";
      trade_json += "\"entry_time\":\""  + TimeToISO(entry_t) + "\",";
      trade_json += "\"exit_time\":\""   + TimeToISO(close_t) + "\",";
      trade_json += "\"quality\":5,";
      trade_json += "\"notes\":\"MT5 history import\",";
      trade_json += "\"candles\":"       + candles_json;
      trade_json += "}";

      if(batch_count > 0) trades_batch += ",";
      trades_batch += trade_json;
      batch_count++;

      // Send in batches of MAX_BATCH_SIZE
      if(batch_count >= MAX_BATCH_SIZE)
      {
         string payload = "{\"token\":\"" + UserToken + "\",\"type\":\"history\",\"trades\":[" + trades_batch + "]}";
         SendToTradeSylla(payload);
         total_sent  += batch_count;
         trades_batch = "";
         batch_count  = 0;
         if(VerboseLogging)
            Print("TradeSylla: Sent batch of ", MAX_BATCH_SIZE, " trades (", total_sent, " total so far)");
      }
   }

   // Send remaining trades
   if(batch_count > 0)
   {
      string payload = "{\"token\":\"" + UserToken + "\",\"type\":\"history\",\"trades\":[" + trades_batch + "]}";
      SendToTradeSylla(payload);
      total_sent += batch_count;
   }

   if(VerboseLogging)
      Print("TradeSylla: History sync complete — ", total_sent, " trades sent.");
}

//+------------------------------------------------------------------+
//| Send heartbeat so app knows EA is active                         |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
   double profit   = AccountInfoDouble(ACCOUNT_PROFIT);
   string name     = AccountInfoString(ACCOUNT_NAME);
   string server   = AccountInfoString(ACCOUNT_SERVER);
   string company  = AccountInfoString(ACCOUNT_COMPANY);
   long   login    = AccountInfoInteger(ACCOUNT_LOGIN);
   long   leverage = AccountInfoInteger(ACCOUNT_LEVERAGE);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   bool   is_demo  = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);

   string payload = "{";
   payload += "\"token\":\""   + UserToken + "\",";
   payload += "\"type\":\"heartbeat\",";
   payload += "\"account\":{";
   payload += "\"login\":"     + IntegerToString(login) + ",";
   payload += "\"name\":\""    + EscapeJSON(name) + "\",";
   payload += "\"server\":\""  + EscapeJSON(server) + "\",";
   payload += "\"broker\":\""  + EscapeJSON(company) + "\",";
   payload += "\"balance\":"   + DoubleToString(balance, 2) + ",";
   payload += "\"equity\":"    + DoubleToString(equity, 2) + ",";
   payload += "\"profit\":"    + DoubleToString(profit, 2) + ",";
   payload += "\"leverage\":"  + IntegerToString(leverage) + ",";
   payload += "\"currency\":\"" + EscapeJSON(currency) + "\",";
   payload += "\"is_demo\":"   + (is_demo ? "true" : "false");
   payload += "}}";

   SendToTradeSylla(payload);
}

//+------------------------------------------------------------------+
//| HTTP POST to TradeSylla endpoint                                 |
//+------------------------------------------------------------------+
bool SendToTradeSylla(string json_payload)
{
   char   post_data[];
   char   result_data[];
   string result_headers;

   string headers = "Content-Type: application/json\r\nX-EA-Version: " + EA_VERSION + "\r\n";

   // Convert string to char array
   StringToCharArray(json_payload, post_data, 0, StringLen(json_payload));

   int res = WebRequest(
      "POST",
      ENDPOINT,
      headers,
      10000,           // 10 second timeout
      post_data,
      result_data,
      result_headers
   );

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Print("TradeSylla: WebRequest blocked! Go to MT5 → Tools → Options → Expert Advisors → Allow WebRequest for: ", ENDPOINT);
      else
         Print("TradeSylla: WebRequest error code: ", err);
      return false;
   }

   if(res != 200 && res != 201)
   {
      string response = CharArrayToString(result_data);
      Print("TradeSylla: Server returned HTTP ", res, ": ", StringSubstr(response, 0, 200));
      return false;
   }

   if(VerboseLogging)
   {
      string response = CharArrayToString(result_data);
      Print("TradeSylla: Sync OK → ", StringSubstr(response, 0, 150));
   }
   return true;
}

//+------------------------------------------------------------------+
//| Get OHLCV candles around a trade as JSON array                   |
//+------------------------------------------------------------------+
string GetCandlesJSON(string symbol, ENUM_TIMEFRAMES tf, datetime entry_time, datetime exit_time)
{
   // Calculate how many bars back we need
   int tf_seconds  = PeriodSeconds(tf);
   datetime from_t = entry_time - (datetime)(CandlesBefore * tf_seconds);
   datetime to_t   = exit_time  + (datetime)(CandlesAfter  * tf_seconds);
   int total_bars  = CandlesBefore + CandlesAfter + 20; // small buffer

   MqlRates rates[];
   ArraySetAsSeries(rates, false);

   int copied = CopyRates(symbol, tf, from_t, to_t, rates);
   if(copied <= 0)
   {
      if(VerboseLogging)
         Print("TradeSylla: No candles available for ", symbol, " ", EnumToString(tf));
      return "[]";
   }

   string json = "[";
   for(int i = 0; i < copied; i++)
   {
      if(i > 0) json += ",";
      json += "{";
      json += "\"t\":\""  + TimeToISO(rates[i].time) + "\",";
      json += "\"o\":"    + DoubleToString(rates[i].open,  5) + ",";
      json += "\"h\":"    + DoubleToString(rates[i].high,  5) + ",";
      json += "\"l\":"    + DoubleToString(rates[i].low,   5) + ",";
      json += "\"c\":"    + DoubleToString(rates[i].close, 5) + ",";
      json += "\"v\":"    + IntegerToString(rates[i].tick_volume);
      json += "}";
   }
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES StringToTimeframe(string tf_str)
{
   if(tf_str == "M1")  return PERIOD_M1;
   if(tf_str == "M5")  return PERIOD_M5;
   if(tf_str == "M15") return PERIOD_M15;
   if(tf_str == "M30") return PERIOD_M30;
   if(tf_str == "H1")  return PERIOD_H1;
   if(tf_str == "H4")  return PERIOD_H4;
   if(tf_str == "D1")  return PERIOD_D1;
   return PERIOD_H1;
}

string GetSession(int hour_utc)
{
   if(hour_utc >= 0  && hour_utc <  8) return "ASIAN";
   if(hour_utc >= 7  && hour_utc < 12) return "LONDON";
   if(hour_utc >= 12 && hour_utc < 17) return "NEW_YORK";
   if(hour_utc >= 21)                  return "SYDNEY";
   return "LONDON";
}

double CalcPips(string symbol, double price_diff)
{
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double pip   = (digits == 5 || digits == 3) ? point * 10 : point;
   if(pip <= 0) return 0;
   return NormalizeDouble(price_diff / pip, 1);
}

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
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}

bool IsTicketSynced(ulong ticket)
{
   int size = ArraySize(g_synced_tickets);
   for(int i = 0; i < size; i++)
      if(g_synced_tickets[i] == ticket) return true;
   return false;
}

void MarkTicketSynced(ulong ticket)
{
   int size = ArraySize(g_synced_tickets);
   ArrayResize(g_synced_tickets, size + 1);
   g_synced_tickets[size] = ticket;
}
//+------------------------------------------------------------------+
