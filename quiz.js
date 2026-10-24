(() => {
  'use strict';
  const { el, LESSONS } = AGC;
  const body = document.getElementById('quiz-body');
  const id = new URLSearchParams(location.search).get('quiz');
  const task = Object.keys(LESSONS).find(key => LESSONS[key].quizId === id);
  const bonus = id === 'waking-up-the-berry-quiz-wxp6iak2yanw';
  const quiz = QUIZ_DATA[bonus ? 'bonus' : task];
  if (!quiz) {
    body.replaceChildren(el('h1', {text:'Quiz not found'}),el('p', {text:'Choose a quiz from the challenge lessons.'}),el('a',{href:'/#lessons',text:'All lessons'}));
    return;
  }
  document.title = quiz.title + ' quiz | Ancient Grain Challenge';
  let round = [], answers = [], index = 0, correct = 0;
  const lessonURL = bonus ? '/#bonus-learning' : '/lesson?m=' + task;
  function shuffle(items) {
    const copy = items.slice();
    for (let i=copy.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [copy[i],copy[j]]=[copy[j],copy[i]]; }
    return copy;
  }
  function heading(text) { return el('h1',{class:'quiz-heading',tabindex:'-1',text}); }
  function focusHeading() { body.querySelector('h1,legend')?.focus(); }
  function intro() {
    body.replaceChildren(el('p',{class:'eyebrow',text:bonus?'Optional bonus · 20 points once':'Ancient Grain Challenge · lesson quiz'}),heading(quiz.title),
      el('p',{text:'10 questions. Score 70% or better to pass. No timer. You can retake the quiz as often as you like.'}),
      el('p',{class:'muted',text:bonus?'Watch the lesson, pass this quiz, save your score, and confirm your YouTube comment to earn 20 bonus points. Each point adds a Bosch Universal Plus mixer entry. This bonus does not replace any of the seven required lessons.':'Take the quiz free, without signing in. Afterward, save your result to your challenge entry and add your YouTube comment details to finish the lesson.'}),
      ...(bonus ? [el('a',{href:'https://www.youtube.com/watch?v=_2hW2qzV3nc',target:'_blank',rel:'noopener',text:'Watch and comment on the lesson on YouTube'})] : []),
      el('div',{class:'quiz-actions'},el('button',{type:'button',onclick:start,text:'Start quiz'}),el('a',{href:lessonURL,text:bonus?'Back to the bonus lesson':'Watch the lesson'})));
  }
  function start() { round=shuffle(quiz.questions).slice(0,10); answers=[]; index=0; correct=0; question(); }
  function question() {
    const q=round[index];
    const options=el('div',{class:'quiz-options'});
    const fieldset=el('fieldset',{},el('legend',{tabindex:'-1',text:q.prompt}),options);
    const feedback=el('div',{class:'quiz-feedback stack',role:'status','aria-live':'polite',hidden:true});
    const submit=el('button',{type:'submit',text:'Check answer'});
    const next=el('button',{type:'button',hidden:true,text:index===9?'See my results':'Next question',onclick:()=>{index++;index===round.length?finish():question();}});
    for (const [i,choice] of shuffle(q.choices).entries()) {
      const input=el('input',{type:'radio',name:'answer',value:choice,id:'answer-'+i,required:true});
      options.append(el('label',{class:'quiz-option',for:input.id},input,el('span',{text:choice})));
    }
    let checked=false;
    const form=el('form',{class:'quiz-card stack'},fieldset,submit,feedback,next);
    form.addEventListener('submit',e=>{
      e.preventDefault(); if(checked)return;
      const chosen=form.querySelector('input:checked'); if(!chosen)return;
      checked=true;
      const right=chosen.value===q.answer; if(right)correct++;
      answers.push({question:q,choice:chosen.value,right});
      form.querySelectorAll('input').forEach(input=>{input.disabled=true;if(input.value===q.answer)input.closest('label').classList.add('correct');});
      submit.hidden=true;
      feedback.replaceChildren(el('strong',{text:right?'Correct.':'The correct answer: '+q.answer}),el('p',{text:q.note}));
      feedback.hidden=false;next.hidden=false;next.focus();
    });
    body.replaceChildren(el('p',{class:'eyebrow',text:quiz.title}),el('p',{text:`Question ${index+1} of ${round.length}`}),
      el('progress',{class:'quiz-progress',max:round.length,value:index,'aria-label':'Quiz progress'}),form,
      el('a',{href:lessonURL,text:'Back to the lesson'}));
    focusHeading();
  }
  function finish() {
    const score=correct/round.length*100, passed=score>=70;
    const actions=el('div',{class:'quiz-actions'});
    {
      // Use a normal same-origin link. No popup permission or third-party login.
      const params=new URLSearchParams({quiz:id,score:String(score),total:String(round.length)});
      actions.append(el('a',{class:'btn-link',href:'/record-score?'+params,text:bonus && passed ? 'CLAIM YOUR 20 POINTS' : 'Record my challenge score'}));
    }
    actions.append(el('button',{type:'button',class:'ghost',onclick:start,text:'Retake quiz'}),el('a',{href:lessonURL,text:'Back to the lesson'}));
    const review=el('ol',{class:'quiz-review'});
    for(const a of answers) review.append(el('li',{},el('strong',{text:a.question.prompt}),el('p',{text:`Your answer: ${a.choice}${a.right?' · Correct':''}`}),
      ...(!a.right?[el('p',{text:'Correct answer: '+a.question.answer})]:[]),el('p',{class:'muted',text:a.question.note})));
    body.replaceChildren(heading(passed?'You passed.':'Keep learning. Try again.'),el('p',{class:'quiz-score',text:score+'%'}),
      el('p',{text:`${correct} of ${round.length} correct · 70% to pass`}),
      el('p',{class:bonus && passed ? 'msg' : 'muted',text:bonus
        ? (passed
          ? 'Your quiz is passed, but your challenge points have not been recorded yet. Claim your points, save this score to your entry, then confirm your YouTube comment.'
          : 'You need 70% or better to earn this 20-point bonus. You can save this score, review the teaching notes, and retake the quiz.')
        : 'Your result is ready. Use “Record my challenge score” to save it to your entry. Lesson completion also requires your YouTube comment details before it earns points. Retakes cannot lower your saved best score.'}),
      actions,el('details',{},el('summary',{text:'Review your answers and teaching notes'}),review));
    focusHeading();
  }
  intro();
})();
