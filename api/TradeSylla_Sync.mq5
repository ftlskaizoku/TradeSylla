//+------------------------------------------------------------------+
//|                                         TradeSylla_Sync.mq5    |
//|                         Auto-sync trades + charts to TradeSylla |
//|                              https://tradesylla.vercel.app      |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property link      "https://tradesylla.vercel.app"
#property version   "3.1"
#property description "Syncs closed trades (with SL/TP) and chart context to TradeSylla."

//── Input parameters ────────────────────────────────────────────────
input string UserToken        = "";     // Your TradeSylla User Token (required)
input bool   SyncHistory      = true;   // Sync full account history on every restart
input int    CandlesBefore    = 60;     // Candles before trade entry
input int    CandlesAfter     = 30;     // Candles after trade exit
input string ChartTimeframe   = "M15";  // Chart timeframe — match your trading TF
input int    SyncIntervalSec  = 30;     // Heartbeat interval (seconds)
input bool   VerboseLogging   = true;   // Print details to Experts log
input bool   ForceResync     = false;  // Re-sync ALL history (ignores duplicates — use once to fix missing symbols)
input bool   SkipCandles     = false;  // Skip candle fetch — faster re-sync, no chart data

//── Constants ────────────────────────────────────────────────────────
#define ENDPOINT       "https://tradesylla.vercel.app/api/ea-sync"
#define EA_VERSION     "3.1"
#define MAX_BATCH_SIZE 25   // reduced from 50 — avoids HTTP timeout on large history

//── Globals ──────────────────────────────────────────────────────────
ulong g_synced_tickets[];

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

   Print("TradeSylla EA v", EA_VERSION, " initialized. Token: ", StringSubstr(UserToken,0,8), "...");
   Print("TradeSylla: Chart timeframe = ", ChartTimeframe, " | Candles before = ", CandlesBefore, " | after = ", CandlesAfter);

   SendHeartbeat();

   if(SyncHistory)
   {
      Print("TradeSylla: Starting full history sync...");
      SyncFullHistory();
   }

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer() { SendHeartbeat(); }

//+------------------------------------------------------------------+
//| New closed trade fires here immediately                          |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   ulong deal_ticket = trans.deal;
   if(deal_ticket == 0) return;
   if(!HistoryDealSelect(deal_ticket)) return;

   long entry = HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) return;
   if(IsTicketSynced(deal_ticket)) return;

   Print("TradeSylla: Trade closed — syncing deal #", deal_ticket);
   SyncDeal(deal_ticket);
   MarkTicketSynced(deal_ticket);
}

//+------------------------------------------------------------------+
//| Fetch SL & TP from the order that opened this position          |
//+------------------------------------------------------------------+
void GetSLTP(ulong pos_id, double &sl_out, double &tp_out)
{
   sl_out = 0;
   tp_out = 0;

   // Search all history orders for this position
   int total_orders = HistoryOrdersTotal();
   for(int i = 0; i < total_orders; i++)
   {
      ulong ord_ticket = HistoryOrderGetTicket(i);
      if(ord_ticket == 0) continue;
      ulong ord_pos = HistoryOrderGetInteger(ord_ticket, ORDER_POSITION_ID);
      if(ord_pos != pos_id) continue;

      double sl = HistoryOrderGetDouble(ord_ticket, ORDER_SL);
      double tp = HistoryOrderGetDouble(ord_ticket, ORDER_TP);

      // Take first non-zero values found
      if(sl > 0 && sl_out == 0) sl_out = sl;
      if(tp > 0 && tp_out == 0) tp_out = tp;
      if(sl_out > 0 && tp_out > 0) break;
   }
}

