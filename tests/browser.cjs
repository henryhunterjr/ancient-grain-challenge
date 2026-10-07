// Local browser QA. Every non-local request is intercepted; no real API calls.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const playwrightPath=process.env.AGC_PLAYWRIGHT_PATH;
if(!playwrightPath) throw new Error('Set AGC_PLAYWRIGHT_PATH to an installed playwright-core package.');
const {chromium}=require(playwrightPath);
const token='00000000-0000-4000-8000-000000000001'; // Synthetic fixture only.
const tasks=Array.from({length:7},(_,i)=>({key:'m'+(i+1),title:i===6?'Rye Redefined':'Lesson '+(i+1),description:i===6?'Why rye dough does not behave like wheat. Take the quiz, and watch the lesson when the video is posted.':'Watch the lesson.',category:'module',points:20}));
tasks.push({key:'bake_grain',title:'Bake with grain',category:'bonus',points:15,description:'Bake.',link:'https://skoo.ly/fresh-mill-recipes'});
let claims=[],calls=[];
const output=path.join(root,'test-output');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let rel=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!path.extname(rel)) rel+='.html';const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.AGC_CHROMIUM_PATH});
 try {
  const context=await browser.newContext({viewport:{width:393,height:852}});
  await context.route('**/*',async route=>{
   const request=route.request();if(request.url().startsWith(base)) return route.continue();
   if(request.url().includes('/rest/v1/rpc/')) {
    const name=request.url().split('/').pop();const body=request.postDataJSON();calls.push({name,body});
    let result=null;
    if(name==='get_tasks')result=tasks;
    if(name==='stats')result={entrants:1,qualified:0};
    if(name==='leaderboard'||name==='winners')result=[];
    if(name==='my_progress'&&body.p_token===token)result={first_name:'Synthetic',modules_total:7,modules_verified:claims.length,qualified:claims.length===7,verified_points:20*claims.length,pending_points:0,claims};
    if(name==='claim_task'){claims.push({task_key:body.p_task_key,proof:body.p_proof,status:'verified'});result={ok:true,status:'verified'};}
    if(name==='admin_overview')result={entrants:[],draws:[]};
    if(name==='admin_draw')result={error:'empty'};
    return route.fulfill({json:result});
   }
   return route.abort();
  });
  const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#r-news').waitFor();
  for(const id of ['r-news','r-rules']) {
   const dims=await page.locator('#'+id).evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,labelHeight:el.closest('label').getBoundingClientRect().height}));
   assert.ok(dims.width>=22&&dims.height>=22&&dims.labelHeight>=44,JSON.stringify(dims));
  }
  await page.getByText('Already registered?',{exact:true}).click();
  if(process.env.AGC_EXPECT_SECURE_RECOVERY==='1') {
   assert.equal(await page.locator('#x-email,#x-skool').count(),0);
   await page.getByRole('button',{name:'Find my entry'}).click();
   assert.ok(!calls.some(c=>c.name==='recover'));
   assert.ok(!calls.some(c=>c.name==='my_progress'));
  }
  await page.locator('#x-code').fill(token);await page.getByRole('button',{name:'Find my entry'}).click();
  await page.getByRole('heading',{name:'Welcome back, Synthetic.'}).waitFor();
  assert.ok(await page.getByText('Complete one lesson for weekly Friday draws.',{exact:false}).isVisible());
  assert.equal(await page.locator('a[href="https://skoo.ly/fresh-mill-recipes"]').count(),0);
  assert.ok(await page.locator('a[href="https://recipepantry.app/fresh-milled"]').count()>=2);
  await page.goto(base+'/lesson?m=m7');await page.locator('#quiz-score').waitFor();
  assert.ok(!await page.getByText('watch the lesson when the video is posted',{exact:false}).count());
  await page.getByRole('textbox',{name:'The YouTube name you commented under'}).fill('Synthetic Baker');
  for(const value of ['', '-1','101','69.999']) {
   await page.locator('#quiz-score').fill(value);await page.getByRole('button',{name:'I finished this lesson'}).click();
   assert.equal(calls.filter(c=>c.name==='claim_task').length,0,'Invalid score submitted: '+value);
   assert.ok(await page.locator('.msg.err').count()>0);
  }
  await page.locator('#quiz-score').fill('80');
  assert.equal(await page.locator('#quiz-score').inputValue(),'80');
  assert.equal(await page.evaluate(()=>AGC.quizPercentage(document.getElementById('quiz-score').value)),80);
  await page.getByRole('button',{name:'I finished this lesson'}).click();
  try { await page.getByText('Done',{exact:true}).waitFor({timeout:5000}); }
  catch(e) { console.error({calls:calls.map(c=>({name:c.name,proof:c.body?.p_proof})),text:await page.locator('#lesson-body').innerText(),errors});throw e; }
  assert.equal(calls.find(c=>c.name==='claim_task').body.p_proof,'YouTube: Synthetic Baker · Score: 80%');
  await page.goto(base+'/lesson?m=m2');await page.locator('#quiz-score').waitFor();
  await page.screenshot({path:path.join(output,'lesson-mobile.png'),fullPage:true});
  await page.goto(base);await page.getByText("You've completed at least one lesson",{exact:false}).waitFor();
  await page.screenshot({path:path.join(output,'home-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});
  await page.goto(base+'/admin');await page.locator('#key').fill('local-only-test');await page.getByRole('button',{name:'Open',exact:true}).click();
  await page.locator('#draw-kind').waitFor();await page.locator('#draw-kind').selectOption('final_small');
  await page.getByRole('button',{name:'Draw a winner',exact:true}).click();await page.getByRole('button',{name:'Yes, draw now',exact:true}).click();
  const drawCall=calls.find(c=>c.name==='admin_draw');assert.equal(drawCall.body.p_kind,'final_small');assert.equal(drawCall.body.p_prize,'5 lb bag');
  await page.screenshot({path:path.join(output,'admin-final-pool.png'),fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: 393px controls, entry-code sign-in, score validation, progress, links, mobile/desktop renders and mocked December-small-bag request; no live API calls');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
