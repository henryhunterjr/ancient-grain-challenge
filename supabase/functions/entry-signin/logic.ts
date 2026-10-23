// Email sign-in links for the Ancient Grain Challenge.
// Pure request logic, kept free of Deno globals so it can be tested with stubs.
export const ORIGIN = 'https://challenge.bakinggreatbread.com';
export const GENERIC = 'If that email is registered for the challenge, a sign-in link is on its way. Check your inbox and spam folder. The link works once and expires in 60 minutes.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/;

export interface Deps {
  origins: string[];
  enabled: boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): string;                       // 43-char base64url credential
  sha256(value: string): Promise<string>; // hex
  hmac(value: string): Promise<string>;   // hex, keyed with a server-only pepper
  call(name: 'entry_recovery_issue' | 'entry_recovery_redeem' | 'entry_recovery_revoke', args: unknown[]): Promise<any>;
  send(to: string, link: string, idempotency: string, timeoutMs: number): Promise<void>;
  log?(where: string, e: unknown): void; // never receives emails or credentials
}

// Only public quiz fields travel in the link, re-checked by the browser before use.
export function quizFragment(q: unknown): string {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return '';
  const { quiz, score, total } = q as Record<string, unknown>;
  const s = Number(score), t = Number(total);
  if (typeof quiz !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(quiz)) return '';
  if (!Number.isFinite(s) || s < 0 || s > 100 || !Number.isInteger(t) || t < 1 || t > 100) return '';
  return '&quiz=' + encodeURIComponent(quiz) + '&score=' + encodeURIComponent(String(s)) + '&total=' + t;
}

function headers(origin: string | null, d: Deps): Headers {
  const h = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  if (origin && d.origins.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'content-type, apikey, authorization, x-client-info');
    h.set('Access-Control-Max-Age', '600');
    h.set('Vary', 'Origin');
  }
  return h;
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const h = headers(origin, d);
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === 'OPTIONS') return new Response(null, { status: origin && d.origins.includes(origin) ? 204 : 403, headers: h });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!origin || !d.origins.includes(origin)) return reply(403, { error: 'origin' });
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') || '')) return reply(415, { error: 'request' });
  if (!d.enabled) return reply(503, { error: 'unavailable' });

  let body: any;
  try {
    const text = await req.text();
    if (text.length > 1024) throw new Error();
    body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch { return reply(400, { error: 'request' }); }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const ipHash = await d.hmac('ip:' + ip);

  if (body.action === 'request') {
    if (typeof body.email !== 'string') return reply(400, { error: 'email' });
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !EMAIL.test(email)) return reply(400, { error: 'email' });
    // Registered, unknown, rate-limited and failed sends all get the same answer
    // after the same delay, so the form cannot be used to test who entered.
    const deadline = d.now() + 3000;
    const credential = d.random(), tokenHash = await d.sha256(credential);
    try {
      const issued = await d.call('entry_recovery_issue', [email, tokenHash, await d.hmac('email:' + email), ipHash]);
      if (issued?.recipient) {
        const next = typeof body.next === 'string' && /^m[1-9]$/.test(body.next) ? '&next=' + body.next : '';
        const link = ORIGIN + '/recover-entry#r=' + credential + quizFragment(body.quiz) + next;
        try { await d.send(issued.recipient, link, tokenHash, Math.max(500, deadline - d.now() - 100)); }
        catch (e) { d.log?.('send', e); await d.call('entry_recovery_revoke', [tokenHash]).catch(() => {}); }
      }
    } catch (e) { d.log?.('issue', e); /* same generic answer */ }
    await d.sleep(Math.max(0, deadline - d.now()));
    return reply(200, { message: GENERIC });
  }

  if (body.action === 'redeem') {
    if (typeof body.credential !== 'string' || !CREDENTIAL.test(body.credential)) return reply(400, { error: 'link' });
    try {
      const r = await d.call('entry_recovery_redeem', [await d.sha256(body.credential), ipHash]);
      if (!r || !UUID.test(r.token || '') || typeof r.first_name !== 'string') return reply(400, { error: 'link' });
      return reply(200, { token: r.token, first_name: r.first_name });
    } catch (e) { d.log?.('redeem', e); return reply(503, { error: 'unavailable' }); }
  }
  return reply(400, { error: 'request' });
}

export function emailContent(link: string) {
  const subject = 'Your Ancient Grain Challenge sign-in link';
  const giveaway = "You're already entered in the December 1 drawing for a Bosch Universal Plus stand mixer from NutriMill. Every verified point adds another entry. The two optional bonus quizzes can earn 20 points each, once.";
  const text = 'Here is your sign-in link for the Ancient Grain Challenge:\n\n' + link +
    '\n\nTap it, then tap "Sign me in." It works once and expires in 60 minutes. Any quiz score you were saving comes with you.' +
    '\n\nYour entry, points, and entry code stay the same. If you did not ask for this, ignore this email.\n\n' + giveaway + '\n\nHenry Hunter\nBaking Great Bread at Home';
  const safe = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#2b2118;line-height:1.5">
<h2 style="margin:0 0 12px">Sign in to the Ancient Grain Challenge</h2>
<p>Tap the button, then tap <strong>Sign me in</strong>. Any quiz score you were saving comes with you.</p>
<p style="margin:24px 0"><a href="${safe}" style="background:#8a5a2b;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Sign me in</a></p>
<p style="font-size:14px;color:#6b5a4a">This link works once and expires in 60 minutes. Your entry, points, and entry code stay the same. If you did not ask for this, ignore this email.</p>
<p>${giveaway}</p>
<p style="font-size:14px">Henry Hunter<br>Baking Great Bread at Home</p></div>`;
  return { subject, text, html };
}
