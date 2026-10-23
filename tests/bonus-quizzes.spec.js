const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const token='11111111-1111-4111-8111-111111111111';
const id='why-your-fresh-milled-sourdough-is-xih6muguvxwc6';
const dense='/quizzes/why-your-fresh-milled-sourdough-is-dense/';
const html=fs.readFileSync(path.join(__dirname,'..',dense,'index.html'),'utf8');
const bank=vm.runInNewContext(html.match(/var bank=(\[[\s\S]*?\]);\s*var sponsors=/)[1],{q:(id,type,difficulty,prompt,choices,answer,note)=>({prompt,choices,answer,note})});
async function fixture(page,signed=true){
 if(signed)await page.addInitScript(t=>{if(location.hostname==='127.0.0.1')localStorage.setItem('agc_token',t);},token);
 const calls=[],scores={};
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();
  if(!u.pathname.includes('/rpc/')&&!u.pathname.endsWith('/entry-signin'))return route.abort();
  const name=u.pathname.split('/').pop(),body=route.request().postDataJSON();calls.push({name,body});
  const task=body.p_quiz_id?.startsWith('waking')?'b_sprouted':'b_dense';
  if(name==='record_quiz_score')scores[task]=body.p_score;
  const result={my_progress:{first_name:'Bonus Baker',claims:[],modules_total:7,modules_verified:0,verified_points:0},
   record_quiz_score:{ok:true,task_key:task,best_score:body.p_score,passed:body.p_score>=(task==='b_dense'?80:70),lesson_complete:false,received_at:'2026-10-23T18:00:00Z'},
   record_lesson_comment:{ok:true,lesson_complete:scores[body.p_task_key]>=(body.p_task_key==='b_dense'?80:70)},'entry-signin':{message:'If registered, check your email.'}}[name];
  return route.fulfill({json:result});
 });return calls;
}
for(const width of [393,1440])for(const right of [7,8])test(`dense bonus ${right}/10 at ${width}: delivered quiz to explicit score/comment credit`,async({page})=>{
 await page.setViewportSize({width,height:900});const calls=await fixture(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(dense);await page.locator('#beginBtn').click();await page.locator('#startQuizBtn').click();
 for(let i=0;i<10;i++){
  const prompt=await page.locator('#questionText').innerText(),q=bank.find(q=>q.prompt===prompt);
  const choice=i<right?q.answer:q.choices.find(c=>c!==q.answer);
  await page.locator('#answers button').filter({has:page.locator('span:last-child',{hasText:choice})}).click();
  await expect(page.locator('#feedbackText')).toHaveText(q.note);await page.locator('#nextBtn').click();
  if(i===4)await page.locator('#backToQuizBtn').click();
 }
 await expect(page.locator('#verdict')).toHaveText(right===8?'PASS':'FAIL');
 await expect(page.locator('#recordBonusScore')).toHaveAttribute('href',`/record-score?quiz=${id}&score=${right*10}&total=10`);
 expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(0);
 await page.locator('#recordBonusScore').click();
 await page.getByRole('button',{name:'Save score for Bonus Baker'}).click();
 await expect(page.getByRole('heading',{name:`Score saved: ${right*10}%`})).toBeVisible();
 await expect(page.getByText('This optional bonus earns 20 points once.',{exact:false})).toBeVisible();
 if(right===7)await expect(page.getByText('Retake the quiz for 80%',{exact:false})).toBeVisible();
 await page.locator('#comment-name').fill('Bonus Baker');await page.locator('#comment-confirm').check();
 await page.getByRole('button',{name:'Save comment details'}).click();
 await expect(page.getByText(right===8?'Comment details saved. Lesson complete; your progress and points are updated.':'Comment details saved. Retake the quiz for 80% or better to complete this lesson.')).toBeVisible();
 expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(1);
 expect(calls.find(c=>c.name==='record_lesson_comment').body.p_task_key).toBe('b_dense');
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const quiz of [id,'waking-up-the-berry-quiz-wxp6iak2yanw'])test(`${quiz}: guest can carry bonus score in email sign-in across browsers`,async({page})=>{
 const calls=await fixture(page,false);await page.goto(`/record-score?quiz=${quiz}&score=80&total=10`);
 await expect(page.getByRole('heading',{name:'Already registered? Get a sign-in link'})).toBeVisible();
 const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')));
 expect(pending.task).toBe(quiz===id?'b_dense':'b_sprouted');
 await page.getByLabel('The email you registered with').fill('bonus@example.invalid');
 await page.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();
 await expect.poll(()=>calls.find(c=>c.name==='entry-signin')).toBeTruthy();
 expect(calls.find(c=>c.name==='entry-signin').body.quiz).toEqual({quiz,score:80,total:10});
 expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(0);
});
