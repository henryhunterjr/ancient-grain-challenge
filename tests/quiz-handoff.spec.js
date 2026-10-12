const { test, expect } = require('@playwright/test');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const q='from-berries-to-bread-module-one-kj65x0xbgxctgu';
const link=(score=80,extra='')=>`/record-score?quiz=${q}&score=${score}&total=10${extra}`;
const progress=name=>({first_name:name,verified_points:0,pending_points:0,modules_total:7,modules_verified:0,qualified:false,claims:[]});
async function fixture(page, token=null, handler=null) {
  if (token) await page.addInitScript(t=>localStorage.setItem('agc_token',t),token);
  const calls=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if (url.hostname==='127.0.0.1') return route.continue();
    if (!url.pathname.includes('/rpc/')) return route.abort();
    const name=url.pathname.split('/').pop(), body=route.request().postDataJSON(); calls.push({name,body});
    let result=handler ? await handler(name,body,route) : undefined;
    if (result==='handled') return;
    if (result===undefined) result=({my_progress: body.p_token===B?progress('Bob'):progress('Alice'),
      record_quiz_score:{ok:true,task_key:'m3',best_score:Math.max(body.p_score||0,80),passed:true,lesson_complete:false,received_at:'2026-10-08T02:00:00Z'},
      record_lesson_comment:{ok:true,lesson_complete:true},my_quiz_results:[],register:{token:A},
      get_tasks:[{key:'m3',title:'From Berries to Bread',category:'module',points:20,description:''}],stats:{entrants:0,qualified:0},leaderboard:[],winners:[]})[name];
    await route.fulfill({json:result});
  }); return calls;
}

