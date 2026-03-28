//+------------------------------------------------------------------+
//| TradeSylla_MarketData.mq5   v2.0                                 |
//| Full OHLCV for ALL broker symbols/timeframes                     |
//| SYLLEDGE command system: EA fetches exactly what AI requests     |
//+------------------------------------------------------------------+
#property copyright "TradeSylla"
#property version   "2.00"

input string AdminToken      = "";
input string ServerURL       = "https://tradesylla.vercel.app";
input bool   FullHistorySync = true;
input int    PollInterval    = 10;
input int    LiveInterval    = 60;

ENUM_TIMEFRAMES TFS[]    = { PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1 };
string          TFNAMES[]= { "M1","M5","M15","H1","H4","D1" };

datetime g_lastLive = 0;
datetime g_lastPoll = 0;

int OnInit() {
   if(AdminToken=="") { Alert("TradeSylla MarketData: Set AdminToken"); return INIT_FAILED; }
   Print("TradeSylla MarketData v2.0 started");
   if(FullHistorySync) SyncAllHistory();
   EventSetTimer(PollInterval);
   return INIT_SUCCEEDED;
}
void OnDeinit(const int r) { EventKillTimer(); }
void OnTimer() {
   datetime now=TimeCurrent();
   if(now-g_lastPoll>=PollInterval) { g_lastPoll=now; PollCommands(); }
   if(now-g_lastLive>=LiveInterval) { g_lastLive=now; PushLive(); }
}

