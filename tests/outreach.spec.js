const {test,expect}=require('@playwright/test');
for (const width of [393,1440]) test('compact desk at '+width+' searches hidden roster, imports member CSV, and saves weekly copy',async({page})=>{
 await page.setViewportSize({width,height:950});
 let state={}, patch;
 const entrant=(n)=>({id:'id'+n,full_name:'Baker '+n,email:'baker'+n+'@example.com',claims:[],modules_verified:0,modules_total:7,verified_points:0,pending_points:0,created_at:'2026-10-01',skool_name:'Other'});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();
  if(u.pathname.includes('/functions/'))return route.fulfill({json:{eligible:98,rows:[],gap_days:3}});
  const body=route.request().postDataJSON()||{},name=u.pathname.split('/').at(-1);
  if(name==='admin_outreach_save'){patch=body.p_patch;state={...state,...patch};if(patch.roster)state.roster.imported_at=new Date().toISOString();return route.fulfill({json:state});}
  const replies={get_tasks:[{key:'m3',title:'From Berries to Bread',category:'module',active:true,sort:1}],admin_overview:{entrants:Array.from({length:98},(_,i)=>entrant(i)),draws:[]},admin_winners:[],admin_outreach_get:state};
  if(name in replies)return route.fulfill({json:replies[name]});return route.abort();
 });
 await page.goto('/admin');await page.fill('#key','synthetic');await page.click('#login button');
 await expect(page.locator('#entrant-total')).toHaveText('(98)');
 await expect(page.locator('#entrant-roster')).not.toHaveAttribute('open','');
 await expect(page.locator('#nudge-roster')).not.toHaveAttribute('open','');
 await page.locator('#entrant-roster summary').click();await page.fill('#roster-search','baker97@');
 await expect(page.locator('#entrants tr:visible')).toHaveCount(1);
 await expect(page.locator('#entrants tr:visible')).toContainText('Baker 97');
 await page.getByText('Academy member snapshot',{exact:true}).click();
 await page.locator('#academy-csv').setInputFiles({name:'members.csv',mimeType:'text/csv',buffer:Buffer.from('Name,Email\nBaker 97,BAKER97@example.com')});
 await expect(page.locator('#academy-preview')).toContainText('1 challenge bakers match');
 await page.check('#academy-active');await page.click('#academy-save');
 await expect(page.locator('#academy-summary')).toContainText('1 matched members');
 await page.locator('#nudge-roster summary').click();await page.selectOption('#nudge-membership','member');
 await expect(page.locator('#nudge-rows tr')).toHaveCount(1);await expect(page.locator('#nudge-rows')).toContainText('Baker 97');
 await page.getByText("This week's email and recommendations",{exact:true}).click();
 await page.fill('#campaign-week_start','2026-10-25');await page.fill('#campaign-intro','Another week at the kitchen table.');await page.click('#campaign-save');
 await expect(page.locator('#campaign-msg')).toContainText('Weekly copy saved');expect(patch.campaign.intro).toContain('Another week');
 await page.locator('details.roster').evaluateAll(nodes=>nodes.forEach(n=>n.open=false));
 await page.locator('#progress-mail').scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-output/outreach-'+width+'.png'});
});