//+------------------------------------------------------------------+
//| Build one trade JSON object (used by both live & history sync)   |
//+------------------------------------------------------------------+
string BuildTradeJSON(
   ulong    order,
   string   symbol,
   string   direction,
   double   entry_price,
   double   exit_price,
   double   sl,
   double   tp,
   double   gross_pnl,
   double   commission,
   double   swap,
   double   total_pnl,
   double   volume,
   string   outcome,
   string   session,
   datetime entry_t,
   datetime close_t,
   string   notes_tag
)
{
   double pips = CalcPips(symbol, MathAbs(exit_price - entry_price));

   // Risk:Reward calculation
   double rr = 0;
   if(sl > 0 && tp > 0)
   {
      double risk   = MathAbs(entry_price - sl);
      double reward = MathAbs(tp - entry_price);
      if(risk > 0) rr = NormalizeDouble(reward / risk, 2);
   }

   // SL pips & TP pips
   double sl_pips = (sl > 0) ? CalcPips(symbol, MathAbs(entry_price - sl)) : 0;
   double tp_pips = (tp > 0) ? CalcPips(symbol, MathAbs(tp - entry_price)) : 0;

   // Duration in minutes
   long duration_min = (long)(close_t - entry_t) / 60;

   // Candles at configured timeframe
   ENUM_TIMEFRAMES tf = StringToTimeframe(ChartTimeframe);
   string candles_json = GetCandlesJSON(symbol, tf, entry_t, close_t);

   string j = "{";
   j += "\"mt5_ticket\":\""  + IntegerToString((long)order) + "\",";
   j += "\"symbol\":\""      + EscapeJSON(symbol) + "\",";
   j += "\"direction\":\""   + direction + "\",";
   j += "\"entry_price\":"   + DoubleToString(entry_price, 5) + ",";
   j += "\"exit_price\":"    + DoubleToString(exit_price,  5) + ",";
   j += "\"sl\":"            + DoubleToString(sl,          5) + ",";
   j += "\"tp\":"            + DoubleToString(tp,          5) + ",";
   j += "\"sl_pips\":"       + DoubleToString(sl_pips,     1) + ",";
   j += "\"tp_pips\":"       + DoubleToString(tp_pips,     1) + ",";
   j += "\"rr\":"            + DoubleToString(rr,          2) + ",";
   j += "\"gross_pnl\":"     + DoubleToString(NormalizeDouble(gross_pnl,2),   2) + ",";
   j += "\"commission\":"    + DoubleToString(NormalizeDouble(commission,2),   2) + ",";
   j += "\"swap\":"          + DoubleToString(NormalizeDouble(swap,2),         2) + ",";
   j += "\"pnl\":"           + DoubleToString(NormalizeDouble(total_pnl,2),    2) + ",";
   j += "\"pips\":"          + DoubleToString(pips,        1) + ",";
   j += "\"volume\":"        + DoubleToString(volume,      2) + ",";
   j += "\"duration_min\":"  + IntegerToString(duration_min) + ",";
   j += "\"outcome\":\""     + outcome + "\",";
   j += "\"session\":\""     + session + "\",";
   j += "\"timeframe\":\""   + ChartTimeframe + "\",";
   j += "\"entry_time\":\""  + TimeToISO(entry_t) + "\",";
   j += "\"exit_time\":\""   + TimeToISO(close_t) + "\",";
   j += "\"quality\":5,";
   j += "\"notes\":\""       + notes_tag + "\",";
   j += "\"candles\":"       + candles_json;
   j += "}";
   return j;
}

