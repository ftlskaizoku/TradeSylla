//+------------------------------------------------------------------+
//|                                         TradeSylla_Sync.mq5    |
//|         Auto-sync ALL trades from ALL pairs to TradeSylla       |
//|                    https://tradesylla.vercel.app                |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property link      "https://tradesylla.vercel.app"
#property version   "4.0"
#property description "Syncs complete trade history (all pairs) to TradeSylla. v4.0 fixes: missing pairs, win/loss accuracy, multi-account support."

//── Input parameters ──────────────────────────────────────────────────────────
input string UserToken       = "";      // Your TradeSylla User Token (required)
input bool   SyncHistory     = true;    // Sync full account history on startup
input int    SyncIntervalSec = 30;      // Heartbeat interval (seconds)
input bool   VerboseLogging  = true;    // Print details to Experts log
input bool   ForceResync     = false;   // Re-sync ALL history ignoring duplicates

//── Constants ─────────────────────────────────────────────────────────────────
#define ENDPOINT       "https://tradesylla.vercel.app/api/ea-sync"
#define EA_VERSION     "4.0"
#define MAX_BATCH_SIZE 30

//── Globals ───────────────────────────────────────────────────────────────────
ulong g_synced_tickets[];
string g_account_login = "";

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(UserToken) < 10)
   {
      Alert("TradeSylla: UserToken is not set. Enter your token in EA settings.");
      return INIT_FAILED;
   }

   ArrayResize(g_synced_tickets, 0);
   g_account_login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));

   EventSetTimer(SyncIntervalSec);

   Print("TradeSylla EA v", EA_VERSION, " initialized.");
   Print("TradeSylla: Account login = ", g_account_login,
         " | Token = ", StringSubstr(UserToken, 0, 8), "...");

   SendHeartbeat();

   if(SyncHistory)
   {
      Print("TradeSylla: Starting full history sync (ALL pairs, ALL time)...");
      SyncFullHistory();
   }

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer()                  { SendHeartbeat(); }

//+------------------------------------------------------------------+
//| Live trade fires immediately on close                            |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   ulong deal_ticket = trans.deal;
   if(deal_ticket == 0) return;

   // Need full history loaded to find all position deals
   datetime from = D'2000.01.01';
   HistorySelect(from, TimeCurrent() + 86400);

   if(!HistoryDealSelect(deal_ticket)) return;

   long entry = HistoryDealGetInteger(deal_ticket, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) return;
   if(IsTicketSynced(deal_ticket)) return;

   ulong pos_id = (ulong)HistoryDealGetInteger(deal_ticket, DEAL_POSITION_ID);
   Print("TradeSylla: Trade closed — syncing position #", pos_id);
   SyncPosition(pos_id);
   MarkTicketSynced(deal_ticket);
}

//+------------------------------------------------------------------+
//| Aggregate ALL deal data for a position (FIX: win/loss accuracy) |
//|                                                                  |
//| Some brokers create separate deals for commission, swap, etc.   |
//| We must sum profit+swap+commission from every deal in position. |
//+------------------------------------------------------------------+
struct PositionData
{
   string   symbol;
   string   direction;
   double   entry_price;
   double   exit_price;
   datetime entry_time;
   datetime exit_time;
   double   gross_profit;   // raw price profit only
   double   commission;     // all commissions summed
   double   swap;           // all swaps summed
   double   total_pnl;      // gross_profit + commission + swap
   double   volume;
   double   sl;
   double   tp;
   bool     valid;
};

