import postgres from 'npm:postgres@3.4.4';
import { handle, ORIGIN, type Mail } from './logic.ts';

const env = (k: string) => Deno.env.get(k) || '';
const resendKey = env('AGC_RESEND_KEY');
const from = env('AGC_PROGRESS_FROM') || 'Henry Hunter <noreply@bakinggreatbread.com>';
const replyTo = env('AGC_REPLY_TO') || 'henrysbreadkitchen@gmail.com';
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20 });
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const log = (where: string, e: unknown) => console.error('progress-mail', where, e instanceof Error ? e.message.slice(0, 200) : 'error');

Deno.serve(req => handle(req, {
  origins: [ORIGIN],
  enabled: !!(resendKey && env('SUPABASE_DB_URL') && env('AGC_PROGRESS_ENABLED') !== 'false'),
  now: () => Date.now(),
  random: () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  sha256: async v => hex(await crypto.subtle.digest('SHA-256', enc.encode(v))),
  isAdmin: async key => (await sql`select public._is_admin(${key}) as ok`)[0]?.ok === true,
  list: async () => (await sql`select * from agc_entry_recovery.progress_mail_list_v2()`) as any,
  winners: async () => (await sql`select public_name, grain, drawn_on::text as drawn_on from agc_entry_recovery.latest_grain_winners()`) as any,
  issue: async (entrant, hash, days) => { await sql`select agc_entry_recovery.progress_link_issue(${entrant}::uuid, ${hash}, ${days})`; },
  logged: async (entrant, lesson) => { await sql`select agc_entry_recovery.progress_mail_logged(${entrant}::uuid, ${lesson})`; },
  log,
  async sendBatch(mails: Mail[], idempotency: string) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resendKey, 'Idempotency-Key': idempotency },
      body: JSON.stringify(mails.map(m => ({ from, reply_to: replyTo, to: [m.to], subject: m.subject, text: m.text, html: m.html }))),
    });
    if (!res.ok) throw new Error('resend ' + res.status + ' ' + (await res.text()).slice(0, 150));
  },
}));
