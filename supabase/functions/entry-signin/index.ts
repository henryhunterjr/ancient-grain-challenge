import postgres from 'npm:postgres@3.4.4';
import { emailContent, handle, ORIGIN } from './logic.ts';

const env = (k: string) => Deno.env.get(k) || '';
const resendKey = env('AGC_RESEND_KEY');
const from = env('AGC_FROM') || 'Ancient Grain Challenge <noreply@bakinggreatbread.com>';
// Pepper for hashing emails and IPs in rate limits. Falls back to the
// project's own service key, which only the server can see.
const pepper = env('AGC_RECOVERY_PEPPER') || env('SUPABASE_SERVICE_ROLE_KEY');
const sql = postgres(env('SUPABASE_DB_URL'), { prepare: false, max: 2, idle_timeout: 20 });
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const hmacKey = crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

const log = (where: string, e: unknown) => console.error('entry-signin', where, e instanceof Error ? e.message.slice(0, 200) : 'error');

const deps = {
  origins: [ORIGIN],
  enabled: !!(resendKey && pepper.length >= 32 && env('SUPABASE_DB_URL') && env('AGC_SIGNIN_ENABLED') !== 'false'),
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
  random: () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  sha256: async (v: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(v))),
  hmac: async (v: string) => hex(await crypto.subtle.sign('HMAC', await hmacKey, enc.encode(v))),
  async call(name: string, args: unknown[]) {
    const fn = sql.unsafe(`select agc_entry_recovery.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args as any[]);
    const rows = await fn;
    return rows[0]?.r ?? null;
  },
  log,
  async send(to: string, link: string, idempotency: string, timeoutMs: number) {
    const { subject, text, html } = emailContent(link);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resendKey, 'Idempotency-Key': idempotency },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!res.ok) throw new Error('delivery ' + res.status);
  },
};

Deno.serve(req => handle(req, deps as any));
