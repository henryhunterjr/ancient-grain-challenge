const {test,expect}=require('@playwright/test');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const progress={first_name:'Synthetic Baker',verified_points:0,pending_points:0,modules_total:7,modules_verified:0,qualified:false,claims:[]};
async function fixture(page,{stored=false,failProgress=false,holdProgress=false}={}){
 if(stored)await page.addInitScript(code=>localStorage.setItem('agc_token',code),A);
 const calls=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(!url.pathname.includes('/rpc/'))return route.abort();
  const name=url.pathname.split('/').pop();calls.push(name);
  if(name==='my_progress'&&holdProgress)return;
  if(name==='my_progress'&&failProgress)return route.fulfill({status:503,json:{error:'synthetic outage'}});
  const value={my_progress:progress,register:{token:A},get_tasks:[],stats:{entrants:0,qualified:0},leaderboard:[],winners:[]}[name];
  return route.fulfill({json:value??[]});
 });return calls;
}
async function register(page){
 await page.locator('#r-name').fill('Synthetic Baker');await page.locator('#r-email').fill('synthetic@example.invalid');
 await page.locator('#r-skool').selectOption('Other');await page.locator('#r-country').selectOption('United States');
 await page.locator('#r-grain').selectOption('Rye');await page.locator('#r-news').check();await page.locator('#r-rules').check();
 await page.getByRole('button',{name:'Register for the challenge'}).click();
}
test('new code appears immediately while progress is still loading',async({page})=>{
 await fixture(page,{holdProgress:true});await page.goto('/');await register(page);
 await expect(page.getByLabel('Your private entry code')).toHaveValue(A);
 await expect(page.getByRole('button',{name:'Copy code',exact:true})).toBeVisible();
 await expect(page.getByText('Your entry was created.',{exact:false})).toBeVisible();
 expect(page.url()).not.toContain(A);
});
test('blocked browser storage and failed progress keep code visible and prevent another registration',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('synthetic blocked storage');};});
 const calls=await fixture(page,{failProgress:true});await page.goto('/');await register(page);
 await expect(page.getByLabel('Your private entry code')).toHaveValue(A);
 await expect(page.getByText('This browser could not save your sign-in.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Retry loading my entry'}).click();
 await expect(page.getByLabel('Your private entry code')).toHaveValue(A);
 await expect(page.getByRole('button',{name:'Register for the challenge'})).toHaveCount(0);
 expect(calls.filter(name=>name==='register')).toHaveLength(1);
});
test('same-browser saved code remains available when progress fails and restores after retry',async({page})=>{
 await fixture(page,{stored:true,failProgress:true});await page.goto('/');
 await expect(page.getByLabel('Your private entry code')).toHaveValue(A);
 await expect(page.getByRole('heading',{name:'Your saved entry code'})).toBeVisible();
 await page.route('**/rpc/my_progress',route=>route.fulfill({json:progress}));
 await page.getByRole('button',{name:'Retry loading my entry'}).click();
 await expect(page.getByText('Welcome back, Synthetic Baker.')).toBeVisible();
 await expect(page.getByLabel('Your private entry code')).toHaveValue(A);
});
test('clipboard success is confirmed only after the operation succeeds and supports keyboard activation',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.syntheticCopied=value;}}});});
 await fixture(page,{stored:true});await page.goto('/');
 const button=page.getByRole('button',{name:'Copy code',exact:true});await button.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Code copied. Save it somewhere private.')).toBeVisible();
 expect(await page.evaluate(()=>window.syntheticCopied)).toBe(A);
});
test('failed clipboard and legacy copy select code and give honest manual instructions',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('synthetic denied');}}});document.execCommand=()=>false;});
 await fixture(page,{stored:true});await page.goto('/');await page.getByRole('button',{name:'Copy code',exact:true}).click();
 await expect(page.getByText('Automatic copy is unavailable.',{exact:false})).toBeVisible();
 expect(await page.getByLabel('Your private entry code').evaluate(input=>input.selectionEnd-input.selectionStart)).toBe(A.length);
 await expect(page.getByText('Code copied. Save it somewhere private.')).toHaveCount(0);
});
test('session change clears the previous code and sign-out removes the panel',async({page})=>{
 await fixture(page,{stored:true});await page.goto('/');await expect(page.getByLabel('Your private entry code')).toHaveValue(A);
 await page.evaluate(code=>{localStorage.setItem('agc_token',code);window.dispatchEvent(new StorageEvent('storage',{key:'agc_token',newValue:code}));},B);
 await expect(page.getByLabel('Your private entry code')).toHaveValue(B);
 await page.getByRole('button',{name:'Not you? Sign out on this device'}).click();
 await expect(page.getByLabel('Your private entry code')).toHaveCount(0);
});
test('code controls fit desktop and narrow mobile screens',async({page})=>{
 await fixture(page,{stored:true});
 for(const width of [320,393,1280]){
  await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.getByRole('button',{name:'Copy code',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await page.getByRole('button',{name:'Copy code',exact:true}).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('#me-body').screenshot({path:`test-output/code-controls-${width}.png`});
 }
});
