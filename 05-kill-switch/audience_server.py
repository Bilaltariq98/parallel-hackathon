import json,re,threading,time,secrets,socket,os,ipaddress
from urllib.parse import urlparse
TEST_MODE=os.environ.get("KILL_SWITCH_TEST")=="1"
MAX_COMPANIES=2 if TEST_MODE else 60
SUBMISSIONS_PER_MINUTE=3
MAX_RESEARCH_JOBS=2
MAX_API_INFLIGHT=8
TOKEN=secrets.token_urlsafe(32)
LOCK=threading.RLock()
JOBS=threading.BoundedSemaphore(MAX_RESEARCH_JOBS)
RATES={}
def lan_address():
 s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
 try:s.connect(('8.8.8.8',80));return s.getsockname()[0]
 except OSError:return '127.0.0.1'
 finally:s.close()
LAN=lan_address()
JOIN_URL=f'http://{LAN}:4104/join'
def validate(d):
 name=d.get('name');domain=d.get('domain')
 if not isinstance(name,str) or not isinstance(domain,str) or len(name)>160:raise ValueError()
 if '<' in name or '>' in name:raise ValueError()
 name=name;name=''.join(c for c in name if c.isprintable()).strip()
 domain=domain.strip().lower().removeprefix('www.')
 if not 2<=len(name)<=80 or len(domain)>253:raise ValueError()
 if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}',domain):raise ValueError()
 if domain.rsplit('.',1)[1] in {'localhost','local','internal','test','invalid','example','home','lan','onion'}:raise ValueError()
 return name,domain

def install(module):
 H=module.Handler;path=module.HERE/'audience.json'
 records=json.loads(path.read_text()) if path.exists() else {}
 def save():
  tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(records));os.replace(tmp,path)
 def local(h):return h.client_address[0] in ('127.0.0.1','::1') and h.headers.get('Host','').split(':')[0] in ('127.0.0.1','localhost')
 oldget=H.do_GET
 def get(h):
  route=h.path.split('?')[0]
  if route=='/api/companies':
   with LOCK:return h.reply(200,{'companies':list(records.values()),'joinUrl':JOIN_URL})
  if route=='/api/presenter':
   if not local(h):return h.reply(403,{'error':'Presenter only.'})
   return h.reply(200,{'token':TOKEN,'joinUrl':JOIN_URL})
  if route in ('/','/index.html') and not local(h):h.send_response(302);h.send_header('Location','/join');h.end_headers();return
  if route in ('/join','/join.html','/audience.js','/vendor/qrcode.js'):
   h.path='/join.html' if route=='/join' else route
   return module.SimpleHTTPRequestHandler.do_GET(h)
  return oldget(h)
 def post(h):
  if h.path not in ('/api/company','/api/remove'):return h.reply(404,{'error':'Not found.'})
  if h.path=='/api/remove' and (not local(h) or not secrets.compare_digest(h.headers.get('X-Presenter-Token',''),TOKEN)):return h.reply(403,{'error':'Presenter only.'})
  try:
   size=int(h.headers.get('Content-Length','0'))
   if not 0<size<4096:raise ValueError()
   d=json.loads(h.rfile.read(size))
   if not isinstance(d,dict):raise ValueError()
   if h.path=='/api/remove':
    with LOCK:records.pop(d.get('domain'),None);save()
    return h.reply(200,{'ok':True})
   name,domain=validate(d)
  except (ValueError,TypeError,KeyError):return h.reply(400,{'error':'Enter a company name and a public domain, such as acme.com. No links or paths.'})
  with LOCK:
   now=time.monotonic();addr=(h.headers.get("X-Test-Client",h.client_address[0]) if TEST_MODE and local(h) else h.client_address[0]);times=[t for t in RATES.get(addr,[]) if now-t<60];RATES[addr]=times
   if len(times)>=SUBMISSIONS_PER_MINUTE:return h.reply(429,{'error':'Please wait a minute before trying again.'})
   times.append(now)
   if domain in records:return h.reply(200,records[domain])
   if any(c['domain'].lower().removeprefix('www.')==domain or c['name'].lower()==name.lower() for c in module.json.loads((module.HERE/'seed.json').read_text())['companies']):return h.reply(409,{'error':'This company is already in the city.'})
   if any(r['company']['name'].lower()==name.lower() for r in records.values()):return h.reply(409,{'error':'That company name is already in use.'})
   if len(records)>=MAX_COMPANIES:return h.reply(429,{'error':'The city is full. Thanks for joining.'})
   if not JOBS.acquire(False):return h.reply(429,{'error':'Two companies are being researched. Please try again shortly.'})
   records[domain]={'company':{'name':name,'domain':domain,'verified':False},'edges':[],'status':'researching'}
  try:
   edges=[];failed=0
   for f in module.as_completed([] if TEST_MODE else [module.POOL.submit(module.probe,name,domain,v) for v in module.VENDORS]):
    try:edges.append(f.result())
    except Exception:failed+=1
   verified=any((urlparse(c.get('url','')).hostname or '').removeprefix('www.')==domain or (urlparse(c.get('url','')).hostname or '').endswith('.'+domain) for e in edges for c in e['citations'])
   result={'company':{'name':name,'domain':domain,'verified':verified},'edges':[e for e in edges if verified and e['p']>.6 and e['citations']],'status':'added' if verified else 'unverified','failed':failed}
   with LOCK:
    if domain in records:records[domain]=result;save()
   return h.reply(200,result)
  finally:JOBS.release()
 H.do_GET=get;H.do_POST=post
