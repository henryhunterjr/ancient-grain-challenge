const {randomBytes,createHash,createHmac}=require('node:crypto');
const {isIP}=require('node:net');
const ORIGIN='https://challenge.bakinggreatbread.com';
const DATABASE='https://pmhytaaajbhzyldmxmzb.supabase.co';
const GENERIC='If that email belongs to an entry, a sign-in link will arrive shortly. Check your inbox and spam folder. Links expire after 15 minutes.';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function configuration(env=process.env){
  const config={enabled:env.AGC_RECOVERY_ENABLED==='true',databaseToken:env.AGC_RECOVERY_DATABASE_TOKEN,
    publishableKey:env.AGC_RECOVERY_PUBLISHABLE_KEY,mailKey:env.AGC_RECOVERY_RESEND_KEY,
    from:env.AGC_RECOVERY_FROM,pepper:env.AGC_RECOVERY_RATE_PEPPER,origin:ORIGIN};
  // Refuse broad service-role credentials. Owner must approve a scoped worker.
  try {const claims=JSON.parse(Buffer.from((config.databaseToken||'').split('.')[1],'base64url'));
    config.enabled&&=claims.role==='agc_entry_recovery_worker'&&Number.isFinite(claims.exp)&&claims.exp>Date.now()/1000;
  }catch{config.enabled=false;}
  config.enabled&&=!!(config.publishableKey&&config.mailKey&&config.from&&!/[\r\n]/.test(config.from)&&config.pepper?.length>=32);
  return config;
}
function dependencies(config){
  return {config,clock:()=>Date.now(),sleep,random:()=>randomBytes(32).toString('base64url'),
    async rpc(name,body,timeout=2000){
      const response=await fetch(DATABASE+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',
        headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+config.databaseToken},
        body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
      if(!response.ok)throw new Error('database_unavailable');return response.json();
    },
    async send(recipient,url,id,timeout){
      const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.mailKey,'Idempotency-Key':id},
        body:JSON.stringify({from:config.from,to:[recipient],subject:'Your Ancient Grain Challenge sign-in link',
          text:'You requested access to your existing Ancient Grain Challenge entry.\n\n'+url+'\n\nOpen the link, then choose Continue to recover your entry. It expires in 15 minutes and can be used once. Your existing entry code and points stay unchanged. Keep this link private. If you did not request it, ignore this email.'}),
        signal:AbortSignal.timeout(timeout)});
      if(!response.ok)throw new Error('delivery_unavailable');
    }};
}
function handler(kind,provided){
 return async(req,res)=>{
  const d=provided||dependencies(configuration());const {config}=d;
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,data)=>res.status(status).json(data);
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{error:'method'});}
  if(req.headers.origin!==config.origin||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(403,{error:'request'});
  if(!config.enabled)return reply(503,{error:'unavailable'});
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'').trim();
  if(!isIP(ip))return reply(403,{error:'request'});
  let body=req.body;
  try{if(typeof body==='string'){if(Buffer.byteLength(body)>1024)throw Error();body=JSON.parse(body);}if(!body||Array.isArray(body)||typeof body!=='object'||JSON.stringify(body).length>1024)throw Error();}
  catch{return reply(400,{error:'request'});}
  const fingerprint=value=>createHmac('sha256',config.pepper).update(value).digest('hex');
  const ipHash=fingerprint('ip:'+ip);
  if(kind==='request'){
    if(Object.keys(body).some(k=>k!=='email')||typeof body.email!=='string')return reply(400,{error:'email'});
    const email=body.email.trim().toLowerCase();
    if(email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return reply(400,{error:'email'});
    // Known, unknown, ambiguous, limited and provider-failed requests share the
    // same response and bounded response time. Never log emails or credentials.
    const deadline=d.clock()+4500,token=d.random(),tokenHash=hash(token);
    try{
      const issued=await d.rpc('entry_recovery_issue',{p_email:email,p_token_hash:tokenHash,p_email_hash:fingerprint('email:'+email),p_ip_hash:ipHash});
      if(issued?.recipient){
        const remaining=deadline-d.clock()-200;
        if(remaining<1)throw new Error('deadline');
        try{await d.send(issued.recipient,config.origin+'/recover-entry#r='+token,tokenHash,remaining);}
        catch{await d.rpc('entry_recovery_revoke',{p_token_hash:tokenHash},150).catch(()=>{});}
      }
    }catch{}
    await d.sleep(Math.max(0,deadline-d.clock()));return reply(200,{message:GENERIC});
  }
  if(Object.keys(body).some(k=>k!=='credential')||typeof body.credential!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.credential))return reply(400,{error:'link'});
  try{
    const result=await d.rpc('entry_recovery_redeem',{p_token_hash:hash(body.credential),p_ip_hash:ipHash});
    if(!result||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.token||'')||typeof result.first_name!=='string')return reply(400,{error:'link'});
    return reply(200,{token:result.token,first_name:result.first_name});
  }catch{return reply(503,{error:'unavailable'});}
 };
}
module.exports={handler,configuration,dependencies,hash,GENERIC,ORIGIN};
