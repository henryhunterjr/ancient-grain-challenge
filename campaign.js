// Shared, side-effect-free outreach helpers. No roster or credential is stored here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AGCCampaign = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const normalEmail = s => String(s || '').trim().toLowerCase();
  function parseCSV(text) {
    if (text.length > 3e6) throw Error('Use a CSV smaller than 3 MB.');
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else if (quoted || !field) quoted = !quoted; else throw Error('Check the CSV quotation marks.'); }
      else if (c === ',' && !quoted) { row.push(field); field = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(x => x.trim())) rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (quoted) throw Error('The CSV has an unfinished quoted field.');
    row.push(field); if (row.some(x => x.trim())) rows.push(row);
    const header = (rows.shift() || []).map(x => x.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[_-]+/g, ' '));
    const index = header.findIndex(x => ['email', 'email address', 'member email'].includes(x));
    if (index < 0) throw Error('The CSV needs an Email or Email address column. Names alone cannot confirm membership.');
    const emails = new Set(); let invalid = 0;
    for (const r of rows) { const email = normalEmail(r[index]); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) emails.add(email); else invalid++; }
    if (!emails.size || emails.size > 20000 || invalid) throw Error(invalid ? `${invalid} row(s) have missing or invalid emails. Fix those before replacing the roster.` : 'Use a roster with 1 to 20,000 valid emails.');
    return { emails: [...emails], duplicates: rows.length - emails.size, rows: rows.length };
  }
  function membership(email, snapshot, now = Date.now()) {
    if (!snapshot?.imported_at || !Array.isArray(snapshot.emails)) return 'unknown';
    if (now - Date.parse(snapshot.imported_at) > 14 * 864e5 || !Number.isFinite(Date.parse(snapshot.imported_at))) return 'unknown';
    return snapshot.emails.includes(normalEmail(email)) ? 'member' : 'unmatched';
  }
  const membershipLabel = status => ({ member: 'Academy member', unmatched: 'Not matched in latest roster', unknown: 'Membership unknown' }[status] || 'Membership unknown');
  function latestWinners(winners) {
    const eligible = winners.filter(w => w.kind !== 'mixer' && w.status !== 'forfeited');
    if (!eligible.length) return [];
    const date = w => new Date(w.drawn_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const latest = eligible.map(date).sort().at(-1);
    return eligible.filter(w => date(w) === latest);
  }
  const SOURCES = ['Academy', 'Facebook', 'YouTube', 'Instagram', 'TikTok', 'Newsletter', 'Partner', 'Friend', 'Search', 'Other'];
  return { parseCSV, membership, membershipLabel, latestWinners, SOURCES };
});
