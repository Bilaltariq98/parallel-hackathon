#!/usr/bin/env python3
"""Webinator server. Stdlib only. Run: python3 04-webinator/server.py  (port 4102)

Endpoints:
  GET  /api/bank                 -> {questions:{key:text}, companies:[{name,status,p}]}
  GET  /api/rebuild[?only=missing] (SSE) events: start, company, error, done
  POST /api/evidence {company, keys:[...]} -> {company, answers:{key:p|null}, citations:[...]}
  POST /api/add {name}           -> {company:{name,status,p}}  (400 invalid, 409 duplicate, 502 upstream)
The API key is handled only inside shared/parallel.py; it never reaches the browser.
"""
import json, os, pathlib, queue, sys, threading, unicodedata
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "shared"))
from parallel import decide  # noqa: E402

PORT = 4102
BANK_FILE = HERE / "bank.json"
SEED_FILE = ROOT / "recon" / "webinator_bank.json"  # read-only
MAX_NAME = 80
WORKERS = 8

QUESTIONS = {
    "uk_hq": "Is this company headquartered in the United Kingdom?",
    "us_hq": "Is this company headquartered in the United States?",
    "public": "Are this company's own shares publicly traded on a stock exchange?",
    "consumer": "Does this company sell primarily to consumers rather than to businesses?",
    "software": "Is this company's main product software or an internet service?",
    "hardware": "Does this company design or manufacture physical hardware or devices?",
    "finance": "Is this company a bank, payments, or financial services company?",
    "food": "Does this company primarily sell food, drink, or groceries?",
    "fashion": "Is this company primarily a clothing, fashion, or luxury goods brand?",
    "auto_aero": "Does this company make cars, aircraft, or other vehicles?",
    "energy_pharma": "Is this company primarily in energy, oil and gas, or pharmaceuticals?",
    "pre_1950": "Was this company founded before 1950?",
    "post_2005": "Was this company founded in 2005 or later?",
    "over_100k": "Does this company have more than 100,000 employees?",
    "trillion": "Has this company's market value or valuation ever exceeded one trillion US dollars?",
    "founder_ceo": "Is this company currently led by one of its founders as CEO?",
    "ai": "Is artificial intelligence a core part of this company's main product?",
    "europe": "Is this company headquartered in continental Europe (not the UK)?",
    "asia": "Is this company headquartered in Asia?",
    "retail_stores": "Does this company operate physical retail stores or restaurants?",
}

POOL = ["Apple", "Microsoft", "Google", "Amazon", "Meta", "Netflix", "Tesla", "Nvidia", "OpenAI", "Anthropic",
        "Stripe", "Shopify", "Airbnb", "Uber", "Spotify", "Salesforce", "Oracle", "IBM", "Intel", "AMD",
        "Samsung", "Sony", "Nintendo", "Toyota", "Volkswagen", "BMW", "Ferrari", "Ford", "General Motors", "Rivian",
        "Coca-Cola", "PepsiCo", "McDonald's", "Starbucks", "Nike", "Adidas", "IKEA", "H&M", "Zara", "LVMH",
        "Walmart", "Costco", "Tesco", "Sainsbury's", "Ocado", "Deliveroo", "Just Eat", "Monzo", "Revolut", "Wise",
        "Starling Bank", "HSBC", "Barclays", "JPMorgan Chase", "Goldman Sachs", "Visa", "Mastercard", "PayPal", "Klarna", "Adyen",
        "ARM", "DeepMind", "BBC", "BP", "Shell", "Unilever", "GSK", "AstraZeneca", "Rolls-Royce", "Dyson",
        "Burberry", "Octopus Energy", "Vodafone", "BT", "Figma", "Notion", "Canva", "Atlassian", "Slack", "Zoom",
        "Datadog", "Cloudflare", "Snowflake", "GitHub", "Duolingo", "Disney", "Warner Bros", "Pfizer", "Moderna", "Boeing",
        "Airbus", "SpaceX", "Ryanair", "easyJet", "British Airways", "Red Bull", "Lego", "Peloton", "TikTok", "Tencent"]

lock = threading.Lock()       # guards bank
rebuild_lock = threading.Lock()
bank = {}                     # name -> {"status": "ok"|"nodata", "p": {...}|None, "error"?: str}


def save_bank():
    tmp = BANK_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"questions": QUESTIONS, "companies": bank}, indent=1))
    os.replace(tmp, BANK_FILE)


def load_bank():
    global bank
    if BANK_FILE.exists():
        bank = json.loads(BANK_FILE.read_text())["companies"]
        return
    seed = json.loads(SEED_FILE.read_text()) if SEED_FILE.exists() else {}
    bank = {}
    for name in POOL:
        if name in seed:
            bank[name] = {"status": "ok", "p": seed[name]}
        else:
            bank[name] = {"status": "nodata", "p": None, "error": "missing from seed"}
    save_bank()


def clean_name(raw):
    if not isinstance(raw, str):
        return None
    s = "".join(ch for ch in raw if unicodedata.category(ch)[0] != "C")
    s = " ".join(s.split())
    return s if s and len(s) <= MAX_NAME else None


def qs(keys):
    return {k: {"type": "noul", "instructions": QUESTIONS[k]} for k in keys}


