// Adds the challenge handoff without changing the delivered quiz engine or bank.
(() => {
  const results = document.getElementById('resultsScreen');
  if (!results) return;
  const quiz = 'why-your-fresh-milled-sourdough-is-xih6muguvxwc6';
  const panel = document.createElement('aside');
  panel.className = 'bakers-pick';
  panel.innerHTML = '<h3>Get credit for this lesson</h3><p>Earn 20 bonus points once: pass at 80%, save your score to your challenge entry, and confirm your YouTube comment. Every point adds one entry in the Bosch Universal Plus stand mixer drawing.</p><p>Already registered? Sign in to your existing entry. You do not need to register again. Watched on social media? You can take this quiz and save your score here.</p><a id="recordBonusScore" class="primary" href="/record-score">Record my challenge score</a>';
  document.querySelector('.score-panel').append(panel);
  function update() {
    if (!results.classList.contains('active')) return;
    const score = parseInt(document.getElementById('percentScore').textContent, 10);
    if (!Number.isFinite(score) || score < 0 || score > 100) return;
    document.getElementById('recordBonusScore').href = '/record-score?' + new URLSearchParams({quiz, score:String(score), total:'10'});
  }
  new MutationObserver(update).observe(results, {attributes:true,attributeFilter:['class']});
  update();
})();
