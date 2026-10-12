// Disposable loopback PostgreSQL only. No production config or real secrets.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),tls=require('node:tls');
const {Pool,Client}=require('pg');
const {createDatabase,poolOptions,WORKER}=require('../server/database.cjs');
const database=process.env.AGC_TEST_DB_NAME;
if(!/^agc_email_test_\d+$/.test(database||''))throw Error('Disposable local fixture required');
const port=Number(process.env.AGC_TEST_PG_PORT||55439),password=process.env.AGC_TEST_DB_PASSWORD,ca=fs.readFileSync(process.env.AGC_TEST_CA,'utf8');
const config={host:'localhost',port,database,user:WORKER,password,ca};
const options=poolOptions(config);
const ownerOptions={host:'127.0.0.1',port,database,user:'postgres',ssl:{rejectUnauthorized:true,ca,checkServerIdentity:(_,cert)=>tls.checkServerIdentity('localhost',cert)}};
test('real SCRAM login and verified TLS call private functions, commit exactly once and reuse safely after errors',async()=>{
 const pool=new Pool(options);pool.on('error',()=>{});
 try{
  const check=await pool.query('select ssl,version from pg_stat_ssl where pid=pg_backend_pid()');assert.equal(check.rows[0].ssl,true);assert(/^TLSv1\.[23]$/.test(check.rows[0].version));
  for(const q of ['select token from public.entrants','select * from public.claims','select * from agc_entry_recovery.links','select public.winners()','select public.admin_draw(\'x\',\'x\',\'x\',\'x\')','set role service_role','create table public.worker_fixture(x int)','create table agc_entry_recovery.worker_fixture(x int)'])await assert.rejects(pool.query(q));
  const call=createDatabase(pool),h=crypto.randomBytes(32).toString('hex');
  const owner=new Client(ownerOptions);await owner.connect();try{await owner.query('delete from agc_entry_recovery.limits');}finally{await owner.end();}
  const issued=await call('entry_recovery_issue',{p_email:'synthetic-recovery@example.invalid',p_token_hash:h,p_email_hash:crypto.randomBytes(32).toString('hex'),p_ip_hash:crypto.randomBytes(32).toString('hex')});assert.equal(issued.recipient,'synthetic-recovery@example.invalid');
  const result=await call('entry_recovery_redeem',{p_token_hash:h,p_ip_hash:'a'.repeat(64)});assert(/^[a-f0-9-]{36}$/.test(result.token));assert.equal(await call('entry_recovery_redeem',{p_token_hash:h,p_ip_hash:'a'.repeat(64)}),null);
  assert.equal((await pool.query('select 1 as ok')).rows[0].ok,1);
 }finally{await pool.end();}
});
test('certificate trust, hostname verification and password authentication fail closed',async()=>{
 for(const variant of [{...options,ssl:{rejectUnauthorized:true}},{...options,ssl:{rejectUnauthorized:true,ca,checkServerIdentity:(_,cert)=>tls.checkServerIdentity('wrong.invalid',cert)}},{...options,password:'incorrect-synthetic-password'}]){
  const c=new Client(variant);try{await assert.rejects(c.connect());}finally{await c.end().catch(()=>{});}
 }
});
test('real transaction errors and server statement timeouts roll back partial work and leave reusable clean connections',async()=>{
 const owner=new Client(ownerOptions);await owner.connect();const pool=new Pool(options);pool.on('error',()=>{});const call=createDatabase(pool);
 const original=(await owner.query("select pg_get_functiondef('agc_entry_recovery.entry_recovery_revoke(text)'::regprocedure) as sql")).rows[0].sql;
 try{
  for(const action of ["raise exception 'synthetic failure'","perform pg_catalog.pg_sleep(5)"]){
   await owner.query("create or replace function agc_entry_recovery.entry_recovery_revoke(p_token_hash text) returns void language plpgsql security definer set search_path='' as $$ begin insert into agc_entry_recovery.limits values('rollback-fixture',clock_timestamp(),1,clock_timestamp()); "+action+"; end $$");
   const start=Date.now();await assert.rejects(call('entry_recovery_revoke',{p_token_hash:'a'.repeat(64)}),e=>e.message==='database_unavailable');assert(Date.now()-start<2200);
   assert.equal((await owner.query("select count(*)::int as n from agc_entry_recovery.limits where key='rollback-fixture'")).rows[0].n,0);
   assert.equal((await pool.query('select 1 as ok')).rows[0].ok,1);
  }
 }finally{await owner.query(original);await pool.end();await owner.end();}
});
test('TLS downgrade refused when PostgreSQL server reports no TLS',async()=>{
 const net=require('node:net');const server=net.createServer(socket=>socket.once('data',()=>socket.end('N')));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const c=new Client({...options,host:'127.0.0.1',port:server.address().port});try{await assert.rejects(c.connect(),/SSL/);}finally{await c.end().catch(()=>{});await new Promise(r=>server.close(r));}
});
test('password rotation rejects the previous password on new connections; expired and disabled logins cannot authenticate',async()=>{
 const owner=new Client(ownerOptions);await owner.connect();const replacement=crypto.randomBytes(40).toString('hex');
 try{
  await owner.query("alter role agc_entry_recovery_worker password '"+replacement+"'");
  const old=new Client(options);try{await assert.rejects(old.connect(),/password authentication failed/);}finally{await old.end().catch(()=>{});}
  const current=new Client({...options,password:replacement});await current.connect();await current.end();
  await owner.query("alter role agc_entry_recovery_worker valid until '2000-01-01'");
  const expired=new Client({...options,password:replacement});try{await assert.rejects(expired.connect());}finally{await expired.end().catch(()=>{});}
  await owner.query("alter role agc_entry_recovery_worker valid until '2099-01-01'");
  const warm=new Client({...options,password:replacement});await warm.connect();
  try{
    await owner.query(fs.readFileSync(require('node:path').join(__dirname,'../database/disable-email-recovery.sql'),'utf8'));
    await assert.rejects(warm.query("select agc_entry_recovery.entry_recovery_revoke(repeat('a',64))"),/permission denied/);
  }finally{await warm.end();}
  const disabled=new Client({...options,password:replacement});try{await assert.rejects(disabled.connect());}finally{await disabled.end().catch(()=>{});}
 }finally{await owner.end();}
});
