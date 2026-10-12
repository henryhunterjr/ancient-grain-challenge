const {test}=require('node:test'),assert=require('node:assert/strict');
const {databaseConfiguration,poolOptions,createDatabase,WORKER,PROJECT}=require('../server/database.cjs');
const {configuration}=require('../server/recovery.cjs');
const password='synthetic-only-local-password'.repeat(2);
function fixture(failAt){
 const calls=[],releases=[];const client={async query(q){calls.push(q);if(calls.length===failAt)throw Error('private SQL details');return {rows:[{result:{recipient:'synthetic@example.invalid'}}]};},release(value){releases.push(value);}};
 const pool={async connect(){return client;}};return {calls,releases,client,pool};
}
const body={p_email:'synthetic@example.invalid',p_token_hash:'a'.repeat(64),p_email_hash:'b'.repeat(64),p_ip_hash:'c'.repeat(64)};
test('fixed scoped username/database/transaction pooler and verified TLS cannot be overridden by a URL or broad credentials',()=>{
 const env={AGC_RECOVERY_DB_HOST:'aws-0-us-east-1.pooler.supabase.com',AGC_RECOVERY_DB_PASSWORD:password};
 const c=databaseConfiguration(env),o=poolOptions(c);assert.equal(c.user,WORKER+'.'+PROJECT);assert.equal(c.database,'postgres');assert.equal(c.port,6543);
 assert.equal(o.ssl.rejectUnauthorized,true);assert.equal(o.ssl.minVersion,'TLSv1.2');assert.equal(o.ssl.servername,c.host);assert.equal(o.max,1);assert.equal(o.maxLifetimeSeconds,60);assert.equal(o.pipeline,false);
 for(const host of ['localhost','evil.invalid','pooler.supabase.com.evil.invalid','aws-0-us-east-1.pooler.supabase.com?sslmode=no-verify','postgres://postgres:password@aws-0-us-east-1.pooler.supabase.com'])assert.equal(databaseConfiguration({...env,AGC_RECOVERY_DB_HOST:host}),null);
 assert.equal(databaseConfiguration({...env,AGC_RECOVERY_DB_PASSWORD:'short'}),null);
 assert.equal(databaseConfiguration({...env,AGC_RECOVERY_DB_CA:'not a PEM certificate'}),null);
 assert(!('connectionString' in o));
 const config=configuration({...env,AGC_RECOVERY_ENABLED:'true',AGC_RECOVERY_RESEND_KEY:'synthetic-only',AGC_RECOVERY_FROM:'noreply@bakinggreatbread.com',AGC_RECOVERY_RATE_PEPPER:password});assert.equal(config.enabled,true);
});
test('strict function allowlist, parameterization and commit-before-result work without named prepares or pipelining',async()=>{
 const f=fixture(),call=createDatabase(f.pool),result=await call('entry_recovery_issue',body);
 assert.equal(result.recipient,'synthetic@example.invalid');assert.equal(f.calls[0],'BEGIN');assert(f.calls[1].includes('SET LOCAL statement_timeout'));
 assert.deepEqual(f.calls[2].values,Object.values(body));assert(!f.calls[2].text.includes(body.p_email));assert(f.calls[2].text.startsWith('select agc_entry_recovery.entry_recovery_issue('));assert(!('name' in f.calls[2]));assert.equal(f.calls[3],'COMMIT');assert.deepEqual(f.releases,[undefined]);
 for(const [name,payload] of [['register',body],['constructor',body],['__proto__',body],['entry_recovery_issue',{...body,sql:'select * from entrants'}],['entry_recovery_issue',{p_email:'x'}]])await assert.rejects(call(name,payload),/database_unavailable/);
 assert.equal(f.calls.length,4);
});
test('BEGIN, statement, function and COMMIT failures destroy connections and redact errors',async()=>{
 for(const point of [1,2,3,4]){const f=fixture(point);await assert.rejects(createDatabase(f.pool)('entry_recovery_issue',body),e=>e.message==='database_unavailable');assert.deepEqual(f.releases,[true]);}
});
test('acquisition timeout releases a client arriving later and never starts a transaction',async()=>{
 const f=fixture();let resolve;f.pool.connect=()=>new Promise(r=>resolve=r);await assert.rejects(createDatabase(f.pool)('entry_recovery_issue',body,5),/database_unavailable/);
 resolve(f.client);await new Promise(r=>setImmediate(r));assert.deepEqual(f.releases,[true]);assert.equal(f.calls.length,0);
});
test('query timeout destroys the connection once and does not report an unconfirmed commit',async()=>{
 const f=fixture();f.client.query=async q=>{f.calls.push(q);if(f.calls.length===3)return new Promise(()=>{});return {rows:[]};};
 await assert.rejects(createDatabase(f.pool)('entry_recovery_issue',body,5),/database_unavailable/);assert.deepEqual(f.releases,[true]);assert.equal(f.calls.length,3);
});
