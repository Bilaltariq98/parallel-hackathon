import sys, pathlib, json, re, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = pathlib.Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / 'shared'))
import parallel
parallel.CACHE_DIR = HERE / '.cache'

MAX_COMPANIES = 60
MAX_ADDS_IN_FLIGHT = 2
MAX_MANUAL_PAIRS = 30
MAX_MANUAL_IN_FLIGHT = 2
MAX_REQUEST_BYTES = 4096
POOL = ThreadPoolExecutor(max_workers=8)
UPSTREAM_SLOTS = threading.BoundedSemaphore(8)
QUESTIONS = json.loads((HERE / 'questions.json').read_text())
SEEDS = json.loads((HERE / 'seed.json').read_text())
SEED_PAIRS = json.loads((HERE / 'seed-links.json').read_text())['pairs']

class Rejected(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message

class ResearchGuard:
    def __init__(self):
        self.lock = threading.Lock()
        self.used = {'company': 0, 'pair': 0}
        self.pending = set()
        self.results = {}
        self.known = {c['domain']: {'name': c['name'], 'domain': c['domain']} for c in SEEDS}
        for r in SEED_PAIRS:
            if 'result' in r:
                self.results[('pair', *sorted((r['a'], r['b'])))] = (200, r['result'])

    def begin(self, key):
        kind = key[0]
        limit = MAX_COMPANIES if kind == 'company' else MAX_MANUAL_PAIRS
        active_limit = MAX_ADDS_IN_FLIGHT if kind == 'company' else MAX_MANUAL_IN_FLIGHT
        with self.lock:
            if key in self.results:
                return self.results[key]
            if key in self.pending or sum(k[0] == kind for k in self.pending) >= active_limit:
                raise Rejected(429, 'research_busy', 'Research is busy. Try again in a moment.')
            if self.used[kind] >= limit:
                message = 'This demo has reached its company-add limit.' if kind == 'company' else 'This demo has reached its manual hunch-check limit.'
                raise Rejected(429, 'research_limit', message + ' Existing planets and saved results still work.')
            self.used[kind] += 1
            self.pending.add(key)
            return None

    def finish(self, key, result):
        with self.lock:
            self.results[key] = result
            self.pending.remove(key)

GUARD = ResearchGuard()
PAIR_LOCK = threading.Lock()
PAIR_PENDING = {}
REQUEST_METRICS = {'attempts': 0}
METRIC_LOCK = threading.Lock()
_original_urlopen = parallel.urllib.request.urlopen

def counted_urlopen(*args, **kwargs):
    with METRIC_LOCK:
        REQUEST_METRICS['attempts'] += 1
    return _original_urlopen(*args, **kwargs)
parallel.urllib.request.urlopen = counted_urlopen

def decision(state, questions):
    # The shared client retries 429 and 5xx (including 504) with exponential backoff.
    with UPSTREAM_SLOTS:
        return parallel.decide(state, questions)

def company(c):
    if not isinstance(c, dict) or not isinstance(c.get('name'), str) or not isinstance(c.get('domain'), str):
        raise ValueError('Company name and domain are required.')
    name = c['name'].strip()
    domain = re.sub(r'^https?://', '', c['domain'].strip().lower()).rstrip('/')
    if not 1 < len(name) < 81 or len(domain) > 253 or not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}', domain):
        raise ValueError('Enter a company name and a valid domain such as monzo.com.')
    return {'name': name, 'domain': domain}

def probe(c, k):
    r = decision({'company': c['name'], 'website': c['domain']}, {'fact': {'type': 'noul', 'instructions': QUESTIONS[k] + ' Verify specifically the company at ' + c['domain']}})
    return k, {'p': r.get('answers', {}).get('fact', {}).get('noul'), 'citations': r.get('citations', [])}

def pair(a, b):
    r = decision({'a': a, 'b': b}, {'link': {'type': 'noul', 'instructions': 'Is there a publicly documented partnership, integration, investment, acquisition or customer relationship between these exact companies? Cite direct evidence mentioning both. Absence of evidence is not evidence of rivalry.'}})
    cites = []
    for c in r.get('citations', []):
        text = ' '.join([c.get('title', ''), *c.get('excerpts', [])]).lower()
        if all(re.search(r'(?<!\w)' + re.escape(x['name'].lower()) + r'(?!\w)', text) for x in (a, b)) and c.get('url', '').startswith(('https://', 'http://')):
            cites.append(c)
    return {'p': r.get('answers', {}).get('link', {}).get('noul'), 'citations': cites}

