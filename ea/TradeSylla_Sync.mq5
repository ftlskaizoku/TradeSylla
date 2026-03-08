//+------------------------------------------------------------------+
//| TradeSylla Sync EA v1.1                                          |
//| Sends every closed trade to TradeSylla journal automatically     |
//|                                                                  |
//| INSTALL:                                                         |
//|   1. Copy this file to MT5 → File → Open Data Folder            |
//|      → MQL5 → Experts                                           |
//|   2. In MetaEditor press F7 to compile (or open and press F7)   |
//|   3. Attach to any chart, paste your User Token from TradeSylla  |
//|   4. Tools → Options → Expert Advisors → Allow WebRequest        |
//|      → Add: https://tradesylla.vercel.app                       |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "1.01"
#property strict

//--- User inputs
input string UserToken    = "";   // Paste your TradeSylla User Token here
input string ServerURL    = "https://tradesylla.vercel.app/api/mt5-sync";
input int    SyncInterval = 30;   // Sync every N seconds
input bool   SyncHistory  = true; // Import full history on first run

//--- Internal state
bool     firstRunDone = false;
datetime lastDealTime = 0;

// Simple string array to track already-sent tickets
string sentTickets[];
int    sentCount = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(UserToken) == 0)
   {
      Alert("[TradeSylla] Please enter your User Token in EA input settings.");
      return INIT_PARAMETERS_INCORRECT;
   }
   Print("[TradeSylla] EA started. Syncing to: ", ServerURL);
   EventSetTimer(SyncInterval);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnTimer()
{
   SyncClosedTrades();
}

//+------------------------------------------------------------------+
bool AlreadySent(string ticket)
{
   for(int i = 0; i < sentCount; i++)
      if(sentTickets[i] == ticket) return true;
   return false;
}

void MarkSent(string ticket)
{
   ArrayResize(sentTickets, sentCount + 1);
   sentTickets[sentCount] = ticket;
   sentCount++;
}

