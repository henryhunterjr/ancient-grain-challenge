const {test}=require('node:test'); const assert=require('node:assert/strict');
const C=require('../campaign.js');
test('CSV handles BOM, quotes, embedded newlines, duplicate and case-insensitive emails',()=>{
 const result=C.parseCSV('\uFEFFName,Email address\r\n"Doe, Ana",ANA@example.com\r\n"Two\nLines",ana@example.com\r\nOther,other@example.com');
 assert.deepEqual(result.emails,['ana@example.com','other@example.com']);assert.equal(result.duplicates,1);
 assert.throws(()=>C.parseCSV('Name,Email\nAna,invalid'),/invalid/);
 assert.throws(()=>C.parseCSV('Name\nAna'),/Names alone/);
 assert.throws(()=>C.parseCSV('Email\n"unfinished'),/unfinished/);
});
test('membership is exact-email only and stale snapshots fail to unknown',()=>{
 const now=Date.parse('2026-10-25T12:00:00Z'), snapshot={imported_at:'2026-10-24T12:00:00Z',emails:['ana@example.com']};
 assert.equal(C.membership(' ANA@EXAMPLE.COM ',snapshot,now),'member');
 assert.equal(C.membership('different@example.com',snapshot,now),'unmatched');
 assert.equal(C.membership('ana@example.com',snapshot,now+15*864e5),'unknown');
 assert.equal(C.membership('ana@example.com',null,now),'unknown');
});
test('latest winners ignores array order, mixer and forfeited records',()=>{
 const result=C.latestWinners([{drawn_at:'2026-10-16',full_name:'Old'}, {drawn_at:'2026-10-23',full_name:'New'},
 {drawn_at:'2026-10-24',kind:'mixer'}, {drawn_at:'2026-10-25',status:'forfeited'}]);
 assert.equal(result.length,1);assert.equal(result[0].full_name,'New');
});
