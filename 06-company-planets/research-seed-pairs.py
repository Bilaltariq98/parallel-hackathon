"""One-time, resumable seed research. Run explicitly; never runs in the web server."""
import sys
sys.dont_write_bytecode = True
import json, pathlib, threading, itertools, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import server

path = pathlib.Path('seed-links.json')
seeds = json.loads(pathlib.Path('seed.json').read_text())
fixtures = json.loads(pathlib.Path('pair-fixtures.json').read_text())
previous = json.loads(path.read_text()) if path.exists() else {'pairs': [], 'requests_spent': 0}
results = {tuple(sorted((r['a'], r['b']))): r for r in previous['pairs'] if 'error' not in r}
calls = previous['requests_spent']
lock = threading.Lock()
original = server.parallel.urllib.request.urlopen
def counted(*args, **kwargs):
    global calls
    with lock:
        calls += 1
    return original(*args, **kwargs)
server.parallel.urllib.request.urlopen = counted

def check(a,b):
    cached = fixtures.get('|'.join(sorted((a['name'],b['name']))))
    if cached:
        result = {k: cached[k] for k in ('p','citations')}
        origin = 'existing-cache'
    else:
        result = server.pair({k:a[k] for k in ('name','domain')},{k:b[k] for k in ('name','domain')})
        origin = 'researched'
    return {'a':a['domain'],'b':b['domain'],'result':result,'origin':origin}
def save():
    out={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'requests_spent':calls,'pairs':list(results.values())}
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(out,indent=2));temporary.replace(path)

jobs=[(a,b) for a,b in itertools.combinations(seeds,2) if tuple(sorted((a['domain'],b['domain']))) not in results]
print('Pairs to complete:',len(jobs),'of 105',flush=True)
with ThreadPoolExecutor(max_workers=8) as pool:
    futures={pool.submit(check,a,b):(a,b) for a,b in jobs}
    for future in as_completed(futures):
        a,b=futures[future]
        try:
            result=future.result()
        except Exception:
            result={'a':a['domain'],'b':b['domain'],'error':'Research failed; rerun this script to retry.'}
        results[tuple(sorted((a['domain'],b['domain'])))]=result
        save()
        print('Completed',len(results),'/ 105; upstream requests:',calls,flush=True)
links=sum(r.get('result',{}).get('p',0) is not None and r.get('result',{}).get('p',0)>.6 and bool(r.get('result',{}).get('citations')) for r in results.values())
print('Cited links:',links,'; failed:',sum('error' in r for r in results.values()),'; upstream requests:',calls,flush=True)
