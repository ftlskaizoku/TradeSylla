//+------------------------------------------------------------------+
//| TradeSylla_Sync.mq5   v4.1                                       |
//| FIX: entry_time + exit_time properly extracted per deal          |
//| FIX: quality field removed — user edits never overwritten        |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "4.10"

input string  UserToken    = "";
input string  ServerURL    = "https://tradesylla.vercel.app";
input bool    ForceResync  = false;
input int     SyncInterval = 5;

datetime g_lastSync   = 0;
string   g_syncedFile = "ts_synced_tickets.txt";
bool     g_skipCandles= false;

//+------------------------------------------------------------------+
int OnInit() {
   if(UserToken == "") { Alert("TradeSylla: Set UserToken in EA inputs"); return INIT_FAILED; }
   Print("TradeSylla Sync v4.1 | Account:", AccountInfoInteger(ACCOUNT_LOGIN));
   if(ForceResync) { FileDelete(g_syncedFile); Print("TradeSylla: ForceResync — cache cleared"); }
   g_skipCandles = true;
   SyncAllHistory();
   g_skipCandles = false;
   EventSetTimer(SyncInterval);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int r) { EventKillTimer(); }
void OnTimer()             { if(TimeCurrent()-g_lastSync>=SyncInterval){ g_lastSync=TimeCurrent(); SyncRecentTrades(); } }

//── Synced-ticket cache ──────────────────────────────────────────────────────
void LoadSyncedTickets(ulong &arr[]) {
   int h=FileOpen(g_syncedFile,FILE_READ|FILE_TXT|FILE_ANSI); if(h==INVALID_HANDLE) return;
   int n=0;
   while(!FileIsEnding(h)){ string l=FileReadString(h); if(l!=""){ ArrayResize(arr,n+1); arr[n++]=(ulong)StringToInteger(l); } }
   FileClose(h);
}
void SaveSyncedTicket(ulong t) {
   int h=FileOpen(g_syncedFile,FILE_WRITE|FILE_READ|FILE_TXT|FILE_ANSI); if(h==INVALID_HANDLE) return;
   FileSeek(h,0,SEEK_END); FileWriteString(h,IntegerToString(t)+"\n"); FileClose(h);
}
bool IsSynced(ulong &arr[], ulong t) { for(int i=0;i<ArraySize(arr);i++) if(arr[i]==t) return true; return false; }

//── Helpers ──────────────────────────────────────────────────────────────────
string GetSession(datetime t) {
   MqlDateTime d; TimeToStruct(t,d); int h=d.hour;
   if(h>=2&&h<5)   return "SYDNEY";
   if(h>=0&&h<9)   return "ASIAN";
   if(h>=7&&h<16)  return "LONDON";
   if(h>=13&&h<22) return "NEW_YORK";
   return "ASIAN";
}
string GetTF(datetime entry, datetime exit_t) {
   int m=(int)((exit_t-entry)/60);
   if(m<=5) return "M1"; if(m<=20) return "M5"; if(m<=60) return "M15";
   if(m<=240) return "H1"; if(m<=1440) return "H4"; return "D1";
}
// ISO 8601: "2025-01-15T08:30:00"
string ISO(datetime t) {
   if(t<=0) return "";
   MqlDateTime d; TimeToStruct(t,d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",d.year,d.mon,d.day,d.hour,d.min,d.sec);
}
double Pips(string sym, long type, double entry, double exit_p) {
   double pt=SymbolInfoDouble(sym,SYMBOL_POINT);
   int dg=(int)SymbolInfoInteger(sym,SYMBOL_DIGITS);
   double m=(dg==3||dg==5)?10.0:1.0;
   double raw=(type==POSITION_TYPE_BUY)?(exit_p-entry):(entry-exit_p);
   return raw/pt/m;
}

//── Build JSON (NO quality field) ────────────────────────────────────────────
string BuildJSON(ulong posId, string sym, long type,
                 double ep, double xp, double lots,
                 double pnl, double swp, double comm,
                 double pips, datetime et, datetime xt) {
   // quality intentionally omitted — server preserves existing value
   return StringFormat(
      "{\"ticket\":\"%I64u\",\"account_login\":\"%s\","
      "\"symbol\":\"%s\",\"direction\":\"%s\","
      "\"entry_price\":%.5f,\"exit_price\":%.5f,"
      "\"lot_size\":%.2f,\"pnl\":%.2f,\"swap\":%.2f,"
      "\"commission\":%.2f,\"total_pnl\":%.2f,\"pips\":%.1f,"
      "\"session\":\"%s\",\"timeframe\":\"%s\","
      "\"entry_time\":\"%s\",\"exit_time\":\"%s\"}",
      posId, IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)),
      sym, (type==POSITION_TYPE_BUY?"BUY":"SELL"),
      ep, xp, lots, pnl, swp, comm, pnl+swp+comm, pips,
      GetSession(et), GetTF(et,xt),
      ISO(et), ISO(xt)
   );
}

