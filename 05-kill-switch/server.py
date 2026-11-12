import sys,pathlib,json,re,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor,as_completed
from urllib.parse import urlparse
HERE=pathlib.Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(HERE.parent/'shared'))
import parallel
parallel.CACHE_DIR=HERE/'.cache'
POOL=ThreadPoolExecutor(max_workers=8)
VENDORS=json.loads((HERE/'seed.json').read_text())['vendors']
def probe(name,domain,vendor):
 r=parallel.decide({'company':name,'website':domain},{'edge':{'type':'noul','instructions':f'Does {name} ({domain}) use {vendor} as a vendor, subprocessor or infrastructure provider? Find evidence specifically about this company.'}})
 cites=[]
 for c in r.get('citations',[]):
  host=urlparse(c.get('url','')).hostname or ''
  txt=' '.join([c.get('title',''),*c.get('excerpts',[])]).lower()
  if host==domain or host.endswith('.'+domain) or re.search(r'(?<!\w)'+re.escape(name.lower())+r'(?!\w)',txt):
   if c.get('url','').startswith(('http://','https://')): cites.append(c)
 a=r.get('answers',{}).get('edge',{})
 return {'company':name,'vendor':vendor,'p':a.get('noul') or 0,'citations':cites}
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(HERE),**kw)
 def log_message(self,*a):pass
 def reply(self,status,data):
  b=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  if self.path.split('?')[0] not in ('/','/index.html','/style.css','/app.js','/scene.js','/hud.js','/data.js','/game.mjs','/seed.json','/vendor/three.module.js','/vendor/controls/OrbitControls.js','/vendor/effects/AsciiEffect.js'):return self.reply(404,{'error':'Not found'})
  super().do_GET()
 def do_POST(self):
  if self.path!='/api/company':return self.reply(404,{'error':'Not found'})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<4096:raise ValueError()
   d=json.loads(self.rfile.read(size));name=d['name'].strip();domain=d['domain'].strip().lower().removeprefix('https://').removeprefix('http://').rstrip('/')
   if not 2<=len(name)<=80 or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}',domain):raise ValueError()
  except (ValueError,KeyError,TypeError):return self.reply(400,{'error':'Enter a company name and a valid website domain.'})
  edges=[];failed=0
  for f in as_completed([POOL.submit(probe,name,domain,v) for v in VENDORS]):
   try:edges.append(f.result())
   except Exception:failed+=1
  self.reply(200,{'company':{'name':name,'domain':domain,'verified':any(e['citations'] for e in edges)},'edges':[e for e in edges if e['p']>.6 and e['citations']],'failed':failed})
import audience_server
parallel._inflight=threading.Semaphore(audience_server.MAX_API_INFLIGHT)
audience_server.install(sys.modules[__name__])
if __name__=='__main__':
 print('Kill Switch: http://127.0.0.1:4104',flush=True)
 print('Audience: '+audience_server.JOIN_URL,flush=True)
 ThreadingHTTPServer(('127.0.0.1' if audience_server.TEST_MODE else '0.0.0.0',4104),Handler).serve_forever()
