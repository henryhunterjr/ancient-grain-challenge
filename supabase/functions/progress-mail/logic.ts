// "Your next lesson" emails for the Ancient Grain Challenge.
// Host Desk only: every action needs the Host Desk key. Pure logic, tested with stubs.
export const ORIGIN = 'https://challenge.bakinggreatbread.com';
// Henry's own inboxes: they receive previews and are never in the real send.
export const TEST_EMAILS = ['henrysbreadkitchen@gmail.com', 'henryhunterjr@gmail.com'];
export const DRAW_DATES = ['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27'];
export const RESEND_GAP_DAYS = 3;
export const LINK_DAYS = 7;

export interface Row {
  entrant_id: string; email: string; first_name: string; is_test: boolean; lessons_done: number;
  next_key: string; next_title: string; quiz_passed: boolean; last_sent_at: string | null;
}
export interface Mail { to: string; subject: string; text: string; html: string }
export interface Deps {
  origins: string[]; enabled: boolean;
  now(): number;
  random(): string;
  sha256(v: string): Promise<string>;
  isAdmin(key: string): Promise<boolean>;
  list(): Promise<Row[]>;
  issue(entrant: string, tokenHash: string, days: number): Promise<void>;
  logged(entrant: string, lesson: string): Promise<void>;
  sendBatch(mails: Mail[], idempotency: string): Promise<void>;
  log?(where: string, e: unknown): void;
}

