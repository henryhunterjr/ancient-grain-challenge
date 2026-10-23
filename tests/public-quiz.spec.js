const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={};vm.createContext(sandbox);
for(const f of ['shared.js','quiz-data.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),sandbox);
const data=vm.runInContext('QUIZ_DATA',sandbox),lessons=vm.runInContext('AGC.LESSONS',sandbox);
const bonusId='waking-up-the-berry-quiz-wxp6iak2yanw';
const tasks=Object.entries(lessons).map(([key,l])=>({key,title:data[key].title,category:'module',points:20,description:''}));
async function fixture(page,token=false) {
  const calls=[];
  if(token)await page.addInitScript(()=>localStorage.setItem('agc_token','11111111-1111-4111-8111-111111111111'));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(!url.pathname.includes('/rpc/'))return route.abort();
    const name=url.pathname.split('/').pop(),body=route.request().postDataJSON();calls.push({name,body});
    const result=({get_tasks:tasks,my_progress:{first_name:'Synthetic Baker',claims:[],modules_total:7,modules_verified:0,verified_points:0},
      my_quiz_results:[],stats:{entrants:0,qualified:0},leaderboard:[],winners:[],
      record_quiz_score:{ok:true,task_key:'m3',best_score:70,passed:true,lesson_complete:false,received_at:'2026-10-20T12:00:00Z'},
      record_lesson_comment:{ok:true,lesson_complete:true}})[name];
    return route.fulfill({json:result});
  });return calls;
}
async function attempt(page,bank,right=10) {
  await page.getByRole('button',{name:'Start quiz'}).click();
  for(let i=0;i<10;i++) {
    const prompt=await page.locator('legend').innerText(),q=bank.find(q=>q.prompt===prompt);
    expect(q).toBeTruthy();
    const answer=i<right?q.answer:q.choices.find(c=>c!==q.answer);
    await page.getByRole('radio',{name:answer,exact:true}).check();
    await page.getByRole('button',{name:'Check answer'}).click();
    await expect(page.locator('input:enabled')).toHaveCount(0);
    await page.getByRole('button',{name:i===9?'See my results':'Next question',exact:true}).click();
  }
}
test('all banks have valid unique questions, original IDs and unchanged videos',()=>{
  expect(Object.keys(lessons)).toHaveLength(7);
  for(const [key,quiz] of Object.entries(data)) {
    expect(quiz.questions.length).toBeGreaterThanOrEqual(10);
    expect(new Set(quiz.questions.map(q=>q.prompt)).size).toBe(quiz.questions.length);
    for(const q of quiz.questions){expect(q.choices.filter(c=>c===q.answer)).toHaveLength(1);expect(new Set(q.choices).size).toBe(q.choices.length);expect(q.note.length).toBeGreaterThan(10);}
    if(key!=='bonus'){expect(lessons[key].quiz).toBe('/quiz?quiz='+lessons[key].quizId);expect(lessons[key].videos.length).toBeGreaterThan(0);}
  }
  expect(data.m1.questions).toHaveLength(15);expect(data.bonus.questions).toHaveLength(15);
});
for(const width of [390,1440])for(const [key,quiz] of Object.entries(data))test(`logged-out ${key} at ${width}px: complete, grade, review and retake`,async({page})=>{
  await page.setViewportSize({width,height:900});const calls=await fixture(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(key==='bonus') {
    await page.goto('/');await page.getByRole('link',{name:'Take the bonus quiz',exact:true}).click();
  } else {
    await page.goto('/lesson?m='+key);
    const link=page.getByRole('link',{name:'Take the quiz (pass at 70%)',exact:true});
    await expect(link).not.toHaveAttribute('target','_blank');await link.click();
  }
  await expect(page.getByRole('heading',{name:quiz.title,exact:true})).toBeVisible();
  const url=page.url();expect(url).toContain('/quiz?quiz=');expect(url).not.toContain('muse.ai');
  await attempt(page,quiz.questions,7);
  await expect(page.getByRole('heading',{name:'You passed.',exact:true})).toBeVisible();
  await expect(page.locator('.quiz-score')).toHaveText('70%');
  await page.getByText('Review your answers and teaching notes',{exact:true}).click();
  await expect(page.locator('.quiz-review>li')).toHaveCount(10);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(key==='bonus')await expect(page.getByRole('link',{name:'Record my challenge score'})).toHaveAttribute('href',`/record-score?quiz=${bonusId}&score=70&total=10`);
  else await expect(page.getByRole('link',{name:'Record my challenge score'})).toHaveAttribute('href',`/record-score?quiz=${lessons[key].quizId}&score=70&total=10`);
  expect(calls.some(c=>/record_|register|claim_task/.test(c.name))).toBe(false);
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Retake quiz'}).click();await expect(page.getByText('Question 1 of 10',{exact:true})).toBeVisible();
});
test('cannot skip an answer, 60% fails and invalid quiz IDs do not render a quiz',async({page})=>{
  await fixture(page);await page.goto(lessons.m3.quiz);await page.getByRole('button',{name:'Start quiz'}).click();
  await page.getByRole('button',{name:'Check answer'}).click();await expect(page.getByText('Question 1 of 10',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Next question'})).toBeHidden();
  await page.goto(lessons.m3.quiz);await attempt(page,data.m3.questions,6);
  await expect(page.getByRole('heading',{name:'Keep learning. Try again.'})).toBeVisible();await expect(page.locator('.quiz-score')).toHaveText('60%');
  await page.goto('/quiz?quiz=not-a-quiz');await expect(page.getByRole('heading',{name:'Quiz not found'})).toBeVisible();
});
test('native result uses the existing explicit score save and YouTube completion flow',async({page})=>{
  const calls=await fixture(page,true);await page.goto(lessons.m3.quiz);await attempt(page,data.m3.questions,7);
  await page.getByRole('link',{name:'Record my challenge score'}).click();
  await expect(page.getByRole('button',{name:'Save score for Synthetic Baker'})).toBeVisible();
  expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(0);
  await page.getByRole('button',{name:'Save score for Synthetic Baker'}).dblclick();
  await expect(page.getByRole('heading',{name:'Score saved: 70%'})).toBeVisible();
  const saved=calls.filter(c=>c.name==='record_quiz_score');expect(saved).toHaveLength(1);
  expect(saved[0].body).toEqual({p_token:'11111111-1111-4111-8111-111111111111',p_quiz_id:lessons.m3.quizId,p_score:70,p_total:10});
  await page.locator('#comment-name').fill('Synthetic Baker');await page.locator('#comment-confirm').check();
  await page.getByRole('button',{name:'Save comment details'}).click();await expect(page.getByText('Comment details saved. Lesson complete; your progress and points are updated.')).toBeVisible();
  expect(calls.filter(c=>c.name==='record_lesson_comment')[0].body.p_task_key).toBe('m3');
});
test('guest result survives free registration link and keyboard-only quiz controls work',async({page})=>{
  await fixture(page);await page.goto(lessons.m3.quiz);await page.getByRole('button',{name:'Start quiz'}).focus();await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');await page.keyboard.press('Space');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
  await expect(page.locator('.quiz-feedback')).toBeVisible();await expect(page.getByRole('button',{name:'Next question'})).toBeFocused();
  await page.goto(lessons.m3.quiz);await attempt(page,data.m3.questions,10);await page.getByRole('link',{name:'Record my challenge score'}).click();
  await page.getByRole('link',{name:'Register, or sign in with your entry code'}).click();
  await expect(page.getByRole('link',{name:'return to record your score'})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')).score)).toBe(100);
});
