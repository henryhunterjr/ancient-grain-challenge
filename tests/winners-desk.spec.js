// Browser checks for the winners desk and the public claim page. Every Supabase call is mocked;
// nothing reaches production. Run: npx playwright test tests/winners-desk.spec.js
const { test, expect } = require('@playwright/test');

const TOKEN = '22222222-2222-4222-8222-222222222222';
const tasks = [
  { key: 'm3', title: 'From Berries to Bread', category: 'module', points: 20, sort: 10, active: true },
  { key: 'm7', title: 'Rye Redefined', category: 'module', points: 20, sort: 20, active: true },
  { key: 'm1', title: 'Why Ancient Wheat Dough Feels Different', category: 'module', points: 20, sort: 30, active: true },
  { key: 'm2', title: 'The Kneading Fallacy', category: 'module', points: 20, sort: 40, active: true },
  { key: 'm4', title: 'Which Wheat Berry Should You Use?', category: 'module', points: 20, sort: 50, active: true },
  { key: 'm6', title: 'Mastering Einkorn', category: 'module', points: 20, sort: 60, active: true },
  { key: 'm5', title: 'Ancient Grain Sourdough Starter', category: 'module', points: 20, sort: 70, active: true },
];
const entrant = (id, name, email, done, extra = {}) => ({
  id, entry_code: id, full_name: name, email, skool_name: 'Crust & Crumb Academy', country: 'United States', region: 'Ohio',
  mill_status: '', experience: '', newsletter: true, disqualified: false, is_test: false, preferred_grain: 'Spelt', created_at: '2026-10-10T12:00:00Z',
  verified_points: done.length * 20, pending_points: 0, modules_verified: done.length, modules_total: 7,
  claims: done.map(k => ({ id: k + id, task_key: k, status: 'verified', proof: 'Score: 90%', claimed_at: '2026-10-12T12:00:00Z' })), ...extra,
});
const overview = {
  entrants: [
    entrant('e1', 'Winnie Baker', 'winnie@example.invalid', ['m3']),
    entrant('e2', 'Stuck Sam', 'sam@example.invalid', []),
    entrant('e3', 'Halfway Hal', 'hal@example.invalid', ['m3', 'm7', 'm1', 'm2']),
    entrant('e4', 'Finished Fay', 'fay@example.invalid', ['m3', 'm7', 'm1', 'm2', 'm4', 'm6', 'm5']),
  ],
  draws: [{ prize: '5 lb bag', kind: 'weekly', label: null, name: 'Winnie Baker', email: 'winnie@example.invalid', skool_name: 'Crust & Crumb Academy', preferred_grain: 'Spelt', entries: 20, pool_size: 3, drawn_at: '2026-10-16T13:52:00Z' }],
};
let winner;
const resetWinner = () => { winner = {
  draw_id: 'd1', prize: '5 lb bag', kind: 'weekly', label: null, entries: 20, pool_size: 3, drawn_at: '2026-10-16T13:52:00Z',
  entrant_id: 'e1', full_name: 'Winnie Baker', email: 'winnie@example.invalid', skool_name: 'Crust & Crumb Academy', country: 'United States', region: 'Ohio', preferred_grain: 'Spelt',
  modules_verified: 1, verified_points: 20, claim_token: TOKEN, status: 'drawn', grain: 'Spelt', ship_name: '', address1: '', address2: '', city: '', ship_region: '', postal: '', ship_country: '', phone: '',
  tracking: '', notes: '', claim_expires_at: null, notified_at: null, reminded_at: null, address_received_at: null, sent_to_partner_at: null, shipped_at: null, announced_at: null,
}; };
const calls = [];
const pmState = { sent: false };