test('pending carries through closed page, free signup and explicit authenticated save',async({page,context})=>{
  const calls=await fixture(page); await page.goto(link());
  await expect(page.getByText('Your pending score stays here;', {exact:false})).toBeVisible();
  expect(await page.evaluate(()=>location.search)).toBe('');
  const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')));
  expect(Object.keys(pending).sort()).toEqual(['created','expires','id','quiz','score','task','total'].sort());
  expect(pending.expires-pending.created).toBe(7*86400000);
  await page.close(); page=await context.newPage(); await fixture(page);
  await page.goto('/record-score'); await page.getByRole('link',{name:'Register or sign in'}).click();
  await expect(page.getByRole('link',{name:'return to record your score'})).toBeVisible();
  await page.locator('#r-name').fill('Synthetic Baker'); await page.locator('#r-email').fill('synthetic@example.invalid');
  await page.locator('#r-skool').selectOption('Other'); await page.locator('#r-country').selectOption('United States');
  await page.locator('#r-grain').selectOption('Rye'); await page.locator('#r-news').check(); await page.locator('#r-rules').check();
  await page.getByRole('button',{name:'Register for the challenge'}).click();
  await expect(page.getByText('Welcome back, Alice.')).toBeVisible();
  await page.getByRole('link',{name:'return to record your score'}).click();
  await page.getByRole('button',{name:'Save score for Alice'}).click();
  await expect(page.getByRole('heading',{name:'Score saved: 80%'})).toBeVisible();
  await expect(page.getByText('This lesson still needs', {exact:false})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('agc_pending_quiz_v1'))).toBeNull();
  await page.locator('#comment-name').fill('Synthetic YouTube Baker'); await page.locator('#comment-confirm').check();
  await page.getByRole('button',{name:'Save comment details'}).click();
  await expect(page.getByText('Comment details saved. Lesson complete;', {exact:false})).toBeVisible();
});
test('existing entry code sign-in preserves pending and never puts code in URL',async({page})=>{
  await fixture(page); await page.goto(link()); await page.getByRole('link',{name:'Register or sign in'}).click();
  await page.getByText('Already registered?',{exact:true}).click(); await page.locator('#x-code').fill(A);
  await page.getByRole('button',{name:'Find my entry'}).click(); await expect(page.getByText('Welcome back, Alice.')).toBeVisible();
  await page.getByRole('link',{name:'return to record your score'}).click(); expect(page.url()).not.toContain(A);
  await expect(page.getByRole('button',{name:'Save score for Alice'})).toBeVisible();
});
test('network failure/retry and double click wait for backend confirmation',async({page})=>{
  let attempts=0; const calls=await fixture(page,A,async(name,body,route)=>{
    if(name==='record_quiz_score') { attempts++; if(attempts===1){ await route.abort(); return 'handled'; }
      await new Promise(r=>setTimeout(r,150)); }
  });
  await page.goto(link()); await page.getByRole('button',{name:'Save score for Alice'}).click();
  await expect(page.getByText('Could not confirm the save.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>!!localStorage.getItem('agc_pending_quiz_v1'))).toBe(true);
  await page.getByRole('button',{name:'Save score for Alice'}).evaluate(b=>{b.click();b.click();});
  await expect(page.getByRole('heading',{name:'Score saved: 80%'})).toBeVisible();
  expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(2);
});
test('session changes during save never confirm or attach to the new entry',async({page})=>{
  let release, started; const ready=new Promise(r=>started=r), held=new Promise(r=>release=r);
  const calls=await fixture(page,A,async name=>{if(name==='record_quiz_score'){started();await held;}});
  await page.goto(link()); await page.getByRole('button',{name:'Save score for Alice'}).click(); await ready;
  await page.evaluate(t=>{localStorage.setItem('agc_token',t);window.dispatchEvent(new StorageEvent('storage',{key:'agc_token'}));},B);
  release(); await expect(page.getByRole('button',{name:'Save score for Bob'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Score saved: 80%'})).toHaveCount(0);
  expect(calls.filter(c=>c.name==='record_quiz_score')[0].body.p_token).toBe(A);
  expect(await page.evaluate(()=>!!localStorage.getItem('agc_pending_quiz_v1'))).toBe(true);
});
test('new result requires replacement choice; clear in another tab clears this tab',async({page,context})=>{
  await fixture(page); await page.goto(link(70)); await page.goto(link(90));
  await expect(page.getByRole('button',{name:'Keep earlier 70% result'})).toBeVisible();
  await page.getByRole('button',{name:'Keep earlier 70% result'}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')).score)).toBe(70);
  const other=await context.newPage(); await fixture(other); await other.goto('/record-score');
  await other.getByRole('button',{name:'Cancel and clear pending score'}).click();
  await expect(page.getByText('No pending result.',{exact:false})).toBeVisible();
});
test('two incoming tabs retain their own choice across shared updates, reload and session changes',async({page,context})=>{
  const calls=await fixture(page); await page.goto(link(70));
  const first=await context.newPage(),second=await context.newPage();
  await fixture(first); const secondCalls=await fixture(second);
  await first.goto(link(80)); await second.goto(link(90));
  await expect(first.getByRole('button',{name:'Use new 80% result'})).toBeVisible();
  await expect(second.getByRole('button',{name:'Use new 90% result'})).toBeVisible();
  await first.getByRole('button',{name:'Use new 80% result'}).click();
  await expect(second.getByRole('button',{name:'Use new 90% result'})).toBeVisible();
  await expect(second.getByRole('button',{name:'Keep earlier 80% result'})).toBeVisible();
  await second.reload();
  await expect(second.getByRole('button',{name:'Use new 90% result'})).toBeVisible();
  expect(await second.evaluate(()=>Object.keys(history.state.quizCandidate).sort())).toEqual(['quiz','task','score','total','created','expires'].sort());
  await first.evaluate(t=>localStorage.setItem('agc_token',t),B);
  await expect(second.getByRole('button',{name:'Use new 90% result'})).toBeVisible();
  await expect(second.getByRole('button',{name:'Save score for Bob'})).toHaveCount(0);
  await second.getByRole('button',{name:'Keep earlier 80% result'}).click();
  await expect(second.getByRole('button',{name:'Save score for Bob'})).toBeVisible();
  expect(await second.evaluate(()=>history.state)).toBeNull();
  expect([...calls,...secondCalls].some(c=>c.name==='record_quiz_score')).toBe(false);
  await second.goto(link(90)); await second.getByRole('button',{name:'Use new 90% result'}).click();
  await expect(first.getByRole('heading',{name:'90%',exact:false})).toBeVisible();
  expect(await first.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')).score)).toBe(90);
});
test('clearing shared pending does not discard an unresolved incoming candidate',async({page,context})=>{
  await fixture(page); await page.goto(link(70));
  const other=await context.newPage();await fixture(other);await other.goto(link(90));
  await page.getByRole('button',{name:'Cancel and clear pending score'}).click();
  await expect(other.getByRole('button',{name:'Use new 90% result'})).toBeVisible();
  await expect(other.getByText('There is no current pending result.',{exact:true})).toBeVisible();
  await other.reload();await other.getByRole('button',{name:'Discard new result'}).click();
  await expect(other.getByText('No pending result.',{exact:false})).toBeVisible();
  expect(await other.evaluate(()=>history.state)).toBeNull();
});
test('unresolved candidates expire and choosing one preserves its original expiry',async({page})=>{
  await fixture(page);await page.goto(link(70));await page.goto(link(90));
  const original=await page.evaluate(()=>history.state.quizCandidate);
  await page.getByRole('button',{name:'Use new 90% result'}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')).expires)).toBe(original.expires);
  await page.goto(link(95));
  await page.evaluate(()=>{const p=history.state.quizCandidate;p.created-=8*86400000;p.expires-=8*86400000;history.replaceState({quizCandidate:p},'');});
  await page.reload();await expect(page.getByRole('button',{name:'Use new 95% result'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'90%',exact:false})).toBeVisible();
});
test('another tab replacing pending during save cannot receive a false confirmation or be cleared',async({page,context})=>{
  let release,started;const ready=new Promise(r=>started=r),held=new Promise(r=>release=r);
  const calls=await fixture(page,A,async name=>{if(name==='record_quiz_score'){started();await held;}});
  await page.goto(link(80));await page.getByRole('button',{name:'Save score for Alice'}).click();await ready;
  const other=await context.newPage();await fixture(other);await other.goto(link(95));
  await other.getByRole('button',{name:'Use new 95% result'}).click();
  await expect(page.getByRole('heading',{name:'95%',exact:false})).toBeVisible();
  release();await expect(page.getByRole('button',{name:'Save score for Alice'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Score saved:',exact:false})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')).score)).toBe(95);
  expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(1);
});
test('expiry, malformed params and forged pass/time',async({page})=>{
  const calls=await fixture(page,A); await page.goto(link(0,'&pass=true&timestamp=2000-01-01'));
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('agc_pending_quiz_v1')))).not.toHaveProperty('pass');
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('agc_pending_quiz_v1'));p.created-=8*86400000;p.expires-=8*86400000;localStorage.setItem('agc_pending_quiz_v1',JSON.stringify(p));});
  await page.goto('/record-score'); await expect(page.getByText('No pending result.',{exact:false})).toBeVisible();
  for(const bad of ['score=NaN','score=Infinity','score=-1','score=101','score=1e2','score=80&score=90','score=80&token=secret']) {
    await page.goto(`/record-score?quiz=${q}&total=10&${bad}`); await expect(page.getByText('This result link is invalid.',{exact:false})).toBeVisible();
  }
  expect(calls.filter(c=>c.name==='record_quiz_score')).toHaveLength(0);
});
test('failed/interrupted signup keeps result across reload and offers retry',async({page})=>{
  await fixture(page,null,async(name,body,route)=>{if(name==='register'){await route.abort();return 'handled';}});
  await page.goto(link());await page.getByRole('link',{name:'Register or sign in'}).click();
  await page.locator('#r-name').fill('Synthetic Baker');await page.locator('#r-email').fill('synthetic@example.invalid');
  await page.locator('#r-skool').selectOption('Other');await page.locator('#r-country').selectOption('United States');
  await page.locator('#r-grain').selectOption('Rye');await page.locator('#r-news').check();await page.locator('#r-rules').check();
  await page.getByRole('button',{name:'Register for the challenge'}).click();
  await expect(page.getByText('We couldn\'t reach the server. Check your connection and try again.')).toBeVisible();
  await page.reload();await expect(page.getByRole('link',{name:'return to record your score'})).toBeVisible();
  await page.getByRole('link',{name:'return to record your score'}).click();
  await expect(page.getByRole('heading',{name:'80% · From Berries to Bread'})).toBeVisible();
});
test('invalid saved entry gets sign-in prompt without sending a score',async({page})=>{
  const calls=await fixture(page,A,name=>name==='my_progress'?null:undefined);
  await page.goto(link());await expect(page.getByText('Your entry session is no longer valid.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save score for Alice'})).toHaveCount(0);
  expect(calls.some(c=>c.name==='record_quiz_score')).toBe(false);
});
test('closed/error result stays pending and does not say saved',async({page})=>{
  await fixture(page,A,name=>name==='record_quiz_score'?{error:'closed'}:undefined);
  await page.goto(link()); await page.getByRole('button',{name:'Save score for Alice'}).click();
  await expect(page.getByText('Challenge check-offs have closed.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Score saved: 80%'})).toHaveCount(0);
  expect(await page.evaluate(()=>!!localStorage.getItem('agc_pending_quiz_v1'))).toBe(true);
});
test('lesson displays saved result, saves comment through existing progress flow',async({page})=>{
  const calls=await fixture(page,A,name=>name==='my_quiz_results'?[{task_key:'m3',best_score:80,passed:true}]:undefined);
  await page.goto('/lesson?m=m3'); await expect(page.getByText('Browser-reported quiz score saved: 80%.',{exact:false})).toBeVisible();
  await expect(page.locator('#quiz-score')).toHaveValue('80'); await expect(page.locator('#quiz-score')).toHaveAttribute('readonly','');
  await page.getByPlaceholder('Your YouTube name').fill('Synthetic Baker'); await page.getByRole('button',{name:'I finished this lesson'}).click();
  await expect.poll(()=>calls.filter(c=>c.name==='record_lesson_comment').length).toBe(1);
  expect(calls.some(c=>c.name==='claim_task')).toBe(false);
});
test('storage unavailable is explicit; pending works while page remains open',async({page})=>{
  await fixture(page); await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('blocked')};Storage.prototype.getItem=function(){throw new Error('blocked')};});
  await page.goto(link()); await expect(page.getByText('Browser storage is unavailable.',{exact:false})).toBeVisible();
});
test('mobile and desktop layout captures',async({page})=>{
  await fixture(page,A); await page.goto(link()); await expect(page.getByRole('button',{name:'Save score for Alice'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-output/score-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-output/score-desktop.png',fullPage:true});
});
test('registration-first launch copy and unchanged seven IDs',async({page})=>{
  await fixture(page);await page.goto('/');
  await expect(page.locator('.hero .lede')).toHaveText('Register today. Learn at your own pace. You don’t need to complete a lesson or quiz to sign up.');
  await expect(page.locator('#how').locator('..').getByText('You don’t need to complete a lesson or quiz to sign up.',{exact:false})).toBeVisible();
  await expect(page.locator('#me').locator('..').getByText('No Academy membership or payment is needed.',{exact:false})).toBeVisible();
  await expect(page.locator('.prize-row').getByText('30 winners will each receive one 5-pound bag of grain',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(AGC.LESSONS).sort())).toEqual(['m1','m2','m3','m4','m5','m6','m7']);
  await page.getByText('How to qualify and how entries work',{exact:true}).click();
  await expect(page.getByText('For weekly Friday draws, complete at least one lesson before that drawing. For the final two 5 lb bags and the 25 lb grand prize on December 1, complete all seven lessons by Sunday, November 29, 2026 at 11:59 pm Eastern.',{exact:true})).toBeVisible();
  await expect(page.getByText('We check the comments for the bakers who get drawn.',{exact:false})).toBeVisible();
  await page.getByText('Prizes and the drawing',{exact:true}).click();
  await expect(page.getByText("Winners are announced in the Academy and on this page, and contacted by email. If we don't hear back within 7 days, we draw a new winner.",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>AGC.taskDescription({key:'m7',description:'Canonical database copy'}))).toBe('Canonical database copy');
});

test('private code Copy button has honest clipboard failure fallback',async({page})=>{
  await fixture(page,A);await page.addInitScript(()=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied')}}});document.execCommand=()=>false;
  });
  await page.goto('/#me');await page.getByRole('button',{name:'Copy code',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Your private entry code'})).toHaveValue(A);
  await expect(page.getByText('Copy is unavailable.',{exact:false})).toBeVisible();
  expect(await page.getByRole('textbox',{name:'Your private entry code'}).evaluate(i=>i.selectionEnd-i.selectionStart)).toBe(A.length);
});
test('newly issued code is immediately visible and kept when storage and progress fail',async({page})=>{
  let release,started;const ready=new Promise(r=>started=r),held=new Promise(r=>release=r);
  await fixture(page,null,async name=>{if(name==='my_progress'){started();await held;return null;}});
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('blocked')};Storage.prototype.getItem=function(){throw Error('blocked')};});
  await page.goto('/#me');await page.locator('#r-name').fill('Synthetic Baker');await page.locator('#r-email').fill('synthetic@example.invalid');
  await page.locator('#r-skool').selectOption('Other');await page.locator('#r-country').selectOption('United States');await page.locator('#r-grain').selectOption('Rye');await page.locator('#r-news').check();await page.locator('#r-rules').check();
  await page.getByRole('button',{name:'Register for the challenge'}).click();await ready;
  await expect(page.getByRole('textbox',{name:'Your private entry code'})).toHaveValue(A);
  await expect(page.getByText('This browser could not save your sign-in.',{exact:false})).toBeVisible();
  release();await expect(page.getByRole('button',{name:'Retry loading my entry'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Your private entry code'})).toHaveValue(A);
  await expect(page.getByRole('button',{name:'Register for the challenge'})).toHaveCount(0);
});
test('recovery request is generic and preserves pending quiz without signing in or registering',async({page})=>{
  const calls=await fixture(page);await page.goto(link());await page.getByRole('link',{name:'Register or sign in'}).click();
  const pending=await page.evaluate(()=>localStorage.getItem('agc_pending_quiz_v1'));
  await page.route('**/api/recovery/request',route=>route.fulfill({json:{message:'If that email belongs to an entry, a sign-in link will arrive shortly.'}}));
  await page.getByText('Already registered?',{exact:true}).click();await page.locator('#recovery-email').fill('synthetic@example.invalid');
  await page.getByRole('button',{name:'Email me a sign-in link'}).click();
  await expect(page.getByText('If that email belongs to an entry, a sign-in link will arrive shortly.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('agc_pending_quiz_v1'))).toBe(pending);
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBeNull();expect(calls.some(c=>c.name==='register')).toBe(false);
});
test('recovery link strips credential, waits for click, and requires explicit entry switch while preserving pending score',async({page,context})=>{
  const calls=await fixture(page);await page.goto(link());await page.evaluate(t=>localStorage.setItem('agc_token',t),A);
  const credential='a'.repeat(43);let redeems=0;
  await page.route('**/api/recovery/redeem',async route=>{redeems++;expect(route.request().postDataJSON()).toEqual({credential});await route.fulfill({json:{token:B,first_name:'Bob'}});});
  await page.goto('/recover-entry#r='+credential);
  expect(page.url()).not.toContain(credential);expect(redeems).toBe(0);
  await page.getByRole('button',{name:'Continue to recover my entry'}).click();
  await expect(page.getByRole('textbox',{name:'Your private entry code'})).toHaveValue(B);
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBe(A);
  const other=await context.newPage();await fixture(other);await other.goto('/');await other.evaluate(()=>localStorage.removeItem('agc_token'));
  await page.getByRole('button',{name:'Use my recovered entry for Bob'}).click();
  await expect(page.getByRole('button',{name:'Confirm switch to Bob'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBeNull();
  await page.getByRole('button',{name:'Confirm switch to Bob'}).click();
  await expect(page.getByRole('heading',{name:'Signed in as Bob'})).toBeVisible();
  await page.getByRole('link',{name:'Return to record my pending score'}).click();
  await expect(page.getByRole('button',{name:'Save score for Bob'})).toBeVisible();
  expect(calls.some(c=>['record_quiz_score','record_lesson_comment','register'].includes(c.name))).toBe(false);
  expect(redeems).toBe(1);
});
test('expired or failed recovery keeps pending data and offers a fresh request',async({page})=>{
  await fixture(page);await page.goto(link());const pending=await page.evaluate(()=>localStorage.getItem('agc_pending_quiz_v1'));
  await page.route('**/api/recovery/redeem',route=>route.fulfill({status:400,json:{error:'link'}}));
  await page.goto('/recover-entry#r='+'b'.repeat(43));await page.getByRole('button',{name:'Continue to recover my entry'}).click();
  await expect(page.getByText('This sign-in link is invalid, expired, or already used.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Email me a sign-in link'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('agc_pending_quiz_v1'))).toBe(pending);
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBeNull();
});

test('recovery double click sends once; blocked storage shows private code with no misleading navigation',async({page})=>{
  await fixture(page);let release,started;const ready=new Promise(r=>started=r),held=new Promise(r=>release=r);let redeems=0;
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('blocked')};});
  await page.route('**/api/recovery/redeem',async route=>{redeems++;started();await held;await route.fulfill({json:{token:B,first_name:'Bob'}});});
  await page.goto('/recover-entry#r='+'c'.repeat(43));
  await page.getByRole('button',{name:'Continue to recover my entry'}).evaluate(button=>{button.click();button.click();});await ready;expect(redeems).toBe(1);release();
  await page.getByRole('button',{name:'Use my recovered entry for Bob'}).click();
  await expect(page.getByRole('textbox',{name:'Your private entry code'})).toHaveValue(B);
  await expect(page.getByText('This browser could not save your sign-in.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>AGC.store.get('agc_token'))).toBe(B);
  await expect(page.getByRole('link',{name:'Go to my entry',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-output/email-recovery-mobile.png',fullPage:true});
  await page.setViewportSize({width:320,height:800});
  expect(await page.getByRole('textbox',{name:'Your private entry code'}).evaluate(i=>i.scrollHeight<=i.clientHeight)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-output/email-recovery-narrow.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-output/email-recovery-desktop.png',fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'test-output/email-recovery-dark.png',fullPage:true});
});

test('recovery credential never appears in GET requests or browser storage and network failure offers fresh link',async({page})=>{
  await fixture(page);const credential='d'.repeat(43),requests=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.route('**/api/recovery/redeem',route=>route.abort());await page.goto('/recover-entry#r='+credential);
  expect(requests.every(r=>!r.url.includes(credential))).toBe(true);
  expect(await page.evaluate(c=>JSON.stringify({...localStorage,...sessionStorage}).includes(c),credential)).toBe(false);
  expect(requests.every(r=>r.url.startsWith('http://127.0.0.1:4178/'))).toBe(true);
  await page.getByRole('button',{name:'Continue to recover my entry'}).click();
  await expect(page.getByText('We could not confirm recovery.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Email me a sign-in link'})).toBeVisible();
});
