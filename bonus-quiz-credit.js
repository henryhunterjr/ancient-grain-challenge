// Adds the challenge handoff without changing the delivered quiz engine or bank.
(() => {
  const results = document.getElementById('resultsScreen');
  if (!results) return;
  const quiz = 'why-your-fresh-milled-sourdough-is-xih6muguvxwc6';
  const panel = document.createElement('aside');
  panel.className = 'bakers-pick';
  panel.innerHTML = '<h3 id="bonusCreditHeading">Get credit for this lesson</h3><p id="bonusCreditStatus">Earn 20 bonus points once: pass at 80%, save your score to your challenge entry, and confirm your YouTube comment. Every point adds one entry in the Bosch Universal Plus stand mixer drawing.</p><p>Already registered? Sign in to your existing entry. You do not need to register again. Watched on social media? You can take this quiz and save your score here.</p><a id="recordBonusScore" class="primary" href="/record-score">Record my challenge score</a>';
  document.querySelector('.score-panel').append(panel);
  function update() {
    if (!results.classList.contains('active')) return;
    const score = parseInt(document.getElementById('percentScore').textContent, 10);
    if (!Number.isFinite(score) || score < 0 || score > 100) return;
    const link = document.getElementById('recordBonusScore');
    const status = document.getElementById('bonusCreditStatus');
    const heading = document.getElementById('bonusCreditHeading');
    link.href = '/record-score?' + new URLSearchParams({quiz, score:String(score), total:'10'});
    if (score >= 80) {
      heading.textContent = 'You passed. Now claim your 20 points.';
      status.textContent = 'Your quiz is complete, but your challenge points have not been recorded yet. Claim your points, save this score to your entry, then confirm your YouTube comment.';
      link.textContent = 'CLAIM YOUR 20 POINTS';
    } else {
      heading.textContent = 'Keep going. You need 80% to earn the bonus.';
      status.textContent = 'This score can be saved, but the 20-point bonus is awarded only after you pass at 80% or better and confirm your YouTube comment.';
      link.textContent = 'Record my challenge score';
    }
  }
  new MutationObserver(update).observe(results, {attributes:true,attributeFilter:['class']});
  update();
})();
