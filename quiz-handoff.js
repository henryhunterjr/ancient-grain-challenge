// Pending handoffs contain only public quiz data. Entry codes stay in the existing
// identity store and are never included in a pending result or link.
const QuizHandoff = (() => {
  const KEY = 'agc_pending_quiz_v1', TTL = 7 * 24 * 60 * 60 * 1000;
  let memory = null, durable = true;
  const quizzes = Object.fromEntries(Object.entries(AGC.LESSONS).map(([task,lesson]) => [lesson.quiz.split('/').pop(),task]));
  const titles = { m3: 'From Berries to Bread', m7: 'Rye Redefined', m1: 'Why Ancient Wheat Dough Feels Different',
    m2: 'The Kneading Fallacy', m4: 'Which Wheat Berry Should You Use?', m6: 'Mastering Einkorn', m5: 'Ancient Grain Sourdough Starter' };
  function validate(quiz, score, total) {
    const percentage = AGC.quizPercentage(score);
    if (!Object.hasOwn(quizzes,quiz) || percentage === null || !/^[1-9][0-9]*$/.test(String(total)) || Number(total)>100) return null;
    return { quiz, task: quizzes[quiz], score: percentage, total: Number(total) };
  }
  function parse(search) {
    const params = new URLSearchParams(search);
    if (!params.size) return { result: null };
    for (const key of params.keys()) if (!['quiz','score','total','pass','timestamp'].includes(key) || params.getAll(key).length!==1) return { error: true };
    const result = validate(params.get('quiz'), params.get('score'), params.get('total'));
    // Client pass and timestamp are intentionally discarded, never persisted.
    return result ? { result } : { error: true };
  }
  function clear(id) {
    const current = read();
    if (id && current?.id !== id) return false;
    memory = null;
    try { localStorage.removeItem(KEY); } catch { durable = false; }
    return true;
  }
  function read() {
    let pending = memory;
    try { const raw = localStorage.getItem(KEY); pending = raw ? JSON.parse(raw) : null; } catch { durable = false; }
    const now = Date.now();
    if (!pending) return null;
    const valid = validate(pending.quiz,pending.score,pending.total);
    if (!valid || typeof pending.id!=='string' || !Number.isFinite(pending.created) || !Number.isFinite(pending.expires)
      || pending.created>now || pending.expires!==pending.created+TTL || pending.expires<=now) {
      memory = null; try { localStorage.removeItem(KEY); } catch { durable = false; } return null;
    }
    return { ...valid, id: pending.id, created: pending.created, expires: pending.expires };
  }
  function keep(result, created = Date.now()) {
    memory = { ...validate(result.quiz,result.score,result.total), id: crypto.randomUUID(), created, expires: created+TTL };
    try { localStorage.setItem(KEY,JSON.stringify(memory)); durable = true; } catch { durable = false; }
    return memory;
  }
  function banner() {
    const pending = read();
    const box = document.getElementById('pending-quiz');
    if (!box) return;
    box.replaceChildren();
    if (!pending) return;
    box.append(AGC.el('p', { class: 'msg' }, 'Your quiz result is waiting. Register free or sign in, then ',
      AGC.el('a', { href: '/record-score', text: 'return to record your score' }), '. No lessons are required at signup.'),
      AGC.el('button', { type: 'button', class: 'ghost small', onclick: () => { clear(pending.id); banner(); } }, 'Clear pending score'));
  }
  return { KEY, TTL, quizzes, titles, parse, validate, keep, read, clear, banner, durable: () => durable };
})();
