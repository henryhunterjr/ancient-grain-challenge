// Host-only campaign settings and minimal Academy email snapshot, saved through guarded RPCs.
window.AGCOutreach = (() => {
  const { rpc, el } = AGC; let ctx, state = {}, pending = null;
  const $ = id => document.getElementById(id);
  const status = e => AGCCampaign.membership(e.email, state.roster);
  const fields = ['week_start', 'intro', 'recipe_title', 'recipe_url', 'bake_title', 'bake_url'];
  function badges() {
    if (!ctx?.data) return;
    const entrants = ctx.data.entrants.filter(e => !e.is_test && !e.disqualified);
    const counts = { member: 0, unmatched: 0, unknown: 0 }; entrants.forEach(e => counts[status(e)]++);
    $('academy-summary').textContent = `${counts.member} matched members · ${counts.unmatched} not matched · ${counts.unknown} unknown`;
    const stamp = state.roster?.imported_at;
    $('academy-imported').textContent = stamp ? `Active-member roster imported ${new Date(stamp).toLocaleString()}. Refresh weekly. Matches older than 14 days become unknown. A missing match can mean a different email.` : 'No member roster imported. Joining-from answers are not verified membership.';
    document.querySelectorAll('#entrants tr[data-entrant-id]').forEach(row => {
      const entrant = entrants.find(e => e.id === row.dataset.entrantId);
      if (!entrant) return;
      let cell = row.querySelector('[data-membership]');
      if (!cell) { cell = el('small', { 'data-membership': '', class: 'membership-label' }); row.cells[0].append(el('br'), cell); }
      cell.textContent = AGCCampaign.membershipLabel(status(entrant));
    });
    const sources = Object.values(state.sources || {}); const countsBySource = {};
    sources.forEach(s => { if (s.heard_from) countsBySource[s.heard_from] = (countsBySource[s.heard_from] || 0) + 1; });
    $('source-summary').textContent = 'How bakers found us: ' + (Object.entries(countsBySource).map(([k,n]) => k + ': ' + n).join(' · ') || 'no answers recorded yet') + '. Earlier registrations have no retroactive source answer.';
    window.AGCWinners?.renderNudges();
  }
  function posts() {
    const saved = state.campaign || {};
    const today = new Date().toLocaleDateString('en-CA', {timeZone:'America/New_York'});
    const end = Date.parse((saved.week_start || '') + 'T12:00:00Z') + 7*864e5;
    const config = Number.isFinite(end) && today >= saved.week_start && today < new Date(end).toISOString().slice(0,10) ? saved : {};
    const latest = AGCCampaign.latestWinners(ctx.winners || []);
    const names = latest.map(w => window.AGCWinners.publicName(w.full_name)).join(', ');
    const dated = latest.length ? new Date(latest[0].drawn_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' }) : '';
    const nextFriday = ['2026-10-30','2026-11-06','2026-11-13','2026-11-20','2026-11-27'].find(d=>d>today);
    const drawingReminder = nextFriday ? `The next grain drawing is ${new Date(nextFriday+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'})}. One completed lesson gets you into the weekly pool if you haven't already won a 5 lb bag.` : 'The December 1 grain finale is coming. Complete all seven lessons to qualify for the final grain prizes.';
    const url = source => `https://challenge.bakinggreatbread.com/?utm_source=${source}&utm_medium=social&utm_campaign=from_berries_to_bread`;
    const drafts = [
      ['Monday: pick up your next lesson', `Already started From Berries to Bread? Pick up where you left off. Your next lesson is waiting, and each verified point adds another entry for the Bosch Universal Plus stand mixer drawing on December 1.\n\n${url('mew-monday')}`],
      ['Wednesday: put the lesson to work', config.recipe_url && /^https:\/\//.test(config.recipe_url) ? `Put what you've learned into a loaf. This week's recipe is ${config.recipe_title || 'ready for you'}. Bake it, bring your questions, and share what the dough taught you.\n\n${config.recipe_url}` : `Fresh-milled dough can feel different from one grain to the next. That's what we're working through in From Berries to Bread. Take the next lesson, then bring your questions into Crust & Crumb Academy.\n\n${url('mew-wednesday')}`],
      ['Thursday: grain drawing reminder', `${drawingReminder} Watch the lesson, pass its quiz, and record your YouTube comment name to claim credit. Grand Teton Ancient Grains provides the grain.\n\n${url('mew-thursday')}`],
      ['After drawing: celebrate the latest saved winners', latest.length ? `${latest.length} more ${latest.length === 1 ? 'bag' : 'bags'} of ancient grain ${latest.length === 1 ? 'is' : 'are'} going to home bakers. Congratulations to our ${dated} winners: ${names}.\n\nWe're learning together in From Berries to Bread, ${nextFriday ? 'with more Friday drawings ahead.' : 'with the December 1 finale ahead.'} Come bake with us.\n\n${url('mew-winners')}` : 'No saved grain winners yet. Draw and verify the winners before preparing this post.'],
      ['Saturday: community invitation', config.bake_url && /^https:\/\//.test(config.bake_url) ? `Pull up a chair for ${config.bake_title || 'our next bake-along'}. Bring your dough and your questions. Nobody bakes alone here.\n\n${config.bake_url}` : `You don't have to figure out fresh-milled bread by yourself. Come join us in Crust & Crumb Academy. Bring your questions, share your loaf, and bake alongside people learning just like you.\n\nhttps://skoo.ly/crust-crumb-academy`]
    ];
    $('outreach-posts').replaceChildren(...drafts.map(([title, text]) => {
      const box = el('textarea', { rows: 6, readonly: true }); box.value = text;
      const copy = el('button', { type: 'button', class: 'ghost small', text: 'Copy for MEW' });
      copy.onclick = async () => { await navigator.clipboard.writeText(box.value); copy.textContent = 'Copied'; };
      return el('details', {}, el('summary', { text: title }), box, copy);
    }));
  }
  let wired = false;
  async function refresh(next) {
    ctx = { ...ctx, ...next };
    if (!wired) {
      wired = true;
      $('academy-csv').onchange = async ev => {
        pending = null; $('academy-save').disabled = true;
        try {
          const file = ev.target.files[0]; if (!file) return;
          if (file.size > 3e6) throw Error('Use a CSV smaller than 3 MB.');
          pending = AGCCampaign.parseCSV(await file.text());
          const E = ctx.data.entrants.filter(e => !e.is_test && !e.disqualified);
          const matches = E.filter(e => pending.emails.includes(e.email.trim().toLowerCase()));
          const added = matches.filter(e => !state.roster?.emails?.includes(e.email.trim().toLowerCase()));
          $('academy-preview').textContent = `${pending.emails.length} unique emails, ${pending.duplicates} duplicates removed. ${matches.length} challenge bakers match; ${added.length} newly matched since the previous snapshot. Confirm this is an export of active Academy members.`;
          $('academy-save').disabled = false;
        } catch (e) { $('academy-preview').textContent = e.message; }
      };
      $('academy-save').onclick = async () => {
        if (!pending || !$('academy-active').checked) { $('academy-preview').textContent = 'Confirm the CSV contains active Academy members first.'; return; }
        $('academy-save').disabled = true;
        try {
          const r = await rpc('admin_outreach_save', { p_key: ctx.key, p_patch: { roster: { emails: pending.emails } } });
          if (r.error) throw Error(r.error);
          state = r; pending = null; $('academy-preview').textContent = 'Member snapshot saved. Only normalized email addresses were retained.'; badges();
        } catch { $('academy-preview').textContent = 'The roster did not save. The existing snapshot is unchanged.'; $('academy-save').disabled = false; }
      };
      $('campaign-save').onclick = async () => {
        const campaign = Object.fromEntries(fields.map(k => [k, $('campaign-' + k).value.trim()]));
        try {
          const r = await rpc('admin_outreach_save', { p_key: ctx.key, p_patch: { campaign } });
          if (r.error) throw Error(r.error);
          state = r; $('campaign-msg').textContent = 'Weekly copy saved. Preview it before sending.'; posts();
        } catch { $('campaign-msg').textContent = 'Settings did not save. Check the date and HTTPS links, then try again.'; }
      };
    }
    try {
      const r = await rpc('admin_outreach_get', { p_key: ctx.key });
      if (r.error || !r || Array.isArray(r)) throw Error('unavailable');
      state = r;
      fields.forEach(k => { if (document.activeElement !== $('campaign-' + k)) $('campaign-' + k).value = state.campaign?.[k] || ''; });
    } catch { $('campaign-msg').textContent = 'Shared outreach settings are unavailable. Membership stays unknown until the database update is installed.'; }
    badges(); posts();
  }
  return { refresh, status, getState: () => state, renderPosts: posts };
})();