//+------------------------------------------------------------------+
void SyncClosedTrades()
{
   datetime fromTime = (SyncHistory && !firstRunDone) ? 0 : lastDealTime;
   firstRunDone = true;

   if(!HistorySelect(fromTime, TimeCurrent())) return;

   int total = HistoryDealsTotal();
   if(total == 0) return;

   // ── Collect all open deals first (entry prices) ─────────────────
   // We store them in a simple parallel array keyed by position ID
   // This avoids calling HistorySelectByPosition which resets the selection

   // Max reasonable size
   int maxDeals = 10000;
   long   openPosIds[];   ArrayResize(openPosIds,   maxDeals);
   double openPrices[];   ArrayResize(openPrices,   maxDeals);
   int    openTypes[];    ArrayResize(openTypes,    maxDeals);
   int    openCount = 0;

   for(int i = 0; i < total; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      if(tk == 0) continue;
      ENUM_DEAL_ENTRY et = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(et != DEAL_ENTRY_IN) continue;
      openPosIds[openCount]  = HistoryDealGetInteger(tk, DEAL_POSITION_ID);
      openPrices[openCount]  = HistoryDealGetDouble (tk, DEAL_PRICE);
      openTypes[openCount]   = (int)HistoryDealGetInteger(tk, DEAL_TYPE);
      openCount++;
   }

   // ── Build JSON array of new closed trades ────────────────────────
   string tradesJson = "[";
   int    added = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      // Only close entries
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      // Skip already sent
      string tickStr = IntegerToString((long)ticket);
      if(AlreadySent(tickStr)) continue;

      // ── Core deal data ───────────────────────────────────────────
      string   symbol     = HistoryDealGetString (ticket, DEAL_SYMBOL);
      double   closePrice = HistoryDealGetDouble (ticket, DEAL_PRICE);
      double   volume     = HistoryDealGetDouble (ticket, DEAL_VOLUME);
      double   profit     = HistoryDealGetDouble (ticket, DEAL_PROFIT);
      double   swap       = HistoryDealGetDouble (ticket, DEAL_SWAP);
      double   commission = HistoryDealGetDouble (ticket, DEAL_COMMISSION);
      double   netPnl     = profit + swap + commission;
      datetime closeTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      long     posId      = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      string   comment    = HistoryDealGetString (ticket, DEAL_COMMENT);

      // ── Find matching open deal ──────────────────────────────────
      double openPrice = closePrice; // fallback
      string direction = "BUY";

      for(int j = 0; j < openCount; j++)
      {
         if(openPosIds[j] == posId)
         {
            openPrice = openPrices[j];
            direction = (openTypes[j] == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            break;
         }
      }

      // ── Pips calculation ─────────────────────────────────────────
      double pips    = 0;
      int    digits  = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      double pipSize = SymbolInfoDouble(symbol, SYMBOL_POINT);
      if(digits == 5 || digits == 3) pipSize *= 10; // 5-digit broker
      if(pipSize > 0)
      {
         double diff = (direction == "BUY") ? closePrice - openPrice
                                            : openPrice  - closePrice;
         pips = NormalizeDouble(diff / pipSize, 1);
      }

      // ── Session detection ────────────────────────────────────────
      MqlDateTime dt;
      TimeToStruct(closeTime, dt);
      string session = "UNKNOWN";
      int    h = dt.hour;
      if(h >= 0  && h <  8) session = "ASIAN";
      if(h >= 8  && h < 12) session = "LONDON";
      if(h >= 12 && h < 17) session = "NEW_YORK";
      if(h == 12 || h == 13) session = "LONDON_NY"; // overlap

      // ── ISO timestamp ────────────────────────────────────────────
      string closeISO = StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
         dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);

      // ── Outcome ──────────────────────────────────────────────────
      string outcome = (netPnl > 0.001) ? "WIN" : (netPnl < -0.001) ? "LOSS" : "BREAKEVEN";

      // ── Clean comment (strip quotes for JSON safety) ──────────────
      StringReplace(comment, "\"", "'");
      StringReplace(comment, "\n", " ");
      StringReplace(comment, "\r", " ");

      // ── Build JSON object for this trade ─────────────────────────
      string obj = StringFormat(
         "{\"mt5_ticket\":\"%s\","
         "\"symbol\":\"%s\","
         "\"direction\":\"%s\","
         "\"entry_price\":%.5f,"
         "\"exit_price\":%.5f,"
         "\"pnl\":%.2f,"
         "\"pips\":%.1f,"
         "\"volume\":%.2f,"
         "\"entry_time\":\"%s\","
         "\"session\":\"%s\","
         "\"outcome\":\"%s\","
         "\"notes\":\"%s\"}",
         tickStr,
         symbol,
         direction,
         openPrice,
         closePrice,
         netPnl,
         pips,
         volume,
         closeISO,
         session,
         outcome,
         comment
      );

      if(added > 0) tradesJson += ",";
      tradesJson += obj;
      added++;

      MarkSent(tickStr);
      if(closeTime > lastDealTime) lastDealTime = closeTime;
   }

   tradesJson += "]";
   if(added == 0) return;

   // ── POST to TradeSylla ───────────────────────────────────────────
   // Correct MQL5 WebRequest signature (header-based, NOT cookie-based):
   // int WebRequest(method, url, headers, timeout, char &data[], char &result[], string &headers_out)

   string payload = StringFormat("{\"token\":\"%s\",\"trades\":%s}", UserToken, tradesJson);

   // Convert string to char array (CP_UTF8, subtract 1 to strip null terminator)
   char   postData[];
   char   response[];
   string responseHeaders;
   string requestHeaders = "Content-Type: application/json\r\n";

   ArrayResize(postData, StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8) - 1);

   int httpCode = WebRequest(
      "POST",
      ServerURL,
      requestHeaders,
      10000,       // 10 second timeout
      postData,
      response,
      responseHeaders
   );

   if(httpCode == 200)
   {
      string respStr = CharArrayToString(response, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[TradeSylla] Synced ", added, " trade(s). Server: ", respStr);
   }
   else if(httpCode == -1)
   {
      int err = GetLastError();
      if(err == 4014 || err == 5203)
         Print("[TradeSylla] WebRequest blocked. Go to: Tools → Options → Expert Advisors → Allow WebRequest → Add https://tradesylla.vercel.app");
      else
         Print("[TradeSylla] WebRequest error code: ", err, " — see MQL5 error list");
   }
   else
   {
      string respStr = CharArrayToString(response, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[TradeSylla] Server returned HTTP ", httpCode, ": ", respStr);
   }
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("[TradeSylla] EA stopped.");
}
//+------------------------------------------------------------------+
