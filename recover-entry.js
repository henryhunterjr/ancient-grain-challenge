(() => {
  const { el, store, signin } = AGC, H = QuizHandoff, box = document.getElementById('recovery');
  const params = new URLSearchParams(location.hash.slice(1));
  const one = k => (params.getAll(k).length === 1 ? params.get(k) : null);
  let credential = one('r');
  // A quiz score carried in the link is public quiz data only; it is re-validated here.
  const carried = params.has('quiz') ? H.validate(one('quiz'), one('score'), one('total')) : null;
  const next = /^m[1-9]$/.test(one('next') || '') ? one('next') : null;
  // Personal lesson links from Henry's progress emails are reusable for 7 days,
  // so they sign in without a second tap. One-time links still wait for a tap.
  const auto = one('auto') === '1' && !params.has('quiz');
  // Strip the link from the address bar and history before anything else runs.
  history.replaceState(null, '', location.pathname);

  const status = text => el('p', { class: 'msg', role: 'status', text });
  function askAgain(text) {
    box.replaceChildren(status(text), el('h3', { text: 'Send a new sign-in link' }),
      AGC.emailSignIn(() => carried || H.read(), next),
      el('p', { class: 'muted' }, 'Or ', el('a', { href: '/#signin', text: 'sign in with your entry code' }), '.'));
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(credential || '')) { askAgain('This sign-in link is incomplete. Request a new one below. Your entry and points are safe.'); return; }

  // Email scanners open links automatically. Only a real tap uses up the link.
  const button = el('button', { type: 'button' }, 'Sign me in');
  const msg = status('');
  box.replaceChildren(el('p', { text: carried
      ? `Tap below to sign in. Your ${carried.score}% quiz result for ${H.titles[carried.task]} comes with you so you can save it.`
      : 'Tap below to sign in to your challenge entry on this device.' }), el('div', {}, button), msg);

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true; msg.textContent = 'Signing you in…';
    let r;
    try { r = await signin({ action: 'redeem', credential }); }
    catch { button.disabled = false; msg.textContent = 'We could not reach the server. Check your connection and tap again.'; return; }
    if (r.status === 503 || r.status >= 500) { button.disabled = false; msg.textContent = 'Sign-in is busy right now. Wait a moment and tap again.'; return; }
    credential = null;
    const d = r.data || {};
    if (!r.ok || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.token || '') || typeof d.first_name !== 'string') {
      // Already signed in on this browser from an earlier tap: just keep moving.
      if (store.get('agc_token') && auto) { location.replace(next ? '/lesson?m=' + next : '/#me'); return; }
      askAgain('This sign-in link has expired or was already used. Request a new one below; your entry and points are safe.'); return;
    }
    store.set('agc_token', d.token);
    if (carried) {
      const pending = H.read();
      if (!pending || pending.quiz !== carried.quiz || pending.score !== carried.score || pending.total !== carried.total) H.keep(carried);
    }
    const dest = carried || H.read() ? '/record-score' : next ? '/lesson?m=' + next : '/#me';
    box.replaceChildren(el('h2', { text: `Welcome back, ${d.first_name}` }),
      status(dest === '/record-score' ? 'You are signed in. Taking you to save your quiz score…' : 'You are signed in. Taking you back…'),
      el('details', {}, el('summary', { text: 'Show my private entry code' }), AGC.codePanel(d.token)),
      el('a', { class: 'btn-link', href: dest, text: dest === '/record-score' ? 'Save my quiz score' : 'Continue' }));
    if (store.durable('agc_token')) setTimeout(() => location.assign(dest), auto ? 600 : 1800);
  });
  if (auto) button.click();
})();
