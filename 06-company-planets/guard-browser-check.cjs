const {chromium}=require('playwright');
const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-gl=angle','--use-angle=metal']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/seed-links.json',r=>r.fulfill({json:{pairs:[]}}));const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let companyCalls=0;
  await page.route('**/api/company',r=>{companyCalls++;return r.fulfill({status:429,json:{error:companyCalls===1?'This demo has reached its company-add limit. Existing planets and saved results still work.':'Research is busy. Try again in a moment.'}})});
  await page.route('**/api/pair',r=>r.fulfill({status:429,json:{error:'This demo has reached its company-add limit. Existing planets and saved results still work.'}}));
  await page.goto('http://127.0.0.1:4105');await page.waitForFunction(()=>window.planetTest?.snapshot().bodies.length===15);
  await page.locator('#name').fill('Limit Test');await page.locator('#domain').fill('limit.example');await page.locator('form button').click();
  await page.waitForFunction(()=>document.querySelector('#caption').textContent.includes('reached its company-add limit'));
  assert.match(await page.locator('#formation').innerText(),/reached its company-add limit/);
  await page.screenshot({path:'screenshots/guard-limit.png'});console.log('PASS company limit is explicit in caption and formation panel');
  await page.getByRole('button',{name:'Retry research'}).click();
  await page.waitForFunction(()=>document.querySelector('#caption').textContent.includes('Research is busy'));
  await page.screenshot({path:'screenshots/guard-busy.png'});console.log('PASS busy response says try again in a moment');
  await page.reload();await page.waitForFunction(()=>window.planetTest?.snapshot().bodies.length===15);await page.waitForTimeout(300);
  const s=await page.evaluate(()=>planetTest.snapshot()),a=s.bodies.find(b=>b.name==='OpenAI'),b=s.bodies.find(b=>b.name==='Microsoft');
  const pointer=(type,x,y)=>page.locator('canvas').dispatchEvent(type,{clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1});
  await pointer('pointermove',a.screen.x,a.screen.y);await pointer('pointerdown',a.screen.x,a.screen.y);
  let dx=a.screen.x-b.screen.x,dy=a.screen.y-b.screen.y,d=Math.hypot(dx,dy);dx/=d;dy/=d;const gap=a.screen.r+b.screen.r+1;
  await pointer('pointermove',b.screen.x+dx*(gap+12),b.screen.y+dy*(gap+12));await page.waitForTimeout(60);await pointer('pointermove',b.screen.x+dx*gap,b.screen.y+dy*gap);await pointer('pointerup',b.screen.x+dx*gap,b.screen.y+dy*gap);
  await page.waitForFunction(()=>document.querySelector('#caption').textContent.includes('reached its company-add limit'));
  const result=await page.evaluate(()=>planetTest.snapshot());assert.equal(result.links,0);assert.equal(result.pending,0);assert(!result.bodies.some(b=>b.locked));assert.deepEqual(errors,[]);
  console.log('PASS pair limit releases lock, preserves links, and shows the caption');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
