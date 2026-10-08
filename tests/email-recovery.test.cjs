const {test}=require('node:test'),assert=require('node:assert/strict');
const {handler,configuration,dependencies,GENERIC,ORIGIN,hash}=require('../server/recovery.cjs');
const token='11111111-1111-4111-8111-111111111111',credential='a'.repeat(43);
function setup(rpc=async()=>({}),send=async()=>{}){
 const calls=[],mails=[],delays=[];
 const dependencies={config:{enabled:true,origin:ORIGIN,pepper:'synthetic-test-only'.repeat(3)},clock:()=>1000,
  random:()=>credential,sleep:async ms=>delays.push(ms),
  rpc:async(name,body)=>{calls.push({name,body});return rpc(name,body);},send:async(...args)=>{mails.push(args);await send(...args);}};
 return {dependencies,calls,mails,delays};
}
async function invoke(kind,s,body,headers={},method='POST'){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 await handler(kind,s.dependencies)({method,headers:{origin:ORIGIN,'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.10',...headers},body},res);return res;
}
test('known, unknown, limited and delivery-failed requests have identical generic bodies and response delay',async()=>{
 const cases=[setup(async()=>({})),setup(async()=>({recipient:'synthetic@example.invalid'})),
  setup(async()=>({recipient:'synthetic@example.invalid'}),async()=>{throw Error('test delivery failure');})];
 for(const s of cases){const r=await invoke('request',s,{email:' Synthetic@Example.Invalid '});assert.equal(r.code,200);assert.deepEqual(r.body,{message:GENERIC});assert.deepEqual(s.delays,[4500]);assert.equal(r.headers['Cache-Control'],'no-store');assert(!JSON.stringify(r.body).includes(credential));}
 assert.equal(cases[1].mails[0][1],ORIGIN+'/recover-entry#r='+credential);
 assert.equal(cases[1].calls[0].body.p_email,'synthetic@example.invalid');
 assert.equal(cases[1].calls[0].body.p_token_hash,hash(credential));
 assert(!JSON.stringify(cases[1].calls).includes(credential));
 assert.equal(cases[2].calls[1].name,'entry_recovery_revoke');
});
test('backend outages have the same request response and never expose error text',async()=>{
 const s=setup(async()=>{throw Error('private database details');});const r=await invoke('request',s,{email:'synthetic@example.invalid'});
 assert.equal(r.code,200);assert.deepEqual(r.body,{message:GENERIC});assert(!JSON.stringify(r).includes('private database'));assert.equal(s.mails.length,0);
});
test('same-origin, JSON, bounded input and platform IP are required before any RPC',async()=>{
 for(const [body,headers,method] of [[{email:'a@b.invalid'},{origin:'https://evil.invalid'}],
  [{email:'a@b.invalid'},{'content-type':'text/plain'}],[{email:'a@b.invalid'},{'x-vercel-forwarded-for':'203.0.113.10, 203.0.113.11'}],
  [{email:'a@b.invalid',redirect:'https://evil.invalid'}],['x'.repeat(1025)],[[{}]], [{email:'not-an-email'}], [{email:'a@b.invalid'},{},'GET']]){
  const s=setup();const r=await invoke('request',s,body,headers,method);assert(r.code>=400);assert.equal(s.calls.length,0);
 }
});
test('redeem hashes a well-formed credential, returns only its confirmed original entry, and rejects other payloads',async()=>{
 const s=setup(async()=>({token,first_name:'Synthetic'}));const r=await invoke('redeem',s,{credential});
 assert.equal(r.code,200);assert.deepEqual(r.body,{token,first_name:'Synthetic'});assert.equal(s.calls[0].body.p_token_hash,hash(credential));
 for(const body of [{credential:'short'},{credential,token},{credential,email:'a@b.invalid'}]){const x=setup();assert.equal((await invoke('redeem',x,body)).code,400);assert.equal(x.calls.length,0);}
 for(const result of [null,{token:'wrong',first_name:'Synthetic'},{token}])assert.equal((await invoke('redeem',setup(async()=>result),{credential})).code,400);
});
test('unavailable configuration fails closed; broad credentials cannot enable recovery',async()=>{
 const env={AGC_RECOVERY_ENABLED:'true',AGC_RECOVERY_DATABASE_TOKEN:'x.'+Buffer.from(JSON.stringify({role:'service_role',exp:Date.now()/1000+3600})).toString('base64url')+'.x',
  AGC_RECOVERY_PUBLISHABLE_KEY:'synthetic',AGC_RECOVERY_RESEND_KEY:'synthetic',AGC_RECOVERY_FROM:'test@example.invalid',AGC_RECOVERY_RATE_PEPPER:'synthetic-only'.repeat(4)};
 assert.equal(configuration(env).enabled,false);assert.equal(configuration({}).enabled,false);
 const s=setup();s.dependencies.config.enabled=false;assert.equal((await invoke('request',s,{email:'a@b.invalid'})).code,503);assert.equal(s.calls.length,0);
});

test('transport adapter uses fixed endpoints, hashes in RPC, private mail body, no redirects and bounded requests',async()=>{
 const original=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({recipient:'synthetic@example.invalid'})};};
 try{
  const d=dependencies({publishableKey:'synthetic-public',databaseToken:'synthetic-scoped',mailKey:'synthetic-mail',from:'test@example.invalid'});
  await d.rpc('entry_recovery_issue',{p_token_hash:hash(credential)});
  await d.send('synthetic@example.invalid',ORIGIN+'/recover-entry#r='+credential,hash(credential),500);
  assert.equal(calls[0].url,'https://pmhytaaajbhzyldmxmzb.supabase.co/rest/v1/rpc/entry_recovery_issue');
  assert(!calls[0].options.body.includes(credential));assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-scoped');
  assert.equal(calls[1].url,'https://api.resend.com/emails');assert.equal(calls[1].options.headers['Idempotency-Key'],hash(credential));
  const mail=JSON.parse(calls[1].options.body);assert.deepEqual(mail.to,['synthetic@example.invalid']);assert(mail.text.includes(ORIGIN+'/recover-entry#r='+credential));assert(!mail.html);
  for(const call of calls){assert.equal(call.options.redirect,'error');assert(call.options.signal instanceof AbortSignal);}
  global.fetch=async()=>({ok:false});await assert.rejects(d.rpc('entry_recovery_redeem',{}));await assert.rejects(d.send('synthetic@example.invalid','',hash(credential),500));
 }finally{global.fetch=original;}
});
