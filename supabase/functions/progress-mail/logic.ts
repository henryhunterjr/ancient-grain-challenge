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
  next_key: string | null; next_title: string | null; quiz_passed: boolean; last_sent_at: string | null;
  entries: number; next_points: number | null; open_bonus: { title: string; points: number }[] | null;
}
// Henry's announcement graphic, already live on the challenge site.
export const MIXER_IMAGE = ORIGIN + '/img/mixer-giveaway.jpg';
export interface Winner { public_name: string; grain: string | null; drawn_on: string }
export interface Mail { to: string; subject: string; text: string; html: string }
export interface Deps {
  origins: string[]; enabled: boolean;
  now(): number;
  random(): string;
  sha256(v: string): Promise<string>;
  isAdmin(key: string): Promise<boolean>;
  list(): Promise<Row[]>;
  winners(): Promise<Winner[]>;
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
  return rows.filter(r => !r.is_test && !TEST_EMAILS.includes(r.email)
    && (!r.last_sent_at || now - Date.parse(r.last_sent_at) >= gap));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const day = (d: string) => new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

export function compose(r: Row, link: string, now: number, winners: Winner[] = []): Omit<Mail, 'to'> {
  const name = r.first_name || 'there';
  const draw = nextDraw(now);
  const finished = !r.next_key;
  const entries = Math.max(1, r.entries || 1);
  const entriesText = entries === 1 ? '1 entry' : `${entries} entries`;
  const bonus = (r.open_bonus || []).filter(b => b && b.title && b.points > 0);
  const subject = finished ? `${name}, you're in the Bosch mixer drawing with ${entriesText}`
    : r.quiz_passed ? `${name}, you're one step from credit on ${r.next_title}`
    : r.lessons_done === 0 ? `${name}, you're in the Bosch mixer drawing. Your first lesson is ready`
    : r.next_points ? `${name}, your next lesson adds ${r.next_points} mixer entries`
    : `${name}, your next lesson is ${r.next_title}`;
  const thanks = `I'm Henry Hunter, founder of the Crust & Crumb Academy, and I want to thank you for being part of the Ancient Grain Challenge. `
    + `The response to this series has gone way past what I expected, and I'm glad so many of you are getting real value out of it. That's the whole point: to help you become a better baker.`;
  const setup = `You've shown up for this, so I wanted to give something back. `
    + (r.lessons_done > 0 ? `You're already in the running for the grain.` : `Every lesson you finish puts you in the running for grain.`)
    + ` Now I'm giving you something to mix it in.`;
  const mixer = `Big news: I've decided to also give away a Bosch Universal Plus stand mixer from NutriMill. You're already entered. `
    + (entries === 1 ? `You got one entry just for registering, and every point you earn adds another.`
      : `You got one entry for registering, and every point you've earned counts as another, so right now you have ${entriesText}.`)
    + (!finished && r.next_points ? ` Finishing ${r.next_title} adds ${r.next_points} more.` : '')
    + ` I'll draw the winner live in the Academy on Tuesday, December 1.`;
  const status = finished
    ? `You finished all seven lessons, so you're also in the drawing for the 25 lb grand prize. Thank you for going the distance.`
    : r.quiz_passed
    ? `You passed the ${r.next_title} quiz, but the lesson isn't credited yet. The missing piece is your YouTube comment. Leave a comment on the video, then add the YouTube name you commented under. That's it.`
    : r.lessons_done === 0
    ? `You haven't finished a lesson yet. Your first one is ${r.next_title}, and it takes about 15 minutes.`
    : `You've finished ${r.lessons_done} of the 7 lessons. Next up is ${r.next_title}.`;
  const bonusIntro = finished
    ? (bonus.length ? `Want more mixer entries? These bonus activities are still open for you, and every point is another entry:` : `You've done every bonus activity too, so you're all set. I'll see you December 1.`)
    : '';
  const steps = ['Watch the video.', 'Leave a comment on it over on YouTube.', 'Take the quiz. 70% or better passes.',
    'Save your score and the YouTube name you commented under. Your points show up right away.'];
  const prize = finished ? '' : (draw ? `Every finished lesson also puts you in the next grain drawing on ${draw} for a 5 lb bag from Grand Teton Ancient Grains. ` : '')
    + 'Finish all seven and you qualify for the 25 lb grand prize on December 1.';
  const youtube = finished
    ? `If you haven't already, hit like and subscribe on YouTube, and leave a comment on the videos.`
    : `While you're on YouTube, hit like and subscribe, and leave a comment. Your comment is part of what earns you credit for each lesson.`;
  const keepComing = `Keep your questions and comments coming. I read every one, whether it's on YouTube, inside the Academy, or in Baking Great Bread at Home.`;
  const button = finished ? 'See my entry' : r.quiz_passed ? `Finish ${r.next_title}` : `Start ${r.next_title}`;
  const where = finished ? 'to your entry' : 'straight to the lesson';
  const fine = `Your sign-in link is just for you and works for ${LINK_DAYS} days, on your phone or computer. After that, tap "Email me a sign-in link" on any lesson page.`;
  const w = winners.filter(x => x && x.public_name);
  const winnersHead = w.length ? `This week's grain winners (drawn ${day(w[0].drawn_on)})` : '';
  const winnersTail = 'Congratulations, bakers. Your grain ships soon.';
  const text = [
    `Hi ${name},`, thanks, setup, mixer, status,
    `This link signs you in and takes you ${where}. No entry code needed:\n${link}`,
    finished ? bonusIntro + (bonus.length ? '\n' + bonus.map(b => `- ${b.title} (${b.points} points)`).join('\n') : '')
      : `Here's how a lesson counts:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    prize, youtube, keepComing, 'Henry Hunter\nCrust & Crumb Academy',
    w.length ? `${winnersHead}:\n${w.map(x => `- ${x.public_name}${x.grain ? ', ' + x.grain : ''}`).join('\n')}\n${winnersTail}` : '',
    `See your progress anytime: ${ORIGIN}/#me`, fine,
  ].filter(Boolean).join('\n\n');
  const p = (t: string, style = '') => `<p${style ? ` style="${style}"` : ''}>${esc(t)}</p>`;
  const bigNews = `<p><strong>Big news:</strong> ${esc(mixer.slice('Big news: '.length))}</p>`;
  const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2b2118;line-height:1.55;font-size:16px">
<p>Hi ${esc(name)},</p>
${p(thanks)}
${p(setup)}
<a href="${esc(link)}" style="display:block;margin:18px 0 8px"><img src="${MIXER_IMAGE}" width="560" alt="I'm giving away a Bosch Universal Plus stand mixer from NutriMill in the Ancient Grain Challenge" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px"></a>
${bigNews}
${p(status)}
<p style="margin:26px 0"><a href="${esc(link)}" style="background:#8a5a2b;color:#fff;padding:13px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">${esc(button)}</a></p>
${p('One tap signs you in. No entry code needed.', 'font-size:14px;color:#6b5a4a;margin-top:-10px')}
${finished
  ? p(bonusIntro) + (bonus.length ? `<ul style="padding-left:22px">${bonus.map(b => `<li>${esc(b.title)} <span style="color:#6b5a4a">(${b.points} points)</span></li>`).join('')}</ul>` : '')
  : `<p><strong>Here's how a lesson counts:</strong></p>\n<ol style="padding-left:22px">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`}
${prize ? p(prize) : ''}
${p(youtube)}
${p(keepComing)}
<p>Henry Hunter<br>Crust &amp; Crumb Academy</p>
${w.length ? `<div style="border-top:1px solid #e4d8c8;margin-top:22px;padding-top:14px"><p style="margin:0 0 6px"><strong>${esc(winnersHead)}</strong></p>
<ul style="padding-left:22px;margin:0 0 8px">${w.map(x => `<li>${esc(x.public_name)}${x.grain ? `, ${esc(x.grain)}` : ''}</li>`).join('')}</ul>${p(winnersTail, 'margin:0')}</div>` : ''}
<p style="margin-top:22px"><a href="${ORIGIN}/#me" style="color:#8a5a2b">See your progress anytime</a></p>
${p(fine, 'font-size:13px;color:#6b5a4a')}
</div>`;
  return { subject, text, html };
}

async function build(rows: Row[], d: Deps): Promise<Mail[]> {
  const out: Mail[] = [];
  const winners = await d.winners().catch(e => { d.log?.('winners', e); return [] as Winner[]; });
  for (const r of rows) {
    const credential = d.random();
    await d.issue(r.entrant_id, await d.sha256(credential), LINK_DAYS);
    const link = `${ORIGIN}/recover-entry#r=${credential}${r.next_key ? '&next=' + r.next_key : ''}&auto=1`;
    out.push({ to: r.email, ...compose(r, link, d.now(), winners) });
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
      // Also show the finished-baker version, using Henry's own entry and email.
      const sample = targets.some(t => !t.next_key) ? [] : [{ ...targets[0], next_key: null, next_title: null, lessons_done: 7, quiz_passed: false, next_points: null }];
      const built = await build([...targets, ...sample], d);
      const mails = built.map((m, i) => ({ ...m, subject: (i >= targets.length ? '[Preview: finished version] ' : '[Preview] ') + m.subject }));
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
        for (const r of chunk) await d.logged(r.entrant_id, r.next_key ?? 'finished').catch(e => d.log?.('log', e));
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