def stored_pair(a, b):
    key = ('pair', *sorted((a['domain'], b['domain'])))
    with PAIR_LOCK:
        if key in GUARD.results:
            return GUARD.results[key]
        event = PAIR_PENDING.get(key)
        owner = event is None
        if owner:
            event = threading.Event()
            PAIR_PENDING[key] = event
    if not owner:
        event.wait()
        return GUARD.results[key]
    result = (503, {'error': 'Relationship research unavailable. Try again later.'})
    try:
        result = (200, pair(a, b))
    except Exception:
        pass
    finally:
        with PAIR_LOCK:
            with GUARD.lock:
                GUARD.results[key] = result
            PAIR_PENDING.pop(key)
            event.set()
    return result

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/status':
            with GUARD.lock:
                status = {'used': dict(GUARD.used), 'in_flight': len(GUARD.pending), 'upstream_requests': REQUEST_METRICS['attempts']}
            self.json_response(200, status)
            return
        if path != '/' and not (path.endswith(('.js', '.mjs', '.css')) or path in ('/index.html', '/seed.json', '/questions.json', '/seed-links.json')):
            self.send_error(404)
            return
        super().do_GET()

    def json_response(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass

    def stream_start(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def stream_fact(self, event):
        try:
            self.wfile.write((json.dumps(event) + '\n').encode())
            self.wfile.flush()
        except OSError:
            # Finish and cache the existing work even if its requester disconnects.
            pass

    def do_POST(self):
        try:
            if self.path not in ('/api/company', '/api/pair'):
                self.json_response(404, {'error': 'Unknown endpoint.'})
                return
            n = int(self.headers.get('Content-Length', '0'))
            if self.headers.get('Transfer-Encoding') or not 0 < n <= MAX_REQUEST_BYTES:
                self.close_connection = True
                self.json_response(413, {'error': 'Request is too large or has no valid length. Maximum 4096 bytes.'})
                return
            d = json.loads(self.rfile.read(n))
            if self.path == '/api/company':
                c = company(d)
                key = ('company', c['domain'])
                requested = d.get('peers', [x['domain'] for x in SEEDS])
                if not isinstance(requested, list) or len(requested) > len(SEEDS) + MAX_COMPANIES or any(not isinstance(x, str) for x in requested):
                    raise ValueError('Invalid peer list.')
                with GUARD.lock:
                    if any(x not in GUARD.known for x in requested):
                        raise ValueError('Peers must already be known companies.')
                    peers = [GUARD.known[x] for x in dict.fromkeys(requested) if x != c['domain']]
            else:
                a, b = company(d['a']), company(d['b'])
                if a['domain'] == b['domain']:
                    raise ValueError('Choose two different company domains.')
                key = ('pair', *sorted((a['domain'], b['domain'])))
            cached = GUARD.begin(key)
            if key[0] == 'company' and cached is None:
                with GUARD.lock:
                    GUARD.known[c['domain']] = c
        except Rejected as e:
            self.json_response(e.status, {'code': e.code, 'error': e.message})
            return
        except (ValueError, TypeError, KeyError):
            self.json_response(400, {'error': 'Invalid input. Enter a company name and a valid domain.'})
            return

        if cached is not None:
            status, payload = cached
            if status == 200 and key[0] == 'company':
                self.stream_start()
                for event in payload:
                    self.stream_fact(event)
            else:
                self.json_response(status, payload)
            return

        result = (503, {'error': 'Research failed. Please try again later.'})
        try:
            if key[0] == 'company':
                events = []
                # Submit the complete run once; hold the slot until every future finishes.
                futures = [POOL.submit(probe, c, k) for k in QUESTIONS]
                connected = True
                try:
                    self.stream_start()
                except OSError:
                    connected = False
                for f in as_completed(futures):
                    try:
                        k, value = f.result()
                    except Exception:
                        continue
                    event = {'key': k, 'fact': value}
                    events.append(event)
                    if connected:
                        self.stream_fact(event)
                marker = {'type': 'facts_complete'}
                events.append(marker)
                if connected:
                    self.stream_fact(marker)
                # The admitted add owns this bounded peer snapshot; clients cannot mint free pair credits.
                if len([e for e in events if 'key' in e]) == len(QUESTIONS):
                    pair_futures = {POOL.submit(stored_pair, c, other): other for other in peers}
                    for f in as_completed(pair_futures):
                        other = pair_futures[f]
                        status, payload = f.result()
                        event = {'type': 'pair', 'domain': other['domain'], 'result': payload if status == 200 else None, 'error': payload.get('error') if status != 200 else None}
                        events.append(event)
                        if connected:
                            self.stream_fact(event)
                result = (200, events)
            else:
                result = stored_pair(a, b)
                self.json_response(*result)
        except Exception:
            if key[0] != 'company':
                self.json_response(*result)
        finally:
            GUARD.finish(key, result)

if __name__ == '__main__':
    print('Company Planets http://127.0.0.1:4105', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4105), Handler).serve_forever()