PositionData BuildPositionData(ulong pos_id)
{
   PositionData pd;
   pd.valid = false;

   int total_deals = HistoryDealsTotal();
   if(total_deals == 0) return pd;

   double sum_profit     = 0;
   double sum_commission = 0;
   double sum_swap       = 0;
   double open_price     = 0;
   double close_price    = 0;
   datetime open_time    = 0;
   datetime close_time   = 0;
   string   symbol       = "";
   string   direction    = "BUY";
   double   volume       = 0;
   int      close_count  = 0;

   for(int i = 0; i < total_deals; i++)
   {
      ulong ht = HistoryDealGetTicket(i);
      if(ht == 0) continue;
      if((ulong)HistoryDealGetInteger(ht, DEAL_POSITION_ID) != pos_id) continue;

      long   deal_entry = HistoryDealGetInteger(ht, DEAL_ENTRY);
      double profit     = HistoryDealGetDouble(ht,  DEAL_PROFIT);
      double commission = HistoryDealGetDouble(ht,  DEAL_COMMISSION);
      double swap       = HistoryDealGetDouble(ht,  DEAL_SWAP);
      double price      = HistoryDealGetDouble(ht,  DEAL_PRICE);
      double vol        = HistoryDealGetDouble(ht,  DEAL_VOLUME);
      datetime dt       = (datetime)HistoryDealGetInteger(ht, DEAL_TIME);
      string   sym      = HistoryDealGetString(ht, DEAL_SYMBOL);

      // Accumulate all financial components across every deal in this position
      sum_profit     += profit;
      sum_commission += commission;
      sum_swap       += swap;

      if(symbol == "" && sym != "") symbol = sym;

      if(deal_entry == DEAL_ENTRY_IN)
      {
         open_price = price;
         open_time  = dt;
         volume     = vol;
         long dtype = HistoryDealGetInteger(ht, DEAL_TYPE);
         direction  = (dtype == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      }
      else if(deal_entry == DEAL_ENTRY_OUT || deal_entry == DEAL_ENTRY_OUT_BY)
      {
         close_price = price;
         close_time  = dt;
         close_count++;
      }
   }

   if(symbol == "" || close_count == 0) return pd;

   pd.symbol      = symbol;
   pd.direction   = direction;
   pd.entry_price = open_price;
   pd.exit_price  = close_price;
   pd.entry_time  = open_time;
   pd.exit_time   = close_time;
   pd.gross_profit= sum_profit;
   pd.commission  = sum_commission;
   pd.swap        = sum_swap;
   pd.total_pnl   = sum_profit + sum_commission + sum_swap;
   pd.volume      = volume;
   pd.valid       = true;

   // Fetch SL/TP from order history for this position
   pd.sl = 0; pd.tp = 0;
   int total_orders = HistoryOrdersTotal();
   for(int i = 0; i < total_orders; i++)
   {
      ulong ord = HistoryOrderGetTicket(i);
      if(ord == 0) continue;
      if((ulong)HistoryOrderGetInteger(ord, ORDER_POSITION_ID) != pos_id) continue;
      double sl = HistoryOrderGetDouble(ord, ORDER_SL);
      double tp = HistoryOrderGetDouble(ord, ORDER_TP);
      if(sl > 0 && pd.sl == 0) pd.sl = sl;
      if(tp > 0 && pd.tp == 0) pd.tp = tp;
      if(pd.sl > 0 && pd.tp > 0) break;
   }

   return pd;
}

//+------------------------------------------------------------------+
//| Build JSON for one position                                      |
//+------------------------------------------------------------------+
string BuildPositionJSON(ulong pos_id, PositionData& pd, string notes_tag)
{
   double pips   = CalcPips(pd.symbol, MathAbs(pd.exit_price - pd.entry_price));
   double rr     = 0;
   double sl_pips= 0;
   double tp_pips= 0;

   if(pd.sl > 0 && pd.tp > 0)
   {
      double risk   = MathAbs(pd.entry_price - pd.sl);
      double reward = MathAbs(pd.tp - pd.entry_price);
      if(risk > 0) rr = NormalizeDouble(reward / risk, 2);
   }
   if(pd.sl > 0) sl_pips = CalcPips(pd.symbol, MathAbs(pd.entry_price - pd.sl));
   if(pd.tp > 0) tp_pips = CalcPips(pd.symbol, MathAbs(pd.tp - pd.entry_price));

   long duration_min = 0;
   if(pd.entry_time > 0 && pd.exit_time > 0)
      duration_min = (long)(pd.exit_time - pd.entry_time) / 60;

   // Use total_pnl (profit+swap+commission) for outcome — FIX for win/loss confusion
   string outcome = (pd.total_pnl > 0.001) ? "WIN" : (pd.total_pnl < -0.001) ? "LOSS" : "BREAKEVEN";

   MqlDateTime dt_struct;
   TimeToStruct(pd.entry_time, dt_struct);
   string session = GetSession(dt_struct.hour);

   string tf = GetChartTimeframeString();

   string j = "{";
   j += "\"mt5_ticket\":\""   + IntegerToString((long)pos_id) + "\",";
   j += "\"account_login\":\"" + g_account_login + "\",";
   j += "\"symbol\":\""       + EscapeJSON(pd.symbol) + "\",";
   j += "\"direction\":\""    + pd.direction + "\",";
   j += "\"entry_price\":"    + DoubleToString(pd.entry_price, 5) + ",";
   j += "\"exit_price\":"     + DoubleToString(pd.exit_price,  5) + ",";
   j += "\"sl\":"             + DoubleToString(pd.sl,          5) + ",";
   j += "\"tp\":"             + DoubleToString(pd.tp,          5) + ",";
   j += "\"sl_pips\":"        + DoubleToString(sl_pips,        1) + ",";
   j += "\"tp_pips\":"        + DoubleToString(tp_pips,        1) + ",";
   j += "\"rr\":"             + DoubleToString(rr,             2) + ",";
   j += "\"gross_pnl\":"      + DoubleToString(NormalizeDouble(pd.gross_profit, 2), 2) + ",";
   j += "\"commission\":"     + DoubleToString(NormalizeDouble(pd.commission,   2), 2) + ",";
   j += "\"swap\":"           + DoubleToString(NormalizeDouble(pd.swap,         2), 2) + ",";
   j += "\"pnl\":"            + DoubleToString(NormalizeDouble(pd.total_pnl,    2), 2) + ",";
   j += "\"pips\":"           + DoubleToString(pips,           1) + ",";
   j += "\"volume\":"         + DoubleToString(pd.volume,      2) + ",";
   j += "\"duration_min\":"   + IntegerToString(duration_min) + ",";
   j += "\"outcome\":\""      + outcome + "\",";
   j += "\"session\":\""      + session + "\",";
   j += "\"timeframe\":\""    + tf + "\",";
   j += "\"entry_time\":\""   + TimeToISO(pd.entry_time) + "\",";
   j += "\"exit_time\":\""    + TimeToISO(pd.exit_time)  + "\",";
   j += "\"quality\":5,";
   j += "\"notes\":\""        + EscapeJSON(notes_tag) + "\",";
   j += "\"candles\":[]";
   j += "}";
   return j;
}

//+------------------------------------------------------------------+
//| Sync a single position (live trade)                              |
//+------------------------------------------------------------------+
void SyncPosition(ulong pos_id)
{
   PositionData pd = BuildPositionData(pos_id);
   if(!pd.valid)
   {
      Print("TradeSylla: Could not build data for position #", pos_id);
      return;
   }

   string trade_json = BuildPositionJSON(pos_id, pd, "MT5 auto-sync v4");
   string payload    = "{\"token\":\"" + UserToken
                     + "\",\"type\":\"trade\""
                     + ",\"account_login\":\"" + g_account_login + "\""
                     + ",\"trades\":[" + trade_json + "]}";
   SendToTradeSylla(payload);
}

//+------------------------------------------------------------------+
//| Full history sync — ALL pairs, ALL time (FIX: missing pairs)    |
//+------------------------------------------------------------------+
void SyncFullHistory()
{
   // Load ALL history from account inception
   datetime from = D'2000.01.01';
   datetime to   = TimeCurrent() + 86400;

   if(!HistorySelect(from, to))
   {
      Print("TradeSylla: HistorySelect failed.");
      return;
   }

   int total_deals = HistoryDealsTotal();
   Print("TradeSylla: ", total_deals, " total deals in history. Collecting unique positions...");

   // ── Step 1: Collect unique position IDs from closing deals ───────────────
   // Using a simple array (MQL5 has no map/set)
   ulong position_ids[];
   int   pos_count = 0;
   ArrayResize(position_ids, 0);

   for(int i = 0; i < total_deals; i++)
   {
      ulong ht = HistoryDealGetTicket(i);
      if(ht == 0) continue;

      long entry = HistoryDealGetInteger(ht, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      ulong pos_id = (ulong)HistoryDealGetInteger(ht, DEAL_POSITION_ID);
      if(pos_id == 0) continue;

      // Check if already in our list
      bool found = false;
      for(int j = 0; j < pos_count; j++)
         if(position_ids[j] == pos_id) { found = true; break; }
      if(!found)
      {
         ArrayResize(position_ids, pos_count + 1);
         position_ids[pos_count] = pos_id;
         pos_count++;
      }
   }

   Print("TradeSylla: Found ", pos_count, " unique closed positions. Building trade data...");

   // ── Step 2: For each position, aggregate ALL deals (FIX: win/loss + commission) ──
   string batch       = "";
   int    batch_count = 0;
   int    total_sent  = 0;
   int    skipped     = 0;

   for(int i = 0; i < pos_count; i++)
   {
      ulong pos_id = position_ids[i];

      PositionData pd = BuildPositionData(pos_id);
      if(!pd.valid) { skipped++; continue; }

      // FIX: Force symbol into Market Watch before any processing
      // This is critical for indices (UK100, GER40) not on current chart
      if(!SymbolInfoInteger(pd.symbol, SYMBOL_SELECT))
         SymbolSelect(pd.symbol, true);

      if(VerboseLogging)
         Print("TradeSylla: Position #", pos_id, " | ", pd.symbol,
               " | ", pd.direction,
               " | Total P&L: $", DoubleToString(pd.total_pnl, 2),
               " (profit:", DoubleToString(pd.gross_profit, 2),
               " comm:", DoubleToString(pd.commission, 2),
               " swap:", DoubleToString(pd.swap, 2), ")",
               " | ", (pd.total_pnl > 0.001 ? "WIN" : pd.total_pnl < -0.001 ? "LOSS" : "BE"));

      string trade_json = BuildPositionJSON(pos_id, pd, "MT5 history import v4");

      if(batch_count > 0) batch += ",";
      batch += trade_json;
      batch_count++;

      if(batch_count >= MAX_BATCH_SIZE)
      {
         string force_flag = ForceResync ? ",\"force\":true" : "";
         string payload = "{\"token\":\"" + UserToken
                        + "\",\"type\":\"history\""
                        + ",\"account_login\":\"" + g_account_login + "\""
                        + force_flag
                        + ",\"trades\":[" + batch + "]}";
         string resp = SendToTradeSylla(payload);
         if(VerboseLogging) Print("TradeSylla batch response: ", StringSubstr(resp, 0, 200));
         total_sent  += batch_count;
         batch        = "";
         batch_count  = 0;
         Print("TradeSylla: Sent ", total_sent, " / ", pos_count, " positions...");
         Sleep(400);
      }
   }

   // Send remaining
   if(batch_count > 0)
   {
      string force_flag = ForceResync ? ",\"force\":true" : "";
      string payload = "{\"token\":\"" + UserToken
                     + "\",\"type\":\"history\""
                     + ",\"account_login\":\"" + g_account_login + "\""
                     + force_flag
                     + ",\"trades\":[" + batch + "]}";
      string resp = SendToTradeSylla(payload);
      if(VerboseLogging) Print("TradeSylla final batch: ", StringSubstr(resp, 0, 200));
      total_sent += batch_count;
   }

   Print("TradeSylla: History sync COMPLETE — ",
         total_sent, " positions sent, ", skipped, " skipped.");
}

//+------------------------------------------------------------------+
//| Heartbeat — sends account info every SyncIntervalSec seconds    |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string payload = "{";
   payload += "\"token\":\""     + UserToken + "\",";
   payload += "\"type\":\"heartbeat\",";
   payload += "\"account\":{";
   payload += "\"login\":"       + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ",";
   payload += "\"name\":\""      + EscapeJSON(AccountInfoString(ACCOUNT_NAME))    + "\",";
   payload += "\"server\":\""    + EscapeJSON(AccountInfoString(ACCOUNT_SERVER))  + "\",";
   payload += "\"broker\":\""    + EscapeJSON(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   payload += "\"balance\":"     + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE),  2) + ",";
   payload += "\"equity\":"      + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),   2) + ",";
   payload += "\"profit\":"      + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT),   2) + ",";
   payload += "\"leverage\":"    + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   payload += "\"currency\":\""  + EscapeJSON(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   payload += "\"is_demo\":"     + ((AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO) ? "true" : "false");
   payload += "}}";
   SendToTradeSylla(payload);
}

