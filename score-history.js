// Member-facing history of quiz scores already saved to this challenge entry.
// These cards are newly generated keepsakes, not copies of an older quiz provider's banners.
(() => {
  const titles = {
    m3: 'From Berries to Bread',
    m7: 'Rye Redefined',
    m1: 'Why Ancient Wheat Dough Feels Different',
    m2: 'The Kneading Fallacy',
    m4: 'Which Wheat Berry Should You Use?',
    m6: 'Mastering Einkorn',
    m5: 'Ancient Grain Sourdough Starter',
    b_dense: 'Why Your Fresh-Milled Sourdough Is Dense',
    b_sprouted: 'Waking Up the Berry Quiz'
  };
  const order = Object.keys(titles);
  const { rpc, store, el } = AGC;

  function dateLabel(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Date unavailable' :
      d.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
  }

  function drawCard(result) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('canvas');
    const gradient = c.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, '#1e261d');
    gradient.addColorStop(1, '#34472e');
    c.fillStyle = gradient;
    c.fillRect(0, 0, 1200, 630);
    c.fillStyle = '#bfa774';
    c.fillRect(70, 75, 1060, 5);

    c.fillStyle = '#f7ecd3';
    c.font = 'bold 35px system-ui, sans-serif';
    c.fillText('FROM BERRIES TO BREAD', 75, 145);
    c.font = '24px system-ui, sans-serif';
    c.fillStyle = '#d9d4c5';
    c.fillText('ANCIENT GRAIN CHALLENGE  •  SAVED QUIZ SCORE', 75, 191);

    c.fillStyle = '#fff7e6';
    c.font = 'bold 106px system-ui, sans-serif';
    c.fillText(String(result.best_score) + '%', 75, 345);
    c.font = 'bold 37px system-ui, sans-serif';
    const title = titles[result.task_key];
    const words = title.split(' ');
    let line = '', y = 427;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (c.measureText(next).width > 1050 && line) {
        c.fillText(line, 75, y);
        line = word; y += 48;
      } else line = next;
    }
    if (line) c.fillText(line, 75, y);
    c.font = '23px system-ui, sans-serif';
    c.fillStyle = '#d9d4c5';
    c.fillText('Best score recorded: ' + dateLabel(result.received_at), 75, 548);
    c.fillText('Crust & Crumb Academy  •  bakinggreatbread.com', 75, 590);
    return canvas;
  }

  function download(result, status) {
    try {
      const canvas = drawCard(result);
      const slug = result.task_key.replace(/[^a-z0-9_-]/gi, '');
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'ancient-grain-' + slug + '-' + result.best_score + '.png';
      document.body.append(a);
      a.click();
      a.remove();
      status.textContent = 'Your score card is ready. On some phones, use Share or Save Image from the opened picture.';
    } catch {
      status.textContent = "Couldn't make this image on your device. You can still screenshot the score above.";
    }
  }

  async function render(token, container) {
    const status = el('p', { class:'muted', role:'status', text:'Loading your saved quiz scores…' });
    const heading = el('h3', { text:'My quiz scores' });
    container.replaceChildren(heading, status);
    try {
      const data = await rpc('my_quiz_results', { p_token:token });
      if (store.get('agc_token') !== token || !container.isConnected) return;
      if (!Array.isArray(data)) throw new Error('result');
      const saved = data.filter(r =>
        r && Object.prototype.hasOwnProperty.call(titles, r.task_key) &&
        typeof r.best_score === 'number' && Number.isFinite(r.best_score) &&
        r.best_score >= 0 && r.best_score <= 100
      ).sort((a,b) => order.indexOf(a.task_key) - order.indexOf(b.task_key));
      if (!saved.length) {
        status.textContent = 'No saved quiz scores were found for this entry. Older quiz screenshots that were never recorded in the challenge cannot be recovered here.';
        return;
      }
      status.textContent = 'Your best scores saved to this entry. Download a fresh PNG keepsake for each one. These are new score cards, not copies of the original quiz banners.';
      const list = el('div', { class:'stack', style:'gap:12px' });
      for (const r of saved) {
        const feedback = el('span', { class:'muted', role:'status' });
        const button = el('button', { type:'button', class:'ghost small', text:'Download PNG score card' });
        button.addEventListener('click', () => download(r, feedback));
        list.append(el('div', { class:'card stack', style:'gap:8px;padding:14px' },
          el('strong', { text: titles[r.task_key] }),
          el('div', { class:'bar' },
            el('span', { class:'pill ' + (r.passed ? 'verified' : 'pending'), text: r.best_score + '%' }),
            el('span', { class:'muted', text:'Best saved score · ' + dateLabel(r.received_at) })),
          el('div', { class:'bar' }, button, feedback)));
      }
      container.append(list);
    } catch {
      if (store.get('agc_token') === token && container.isConnected) {
        status.textContent = "Couldn't load saved quiz scores right now. Your existing points and results have not been changed.";
      }
    }
  }
  window.AGCScoreHistory = { render };
})();