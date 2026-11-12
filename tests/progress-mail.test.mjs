// Run: node --experimental-strip-types --test tests/progress-mail.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const L = await import('../supabase/functions/progress-mail/logic.ts');
const NOW = Date.parse('2026-10-19T17:00:00Z');
const row = (o = {}) => ({ entrant_id: 'id-' + Math.random(), email: 'baker@example.com', first_name: 'Ana', is_test: false, lessons_done: 2,
  next_key: 'm1', next_title: 'Why Ancient Wheat Dough Feels Different', quiz_passed: false, last_sent_at: null,
  entries: 41, next_points: 20, open_bonus: [], ...o });
function deps(rows, over = {}) {
  const d = { origins: [L.ORIGIN], enabled: true, issued: [], logs: [], batches: [], now: () => NOW, random: () => 'R'.repeat(43),
    sha256: async v => createHash('sha256').update(v).digest('hex'), isAdmin: async k => k === 'good',
    list: async () => rows, winners: async () => [{ public_name: 'Angela S.', grain: 'Hard White Wheat', drawn_on: '2026-10-16' }, { public_name: 'Noah T.', grain: 'Khorasan', drawn_on: '2026-10-16' }], issue: async (e, h, days) => { d.issued.push([e, days]); }, logged: async (e, l) => { d.logs.push([e, l]); },
    sendBatch: async (m) => { d.batches.push(m); }, ...over };
  return d;
}
const post = (body, origin = L.ORIGIN) => new Request('https://x/functions/v1/progress-mail', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('needs the Host Desk key and the challenge site', async () => {
  assert.equal((await L.handle(post({ action: 'preview', key: 'bad' }), deps([]))).status, 403);
  assert.equal((await L.handle(post({ action: 'preview', key: 'good' }, 'https://evil.example'), deps([]))).status, 403);
  assert.equal((await L.handle(post({ action: 'preview', key: 'good' }), deps([], { enabled: false }))).status, 503);
});
test('eligibility skips tests, Henry, finished and recently emailed', () => {
  const rows = [row(), row({ is_test: true }), row({ email: 'henrysbreadkitchen@gmail.com' }),
    row({ last_sent_at: new Date(NOW - 86400000).toISOString() }), row({ last_sent_at: new Date(NOW - 4 * 86400000).toISOString() }), row({ next_key: null, next_title: null })];
  assert.equal(L.eligible(rows, NOW).length, 3);
});
test('preview counts', async () => {
  const r = await L.handle(post({ action: 'preview', key: 'good' }), deps([row(), row({ last_sent_at: new Date(NOW).toISOString() })]));
  const b = await r.json(); assert.equal(b.eligible, 1); assert.equal(b.recently_emailed, 1); assert.equal(b.rows.length, 2);
  assert.ok(!JSON.stringify(b).includes('baker@example.com'));
});
test('in-desk message review does not issue sign-in links, send mail, or log contact',async()=>{
 const d=deps([row({membership_status:'member',next_score:90}),row({lessons_done:0,membership_status:'unmatched'})]);
 const response=await L.handle(post({action:'samples',key:'good'}),d);
 const body=await response.json();assert.equal(body.samples.length,2);
 assert.ok(body.samples.every(m=>m.html&&m.subject&&!m.text.includes('recover-entry#')));
 assert.equal(d.issued.length,0);assert.equal(d.batches.length,0);assert.equal(d.logs.length,0);
});
test('send requires the previewed count, issues 7-day links, logs, batches', async () => {
  const rows = [row(), row({ lessons_done: 0, next_key: 'm3', next_title: 'From Berries to Bread' })];
  const d = deps(rows);
  assert.equal((await L.handle(post({ action: 'send', key: 'good', expect: 5 }), d)).status, 409);
  assert.equal(d.batches.length, 0);
  const r = await L.handle(post({ action: 'send', key: 'good', expect: 2 }), d);
  assert.deepEqual(await r.json(), { sent: 2 });
  assert.equal(d.batches[0].length, 2); assert.equal(d.logs.length, 2); assert.ok(d.issued.every(([, days]) => days === 7));
  assert.match(d.batches[0][0].text, /recover-entry#r=R{43}&next=m1&auto=1/);
});
test('send failure logs nobody as sent', async () => {
  const d = deps([row()], { sendBatch: async () => { throw new Error('resend 500'); } });
  assert.equal((await L.handle(post({ action: 'send', key: 'good', expect: 1 }), d)).status, 502);
  assert.equal(d.logs.length, 0);
});
test('test send goes only to Henry and is marked preview', async () => {
  const d = deps([row(), row({ email: 'henryhunterjr@gmail.com', is_test: true, lessons_done: 0, next_key: 'm3', next_title: 'From Berries to Bread' })]);
  const b = await (await L.handle(post({ action: 'test', key: 'good' }), d)).json();
  assert.deepEqual(b.to, ['henryhunterjr@gmail.com']); assert.match(d.batches[0][0].subject, /^\[Preview\]/); assert.equal(d.logs.length, 0);
  assert.equal(d.batches[0].length, 2); assert.match(d.batches[0][1].subject, /^\[Preview: finished version\] .*Bosch mixer drawing/);
  assert.equal(d.batches[0][1].to, 'henryhunterjr@gmail.com'); assert.match(d.batches[0][1].text, /finished all seven/);
});
test('copy variants, no em dashes, next drawing date', () => {
  const link = L.ORIGIN + '/recover-entry#r=x&next=m3';
  const a = L.compose(row({ lessons_done: 0, next_title: 'From Berries to Bread' }), link, NOW);
  const b = L.compose(row({ quiz_passed: true }), link, NOW);
  const c = L.compose(row(), link, NOW);
  assert.match(a.subject, /Bosch mixer drawing\. Your first lesson is ready/); assert.match(b.subject, /one step from credit/); assert.match(c.subject, /next lesson adds 20 mixer entries/);
  for (const m of [a, b, c]) { assert.ok(!/—/.test(m.text + m.html)); assert.match(m.text, /Friday, October 23/); assert.match(m.html, /recover-entry#r=x&amp;next=m3/); }
  assert.equal(L.nextDraw(Date.parse('2026-11-28T12:00:00Z')), null);
});

test('mixer paragraph credits Henry, counts entries, shows the graphic', () => {
  const m = L.compose(row({ lessons_done: 0, entries: 1, next_title: 'From Berries to Bread' }), 'L', NOW);
  assert.match(m.text, /I'm giving away a Bosch Universal Plus stand mixer from NutriMill/);
  assert.match(m.text, /one for registering/); assert.match(m.text, /Finishing From Berries to Bread adds 20 more/);
  assert.ok(m.html.includes('<img src="' + L.MIXER_IMAGE + '"')); assert.ok(!/NutriMill is giving|from NutriMill is giving/.test(m.text));
});
test('finished bakers get a thank-you, bonus list, and a link to their entry', async () => {
  const done = row({ next_key: null, next_title: null, lessons_done: 7, entries: 141, next_points: null,
    open_bonus: [{ title: 'Bake along with us on a Saturday', points: 10 }] });
  const m = L.compose(done, 'L', NOW);
  assert.equal(m.subject, "Ana, you're in the Bosch mixer drawing with 141 entries");
  assert.match(m.text, /finished all seven lessons, so you're also in the drawing for the 25 lb grand prize/); assert.match(m.text, /- Bake along with us on a Saturday \(10 points\)/);
  assert.ok(!/Here's how a lesson counts|Finishing/.test(m.text)); assert.match(m.html, />See my entry</);
  const none = L.compose({ ...done, open_bonus: [] }, 'L', NOW); assert.match(none.text, /anything awaiting review/);
  const d = deps([done]);
  await L.handle(post({ action: 'send', key: 'good', expect: 1 }), d);
  assert.match(d.batches[0][0].text, /recover-entry#r=R{43}&auto=1\n/); assert.deepEqual(d.logs[0][1], 'finished');
});

test('weekly reminder rotates, uses latest winners, and personalizes real progress and membership', () => {
  const input = row({next_score:90, completed_lessons:[{title:'Rye Redefined',score:80}], membership_status:'member'});
  const winners = [{public_name:'Old W.',grain:'Spelt',drawn_on:'2026-10-16'}, {public_name:'Current W.',grain:'Rye',drawn_on:'2026-10-23'}];
  const a=L.compose(input,'L',NOW,winners), b=L.compose(input,'L',NOW+7*864e5,winners);
  assert.notEqual(a.text.split('\n\n')[1],b.text.split('\n\n')[1]);
  assert.match(a.text,/Rye Redefined \(80%\)/); assert.match(a.text,/best recorded score.*90%/);
  assert.match(a.text,/Latest grain winners \(drawn Friday, October 23\)/);
  assert.match(a.text,/Current W/); assert.ok(!a.text.includes('Old W.'));
  assert.match(a.text,/already part of our kitchen table/);
  assert.ok(!/Big news:|I've decided|I'm Henry Hunter, founder|Your grain ships soon/.test(a.text));
  assert.match(L.compose({...input,membership_status:'unmatched'},'L',NOW).text,/If you haven't joined/);
  assert.ok(!L.compose({...input,membership_status:'unknown'},'L',NOW).text.includes("already part of"));
});
test('weekly editorial copy expires, unsafe links are omitted, and HTML escapes data',()=>{
 const r=row({first_name:'<script>',campaign:{week_start:'2026-10-19',intro:'Fresh week <b>',recipe_title:'My loaf',recipe_url:'https://recipepantry.app/recipes/loaf',bake_url:'javascript:alert(1)'}});
 const fresh=L.compose(r,'L',NOW); assert.match(fresh.text,/Fresh week/); assert.match(fresh.html,/&lt;script&gt;/);
 assert.ok(fresh.html.includes(r.campaign.recipe_url));assert.ok(!fresh.html.includes('javascript:'));
 const old=L.compose(r,'L',NOW+8*864e5);assert.ok(!old.text.includes('Fresh week'));assert.ok(!old.html.includes(r.campaign.recipe_url));
});
test('a winners lookup failure still sends the email', async () => {
  const d = deps([row()], { winners: async () => { throw new Error('db'); } });
  assert.equal((await L.handle(post({ action: 'send', key: 'good', expect: 1 }), d)).status, 200);
  assert.ok(!/grain winners/.test(d.batches[0][0].text));
});

test('every reminder explains social-media credit and links unfinished 20-point bonus quizzes',()=>{
  const b=[{key:'b_dense',title:'Why Your Fresh-Milled Sourdough Is Dense',points:20,pass_mark:80,link:L.ORIGIN+'/quizzes/why-your-fresh-milled-sourdough-is-dense/'},
    {key:'b_sprouted',title:'Waking Up the Berry Quiz',points:20,pass_mark:70,link:L.ORIGIN+'/quiz?quiz=waking-up-the-berry-quiz-wxp6iak2yanw'}];
  for(const next_key of ['m3',null]){
    const m=L.compose(row({next_key,open_bonus:b}),'L',NOW);
    assert.match(m.text,/Bosch Universal Plus stand mixer/);
    assert.match(m.text,/sign in to the entry you already registered/);
    assert.match(m.text,/Watching alone does not automatically add points/);
    assert.match(m.text,/80% to pass, 20 points/);assert.match(m.text,/70% to pass, 20 points/);
    assert.ok(m.html.includes(b[0].link));assert.ok(m.html.includes(b[1].link));
  }
});

test('earlier bag winners are not promised another 5 lb prize',()=>{
 const mail=L.compose(row({grain_won:true}),'L',NOW);
 assert.match(mail.text,/out of the remaining 5 lb drawings/);assert.match(mail.text,/25 lb grand prize/);
 assert.ok(!mail.text.includes('Every finished lesson also puts you in the next grain drawing'));
});
