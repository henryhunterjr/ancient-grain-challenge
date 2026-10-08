(() => {
  const { el, rpc, store, LESSONS } = AGC, H = QuizHandoff;
  const box = document.getElementById('handoff');
  const incoming = H.parse(location.search);
  const old = H.read();
  // An unresolved choice belongs to this history entry, not shared localStorage.
  // Retain only validated public quiz data, with the original seven-day expiry.
  const restored = history.state?.quizCandidate;
  const valid = restored && H.validate(restored.quiz,restored.score,restored.total);
  let candidate = valid && Number.isFinite(restored.created) && restored.created<=Date.now()
    && restored.expires===restored.created+H.TTL && restored.expires>Date.now()
    ? { ...valid, created:restored.created, expires:restored.expires } : null;
  if (location.search) {
    candidate = null;
    if (incoming.result && old && (old.quiz!==incoming.result.quiz || old.score!==incoming.result.score || old.total!==incoming.result.total)) {
      const created=Date.now(); candidate={...incoming.result,created,expires:created+H.TTL};
    } else if (incoming.result && !old) H.keep(incoming.result);
  }
  // Remove quiz data (and any unexpected parameters) before navigation or auth.
  function rememberChoice() { history.replaceState(candidate ? {quizCandidate:candidate} : null,'',location.pathname); }
  rememberChoice();
  let generation = 0;
  const errorCopy = { entrant: 'Your entry session is no longer valid. Sign in with your private entry code, then retry.',
    quiz: 'This quiz is not one of the seven challenge lessons.', score: 'The score must be a percentage from 0 to 100.',
    total: 'The question total must be a whole number from 1 to 100.', closed: 'Challenge check-offs have closed. This result cannot be added to the giveaway.',
    youtube_name: 'Enter the YouTube name you commented under, on one line, up to 120 characters.',
    score_required: 'Record your quiz score first, then add your comment details.' };
  function message(text) { return el('p',{ class:'msg',role:'status',text }); }
  function cancel(id) { H.clear(id); render(); }
  function sameIdentity(token,id) { return store.get('agc_token')===token && H.read()?.id===id; }

  async function render() {
    const gen = ++generation, pending = H.read();
    if (candidate && candidate.expires<=Date.now()) { candidate=null; rememberChoice(); }
    if (candidate) {
      const choice=candidate, pendingId=pending?.id;
      const choose=useNew=>{
        // A click must refer to the shared result currently shown in this tab.
        if (candidate!==choice || H.read()?.id!==pendingId) { render(); return; }
        if (choice.expires<=Date.now()) { render(); return; }
        if (useNew) H.keep(choice,choice.created);
        candidate=null; rememberChoice(); render();
      };
      box.replaceChildren(message('Choose which result to keep before saving. Your new result stays in this tab until you choose.'),
        el('p',{text:`New result: ${choice.score}% — ${H.titles[choice.task]}. ${choice.total} questions.`}),
        el('p',{text:pending ? `Current pending result: ${pending.score}% — ${H.titles[pending.task]}. ${pending.total} questions.` : 'There is no current pending result.'}),
        el('p',{class:'muted',text:`This choice expires ${new Date(choice.expires).toLocaleString()}.`}),
        el('button',{type:'button',onclick:()=>choose(true)},`Use new ${choice.score}% result`),
        el('button',{type:'button',class:'ghost',onclick:()=>choose(false)},pending ? `Keep earlier ${pending.score}% result` : 'Discard new result'));
      return;
    }
    if (!pending) {
      box.replaceChildren(message('No pending result. It may have been saved, cleared, or expired after seven days.'),
        el('a',{href:'/#lessons',text:'Take or retake a lesson quiz'})); return;
    }
    box.replaceChildren(el('h2',{text:`${pending.score}% · ${H.titles[pending.task]}`}),
      el('p',{text:`${pending.total} questions. This result is waiting to be saved to your entry.`}),
      el('p',{class:'muted',text:`Kept on this browser until ${new Date(pending.expires).toLocaleString()}. Return to this page after signup or closing it. Only public quiz data is kept with this pending result.`}),
      ...(!H.durable() ? [message('Browser storage is unavailable. Keep this page open; closing or leaving it may lose this pending result.')] : []),
      el('button',{type:'button',class:'ghost small',onclick:()=>cancel(pending.id)},'Cancel and clear pending score'));
    const token = store.get('agc_token');
    if (!token) { authLinks(); return; }
    const loading = message('Checking your entry.'); box.append(loading);
    let progress;
    try { progress = await rpc('my_progress',{p_token:token}); }
    catch { if (gen!==generation) return;
      loading.textContent='Could not check your entry. Your pending score is kept. Retry when your connection returns.';
      box.append(el('button',{type:'button',onclick:render},'Retry')); return; }
    if (gen!==generation || !sameIdentity(token,pending.id)) { if (gen===generation) render(); return; }
    loading.remove();
    if (!progress) { box.append(message(errorCopy.entrant)); authLinks(); return; }
    const msg = message('Confirm this entry before saving.');
    const save = el('button',{type:'button'},`Save score for ${progress.first_name}`);
    const switchEntry = el('button',{type:'button',class:'ghost',onclick:()=>{ store.del('agc_token'); render(); }},'Use a different entry');
    save.addEventListener('click',async()=>{
      if (save.disabled) return;
      if (gen!==generation || !sameIdentity(token,pending.id)) { render(); return; }
      save.disabled=true; msg.textContent='Saving score. Please wait for confirmation.';
      try {
        const r = await rpc('record_quiz_score',{p_token:token,p_quiz_id:pending.quiz,p_score:pending.score,p_total:pending.total});
        if (gen!==generation || !sameIdentity(token,pending.id)) { render(); return; }
        if (r.error || r.ok!==true || !Number.isFinite(r.best_score) || r.task_key!==pending.task) throw new Error(r.error || 'confirmation');
        H.clear(pending.id);
        saved(r,token,gen);
      } catch (e) {
        if (gen!==generation || !sameIdentity(token,pending.id)) { render(); return; }
        msg.textContent=errorCopy[e.message] || 'Could not confirm the save. Your pending score is kept. Retry safely; repeats cannot add points twice.';
        save.disabled=false;
      }
    });
    box.append(el('p',{text:`Signed in as ${progress.first_name}. Only save if this is your entry.`}), save, switchEntry, msg);
  }
  function authLinks() {
    box.append(el('p',{text:'Register free or sign in with your private entry code. Your pending score stays here; return after registration to confirm your entry and save.'}),
      el('a',{class:'btn-link',href:'/?return=record-score#me',text:'Register or sign in'}),
      el('button',{type:'button',class:'ghost',onclick:render},'I have signed in; check again'));
  }
  function saved(r,token,gen) {
    box.replaceChildren(el('h2',{text:`Score saved: ${r.best_score}%`}),
      message(r.lesson_complete ? 'This lesson is complete. Your existing progress and points are updated.' :
        r.passed ? 'Your passing score is saved. This lesson still needs your YouTube comment details before it earns lesson points.' :
        'Your score is saved. Retake the quiz for 70% or better. Lesson points also require your YouTube comment details.'),
      el('p',{class:'muted',text:`Browser-reported. Best score retained; retakes cannot lower it. Server received: ${new Date(r.received_at).toLocaleString()}.`}),
      el('a',{class:'btn-link',href:`/lesson?m=${r.task_key}`,text:'Go to this lesson'}));
    if (r.lesson_complete) return;
    box.append(...LESSONS[r.task_key].videos.map((id,i)=>el('a',{href:'https://www.youtube.com/watch?v='+id,target:'_blank',rel:'noopener noreferrer',text:'Watch and comment on YouTube'+(i?' (video 2)':'')})));
    const name = el('input',{id:'comment-name',autocomplete:'off',maxlength:'120'});
    const check = el('input',{type:'checkbox',id:'comment-confirm'});
    const msg = message('');
    const btn = el('button',{type:'submit'},'Save comment details');
    const form = el('form',{class:'stack'},el('label',{for:'comment-name'},'The YouTube name you commented under',name),
      el('label',{class:'check',for:'comment-confirm'},check,'I watched the lesson and left a comment on its YouTube video.'),btn,msg);
    form.addEventListener('submit',async e=>{
      e.preventDefault(); if (btn.disabled) return;
      if (gen!==generation || store.get('agc_token')!==token) { render(); return; }
      if (!check.checked) { msg.textContent='Confirm that you watched the video and left your comment.'; return; }
      btn.disabled=true; msg.textContent='Saving comment details.';
      try {
        const response = await rpc('record_lesson_comment',{p_token:token,p_task_key:r.task_key,p_youtube_name:name.value.trim()});
        if (gen!==generation || store.get('agc_token')!==token) { render(); return; }
        if (response.error || response.ok!==true) throw new Error(response.error || 'confirmation');
        msg.textContent=response.lesson_complete ? 'Comment details saved. Lesson complete; your progress and points are updated.' :
          'Comment details saved. Retake the quiz for 70% or better to complete this lesson.';
      } catch(e) { msg.textContent=errorCopy[e.message] || 'Could not confirm comment details. Try again.'; btn.disabled=false; }
    }); box.append(form);
  }
  window.addEventListener('storage',e=>{ if (e.key==='agc_token' || e.key===H.KEY) render(); });
  window.addEventListener('pageshow',e=>{ if (e.persisted) render(); });
  // Expiration and tab/session changes are rechecked before every mutation.
  if (incoming.error) {
    box.replaceChildren(message('This result link is invalid. Return to your quiz and use its results button.'),
      ...(old ? [el('button',{type:'button',onclick:render},'Keep my earlier pending result')] : []));
  } else render();
})();