async function mock(page) {
  calls.length = 0; resetWinner(); pmState.sent = false;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname.endsWith('/functions/v1/progress-mail')) {
      const body = route.request().postDataJSON() || {}; calls.push({ name: 'progress-mail', body });
      if (body.key !== 'local-only') return route.fulfill({ status: 403, json: { error: 'denied' } });
      if (body.action === 'preview') return route.fulfill({ json: pmState.sent
        ? { eligible: 0, recently_emailed: 3, gap_days: 3, rows: ['e1','e2','e3'].map(id => ({ entrant_id: id, last_sent_at: '2026-10-19T17:05:00Z', quiz_passed: false })) }
        : { eligible: 3, recently_emailed: 0, gap_days: 3, rows: ['e1','e2','e3'].map(id => ({ entrant_id: id, last_sent_at: null, quiz_passed: false })) } });
      if (body.action === 'test') return route.fulfill({ json: { sent: 1, to: ['henrysbreadkitchen@gmail.com'] } });
      if (body.action === 'send') { if (body.expect !== 3) return route.fulfill({ status: 409, json: { error: 'changed' } }); pmState.sent = true; return route.fulfill({ json: { sent: 3 } }); }
    }
    if (!url.pathname.includes('/rpc/')) return route.abort();
    const name = url.pathname.split('/rpc/')[1];
    const body = route.request().postDataJSON() || {};
    calls.push({ name, body });
    if (name === 'get_tasks') return route.fulfill({ json: tasks });
    if (name === 'admin_overview') return route.fulfill({ json: body.p_key === 'local-only' ? overview : { error: 'denied' } });
    if (name === 'admin_winners') return route.fulfill({ json: [winner] });
    if (name === 'admin_winner_mark') {
      const ev = body.p_event; const now = new Date().toISOString();
      if (ev === 'notified') { winner.status = 'notified'; winner.notified_at = now; winner.claim_expires_at = new Date(Date.now() + 7 * 864e5).toISOString(); }
      if (ev === 'announced') winner.announced_at = now;
      if (ev === 'sent_to_partner') { winner.status = 'sent_to_partner'; winner.sent_to_partner_at = now; }
      return route.fulfill({ json: { ok: true } });
    }
    if (name === 'admin_set_draw_label') { winner.label = body.p_label; return route.fulfill({ json: { ok: true } }); }
    if (name === 'admin_winner_edit') { Object.assign(winner, body.p_fields); return route.fulfill({ json: { ok: true } }); }
    if (name === 'winner_claim') return route.fulfill({ json: body.p_claim === TOKEN
      ? { first_name: 'Winnie', prize: '5 lb bag', kind: 'weekly', label: 'Week 1 · Oct 16', grain: 'Spelt', ship_name: '', address1: '', address2: '', city: '', region: '', postal: '', country: '', phone: '', submitted: false, locked: false, closed: false, expires_at: new Date(Date.now() + 6 * 864e5).toISOString() }
      : { error: 'notfound' } });
    if (name === 'winner_claim_submit') return route.fulfill({ json: body.p_address1 ? { ok: true } : { error: 'address' } });
    return route.fulfill({ json: [] });
  });
}