string ISO(datetime t) {
   MqlDateTime d; TimeToStruct(t,d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",d.year,d.mon,d.day,d.hour,d.min,d.sec);
}

string POST(string path, string body) {
   string hdr="Content-Type: application/json\r\nAuthorization: Bearer "+AdminToken;
   char post[]; StringToCharArray(body,post,0,StringLen(body));
   char res[]; string rh;
   int c=WebRequest("POST",ServerURL+path,hdr,15000,post,res,rh);
   if(c==-1){Print("MarketData POST error ",GetLastError()," ",path); return "";}
   return CharArrayToString(res);
}
string HTTGET(string path) {
   string hdr="Authorization: Bearer "+AdminToken;
   char empty[1]; char res[]; string rh;
   int c=WebRequest("GET",ServerURL+path,hdr,10000,empty,res,rh);
   if(c==-1){Print("MarketData GET error ",GetLastError()); return "";}
   return CharArrayToString(res);
}

string CandlesJSON(string sym, string tf, MqlRates &r[], int n) {
   string s="{\"symbol\":\""+sym+"\",\"timeframe\":\""+tf+"\",\"candles\":[";
   for(int i=0;i<n;i++){
      s+=StringFormat("{\"t\":\"%s\",\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%I64u}",
         ISO(r[i].time),r[i].open,r[i].high,r[i].low,r[i].close,r[i].tick_volume);
      if(i<n-1)s+=",";
   }
   return s+"]}";
}

int GetSymbols(string &syms[]) {
   int total=SymbolsTotal(false),n=0;
   for(int i=0;i<total;i++){
      string name=SymbolName(i,false);
      if(name==""||StringGetCharacter(name,0)=='#') continue;
      ArrayResize(syms,n+1); syms[n++]=name;
   }
   return n;
}

void SyncAllHistory() {
   string syms[]; int ns=GetSymbols(syms);
   Print("MarketData: Syncing ",ns," symbols x ",ArraySize(TFS)," TFs...");
   for(int s=0;s<ns;s++)
      for(int t=0;t<ArraySize(TFS);t++)
         SyncSymbol(syms[s],TFS[t],TFNAMES[t]);
   Print("MarketData: History sync complete");
}

void SyncSymbol(string sym, ENUM_TIMEFRAMES tf, string tfName) {
   MqlRates rates[];
   int loaded=CopyRates(sym,tf,D'2015.01.01',TimeCurrent(),rates);
   if(loaded<=0) return;
   for(int start=0;start<loaded;start+=500){
      int n=MathMin(500,loaded-start);
      MqlRates batch[]; ArrayResize(batch,n); ArrayCopy(batch,rates,0,start,n);
      POST("/api/sylledge-market",CandlesJSON(sym,tfName,batch,n));
      Sleep(30);
   }
}

void PushLive() {
   string syms[]; int ns=GetSymbols(syms);
   for(int s=0;s<ns;s++)
      for(int t=0;t<ArraySize(TFS);t++){
         MqlRates r[2];
         if(CopyRates(syms[s],TFS[t],0,2,r)<2) continue;
         MqlRates bar[1]; bar[0]=r[1];
         POST("/api/sylledge-market",CandlesJSON(syms[s],TFNAMES[t],bar,1));
      }
}

//+------------------------------------------------------------------+
// SYLLEDGE COMMAND SYSTEM
// Polls /api/sylledge-commands/pending — executes exactly what SYLLEDGE requests
//+------------------------------------------------------------------+
void PollCommands() {
   string resp=HTTGET("/api/sylledge-commands/pending");
   if(resp==""||resp=="[]"||resp=="null") return;
   int pos=0;
   while(pos<StringLen(resp)){
      int s=StringFind(resp,"{",pos); if(s==-1) break;
      int e=FindClosingBrace(resp,s); if(e==-1) break;
      ExecCommand(StringSubstr(resp,s,e-s+1));
      pos=e+1;
   }
}

int FindClosingBrace(string s, int start) {
   int depth=0;
   for(int i=start;i<StringLen(s);i++){
      ushort c=StringGetCharacter(s,i);
      if(c=='{') depth++;
      if(c=='}') { depth--; if(depth==0) return i; }
   }
   return -1;
}

void ExecCommand(string cmd) {
   string id  =ExtractJSON(cmd,"id");
   string type=ExtractJSON(cmd,"type");
   string sym =ExtractJSON(cmd,"symbol");
   string tf  =ExtractJSON(cmd,"timeframe");
   string from=ExtractJSON(cmd,"from");
   string to  =ExtractJSON(cmd,"to");
   int    lim =(int)StringToInteger(ExtractJSON(cmd,"limit")=="?"?"500":ExtractJSON(cmd,"limit"));
   if(lim<=0) lim=500;
   if(id==""||type=="") return;
   if(type=="fetch_candles")    CmdFetchCandles(id,sym,tf,from,to,lim);
   else if(type=="fetch_symbols")CmdFetchSymbols(id);
   else if(type=="overview")    CmdOverview(id,sym,tf==""?"H1":tf);
}

void CmdFetchCandles(string id,string sym,string tfName,string fromS,string toS,int lim) {
   ENUM_TIMEFRAMES tf=NameTF(tfName);
   datetime from=fromS!=""?(datetime)StringToTime(fromS):TimeCurrent()-86400*30;
   datetime to  =toS!=""?(datetime)StringToTime(toS)  :TimeCurrent();
   MqlRates r[]; int n=CopyRates(sym,tf,from,to,r);
   if(n<=0){POST("/api/sylledge-commands/ack","{\"command_id\":\""+id+"\",\"status\":\"no_data\"}"); return;}
   if(n>lim) n=lim;
   string body="{\"command_id\":\""+id+"\",\"type\":\"candles\",\"symbol\":\""+sym+"\",\"timeframe\":\""+tfName+"\",\"candles\":[";
   for(int i=0;i<n;i++){
      body+=StringFormat("{\"t\":\"%s\",\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%I64u}",
         ISO(r[i].time),r[i].open,r[i].high,r[i].low,r[i].close,r[i].tick_volume);
      if(i<n-1)body+=",";
   }
   body+="]}";
   POST("/api/sylledge-commands/response",body);
   Print("MarketData: Sent ",n," candles to SYLLEDGE cmd ",id);
}

void CmdFetchSymbols(string id) {
   string syms[]; int n=GetSymbols(syms);
   string body="{\"command_id\":\""+id+"\",\"type\":\"symbols\",\"symbols\":[";
   for(int i=0;i<n;i++){body+="\""+syms[i]+"\""; if(i<n-1)body+=",";}
   POST("/api/sylledge-commands/response",body++"]}");
}

void CmdOverview(string id,string sym,string tfName) {
   ENUM_TIMEFRAMES tf=NameTF(tfName); MqlRates r[20]; int n=CopyRates(sym,tf,0,20,r);
   if(n<=0){POST("/api/sylledge-commands/ack","{\"command_id\":\""+id+"\",\"status\":\"no_data\"}"); return;}
   double hi=0,lo=1e9;
   for(int i=0;i<n;i++){if(r[i].high>hi)hi=r[i].high; if(r[i].low<lo)lo=r[i].low;}
   POST("/api/sylledge-commands/response",
      StringFormat("{\"command_id\":\"%s\",\"type\":\"overview\",\"symbol\":\"%s\","
                   "\"close\":%.5f,\"high20\":%.5f,\"low20\":%.5f}",
                   id,sym,r[n-1].close,hi,lo));
}

ENUM_TIMEFRAMES NameTF(string n){
   if(n=="M1")return PERIOD_M1; if(n=="M5")return PERIOD_M5;
   if(n=="M15")return PERIOD_M15; if(n=="H1")return PERIOD_H1;
   if(n=="H4")return PERIOD_H4;  if(n=="D1")return PERIOD_D1;
   return PERIOD_H1;
}

string ExtractJSON(string json,string key){
   string search="\""+key+"\":\"";
   int pos=StringFind(json,search); if(pos==-1)return "";
   int start=pos+StringLen(search);
   int end=StringFind(json,"\"",start); if(end==-1)return "";
   return StringSubstr(json,start,end-start);
}