//── Send batch to server ─────────────────────────────────────────────────────
bool SendBatch(string &items[], int n) {
   if(n==0) return true;
   string body="["; for(int i=0;i<n;i++){ body+=items[i]; if(i<n-1) body+=","; } body+="]";
   string headers="Content-Type: application/json\r\nAuthorization: Bearer "+UserToken;
   char post[]; StringToCharArray(body,post,0,StringLen(body));
   char res[]; string resH;
   int code=WebRequest("POST",ServerURL+"/api/ea-sync",headers,10000,post,res,resH);
   if(code==-1){ if(!g_skipCandles) Print("TradeSylla: WebRequest error ",GetLastError()); return false; }
   if(!g_skipCandles) Print("TradeSylla: ",CharArrayToString(res));
   return true;
}

//── Aggregate all deals for a position ───────────────────────────────────────
bool AggregatePos(ulong posId,
   string &sym, long &type,
   double &ep, double &xp, double &lots,
   double &pnl, double &swp, double &comm,
   datetime &et, datetime &xt)
{
   sym=""; type=POSITION_TYPE_BUY;
   ep=0; xp=0; lots=0; pnl=0; swp=0; comm=0; et=0; xt=0;
   bool found=false;
   int total=HistoryDealsTotal();
   for(int i=0;i<total;i++) {
      ulong t=HistoryDealGetTicket(i); if(t==0) continue;
      if(HistoryDealGetInteger(t,DEAL_POSITION_ID)!=(long)posId) continue;
      found=true;
      if(sym=="") sym=HistoryDealGetString(t,DEAL_SYMBOL);
      ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(t,DEAL_ENTRY);
      double price=HistoryDealGetDouble(t,DEAL_PRICE);
      double vol  =HistoryDealGetDouble(t,DEAL_VOLUME);
      datetime tm =(datetime)HistoryDealGetInteger(t,DEAL_TIME);
      long    dir =HistoryDealGetInteger(t,DEAL_TYPE);
      pnl  +=HistoryDealGetDouble(t,DEAL_PROFIT);
      swp  +=HistoryDealGetDouble(t,DEAL_SWAP);
      comm +=HistoryDealGetDouble(t,DEAL_COMMISSION);
      if(entry==DEAL_ENTRY_IN)  { ep=price; lots=vol; type=(dir==DEAL_TYPE_BUY?POSITION_TYPE_BUY:POSITION_TYPE_SELL); et=tm; }
      if(entry==DEAL_ENTRY_OUT||entry==DEAL_ENTRY_INOUT) { xp=price; xt=tm; }
   }
   if(found&&xt==0) xt=et; // fallback
   return found;
}

//── Collect unique closed position IDs from history ─────────────────────────
int CollectPositions(ulong &posIds[], ulong &synced[], bool respectCache) {
   int count=0, total=HistoryDealsTotal();
   for(int i=0;i<total;i++) {
      ulong t=HistoryDealGetTicket(i); if(t==0) continue;
      ENUM_DEAL_ENTRY e=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(t,DEAL_ENTRY);
      if(e!=DEAL_ENTRY_OUT&&e!=DEAL_ENTRY_INOUT) continue;
      ulong posId=(ulong)HistoryDealGetInteger(t,DEAL_POSITION_ID);
      if(respectCache&&IsSynced(synced,posId)) continue;
      bool dup=false; for(int j=0;j<count;j++) if(posIds[j]==posId){dup=true;break;}
      if(!dup){ ArrayResize(posIds,count+1); posIds[count++]=posId; }
   }
   return count;
}

//── Full history sync ─────────────────────────────────────────────────────────
void SyncAllHistory() {
   if(!HistorySelect(D'2000.01.01',TimeCurrent())) return;
   ulong synced[]; LoadSyncedTickets(synced);
   ulong posIds[]; int n=CollectPositions(posIds,synced,!ForceResync);
   Print("TradeSylla: Syncing ",n," historical positions...");
   string batch[50]; int bSize=0;
   for(int i=0;i<n;i++) {
      string sym; long type; double ep,xp,lots,pnl,swp,comm; datetime et,xt;
      if(!AggregatePos(posIds[i],sym,type,ep,xp,lots,pnl,swp,comm,et,xt)) continue;
      batch[bSize++]=BuildJSON(posIds[i],sym,type,ep,xp,lots,pnl,swp,comm,Pips(sym,type,ep,xp),et,xt);
      if(bSize==50||i==n-1){
         if(SendBatch(batch,bSize)) for(int j=i-bSize+1;j<=i;j++) SaveSyncedTicket(posIds[j]);
         bSize=0;
      }
   }
   Print("TradeSylla: History sync done — ",n," positions");
}

//── Recent trades (live timer) ────────────────────────────────────────────────
void SyncRecentTrades() {
   if(!HistorySelect(TimeCurrent()-86400*7,TimeCurrent())) return;
   ulong synced[]; LoadSyncedTickets(synced);
   ulong posIds[]; int n=CollectPositions(posIds,synced,true);
   if(n==0) return;
   string batch[]; ArrayResize(batch,n); int bSize=0;
   for(int i=0;i<n;i++) {
      string sym; long type; double ep,xp,lots,pnl,swp,comm; datetime et,xt;
      if(!AggregatePos(posIds[i],sym,type,ep,xp,lots,pnl,swp,comm,et,xt)) continue;
      batch[bSize++]=BuildJSON(posIds[i],sym,type,ep,xp,lots,pnl,swp,comm,Pips(sym,type,ep,xp),et,xt);
   }
   if(SendBatch(batch,bSize)) { for(int i=0;i<n;i++) SaveSyncedTicket(posIds[i]); Print("TradeSylla: +",bSize," trades synced"); }
}