test('admin desk: winner card, labels, notify, partner list, announcement, nudges', async ({ page }) => {
  await mock(page);
  await page.goto('/admin');
  await page.fill('#key', 'local-only');
  await page.click('#login button[type=submit]');
  await expect(page.locator('#win-list')).toContainText('Winnie Baker');
  await expect(page.locator('#win-list')).toContainText('Needs notice');
  await expect(page.locator('#win-list .code')).toHaveValue(`https://challenge.bakinggreatbread.com/claim?c=${TOKEN}`);

  // Default draw label is filled in for today's draw.
  await expect(page.locator('#draw-label')).toHaveValue(/Week \d · |Finale · /);

  // Missing label gets fixed from the draw date.
  await page.click('#win-fix-labels');
  await expect(page.locator('#win-list')).toContainText('Week 1 · Oct 16');
  expect(calls.find(c => c.name === 'admin_set_draw_label').body.p_label).toBe('Week 1 · Oct 16');

  // Winner email carries the claim link, then notify moves the status.
  const href = await page.locator('#win-list a', { hasText: 'Open winner email' }).getAttribute('href');
  expect(decodeURIComponent(href)).toContain(`/claim?c=${TOKEN}`);
  expect(decodeURIComponent(href)).toContain('mail.google.com/mail/?view=cm');
  expect(decodeURIComponent(href)).toContain('to=winnie@example.invalid');
  expect(decodeURIComponent(href)).not.toContain('—');
  await page.click('#win-list button:has-text("Mark notified")');
  await expect(page.locator('#win-list')).toContainText('Waiting on address');

  // Hand-entered address makes the winner ready for Grand Teton.
  await page.click('#win-list button:has-text("Enter address by hand")');
  await page.locator('#win-list label:has-text("Street") input').fill('1 Main St');
  await page.locator('#win-list label:has-text("City") input').fill('Columbus');
  await page.locator('#win-list label:has-text("State") input').fill('OH');
  await page.locator('#win-list label:has-text("ZIP") input').fill('43215');
  await page.click('#win-list button:has-text("Save details")');
  winner.status = 'address_received'; winner.address_received_at = new Date().toISOString(); winner.ship_region = 'OH';
  await page.click('#refresh');
  await expect(page.locator('#partner-count')).toContainText('1 bag is ready');
  await expect(page.locator('#partner-table')).toContainText('1 Main St');
  await page.fill('#partner-email', 'adam@example.invalid');
  const partnerHref = decodeURIComponent(await page.locator('#partner-mail').getAttribute('href'));
  expect(partnerHref).toContain('to=adam@example.invalid');
  expect(partnerHref).toContain('1 Main St');
  expect(partnerHref).toContain('Spelt');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#partner-csv')]);
  expect(dl.suggestedFilename()).toMatch(/grand-teton-shipments-/);

  // Announcement uses first name and last initial only, and newsletter HTML exists.
  await expect(page.locator('#ann-out textarea').nth(0)).toHaveValue(/Winnie B\. \((Ohio|OH)\)/);
  await expect(page.locator('#ann-out textarea').nth(0)).not.toHaveValue(/Winnie Baker/);
  await expect(page.locator('#ann-out textarea').nth(0)).not.toHaveValue(/—/);
  await expect(page.locator('#ann-out textarea').nth(2)).toHaveValue(/<h2>Week 1 · Oct 16 winners/);

  // Nudges: stalled bakers listed with their next lesson, finished baker excluded.
  await expect(page.locator('#nudge-tiles')).toContainText('Registered, no lessons');
  await expect(page.locator('#nudge-rows')).toContainText('Stuck Sam');
  await expect(page.locator('#nudge-rows tr', { hasText: 'Stuck Sam' })).toContainText('From Berries to Bread');
  await expect(page.locator('#nudge-rows tr', { hasText: 'Halfway Hal' })).toContainText('Which Wheat Berry Should You Use?');
  await expect(page.locator('#nudge-rows')).not.toContainText('Finished Fay');
  const nudge = decodeURIComponent(await page.locator('#nudge-rows tr', { hasText: 'Halfway Hal' }).locator('a').getAttribute('href'));
  expect(nudge).toContain('lesson?m=m4');
  expect(nudge).toContain('4 of the seven lessons');
  await page.selectOption('#nudge-filter', '0');
  await expect(page.locator('#nudge-rows')).not.toContainText('Halfway Hal');
  await expect(page.locator('#nudge-blast')).toHaveValue(/Winnie B\./);
});

