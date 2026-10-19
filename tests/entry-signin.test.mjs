// Run: node --experimental-strip-types --test tests/entry-signin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const { handle, GENERIC, ORIGIN, quizFragment } = await import('../supabase/functions/entry-signin/logic.ts');

const TOKEN = '11111111-2222-4333-8444-555555555555';
function deps(over = {}) {
  const calls = [], sent = [];
  let t = 0;
  const d = {
    origins: [ORIGIN], enabled: true, calls, sent,
    now: () => t, sleep: async ms => { t += ms; }, random: () => 'A'.repeat(43),
    sha256: async v => createHash('sha256').update(v).digest('hex'),
    hmac: async v => createHash('sha256').update('pepper' + v).digest('hex'),
    async call(name, args) { calls.push([name, args]);
      if (name === 'entry_recovery_issue') return args[0] === 'baker@example.com' ? { recipient: 'Baker@Example.com' } : {};
      if (name === 'entry_recovery_redeem') return args[0] === createHash('sha256').update('B'.repeat(43)).digest('hex') ? { token: TOKEN, first_name: 'Ana' } : null; },
    async send(to, link) { sent.push([to, link]); },
    ...over };
  return d;
}
const post = (body, origin = ORIGIN, extra = {}) => new Request('https://x.supabase.co/functions/v1/entry-signin', {
  method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '203.0.113.9, 10.0.0.1', ...extra }, body: JSON.stringify(body) });

test('known email sends a link carrying the quiz score', async () => {
  const d = deps();
  const r = await handle(post({ action: 'request', email: ' Baker@Example.com ', quiz: { quiz: 'abc123', score: 80, total: 10 }, next: 'm4' }), d);
  assert.equal(r.status, 200); assert.equal((await r.json()).message, GENERIC);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(d.calls[0][1][0], 'baker@example.com');
  assert.match(d.sent[0][1], new RegExp('^' + ORIGIN + '/recover-entry#r=A{43}&quiz=abc123&score=80&total=10&next=m4$'));
});
test('unknown email gets identical answer and no send', async () => {
  const d = deps();
  const r = await handle(post({ action: 'request', email: 'nobody@example.com' }), d);
  assert.equal(r.status, 200); assert.equal((await r.json()).message, GENERIC); assert.equal(d.sent.length, 0);
});
test('failed send revokes the link but answers the same', async () => {
  const d = deps({ async send() { throw new Error('down'); } });
  const r = await handle(post({ action: 'request', email: 'baker@example.com' }), d);
  assert.equal(r.status, 200); assert.equal(d.calls.at(-1)[0], 'entry_recovery_revoke');
});
test('database failure answers the same', async () => {
  const d = deps({ async call() { throw new Error('db'); } });
  const r = await handle(post({ action: 'request', email: 'baker@example.com' }), d);
  assert.equal(r.status, 200); assert.equal((await r.json()).message, GENERIC);
});
test('responses take the same minimum time', async () => {
  for (const email of ['baker@example.com', 'nobody@example.com']) {
    const d = deps(); await handle(post({ action: 'request', email }), d); assert.ok(d.now() >= 3000);
  }
});
test('other origins and missing origin are refused', async () => {
  assert.equal((await handle(post({ action: 'request', email: 'baker@example.com' }, 'https://evil.example'), deps())).status, 403);
  const req = new Request('https://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await handle(req, deps())).status, 403);
});
test('preflight', async () => {
  const ok = await handle(new Request('https://x/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps());
  assert.equal(ok.status, 204); assert.match(ok.headers.get('access-control-allow-headers'), /content-type/);
  const bad = await handle(new Request('https://x/', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), deps());
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
test('disabled until configured', async () => {
  assert.equal((await handle(post({ action: 'request', email: 'baker@example.com' }), deps({ enabled: false }))).status, 503);
});
test('bad input', async () => {
  assert.equal((await handle(post({ action: 'request', email: 'nope' }), deps())).status, 400);
  assert.equal((await handle(post({ action: 'redeem', credential: 'short' }), deps())).status, 400);
  assert.equal((await handle(post({ action: 'other' }), deps())).status, 400);
  assert.equal((await handle(post({ action: 'request', email: 'a@b.co', pad: 'x'.repeat(2000) }), deps())).status, 400);
});
test('redeem valid and invalid links', async () => {
  const good = await handle(post({ action: 'redeem', credential: 'B'.repeat(43) }), deps());
  assert.equal(good.status, 200); assert.deepEqual(await good.json(), { token: TOKEN, first_name: 'Ana' });
  const used = await handle(post({ action: 'redeem', credential: 'C'.repeat(43) }), deps());
  assert.equal(used.status, 400);
  const down = await handle(post({ action: 'redeem', credential: 'B'.repeat(43) }), deps({ async call() { throw new Error(); } }));
  assert.equal(down.status, 503);
});
test('quiz fragment rejects junk', () => {
  assert.equal(quizFragment({ quiz: 'a b', score: 1, total: 1 }), '');
  assert.equal(quizFragment({ quiz: 'ok', score: 101, total: 1 }), '');
  assert.equal(quizFragment({ quiz: 'ok', score: 50, total: 0 }), '');
  assert.equal(quizFragment(null), '');
  assert.equal(quizFragment({ quiz: 'ok', score: 87.5, total: 8 }), '&quiz=ok&score=87.5&total=8');
});
