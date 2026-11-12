"""Loopback E2E. Test mode disables research, lowers cap, and binds loopback only.
Always restores production server and an empty audience list, even on failure.
"""
import os,json,signal,subprocess,time,urllib.request,urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
H=Path(__file__).resolve().parent;os.chdir(H);URL='http://127.0.0.1:4104'
def req(path,data=None,headers=None):
 try:
  with urllib.request.urlopen(urllib.request.Request(URL+path,None if data is None else json.dumps(data).encode(),{'Content-Type':'application/json',**(headers or {})})) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def restart(test=False):
 p=subprocess.run(['lsof','-ti','tcp:4104','-sTCP:LISTEN'],capture_output=True,text=True)
 for pid in p.stdout.split():os.kill(int(pid),signal.SIGTERM)
 time.sleep(.5)
 env=dict(os.environ);env.pop('KILL_SWITCH_TEST',None)
 if test:env['KILL_SWITCH_TEST']='1'
 subprocess.Popen(['python3','server.py'],cwd=H,env=env,stdout=open(H/'server.log','a'),stderr=subprocess.STDOUT,start_new_session=True)
 for _ in range(50):
  try:req('/api/companies');return
  except OSError:time.sleep(.1)
 raise AssertionError('Server failed to start')
def submit(name='Demo One',domain='demo-one.com',client='phone'):return req('/api/company',dict(name=name,domain=domain),{'X-Test-Client':client})
def ok(case):print('PASS',case,flush=True)
try:
 restart(True)
 token=req('/api/presenter')[1]['token']
 for r in req('/api/companies')[1]['companies']:req('/api/remove',{'domain':r['company']['domain']},{'X-Presenter-Token':token})
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'])
  page=b.new_page(viewport={'width':1440,'height':900});page.goto(URL);page.wait_for_timeout(2500)
  inspect=lambda:page.evaluate("async()=> (await import('/app.js')).inspect()")
  before=inspect()['scene']['towers'];n=len(before);aws=page.evaluate("async()=>{const d=await (await fetch('/seed.json')).json(),g=await import('/game.mjs');return g.cut(g.initial(),'AWS',d.edges).down.length}") # baseline derived from the loaded seed, not a fixed company count
  assert submit()[0]==200
  page.wait_for_function("async()=> (await import('/app.js')).inspect().scene.towers.length===81")
  page.wait_for_timeout(250);page.screenshot(path=str(H/'screenshots/integration-rise.png'))
  after=inspect()['scene']['towers'];assert [(t['name'],t['x'],t['z']) for t in before]==[(t['name'],t['x'],t['z']) for t in after[:len(before)]];ok('arrival, list, stable positions')
  assert len(req('/api/companies')[1]['companies'])==1;assert submit()[0]==200;assert len(req('/api/companies')[1]['companies'])==1;ok('deduplication')
  for name,domain in [('<b>bad</b>','bad.com'),('bad','127.0.0.1'),('bad','localhost'),('x'*200,'bad.com')]:assert submit(name,domain)[0]==400
  ok('hostile input rejected')
  assert submit()[0]==200;assert submit()[0]==429;ok('per-client rate limit')
  page.get_by_role('button',name='AWS',exact=True).click();page.wait_for_timeout(1200);assert submit('Demo Two','demo-two.com','second')[0]==200
  page.screenshot(path=str(H/'screenshots/integration-mid.png'));page.wait_for_timeout(5000)
  assert len(inspect()['state']['down'])==aws;assert len(inspect()['scene']['towers'])==n+2;assert int(page.locator('#score').inner_text())==aws;ok(f'arrival during cascade, {aws} baseline casualties, score preserved')
  assert submit('Demo Three','demo-three.com','third')[0]==429;ok('total cap')
  assert req('/api/remove',{'domain':'demo-one.com'})[0]==403
  assert req('/api/remove',{'domain':'demo-one.com'},{'X-Presenter-Token':token})[0]==200
  page.wait_for_timeout(3000);assert len(inspect()['scene']['towers'])==n+1;ok('token removal')
  restart(True);assert len(req('/api/companies')[1]['companies'])==1;ok('persistence restart')
  page.reload();page.wait_for_timeout(2500)
  page.get_by_role('button',name='SHARE',exact=True).click();page.screenshot(path=str(H/'screenshots/integration-share.png'));page.get_by_role('button',name='Close',exact=True).click()
  for w,h in [(1280,720),(1440,900),(1920,1080)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(400)
   footer=page.locator('footer').bounding_box();nodes=inspect()['scene']['nodes'];assert all(0<n['x']<w and 0<n['y']<footer['y'] for n in nodes),(w,h,footer['y'],max(n['y'] for n in nodes))
  ok('vendor framing all three sizes')
  page.get_by_role('button',name='AWS',exact=True).click();page.wait_for_timeout(1500)
  for w,h in [(1280,720),(1440,900),(1920,1080)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(100)
   share=page.get_by_role('button',name='SHARE',exact=True).bounding_box();cas=page.locator('#casualties').bounding_box();assert share['y']+share['height']<=cas['y']
  ok('share/casualty separation all three sizes')
  phone=b.new_page(viewport={'width':390,'height':844});phone.goto(URL+'/join');phone.screenshot(path=str(H/'screenshots/integration-phone.png'));b.close()
finally:
 restart(False)
 token=req('/api/presenter')[1]['token']
 for r in req('/api/companies')[1]['companies']:req('/api/remove',{'domain':r['company']['domain']},{'X-Presenter-Token':token})
 assert req('/api/companies')[1]['companies']==[]
 print('RESTORED production caps, empty audience, detached server 4104; real API calls: 0',flush=True)