test('claim page: validates, submits, and handles a bad link', async ({ page }) => {
  await mock(page);
  await page.goto(`/claim?c=${TOKEN}`);
  await expect(page.locator('#title')).toContainText('Winnie, you won');
  await expect(page.locator('#expires')).toContainText('Please send your details by');
  await expect(page.locator('#grain')).toHaveValue('Spelt');
  await page.click('#send');
  await expect(page.locator('#msg')).toContainText('Fill in every address line');
  await page.fill('#ship_name', 'Winnie Baker');
  await page.fill('#address1', '1 Main St');
  await page.fill('#city', 'Columbus');
  await page.fill('#region', 'OH');
  await page.fill('#postal', '43215');
  await page.fill('#phone', '614-555-0100');
  await page.click('#send');
  await expect(page.locator('#done')).toBeVisible();
  const submit = calls.find(c => c.name === 'winner_claim_submit').body;
  expect(submit).toMatchObject({ p_claim: TOKEN, p_grain: 'Spelt', p_address1: '1 Main St', p_country: 'United States', p_phone: '614-555-0100' });

  await page.goto('/claim?c=not-a-token');
  await expect(page.locator('#bad')).toBeVisible();
  expect(calls.filter(c => c.name === 'winner_claim').length).toBe(1);
});

test('claim name is literal text, with no injected markup', async ({ page }) => {
  await mock(page);
  const hostile = '<img/src=x/onerror=window.claimInjected=1>';
  await page.route('**/rpc/winner_claim', route => route.fulfill({ json: {
    first_name: hostile, kind: 'weekly', grain: 'Spelt', locked: false, closed: false,
  } }));
  await page.goto(`/claim?c=${TOKEN}`);
  await expect(page.locator('#title')).toHaveText(`${hostile}, you won`);
  await expect(page.locator('#title em')).toHaveText('won');
  await expect(page.locator('#title img')).toHaveCount(0);
  expect(await page.evaluate(() => window.claimInjected)).toBeUndefined();
});

test('newsletter escapes winner fields and CSV neutralizes formulas', async ({ page }) => {
  await mock(page);
  await page.goto('/admin');
  await page.fill('#key', 'local-only');
  await page.click('#login button[type=submit]');
  await expect(page.locator('#win-list')).toContainText('Winnie Baker');
  const result = await page.evaluate(() => {
    const hostile = '<img/src=x/onerror=alert(1)>';
    const w = { full_name: hostile, region: hostile, grain: hostile, kind: 'weekly', drawn_at: '2026-10-16T13:52:00Z' };
    const html = AGCWinners.announcement([w], hostile).newsletterHtml;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const formulas = ['=1+1', '+SUM(1,2)', '-1+1', '@SUM(1,2)', '\t=1+1', '  =1+1', '\r=1+1'];
    const csv = formulas.map(value => ({ value, text: AGCWinners.partnerCsv([{ ...w, label: value, ship_name: value, address1: value, phone: value }]) }));
    return { html, images: doc.querySelectorAll('img').length, text: doc.body.textContent, csv };
  });
  expect(result.images).toBe(0);
  expect(result.html).toContain('&lt;img/src=x/onerror=alert(1)&gt;');
  expect(result.text).toContain('<img/src=x/onerror=alert(1)>');
  for (const row of result.csv) {
    const neutralized = `"'${row.value.replace(/"/g, '""')}"`;
    expect(row.text.split(neutralized).length - 1).toBe(4);
  }
});

test('mixer draw uses its own kind and prize after explicit confirmation', async ({ page }) => {
  await mock(page);
  await page.goto('/admin');
  await page.fill('#key', 'local-only');
  await page.click('#login button[type=submit]');
  await expect(page.locator('#win-list')).toContainText('Winnie Baker');
  await page.selectOption('#draw-kind', 'mixer');
  await page.route('**/rpc/admin_draw', route => {
    calls.push({ name: 'admin_draw', body: route.request().postDataJSON() });
    return route.fulfill({ json: { name: 'Synthetic Baker', entries: 1, pool_size: 4 } });
  });
  await page.click('#draw-arm');
  expect(calls.some(c => c.name === 'admin_draw')).toBe(false);
  await page.click('#draw-go');
  await expect(page.locator('#draw-msg')).toContainText('Synthetic Baker');
  expect(calls.find(c => c.name === 'admin_draw').body).toMatchObject({ p_kind: 'mixer', p_prize: 'Bosch Universal Plus stand mixer', p_label: 'Mixer · Dec 1' });
});

