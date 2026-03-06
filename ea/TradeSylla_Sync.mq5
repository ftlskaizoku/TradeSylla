//+------------------------------------------------------------------+
//| TradeSylla Sync EA                                               |
//| Automatically sends every closed trade to TradeSylla journal     |
//| Install: Copy to MQL5/Experts/ folder in MT5 data directory      |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "1.00"
#property strict

// ─── User inputs ────────────────────────────────────────────────────────────
input string   UserToken    = "";                                       // Your TradeSylla User Token
input string   ServerURL    = "https://tradesylla.vercel.app/api/mt5-sync"; // API endpoint
input int      SyncInterval = 30;                                       // Sync every N seconds
input bool     SyncHistory  = true;                                     // Import full history on first run

// ─── Internal state ─────────────────────────────────────────────────────────
datetime lastSyncTime   = 0;
datetime lastDealTime   = 0;
bool     firstRunDone   = false;
string   sentDealIds    = "";    // comma-separated deal tickets already sent

//+------------------------------------------------------------------+
//| EA initialisation                                                |
//+------------------------------------------------------------------+
int OnInit()
{
   if(UserToken == "")
   {
      Alert("TradeSylla: Please enter your User Token in EA settings.");
      return INIT_PARAMETERS_INCORRECT;
   }
   Print("TradeSylla Sync EA started. Server: ", ServerURL);
   EventSetTimer(SyncInterval);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Timer tick — runs every SyncInterval seconds                     |
//+------------------------------------------------------------------+
void OnTimer()
{
   SyncClosedTrades();
}

//+------------------------------------------------------------------+
//| Main sync logic                                                  |
//+------------------------------------------------------------------+
void SyncClosedTrades()
{
   datetime fromTime = SyncHistory && !firstRunDone ? 0 : lastDealTime;
   firstRunDone = true;

   // Request history from Supabase
   if(!HistorySelect(fromTime, TimeCurrent()))
   {
      Print("TradeSylla: HistorySelect failed");
      return;
   }

   int totalDeals = HistoryDealsTotal();
   if(totalDeals == 0) return;

   string tradesJson = "[";
   int    added      = 0;

   for(int i = 0; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      // Only process SELL (close) deals — these represent closed positions
      ENUM_DEAL_ENTRY entryType = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entryType != DEAL_ENTRY_OUT && entryType != DEAL_ENTRY_OUT_BY) continue;

      // Skip deals already sent
      string ticketStr = IntegerToString((long)ticket);
      if(StringFind(sentDealIds, ticketStr + ",") >= 0) continue;

      // ── Extract deal data ────────────────────────────────────────
      string symbol    = HistoryDealGetString (ticket, DEAL_SYMBOL);
      double profit    = HistoryDealGetDouble (ticket, DEAL_PROFIT);
      double swap      = HistoryDealGetDouble (ticket, DEAL_SWAP);
      double commission= HistoryDealGetDouble (ticket, DEAL_COMMISSION);
      double netProfit = profit + swap + commission;
      double price     = HistoryDealGetDouble (ticket, DEAL_PRICE);
      double volume    = HistoryDealGetDouble (ticket, DEAL_VOLUME);
      datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      string comment   = HistoryDealGetString (ticket, DEAL_COMMENT);
      long   posId     = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);

      // Find the matching open deal for entry price + direction
      double entryPrice = price;
      string direction  = "BUY";  // closed BUY = original was BUY
      if(dealType == DEAL_TYPE_BUY)  direction = "SELL"; // closing deal type is opposite
      if(dealType == DEAL_TYPE_SELL) direction = "BUY";

      // Get open price from position history
      if(HistorySelectByPosition(posId))
      {
         for(int j = 0; j < HistoryDealsTotal(); j++)
         {
            ulong openTicket = HistoryDealGetTicket(j);
            ENUM_DEAL_ENTRY oe = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(openTicket, DEAL_ENTRY);
            if(oe == DEAL_ENTRY_IN)
            {
               entryPrice = HistoryDealGetDouble(openTicket, DEAL_PRICE);
               ENUM_DEAL_TYPE oType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(openTicket, DEAL_TYPE);
               direction = (oType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
               break;
            }
         }
         // Restore full history selection
         HistorySelect(fromTime, TimeCurrent());
      }

      // ── Determine outcome ────────────────────────────────────────
      string outcome = "BREAKEVEN";
      if(netProfit >  0.001) outcome = "WIN";
      if(netProfit < -0.001) outcome = "LOSS";

      // ── Calculate pips ───────────────────────────────────────────
      double pips = 0;
      double pipSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      if(digits == 5 || digits == 3) pipSize *= 10;
      if(pipSize > 0)
      {
         double priceDiff = direction == "BUY" ? price - entryPrice : entryPrice - price;
         pips = NormalizeDouble(priceDiff / pipSize, 1);
      }

      // ── Detect session ───────────────────────────────────────────
      MqlDateTime dt; TimeToStruct(closeTime, dt);
      int hour = dt.hour;
      string session = "UNKNOWN";
      if(hour >= 0  && hour < 8)  session = "ASIAN";
      if(hour >= 7  && hour < 9)  session = "SYDNEY";
      if(hour >= 8  && hour < 12) session = "LONDON";
      if(hour >= 12 && hour < 17) session = "NEW_YORK";
      if(hour >= 13 && hour < 16) session = "LONDON"; // overlap

      // ── Format ISO timestamp ─────────────────────────────────────
      string closeISO = StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
         dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);

      // ── Build JSON trade object ──────────────────────────────────
      string tradeJson = StringFormat(
         "{\"mt5_ticket\":\"%s\",\"symbol\":\"%s\",\"direction\":\"%s\","
         "\"entry_price\":%.5f,\"exit_price\":%.5f,\"pnl\":%.2f,"
         "\"pips\":%.1f,\"volume\":%.2f,\"entry_time\":\"%s\","
         "\"session\":\"%s\",\"outcome\":\"%s\",\"notes\":\"%s\"}",
         ticketStr, symbol, direction,
         entryPrice, price, netProfit,
         pips, volume, closeISO,
         session, outcome,
         StringReplace(comment, "\"", "'")
      );

      if(added > 0) tradesJson += ",";
      tradesJson += tradeJson;
      added++;

      // Track sent
      sentDealIds += ticketStr + ",";
      if(closeTime > lastDealTime) lastDealTime = closeTime;
   }

   tradesJson += "]";

   if(added == 0) return;

   // ── POST to TradeSylla API ────────────────────────────────────────
   string payload = StringFormat("{\"token\":\"%s\",\"trades\":%s}", UserToken, tradesJson);
   string headers = "Content-Type: application/json\r\n";
   char   postData[];
   char   result[];
   string responseHeaders;

   StringToCharArray(payload, postData, 0, StringLen(payload), CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1); // remove null terminator

   int res = WebRequest("POST", ServerURL, headers, 5000, postData, result, responseHeaders);

   if(res == 200)
   {
      Print("TradeSylla: ", added, " trade(s) synced successfully");
      lastSyncTime = TimeCurrent();
   }
   else if(res == -1)
   {
      Print("TradeSylla: WebRequest failed. Make sure ", ServerURL, " is whitelisted in MT5 Tools → Options → Expert Advisors → Allow WebRequest");
   }
   else
   {
      string respStr = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("TradeSylla: Server response ", res, ": ", respStr);
   }
}

string StringReplace(string str, string search, string replace)
{
   string result = str;
   int pos = StringFind(result, search);
   while(pos >= 0)
   {
      result = StringSubstr(result, 0, pos) + replace + StringSubstr(result, pos + StringLen(search));
      pos = StringFind(result, search, pos + StringLen(replace));
   }
   return result;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("TradeSylla Sync EA stopped.");
}
//+------------------------------------------------------------------+
