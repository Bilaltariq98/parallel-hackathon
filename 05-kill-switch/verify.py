from playwright.sync_api import sync_playwright
from pathlib import Path
import json,sys
HERE=Path(__file__).parent
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'])
 page=b.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:4104') else r.abort())
 if '--staged' in sys.argv:page.route('**/seed.json',lambda r:r.fulfill(path=str(HERE/'seed-expanded.json'),content_type='application/json'))
 page.goto('http://127.0.0.1:4104');page.wait_for_timeout(2000)
 (HERE/'screenshots').mkdir(exist_ok=True)
 page.screenshot(path=str(HERE/'screenshots/initial.png'))
 page.evaluate('''window.samples=[];window.started=performance.now();requestAnimationFrame(function tick(t){samples.push(t);if(t-started<2500)requestAnimationFrame(tick)});''')
 plans=page.evaluate("async()=>{const d=await (await fetch('/seed.json')).json();const g=await import('/game.mjs');return [g.balancedRound(d,1),g.balancedRound(d,2)]}")
 page.get_by_role('button',name=plans[0]['best']['vendors'][0],exact=True).click();page.wait_for_timeout(1400);page.screenshot(path=str(HERE/'screenshots/cascade.png'));page.wait_for_timeout(2200)
 print('FPS',page.evaluate('(samples.length-1)*1000/(samples.at(-1)-samples[0])'))
 for vendor in plans[0]['best']['vendors'][1:]:page.get_by_role('button',name=vendor,exact=True).click()
 page.get_by_role('button',name='ROUND 2 → CLOUDS HARDENED',exact=True).click();page.wait_for_timeout(1800)
 assert page.get_by_role('button',name='▣ LOCKED · AWS',exact=True).is_disabled()
 page.screenshot(path=str(HERE/'screenshots/locked.png'))
 for vendor in plans[1]['best']['vendors']:page.get_by_role('button',name=vendor,exact=True).click()
 page.wait_for_timeout(6500);page.screenshot(path=str(HERE/'screenshots/end.png'));print(page.locator('#reveal').inner_text());b.close()