test('mixer fulfillment routes only its winner to NutriMill and uses mixer messages', async ({ page }) => {
  await mock(page);
  const grain = { ...winner, status: 'address_received', ship_name: 'Grain Winner', address1: '1 Grain St', city: 'Columbus' };
  Object.assign(winner, { draw_id: 'd-mixer', kind: 'mixer', prize: 'Bosch Universal Plus stand mixer', label: 'Mixer · Dec 1', full_name: 'Mixer Baker', email: 'mixer@example.invalid', modules_verified: 0, status: 'drawn', grain: '' });
  await page.route('**/rpc/admin_winners', route => route.fulfill({ json: [grain, winner] }));
  await page.goto('/admin');
  await page.fill('#key', 'local-only');
  await page.click('#login button[type=submit]');
  const card = page.locator('#win-list .winner', { hasText: 'Mixer Baker' });
  const notice = decodeURIComponent(await card.getByRole('link', { name: 'Open winner email in Gmail' }).getAttribute('href'));
  expect(notice).toContain('Bosch Universal Plus');
  expect(notice).toContain('NutriMill');
  expect(notice).not.toMatch(/which grain|25 lb|Grand Teton/);
  await card.getByRole('button', { name: 'Mark notified' }).click();
  const reminder = decodeURIComponent(await card.getByRole('link', { name: 'Open reminder email in Gmail' }).getAttribute('href'));
  expect(reminder).toContain('NutriMill');
  expect(reminder).not.toContain('of grain');
  Object.assign(winner, { status: 'address_received', address1: '2 Mixer St', city: 'Columbus', ship_name: 'Mixer Baker' });
  await page.click('#refresh');
  await expect(page.locator('#partner-table')).toContainText('Grain Winner');
  await expect(page.locator('#partner-table')).not.toContainText('Mixer Baker');
  await page.fill('#partner-email', 'grain-partner@example.invalid');
  await page.selectOption('#partner-kind', 'mixer');
  await expect(page.locator('#partner-email')).toHaveValue('');
  await page.fill('#partner-email', 'mixer-partner@example.invalid');
  await expect(page.locator('#partner-table')).toContainText('Mixer Baker');
  await expect(page.locator('#partner-table')).not.toContainText('Grain Winner');
  const mail = decodeURIComponent(await page.locator('#partner-mail').getAttribute('href'));
  expect(mail).toContain('mixer-partner@example.invalid');
  expect(mail).toContain('2 Mixer St');
  expect(mail).not.toMatch(/1 Grain St|Spelt|Adam|Jade/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#partner-all')]);
  expect(dl.suggestedFilename()).toBe('nutrimill-all-winners.csv');
  const fs = require('node:fs');
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  expect(csv).toContain('Mixer Baker');
  expect(csv).not.toMatch(/Grain Winner|Spelt/);
  await page.selectOption('#ann-week', 'Mixer · Dec 1');
  await expect(page.locator('#ann-out textarea').first()).toHaveValue(/Mixer B\..*Bosch Universal Plus stand mixer from NutriMill/);
  await expect(page.locator('#ann-out textarea').first()).not.toHaveValue(/5 lb bag|which grain/);
  page.once('dialog', dialog => dialog.accept());
  await page.click('#partner-mark');
  await expect(card).toContainText('At NutriMill');
  expect(calls.filter(c => c.name === 'admin_winner_mark' && c.body.p_event === 'sent_to_partner').map(c => c.body.p_draw_id)).toEqual(['d-mixer']);
  const shipped = decodeURIComponent(await card.getByRole('link', { name: 'Open shipped email in Gmail' }).getAttribute('href'));
  expect(shipped).toContain('NutriMill');
  expect(shipped).not.toMatch(/25 lb|Grand Teton|of grain/);
  await page.selectOption('#partner-kind', 'grain');
  await expect(page.locator('#partner-email')).toHaveValue('grain-partner@example.invalid');
});

test('mixer claim collects an address without asking for grain', async ({ page }) => {
  await mock(page);
  await page.route('**/rpc/winner_claim', route => route.fulfill({ json: { first_name: 'Mixer', kind: 'mixer', grain: '', locked: false, closed: false } }));
  await page.goto(`/claim?c=${TOKEN}`);
  await expect(page.locator('#lede')).toContainText('Bosch Universal Plus stand mixer from NutriMill');
  await expect(page.locator('#grain-field')).toBeHidden();
  await expect(page.locator('#privacy-copy')).toContainText('NutriMill');
  for (const [field, text] of Object.entries({ ship_name: 'Synthetic Winner', address1: '2 Mixer St', city: 'Columbus', region: 'OH', postal: '43215' })) await page.fill('#' + field, text);
  await page.click('#send');
  await expect(page.locator('#done')).toBeVisible();
  await expect(page.locator('#done-copy')).toContainText('NutriMill');
  expect(calls.find(c => c.name === 'winner_claim_submit').body.p_grain).toBe('');
});

test('public mixer announcement and rules agree at mobile and desktop widths', async ({ page }) => {
  await mock(page);
  await page.route('**/rpc/winners', route => route.fulfill({ json: [{ kind: 'mixer', name: 'Synthetic B.', label: 'Mixer · Dec 1' }] }));
  await page.goto('/');
  await expect(page.locator('.prize-row')).toContainText('Bosch Universal Plus from NutriMill');
  await expect(page.locator('#winners-list')).toContainText('Stand mixer');
  await expect(page.locator('section[aria-labelledby="me"] img[src="img/ancient-grain-prize-banner.svg"]')).toHaveCount(1);
  await expect(page.locator('#me')).toHaveJSProperty('tagName', 'H2');
  await page.getByRole('link', { name: 'Register free', exact: true }).click();
  await expect(page).toHaveURL(/\/#me$/);
  await expect(page.getByRole('heading', { name: 'Your entry & private code' })).toBeInViewport();
  await expect(page.locator('#rules')).toContainText('Each verified point adds one more entry.');
  await expect(page.locator('#rules')).toContainText("Winning grain doesn't stop you from winning the mixer.");
  for (const width of [393, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const image = page.locator('img[src="img/mixer-giveaway.jpg"]');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(n => n.complete && n.naturalWidth)).toBe(1200);
    const box = await image.boundingBox();
    expect(Math.abs(box.width / box.height - 1200 / 675)).toBeLessThan(.02);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-output/mixer-public-${width}.png`, fullPage: true });
    await page.locator('header.hero').screenshot({ path: `test-output/mixer-hero-${width}.png` });
  }
});

test('next-lesson emails: preview, two-tap send, emailed column', async ({ page }) => {
  await mock(page);
  await page.goto('/admin');
  await page.fill('#key', 'local-only');
  await page.click('#login button[type=submit]');
  const send = page.locator('#pm-send');
  await expect(send).toHaveText('Email 3 bakers');
  await page.click('#pm-test');
  await expect(page.locator('#pm-msg')).toContainText('Preview sent to henrysbreadkitchen@gmail.com');
  await send.click();
  await expect(send).toHaveText('Tap again to send 3 emails now');
  expect(calls.filter(c => c.name === 'progress-mail' && c.body.action === 'send').length).toBe(0);
  await send.click();
  await expect(page.locator('#pm-msg')).toContainText('Sent 3 emails');
  await expect(send).toHaveText('Everyone is up to date');
  await expect(send).toBeDisabled();
  expect(calls.find(c => c.body?.action === 'send').body).toEqual({ action: 'send', key: 'local-only', expect: 3 });
  await expect(page.locator('#nudge-rows tr').first().locator('td').nth(4)).not.toHaveText('');
});
