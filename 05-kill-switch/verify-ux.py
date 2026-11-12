"""UX check: hover preview, staged cascade, casualty readout, both rounds. Saves screenshots/ux-*.png and prints cascade fps.
Vendors are taken from the computed optimum for the loaded data, never hardcoded."""
from playwright.sync_api import sync_playwright
from pathlib import Path
HERE=Path(__file__).parent;URL='http://127.0.0.1:4104';SHOTS=HERE/'screenshots'
FPS_START='window.samples=[];window.started=performance.now();requestAnimationFrame(function tick(t){samples.push(t);if(t-started<4500)requestAnimationFrame(tick)})'
FPS_READ='({fps:(samples.length-1)*1000/(samples.at(-1)-samples[0]),worst:Math.max(...samples.slice(1).map((t,i)=>t-samples[i]))})'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'])
 page=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:m.type=='error' and errors.append(m.text))
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(URL) else r.abort())
 page.goto(URL);page.wait_for_timeout(2500)
 plans=page.evaluate("async()=>{const d=await (await fetch('/seed.json')).json();const g=await import('/game.mjs');return [g.balancedRound(d,1),g.balancedRound(d,2)]}")
 button=lambda v:page.get_by_role('button',name=v,exact=True)
 score=lambda:int(page.locator('#score').inner_text())
 first,*rest=plans[0]['best']['vendors']
 button(first).hover();page.wait_for_timeout(300);page.screenshot(path=str(SHOTS/'ux-1-hover-preview.png'))
 assert not page.locator('#vendors').inner_text().count('·'),'counts must stay hidden before the round ends'
 page.evaluate(FPS_START);button(first).click()
 page.wait_for_timeout(1500);mid=score();page.screenshot(path=str(SHOTS/'ux-2-mid-cascade.png'))
 page.wait_for_timeout(3600);done=score();print('score mid/done',mid,done)
 assert 0<mid<done,'score should tick during the cascade, not jump'
 page.mouse.move(700,200);page.wait_for_timeout(300);page.screenshot(path=str(SHOTS/'ux-3-after-one-cut.png'))
 print(page.locator('#casualties summary').all_inner_texts())
 assert page.locator('#reveal').is_hidden()
 for v in rest:button(v).click()
 assert page.locator('#reveal').is_hidden(),'verdict must wait for the last tower'
 page.get_by_role('button',name='ROUND 2 → CLOUDS HARDENED',exact=True).click();page.wait_for_timeout(1800)
 assert page.locator('#casualties').is_hidden() and score()==0
 for v in plans[1]['best']['vendors']:button(v).click();page.wait_for_timeout(4500)
 page.mouse.move(700,200);page.wait_for_timeout(1500);page.screenshot(path=str(SHOTS/'ux-4-end-round-2.png'))
 assert score()>=plans[1]['best']['score'],(score(),plans[1]['best']['score']) # >=: audience companies may have joined on top of the seed
 print(page.locator('#casualties summary').all_inner_texts());print(page.locator('#reveal b').inner_text());print('ERRORS',errors)
 # fps pass on a fresh load: biggest cut, no screenshot in the sampling window (a screenshot stalls a frame)
 page.goto(URL);page.wait_for_timeout(2500);page.evaluate(FPS_START);button(first).click();page.wait_for_timeout(4800);print('CASCADE',page.evaluate(FPS_READ));b.close()
