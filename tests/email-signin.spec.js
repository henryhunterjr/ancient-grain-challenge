const { test, expect } = require('@playwright/test');
const A='11111111-1111-4111-8111-111111111111';
const q='from-berries-to-bread-module-one-kj65x0xbgxctgu';
const CRED='Q'.repeat(43);
const progress=name=>({first_name:name,verified_points:0,pending_points:0,modules_total:7,modules_verified:0,qualified:false,claims:[]});
async function fixture(page, signin) {
  const calls=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if (url.hostname==='127.0.0.1') return route.continue();
    const body=route.request().method()==='POST'?route.request().postDataJSON():null;
    if (url.pathname.endsWith('/functions/v1/entry-signin')) { calls.push({name:'signin',body}); return signin(route,body); }
    if (!url.pathname.includes('/rpc/')) return route.abort();
    const name=url.pathname.split('/').pop(); calls.push({name,body});
    const result=({my_progress:progress('Alice'),record_quiz_score:{ok:true,task_key:'m3',best_score:80,passed:true,lesson_complete:false,received_at:'2026-10-08T02:00:00Z'},
      my_quiz_results:[],get_tasks:[{key:'m3',title:'From Berries to Bread',category:'module',points:20,description:''}],stats:{entrants:0,qualified:0},leaderboard:[],winners:[]})[name];
    await route.fulfill({json:result});
  }); return calls;
}
const generic=route=>route.fulfill({json:{message:'If that email is registered for the challenge, a sign-in link is on its way.'}});

test('signed-out quiz taker requests a link that carries the score',async({page})=>{
  const calls=await fixture(page,generic);
  await page.goto(`/record-score?quiz=${q}&score=80&total=10`);
  await page.getByLabel('The email you registered with').fill('Baker@Example.com');
  await page.getByRole('button',{name:'Email me a sign-in link'}).click();
  await expect(page.getByText('a sign-in link is on its way',{exact:false})).toBeVisible();
  const req=calls.find(c=>c.name==='signin').body;
  expect(req).toEqual({action:'request',email:'Baker@Example.com',quiz:{quiz:q,score:80,total:10}});
});

test('link opened in a fresh browser signs in and saves the carried score',async({page})=>{
  const calls=await fixture(page,(route,body)=>body.action==='redeem'&&body.credential===CRED
    ? route.fulfill({json:{token:A,first_name:'Alice'}}) : route.fulfill({status:400,json:{error:'link'}}));
  await page.goto(`/recover-entry#r=${CRED}&quiz=${q}&score=80&total=10`);
  expect(await page.evaluate(()=>location.hash)).toBe('');
  await expect(page.getByText('Your 80% quiz result for From Berries to Bread comes with you',{exact:false})).toBeVisible();
  expect(calls.length).toBe(0); // scanners that only load the page never use the link
  await page.getByRole('button',{name:'Sign me in'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back, Alice'})).toBeVisible();
  await page.waitForURL('**/record-score');
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBe(A);
  await page.getByRole('button',{name:'Save score for Alice'}).click();
  await expect(page.getByRole('heading',{name:'Score saved: 80%'})).toBeVisible();
  expect(calls.find(c=>c.name==='record_quiz_score').body).toEqual({p_token:A,p_quiz_id:q,p_score:80,p_total:10});
});

test('used link offers a new one, keeping the carried score',async({page})=>{
  const calls=await fixture(page,(route,body)=>body.action==='redeem'?route.fulfill({status:400,json:{error:'link'}}):generic(route));
  await page.goto(`/recover-entry#r=${CRED}&quiz=${q}&score=80&total=10`);
  await page.getByRole('button',{name:'Sign me in'}).click();
  await expect(page.getByText('expired or was already used',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBe(null);
  await page.getByLabel('The email you registered with').fill('baker@example.com');
  await page.getByRole('button',{name:'Email me a sign-in link'}).click();
  await expect(page.getByText('on its way',{exact:false})).toBeVisible();
  expect(calls.at(-1).body.quiz).toEqual({quiz:q,score:80,total:10});
});

test('busy server lets them tap again',async({page})=>{
  let n=0; await fixture(page,route=>(++n===1?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{token:A,first_name:'Alice'}})));
  await page.goto(`/recover-entry#r=${CRED}`);
  await page.getByRole('button',{name:'Sign me in'}).click();
  await expect(page.getByText('Sign-in is busy',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Sign me in'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back, Alice'})).toBeVisible();
  await page.waitForURL(u=>u.hash==='#me');
});

test('lesson guest can request a link that returns to the lesson',async({page})=>{
  const calls=await fixture(page,generic);
  await page.goto('/lesson?m=m3');
  await page.getByText('Already registered? Get a sign-in link by email').click();
  await page.getByLabel('The email you registered with').fill('baker@example.com');
  await page.getByRole('button',{name:'Email me a sign-in link'}).click();
  await expect(page.getByText('on its way',{exact:false})).toBeVisible();
  expect(calls.find(c=>c.name==='signin').body).toEqual({action:'request',email:'baker@example.com',next:'m3'});
});

test('home page offers email sign-in and code sign-in',async({page})=>{
  await fixture(page,generic);
  await page.goto('/#signin');
  await expect(page.getByRole('heading',{name:'Email me a sign-in link'})).toBeVisible();
  await expect(page.getByLabel('Your entry code — required')).toBeVisible();
});

test('incomplete link asks for a new one',async({page})=>{
  await fixture(page,generic);
  await page.goto('/recover-entry#r=short');
  await expect(page.getByText('This sign-in link is incomplete',{exact:false})).toBeVisible();
});

test('personal lesson link signs in without a second tap and opens the lesson',async({page})=>{
  const calls=await fixture(page,(route,body)=>body.action==='redeem'?route.fulfill({json:{token:A,first_name:'Alice'}}):generic(route));
  await page.goto(`/recover-entry#r=${CRED}&next=m7&auto=1`);
  await page.waitForURL('**/lesson?m=m7');
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBe(A);
  expect(calls.filter(c=>c.name==='signin').length).toBe(1);
});

test('tapping a personal link again on a signed-in browser just opens the lesson',async({page})=>{
  await page.addInitScript(t=>localStorage.setItem('agc_token',t),A);
  await fixture(page,(route,body)=>body.action==='redeem'?route.fulfill({status:400,json:{error:'link'}}):generic(route));
  await page.goto(`/recover-entry#r=${CRED}&next=m7&auto=1`);
  await page.waitForURL('**/lesson?m=m7');
});

test('finished baker link signs in and opens Your entry',async({page})=>{
  await fixture(page,(route,body)=>body.action==='redeem'?route.fulfill({json:{token:A,first_name:'Alice'}}):generic(route));
  await page.goto(`/recover-entry#r=${CRED}&auto=1`);
  await page.waitForURL(u=>u.hash==='#me');
  expect(await page.evaluate(()=>localStorage.getItem('agc_token'))).toBe(A);
});

test('one-time links still wait for a tap',async({page})=>{
  const calls=await fixture(page,generic);
  await page.goto(`/recover-entry#r=${CRED}&next=m7`);
  await expect(page.getByRole('button',{name:'Sign me in'})).toBeVisible();
  expect(calls.length).toBe(0);
});
