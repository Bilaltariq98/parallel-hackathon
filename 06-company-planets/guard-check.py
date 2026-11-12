"""HTTP guard and retry tests. All upstream work is stubbed; zero real requests."""
import sys
sys.dont_write_bytecode = True
import json, threading, urllib.request, urllib.error, time, io
from concurrent.futures import ThreadPoolExecutor
import server

server.MAX_COMPANIES = 3
server.MAX_MANUAL_PAIRS = 2
server.GUARD = server.ResearchGuard()
seeds=[{k:c[k] for k in ('name','domain')} for c in server.SEEDS]
facts_release, pairs_release = threading.Event(), threading.Event()
lock = threading.Lock()
counts = {'fact': 0, 'link': 0, 'active': 0, 'peak': 0}
original_decide = server.parallel.decide

def fake_decide(state, questions, **kwargs):
    kind = next(iter(questions))
    with lock:
        counts[kind] += 1
        counts['active'] += 1
        counts['peak'] = max(counts['peak'], counts['active'])
    try:
        assert (facts_release if kind == 'fact' else pairs_release).wait(10)
        domain = state.get('website', 'example.com')
        return {'answers': {kind: {'type': 'noul', 'noul': .9 if kind == 'fact' else .1}}, 'citations': [{'url': 'https://' + domain, 'excerpts': ['Test-only evidence.']}]}
    finally:
        with lock:
            counts['active'] -= 1
server.parallel.decide = fake_decide
http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
threading.Thread(target=http.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:' + str(http.server_port)
def post(path, data, raw=None):
    req=urllib.request.Request(url+'/api/'+path, raw if raw is not None else json.dumps(data).encode(), {'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:return r.status,r.read().decode()
    except urllib.error.HTTPError as e:return e.code,e.read().decode()
def company(domain, peers=None):
    c={'name':'Test '+domain.strip().lower().strip('/'), 'domain':domain}
    if peers is not None:c['peers']=peers
    return c
def until(fn):
    for _ in range(500):
        if fn():return
        time.sleep(.01)
    raise AssertionError('Timed out waiting for stub')
try:
    assert post('company',company('bad domain'))[0]==400
    assert post('company',{},raw=b'x'*4097)[0]==413
    assert post('company',company('valid.com',['unregistered.example']))[0]==400
    assert server.GUARD.used=={'company':0,'pair':0}
    print('PASS input/body/peer validation rejects before spending')
    with ThreadPoolExecutor(max_workers=3) as clients:
        one=clients.submit(post,'company',company('one.example'))
        two=clients.submit(post,'company',company('two.example'))
        until(lambda:len(server.GUARD.pending)==2)
        started=time.monotonic();assert post('company',company('three.example'))[0]==429;assert time.monotonic()-started<1
        assert 'research_busy' in post('company',company('ONE.EXAMPLE/'))[1]
        facts_release.set()
        until(lambda:counts['link']>0)
        assert 'research_busy' in post('company',company('three.example'))[1]
        assert server.GUARD.used=={'company':2,'pair':0}
        # A manual request for a pair already in this add must share the same work.
        manual=clients.submit(post,'pair',{'a':company('one.example'),'b':seeds[0]})
        pairs_release.set();first,second=one.result(),two.result();assert manual.result()[0]==200
    events=[json.loads(x) for x in first[1].splitlines()]
    assert first[0]==200 and sum('key' in e for e in events)==20
    assert sum(e.get('type')=='pair' for e in events)==15
    assert counts['fact']==40 and counts['link']==30 and counts['peak']<=8
    print('PASS two adds stay reserved through facts AND all 15 pairs; no third queue; upstream concurrency <= 8')
    assert post('company',{'name':'Alias','domain':'https://ONE.EXAMPLE/'})==first
    assert post('pair',{'a':seeds[0],'b':company('one.example')})[0]==200
    assert counts['fact']==40 and counts['link']==30
    print('PASS normalized-domain and reverse-pair dedupe, including automatic/manual single-flight')
    assert post('company',company('last.example',[]))[0]==200
    assert 'company-add limit' in post('company',company('over.example'))[1]
    assert post('company',company('one.example'))==first
    assert post('pair',{'a':company('fresh.example'),'b':company('other.example')})[0]==200
    while server.GUARD.used['pair'] < server.MAX_MANUAL_PAIRS:
        assert post('pair',{'a':company('extra.example'),'b':company('other.example')})[0]==200
    assert 'hunch-check limit' in post('pair',{'a':company('no.example'),'b':company('more.example')})[1]
    assert server.GUARD.used=={'company':3,'pair':2}
    assert post('pair',{'a':company('other.example'),'b':company('fresh.example')})[0]==200
    assert post('pair',{'a':seeds[0],'b':seeds[1]})[0]==200
    print('PASS separate 60-add/30-manual caps (tested with small limits); stored and seed results served at cap')
    # Exercise the actual shared retry loop with fake HTTP, fake credential and no network.
    server.parallel.decide=original_decide
    old_open,old_key,old_sleep=server.parallel.urllib.request.urlopen,server.parallel._api_key,server.parallel.time.sleep
    attempts=[];delays=[]
    def fake_http(req, **kw):
        attempts.append(1)
        if len(attempts)<3:raise urllib.error.HTTPError('https://test.invalid',429 if len(attempts)==1 else 504,'stub',{},io.BytesIO(b'{}'))
        return io.BytesIO(json.dumps({'answers':{'link':{'type':'noul','noul':.1}},'citations':[]}).encode())
    try:
        server.parallel.urllib.request.urlopen=fake_http
        server.parallel._api_key=lambda:'test-only-not-a-real-key'
        server.parallel.time.sleep=lambda delay:delays.append(delay)
        server.parallel.decide({'test':'retry'},{'link':{'type':'noul','instructions':'Test'}},cache=False)
        assert len(attempts)==3 and len(delays)==2 and delays[1]>delays[0]
    finally:
        server.parallel.urllib.request.urlopen=old_open;server.parallel._api_key=old_key;server.parallel.time.sleep=old_sleep
    print('PASS 429 and 504 retry with increasing backoff; zero real upstream requests')
finally:
    facts_release.set();pairs_release.set();http.shutdown();http.server_close();server.POOL.shutdown(wait=True)
