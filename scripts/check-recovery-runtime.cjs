'use strict';
// Run in Vercel's build environment. Secrets stay in the hosting process;
// only a fixed success/failure category is printed. No email or data write.
const {Pool}=require('pg');
const {configuration}=require('../server/recovery.cjs');
const {poolOptions,WORKER}=require('../server/database.cjs');
const expectedFunctions=['entry_recovery_issue','entry_recovery_redeem','entry_recovery_revoke'];
const permissionsSQL=`SELECT
  current_user=$1 AS identity_ok,
  (SELECT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
    AND rolconnlimit BETWEEN 1 AND 10 AND rolvaliduntil>now()
    AND rolvaliduntil<=now()+interval '90 days' FROM pg_roles WHERE rolname=current_user) AS role_ok,
  (SELECT count(*)::integer FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
    WHERE r.rolname=current_user) AS memberships,
  has_schema_privilege(current_user,'public','CREATE') AS can_create,
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','agc_entry_recovery') AND c.relkind IN ('r','v','m','p','f')
    AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS tables,
  (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS public_functions,
  (SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='agc_entry_recovery' AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS functions`;
function failure(reason){const error=Error('runtime_check_failed');error.safeReason=reason;return error;}
async function checkRuntime(env,PoolType=Pool){
 let pool,client;
 try{
  // Validate complete delivery configuration without changing the actual flag.
  const ready=configuration({...env,AGC_RECOVERY_ENABLED:'true'});
  if(!ready.enabled||!ready.database.ca||!['false','true'].includes(env.AGC_RECOVERY_ENABLED)
    ||ready.pepper===ready.database.password||ready.pepper===ready.mailKey)throw failure('configuration_incomplete');
  pool=new PoolType({...poolOptions(ready.database),query_timeout:2000});pool.on('error',()=>{});
  client=await pool.connect();
  if(client.connection?.stream?.encrypted!==true||client.connection.stream.authorized!==true)throw failure('tls_verification_failed');
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='1200ms'; SET LOCAL lock_timeout='800ms'");
  const {rows}=await client.query({text:permissionsSQL,values:[WORKER]});
  const row=rows[0];
  if(!row||row.identity_ok!==true||row.role_ok!==true||row.memberships!==0||row.can_create!==false
    ||row.tables!==0||row.public_functions!==0||JSON.stringify(row.functions)!==JSON.stringify(expectedFunctions))throw failure('permission_check_failed');
  await client.query('ROLLBACK');
  return {configuration:true,poolerAuthentication:true,verifiedTLS:true,leastPrivilege:true,deliveryEnabled:env.AGC_RECOVERY_ENABLED==='true'};
 }catch(error){
  const safe=['configuration_incomplete','tls_verification_failed','permission_check_failed'].includes(error.safeReason)?error.safeReason
    :error.code==='28P01'?'authentication_rejected':'connection_or_query_failed';
  throw Error(safe);
 }finally{
  if(client)client.release(true);
  if(pool)await pool.end().catch(()=>{});
 }
}
if(require.main===module){
 checkRuntime(process.env).then(()=>console.log('AGC_RECOVERY_RUNTIME_CHECK passed: configuration, scoped pooler authentication, verified TLS and least privilege; no writes or emails.'))
  .catch(error=>{console.error('AGC_RECOVERY_RUNTIME_CHECK failed: '+error.message);process.exitCode=1;});
}
module.exports={checkRuntime};