//+------------------------------------------------------------------+
//| HTTP POST to TradeSylla server                                   |
//+------------------------------------------------------------------+
string SendToTradeSylla(string json_payload)
{
   char   post_data[], result_data[];
   string result_headers;
   string headers = "Content-Type: application/json\r\nX-EA-Version: " + EA_VERSION + "\r\n";

   StringToCharArray(json_payload, post_data, 0, StringLen(json_payload));

   int res = WebRequest("POST", ENDPOINT, headers, 15000, post_data, result_data, result_headers);

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Print("TradeSylla: WebRequest blocked! Whitelist: ", ENDPOINT,
               " in MT5 → Tools → Options → Expert Advisors");
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
//| Helpers                                                          |
//+------------------------------------------------------------------+
string GetChartTimeframeString()
{
   ENUM_TIMEFRAMES tf = Period();
   if(tf == PERIOD_M1)  return "M1";
   if(tf == PERIOD_M5)  return "M5";
   if(tf == PERIOD_M15) return "M15";
   if(tf == PERIOD_M30) return "M30";
   if(tf == PERIOD_H1)  return "H1";
   if(tf == PERIOD_H4)  return "H4";
   if(tf == PERIOD_D1)  return "D1";
   return "H1";
}

string GetSession(int hour_utc)
{
   if(hour_utc >= 0  && hour_utc <  7)  return "ASIAN";
   if(hour_utc >= 7  && hour_utc < 12)  return "LONDON";
   if(hour_utc >= 12 && hour_utc < 21)  return "NEW_YORK";
   return "SYDNEY";
}

double CalcPips(string symbol, double price_diff)
{
   int    digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point  = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double pip    = (digits == 5 || digits == 3) ? point * 10 : point;
   if(pip <= 0) return 0;
   return NormalizeDouble(price_diff / pip, 1);
}

string TimeToISO(datetime t)
{
   if(t == 0) return "";
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
