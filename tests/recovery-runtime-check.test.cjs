'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkRuntime}=require('../scripts/check-recovery-runtime.cjs');
const password='synthetic-worker-password-only'.repeat(2);
const pepper='separate-synthetic-rate-pepper'.repeat(2);
const env={AGC_RECOVERY_ENABLED:'false',AGC_RECOVERY_DB_HOST:'aws-0-us-east-1.pooler.supabase.com',AGC_RECOVERY_DB_PASSWORD:password,
 AGC_RECOVERY_DB_CA:'-----BEGIN CERTIFICATE-----\npublic-fixture\n-----END CERTIFICATE-----',
 AGC_RECOVERY_FROM:'synthetic@example.invalid',AGC_RECOVERY_RESEND_KEY:'synthetic-sending-key',AGC_RECOVERY_RATE_PEPPER:pepper};
const permissions={identity_ok:true,role_ok:true,memberships:0,can_create:false,tables:0,public_functions:0,
 functions:['entry_recovery_issue','entry_recovery_redeem','entry_recovery_revoke']};
function fixture(overrides={},error){
 const calls=[],releases=[];let ended=0;
 class FakePool{
  on(){}
  async connect(){if(error)throw error;return {connection:{stream:{encrypted:true,authorized:true}},
   async query(query){calls.push(query);return {rows:[{...permissions,...overrides}]};},release(value){releases.push(value);}};}
  async end(){ended++;}
 }
 return {FakePool,calls,releases,get ended(){return ended;}};
}
test('configured secrets stay in-process; check is read-only, scoped, TLS verified, and leaves delivery disabled',async()=>{
 const f=fixture(),result=await checkRuntime(env,f.FakePool);
 assert.deepEqual(result,{configuration:true,poolerAuthentication:true,verifiedTLS:true,leastPrivilege:true,deliveryEnabled:false});
 assert.equal(f.calls[0],'BEGIN READ ONLY');assert.equal(f.calls.at(-1),'ROLLBACK');assert.deepEqual(f.calls[2].values,['agc_entry_recovery_worker']);
 assert(!JSON.stringify(f.calls).includes(password));assert(!JSON.stringify(f.calls).includes(pepper));assert.deepEqual(f.releases,[true]);assert.equal(f.ended,1);
});
test('missing private configuration fails before any network connection',async()=>{
 for(const change of [{AGC_RECOVERY_RATE_PEPPER:''},{AGC_RECOVERY_DB_CA:''}]){
  const f=fixture();await assert.rejects(checkRuntime({...env,...change},f.FakePool),error=>error.message==='configuration_incomplete');assert.equal(f.ended,0);
 }
});
test('read-only authentication is independently checked but reused secrets still fail the release gate',async()=>{
 const f=fixture();let checked=0;
 await assert.rejects(checkRuntime({...env,AGC_RECOVERY_RATE_PEPPER:password},f.FakePool,()=>{checked++;}),
  error=>error.message==='configuration_incomplete'&&error.failedChecks.join()==='AGC_RECOVERY_RATE_PEPPER_separate');
 assert.equal(checked,1);assert.equal(f.calls[0],'BEGIN READ ONLY');assert.equal(f.calls.at(-1),'ROLLBACK');assert.deepEqual(f.releases,[true]);assert.equal(f.ended,1);
});
test('wrong role or broader privileges fail closed and destroy the connection',async()=>{
 for(const change of [{identity_ok:false},{role_ok:false},{memberships:1},{can_create:true},{tables:1},{public_functions:1},{functions:[...permissions.functions,'take_limit']}]){
  const f=fixture(change);await assert.rejects(checkRuntime(env,f.FakePool),error=>error.message==='permission_check_failed');assert.deepEqual(f.releases,[true]);assert.equal(f.ended,1);
 }
});
test('authentication and other private provider errors produce only safe categories',async()=>{
 for(const code of ['28P01','ECONNRESET']){
  const error=Object.assign(Error('private provider detail '+password),{code}),f=fixture({},error);
  await assert.rejects(checkRuntime(env,f.FakePool),error=>error.message===(code==='28P01'?'authentication_rejected':'connection_or_query_failed'));assert.equal(f.ended,1);
 }
});
