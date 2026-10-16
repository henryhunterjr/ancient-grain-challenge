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

async function mock(page) {
  calls.length = 0; resetWinner();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
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
  expect(decodeURIComponent(href)).toContain('mailto:winnie@example.invalid');
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
  expect(partnerHref).toContain('mailto:adam@example.invalid');
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