const ymd = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export function nextDraw(ms: number): string | null {
  const today = ymd(ms);
  const d = DRAW_DATES.find(x => x > today);
  if (!d) return null;
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function eligible(rows: Row[], now: number): Row[] {
  const gap = RESEND_GAP_DAYS * 86400000;
  return rows.filter(r => !r.is_test && !TEST_EMAILS.includes(r.email) && r.next_key
    && (!r.last_sent_at || now - Date.parse(r.last_sent_at) >= gap));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function compose(r: Row, link: string, now: number): Omit<Mail, 'to'> {
  const name = r.first_name || 'there';
  const draw = nextDraw(now);
  const subject = r.quiz_passed ? `${name}, you're one step from credit on ${r.next_title}`
    : r.lessons_done === 0 ? `${name}, your first Ancient Grain lesson is ready`
    : `${name}, your next lesson is ${r.next_title}`;
  const opener = r.quiz_passed
    ? `You passed the ${r.next_title} quiz, but the lesson isn't credited yet. The missing piece is your YouTube comment. Leave a comment on the video, then add the YouTube name you commented under. That's it.`
    : r.lessons_done === 0
    ? `You're registered for the Ancient Grain Challenge, but you haven't finished a lesson yet. Let's fix that. Your first one is ${r.next_title}, and it takes about 15 minutes.`
    : `You've finished ${r.lessons_done} of the 7 lessons. Good work. Next up is ${r.next_title}.`;
  const steps = ['Watch the video.', 'Leave a comment on it over on YouTube.', 'Take the quiz. 70% or better passes.',
    'Save your score and the YouTube name you commented under. Your points show up right away.'];
  const prize = (draw ? `Every finished lesson puts you in the next drawing on ${draw} for a 5 lb bag of grain from Grand Teton Ancient Grains. ` : '')
    + 'Finish all seven and you qualify for the 25 lb grand prize on December 1.';
  const button = r.quiz_passed ? `Finish ${r.next_title}` : `Start ${r.next_title}`;
  const fine = `This link is just for you and works for ${LINK_DAYS} days, on your phone or computer. After that, tap "Email me a sign-in link" on any lesson page.`;
  const text = `Hi ${name},\n\n${opener}\n\nThis link signs you in and takes you straight to the lesson. No entry code needed:\n${link}\n\n`
    + `Here's how a lesson counts:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${prize}\n\n`
    + `See your progress anytime: ${ORIGIN}/#me\n\n${fine}\n\nHenry Hunter\nCrust & Crumb Academy`;
  const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2b2118;line-height:1.55;font-size:16px">
<p>Hi ${esc(name)},</p>
<p>${esc(opener)}</p>
<p style="margin:26px 0"><a href="${esc(link)}" style="background:#8a5a2b;color:#fff;padding:13px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">${esc(button)}</a></p>
<p style="font-size:14px;color:#6b5a4a;margin-top:-10px">One tap signs you in. No entry code needed.</p>
<p><strong>Here's how a lesson counts:</strong></p>
<ol style="padding-left:22px">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
<p>${esc(prize)}</p>
<p><a href="${ORIGIN}/#me" style="color:#8a5a2b">See your progress anytime</a></p>
<p style="font-size:13px;color:#6b5a4a">${esc(fine)}</p>
<p>Henry Hunter<br>Crust &amp; Crumb Academy</p></div>`;
  return { subject, text, html };
}

async function build(rows: Row[], d: Deps): Promise<Mail[]> {
  const out: Mail[] = [];
  for (const r of rows) {
    const credential = d.random();
    await d.issue(r.entrant_id, await d.sha256(credential), LINK_DAYS);
    const link = `${ORIGIN}/recover-entry#r=${credential}&next=${r.next_key}&auto=1`;
    out.push({ to: r.email, ...compose(r, link, d.now()) });
  }
  return out;
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const ok = !!origin && d.origins.includes(origin);
  const h = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (ok) { h.set('Access-Control-Allow-Origin', origin!); h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'content-type, apikey, authorization, x-client-info'); h.set('Vary', 'Origin'); }
  const reply = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: h });
  if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: h });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!ok) return reply(403, { error: 'origin' });
  if (!d.enabled) return reply(503, { error: 'unavailable' });
  let body: any;
  try { const t = await req.text(); if (t.length > 2048) throw 0; body = JSON.parse(t); if (!body || typeof body !== 'object') throw 0; }
  catch { return reply(400, { error: 'request' }); }
  if (typeof body.key !== 'string' || !body.key || !(await d.isAdmin(body.key).catch(() => false))) return reply(403, { error: 'denied' });

  try {
    const rows = await d.list();
    const now = d.now();
    const ready = eligible(rows, now);
    if (body.action === 'preview') {
      return reply(200, {
        eligible: ready.length,
        recently_emailed: rows.filter(r => !r.is_test && !TEST_EMAILS.includes(r.email) && !ready.includes(r)).length,
        rows: rows.filter(r => !r.is_test).map(r => ({ entrant_id: r.entrant_id, last_sent_at: r.last_sent_at, quiz_passed: r.quiz_passed })),
        gap_days: RESEND_GAP_DAYS,
      });
    }
    if (body.action === 'test') {
      const targets = rows.filter(r => TEST_EMAILS.includes(r.email));
      if (!targets.length) return reply(404, { error: 'no_test_entry' });
      const mails = (await build(targets, d)).map(m => ({ ...m, subject: '[Preview] ' + m.subject }));
      await d.sendBatch(mails, 'test-' + await d.sha256(targets.map(t => t.entrant_id).join(',') + now));
      return reply(200, { sent: mails.length, to: targets.map(t => t.email) });
    }
    if (body.action === 'send') {
      if (!Number.isInteger(body.expect) || body.expect !== ready.length) return reply(409, { error: 'changed', eligible: ready.length });
      if (!ready.length) return reply(200, { sent: 0 });
      let sent = 0;
      for (let i = 0; i < ready.length; i += 100) {
        const chunk = ready.slice(i, i + 100);
        const mails = await build(chunk, d);
        await d.sendBatch(mails, 'send-' + await d.sha256(chunk.map(r => r.entrant_id).sort().join(',') + ymd(now)));
        for (const r of chunk) await d.logged(r.entrant_id, r.next_key).catch(e => d.log?.('log', e));
        sent += chunk.length;
      }
      return reply(200, { sent });
    }
    return reply(400, { error: 'request' });
  } catch (e) {
    d.log?.(body.action, e);
    return reply(502, { error: 'send_failed' });
  }
}
