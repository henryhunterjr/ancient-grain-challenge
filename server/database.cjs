const {Pool}=require('pg');
const WORKER='agc_entry_recovery_worker';
const PROJECT='pmhytaaajbhzyldmxmzb';
// Only this site's dedicated login is accepted. No URL parser or connection
// string can override TLS, project, username, port or database selection.
function databaseConfiguration(env){
  const host=env.AGC_RECOVERY_DB_HOST||'',password=env.AGC_RECOVERY_DB_PASSWORD||'',ca=env.AGC_RECOVERY_DB_CA||undefined;
  if(!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)||password.length<32
    ||(ca&&!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(ca)))return null;
  return {host,password,ca,user:WORKER+'.'+PROJECT,port:6543,database:'postgres'};
}
function poolOptions(config){
  return {host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,
    ssl:{rejectUnauthorized:true,minVersion:'TLSv1.2',servername:config.host,...(config.ca?{ca:config.ca}:{})},
    max:1,connectionTimeoutMillis:750,idleTimeoutMillis:10000,maxLifetimeSeconds:60,
    allowExitOnIdle:true,application_name:'agc-entry-recovery',pipeline:false};
}
const calls={
 entry_recovery_issue:{sql:'select agc_entry_recovery.entry_recovery_issue($1::text,$2::text,$3::text,$4::text) as result',fields:['p_email','p_token_hash','p_email_hash','p_ip_hash']},
 entry_recovery_redeem:{sql:'select agc_entry_recovery.entry_recovery_redeem($1::text,$2::text) as result',fields:['p_token_hash','p_ip_hash']},
 entry_recovery_revoke:{sql:'select agc_entry_recovery.entry_recovery_revoke($1::text) as result',fields:['p_token_hash']}
};
// One pool per warm API instance; changed credentials close the previous pool.
let active;
function getDatabase(config){
 const signature=JSON.stringify(config);
 if(!active||active.signature!==signature){if(active)active.pool.end().catch(()=>{});
  const pool=new Pool(poolOptions(config));pool.on('error',()=>{});active={signature,pool};}
 return createDatabase(active.pool);
}
function createDatabase(pool){
 return async(name,body,timeout=2000)=>{
  const call=Object.hasOwn(calls,name)?calls[name]:null;
  if(!call||!body||Object.keys(body).length!==call.fields.length||call.fields.some(key=>typeof body[key]!=='string'))throw Error('database_unavailable');
  // Acquisition, BEGIN, local limits, function call and COMMIT share one
  // deadline. On any error/timeout destroy the connection, never reuse an
  // aborted transaction; closing rolls back anything not already committed.
  let client,expired=false,released=false;
  const discard=()=>{if(client&&!released){released=true;client.release(true);}};
  const operation=(async()=>{
   client=await pool.connect();if(expired){discard();throw Error('database_unavailable');}
   await client.query('BEGIN');
   await client.query("SET LOCAL statement_timeout='1200ms'; SET LOCAL lock_timeout='800ms'");
   const response=await client.query({text:call.sql,values:call.fields.map(key=>body[key])});
   await client.query('COMMIT');
   if(!released){released=true;client.release();}
   return response.rows[0]?.result??null;
  })();
  let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;discard();reject(Error('database_unavailable'));},timeout);})]);}
  catch{discard();throw Error('database_unavailable');}
  finally{clearTimeout(timer);}
 };
}
module.exports={databaseConfiguration,poolOptions,createDatabase,getDatabase,WORKER,PROJECT};