//+------------------------------------------------------------------+
//| Sync a single closed deal (live trade)                           |
//+------------------------------------------------------------------+
void SyncDeal(ulong deal_ticket)
{
   if(!HistoryDealSelect(deal_ticket))
   {
      HistorySelect(D'2000.01.01', TimeCurrent() + 86400);
      if(!HistoryDealSelect(deal_ticket)) return;
   }

   string   symbol    = HistoryDealGetString(deal_ticket,  DEAL_SYMBOL);
   double   price     = HistoryDealGetDouble(deal_ticket,  DEAL_PRICE);
   double   profit    = HistoryDealGetDouble(deal_ticket,  DEAL_PROFIT);
   double   swap      = HistoryDealGetDouble(deal_ticket,  DEAL_SWAP);
   double   commission= HistoryDealGetDouble(deal_ticket,  DEAL_COMMISSION);
   double   volume    = HistoryDealGetDouble(deal_ticket,  DEAL_VOLUME);
   ulong    order     = HistoryDealGetInteger(deal_ticket, DEAL_ORDER);
   ulong    pos_id    = HistoryDealGetInteger(deal_ticket, DEAL_POSITION_ID);
   datetime close_t   = (datetime)HistoryDealGetInteger(deal_ticket, DEAL_TIME);
   double   total_pnl = profit + swap + commission;

   // Find opening deal for entry price, direction, entry time
   double   entry_price = price;
   string   direction   = "BUY";
   datetime entry_t     = close_t;
   int      total_deals = HistoryDealsTotal();

   for(int i = 0; i < total_deals; i++)
   {
      ulong ht = HistoryDealGetTicket(i);
      if(ht == 0) continue;
      if(HistoryDealGetInteger(ht, DEAL_POSITION_ID) != (long)pos_id) continue;
      if(HistoryDealGetInteger(ht, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
      entry_price = HistoryDealGetDouble(ht, DEAL_PRICE);
      entry_t     = (datetime)HistoryDealGetInteger(ht, DEAL_TIME);
      direction   = (HistoryDealGetInteger(ht, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      break;
   }

   // Fetch SL & TP from order
   double sl = 0, tp = 0;
   GetSLTP(pos_id, sl, tp);

   string outcome = (total_pnl > 0.001) ? "WIN" : (total_pnl < -0.001) ? "LOSS" : "BREAKEVEN";
   MqlDateTime dt; TimeToStruct(entry_t, dt);
   string session = GetSession(dt.hour);

   string trade_json = BuildTradeJSON(order, symbol, direction, entry_price, price,
                                      sl, tp, profit, commission, swap, total_pnl,
                                      volume, outcome, session,
                                      entry_t, close_t, "MT5 auto-sync");

   string payload = "{\"token\":\"" + UserToken + "\",\"type\":\"trade\",\"trades\":[" + trade_json + "]}";
   SendToTradeSylla(payload);
}

//+------------------------------------------------------------------+
//| Sync full account history                                        |
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
   Print("TradeSylla: ", total_deals, " deals in history — processing closing deals...");

   string trades_batch = "";
   int    batch_count  = 0;
   int    total_sent   = 0;

   for(int i = 0; i < total_deals; i++)
   {
      ulong h_ticket = HistoryDealGetTicket(i);
      if(h_ticket == 0) continue;

      long entry = HistoryDealGetInteger(h_ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      string   symbol     = HistoryDealGetString(h_ticket,  DEAL_SYMBOL);
      double   price      = HistoryDealGetDouble(h_ticket,  DEAL_PRICE);
      double   profit     = HistoryDealGetDouble(h_ticket,  DEAL_PROFIT);
      double   swap       = HistoryDealGetDouble(h_ticket,  DEAL_SWAP);
      double   commission = HistoryDealGetDouble(h_ticket,  DEAL_COMMISSION);
      double   volume     = HistoryDealGetDouble(h_ticket,  DEAL_VOLUME);
      ulong    order      = HistoryDealGetInteger(h_ticket, DEAL_ORDER);
      ulong    pos_id     = HistoryDealGetInteger(h_ticket, DEAL_POSITION_ID);
      datetime close_t    = (datetime)HistoryDealGetInteger(h_ticket, DEAL_TIME);
      double   total_pnl  = profit + swap + commission;

      // Find opening deal
      double   entry_price = price;
      string   direction   = "BUY";
      datetime entry_t     = close_t;

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

      // Fetch SL/TP from order history
      double sl = 0, tp = 0;
      GetSLTP(pos_id, sl, tp);

      string outcome = (total_pnl > 0.001) ? "WIN" : (total_pnl < -0.001) ? "LOSS" : "BREAKEVEN";
      MqlDateTime dt; TimeToStruct(entry_t, dt);
      string session = GetSession(dt.hour);

      if(VerboseLogging) Print("TradeSylla: Processing ", symbol, " ticket #", order, " | P&L: ", DoubleToString(total_pnl,2), " | ", outcome);
      string trade_json = BuildTradeJSON(order, symbol, direction, entry_price, price,
                                         sl, tp, profit, commission, swap, total_pnl,
                                         volume, outcome, session,
                                         entry_t, close_t, "MT5 history import");

      if(batch_count > 0) trades_batch += ",";
      trades_batch += trade_json;
      batch_count++;

      if(batch_count >= MAX_BATCH_SIZE)
      {
         string force_flag = ForceResync ? ",\"force\":true" : "";
         string payload = "{\"token\":\"" + UserToken + "\",\"type\":\"history\"" + force_flag + ",\"trades\":[" + trades_batch + "]}";
         string response = SendToTradeSylla(payload);
         if(VerboseLogging) Print("TradeSylla batch response: ", response);
         total_sent  += batch_count;
         trades_batch = "";
         batch_count  = 0;
         Print("TradeSylla: Sent ", total_sent, " trades so far...");
         Sleep(500); // small pause between batches to avoid overloading server
      }
   }

   // Send remaining
   if(batch_count > 0)
   {
      string force_flag = ForceResync ? ",\"force\":true" : "";
      string payload = "{\"token\":\"" + UserToken + "\",\"type\":\"history\"" + force_flag + ",\"trades\":[" + trades_batch + "]}";
      string resp = SendToTradeSylla(payload);
      if(VerboseLogging) Print("TradeSylla final batch: ", StringSubstr(resp,0,200));
      total_sent += batch_count;
   }

   Print("TradeSylla: History sync complete — ", total_sent, " trades sent.");
}

//+------------------------------------------------------------------+
//| Heartbeat                                                        |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string payload = "{";
   payload += "\"token\":\""    + UserToken + "\",";
   payload += "\"type\":\"heartbeat\",";
   payload += "\"account\":{";
   payload += "\"login\":"      + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ",";
   payload += "\"name\":\""     + EscapeJSON(AccountInfoString(ACCOUNT_NAME)) + "\",";
   payload += "\"server\":\""   + EscapeJSON(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   payload += "\"broker\":\""   + EscapeJSON(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   payload += "\"balance\":"    + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   payload += "\"equity\":"     + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),  2) + ",";
   payload += "\"profit\":"     + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT),  2) + ",";
   payload += "\"leverage\":"   + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   payload += "\"currency\":\"" + EscapeJSON(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   payload += "\"is_demo\":"    + ((AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO)?"true":"false");
   payload += "}}";
   SendToTradeSylla(payload);
}

//+------------------------------------------------------------------+
//| HTTP POST                                                        |
//+------------------------------------------------------------------+
string SendToTradeSylla(string json_payload)
{
   char post_data[], result_data[];
   string result_headers;
   string headers = "Content-Type: application/json\r\nX-EA-Version: " + EA_VERSION + "\r\n";

   StringToCharArray(json_payload, post_data, 0, StringLen(json_payload));

   int res = WebRequest("POST", ENDPOINT, headers, 15000, post_data, result_data, result_headers);

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Print("TradeSylla: WebRequest blocked! Whitelist: ", ENDPOINT, " in MT5 → Tools → Options → Expert Advisors");
      else
         Print("TradeSylla: WebRequest error code: ", err);
      return "ERROR";
   }

   string response = CharArrayToString(result_data);

   if(res != 200 && res != 201)
   {
      Print("TradeSylla: HTTP ", res, " — ", StringSubstr(response, 0, 150));
      return "HTTP_" + IntegerToString(res);
   }

   if(VerboseLogging)
      Print("TradeSylla OK → ", StringSubstr(response, 0, 200));

   return response;
}

//+------------------------------------------------------------------+
//| Get OHLCV candles around a trade                                 |
//+------------------------------------------------------------------+
string GetCandlesJSON(string symbol, ENUM_TIMEFRAMES tf, datetime entry_time, datetime exit_time)
{
   // Skip candles entirely if flag set (faster for ForceResync)
   if(SkipCandles) return "[]";

   int      tf_seconds = PeriodSeconds(tf);
   datetime from_t     = entry_time - (datetime)(CandlesBefore * tf_seconds);
   datetime to_t       = exit_time  + (datetime)(CandlesAfter  * tf_seconds);

   // Ensure the symbol is loaded in market watch before requesting rates
   // This is critical for index/CFD symbols (UK100, GER40, etc.) not on current chart
   if(!SymbolInfoInteger(symbol, SYMBOL_SELECT))
      SymbolSelect(symbol, true);

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(symbol, tf, from_t, to_t, rates);
   if(copied <= 0)
   {
      if(VerboseLogging) Print("TradeSylla: No candles for ", symbol, " — sending trade without chart context");
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
   if(tf_str=="M1")  return PERIOD_M1;
   if(tf_str=="M5")  return PERIOD_M5;
   if(tf_str=="M15") return PERIOD_M15;
   if(tf_str=="M30") return PERIOD_M30;
   if(tf_str=="H1")  return PERIOD_H1;
   if(tf_str=="H4")  return PERIOD_H4;
   if(tf_str=="D1")  return PERIOD_D1;
   return PERIOD_M15;
}

string GetSession(int hour_utc)
{
   if(hour_utc >= 0  && hour_utc <  7)  return "ASIAN";
   if(hour_utc >= 7  && hour_utc < 12)  return "LONDON";
   if(hour_utc >= 12 && hour_utc < 17)  return "NEW_YORK";
   if(hour_utc >= 17 && hour_utc < 21)  return "NEW_YORK";
   return "SYDNEY";
}

double CalcPips(string symbol, double price_diff)
{
   int    digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point  = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double pip    = (digits==5 || digits==3) ? point*10 : point;
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
   for(int i=0; i<size; i++)
      if(g_synced_tickets[i]==ticket) return true;
   return false;
}

void MarkTicketSynced(ulong ticket)
{
   int size = ArraySize(g_synced_tickets);
   ArrayResize(g_synced_tickets, size+1);
   g_synced_tickets[size] = ticket;
}
//+------------------------------------------------------------------+