def fetch_company(name, keys=None, cache=False):
    """One Decisions call for one company. Returns (p dict, citations)."""
    r = decide({"company": name}, qs(keys or list(QUESTIONS)), cache=cache)
    p = {k: (a["noul"] if a.get("type") == "noul" else None) for k, a in r.get("answers", {}).items()}
    if not p or all(v is None for v in p.values()):
        raise RuntimeError("no usable answers")
    return p, r.get("citations", [])


def public(name):
    c = bank[name]
    return {"name": name, "status": c["status"], "p": c["p"]}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    STATIC = {"/": "index.html", "/index.html": "index.html", "/app.js": "app.js",
              "/game.js": "game.js", "/style.css": "style.css"}
    TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n > 10000:
                return None
            d = json.loads(self.rfile.read(n) or b"{}")
            return d if isinstance(d, dict) else None
        except (ValueError, OSError):
            return None

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path in self.STATIC:
            f = HERE / self.STATIC[path]
            body = f.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", self.TYPES[f.suffix] + "; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        elif path == "/api/bank":
            with lock:
                self.send_json(200, {"questions": QUESTIONS, "companies": [public(n) for n in bank]})
        elif path == "/api/rebuild":
            self.rebuild("only=missing" in query)
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        body = self.read_json()
        if body is None:
            return self.send_json(400, {"error": "bad JSON body"})
        if self.path == "/api/add":
            self.add(body)
        elif self.path == "/api/evidence":
            self.evidence(body)
        else:
            self.send_json(404, {"error": "not found"})

    # --- SSE rebuild
    def sse(self, event, data):
        self.wfile.write(f"event: {event}\ndata: {json.dumps(data)}\n\n".encode())
        self.wfile.flush()

    def rebuild(self, only_missing):
        if not rebuild_lock.acquire(blocking=False):
            return self.send_json(409, {"error": "rebuild already running"})
        q = queue.Queue()
        cancel = threading.Event()
        try:
            with lock:
                names = [n for n in bank if not only_missing or bank[n]["status"] != "ok"]
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.sse("start", {"total": len(names), "only_missing": only_missing})

            def work(name):
                if cancel.is_set():
                    return
                try:
                    p, _ = fetch_company(name, cache=False)
                    with lock:
                        bank[name] = {"status": "ok", "p": p}
                    q.put(("company", {"name": name, "p": p}))
                except Exception as e:  # noqa: BLE001 - reported to client, not swallowed
                    msg = str(e)[:200]
                    sys.stderr.write(f"rebuild error {name}: {msg}\n")
                    with lock:
                        bank[name] = {"status": "nodata", "p": None, "error": msg}
                    q.put(("error", {"name": name, "message": msg}))

            ex = ThreadPoolExecutor(WORKERS)
            for n in names:
                ex.submit(work, n)
            ok = failed = 0
            try:
                for i in range(len(names)):
                    ev, data = q.get()
                    ok += ev == "company"
                    failed += ev == "error"
                    self.sse(ev, {**data, "done": i + 1, "total": len(names)})
                self.sse("done", {"ok": ok, "failed": failed})
            except (BrokenPipeError, ConnectionResetError):
                cancel.set()
            finally:
                ex.shutdown(wait=True)
                with lock:
                    save_bank()
        finally:
            rebuild_lock.release()

    # --- add company
    def add(self, body):
        name = clean_name(body.get("name"))
        if not name:
            return self.send_json(400, {"error": f"name must be 1-{MAX_NAME} characters"})
        with lock:
            if name.lower() in {n.lower() for n in bank}:
                return self.send_json(409, {"error": f"{name} is already on the board"})
        try:
            p, _ = fetch_company(name, cache=True)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"add error {name}: {e}\n")
            return self.send_json(502, {"error": f"live lookup failed: {str(e)[:150]}"})
        with lock:
            if name.lower() in {n.lower() for n in bank}:
                return self.send_json(409, {"error": f"{name} is already on the board"})
            bank[name] = {"status": "ok", "p": p}
            save_bank()
            self.send_json(200, {"company": public(name)})

    # --- evidence
    def evidence(self, body):
        name = body.get("company")
        keys = body.get("keys")
        with lock:
            known = name in bank
        if not known:
            return self.send_json(404, {"error": "unknown company"})
        if not isinstance(keys, list):
            return self.send_json(400, {"error": "keys must be a list"})
        keys = [k for k in dict.fromkeys(keys) if k in QUESTIONS][:20]
        if not keys:
            return self.send_json(400, {"error": "no valid question keys"})
        try:
            r = decide({"company": name}, qs(keys), cache=True)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"evidence error {name}: {e}\n")
            return self.send_json(502, {"error": f"live lookup failed: {str(e)[:150]}"})
        answers = {k: (a["noul"] if a.get("type") == "noul" else None) for k, a in r.get("answers", {}).items()}
        cites = [{"url": str(c.get("url", ""))[:500], "title": str(c.get("title", ""))[:200],
                  "excerpts": [str(x)[:400] for x in (c.get("excerpts") or [])[:3]]}
                 for c in r.get("citations", [])[:10]]
        self.send_json(200, {"company": name, "answers": answers, "citations": cites})


def main():
    load_bank()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    print(f"webinator on http://127.0.0.1:{PORT}  ({len(bank)} companies)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
