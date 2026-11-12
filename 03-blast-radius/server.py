"""Blast Radius server. Stdlib only. Run: python3 03-blast-radius/server.py  (port 4101)

GET /api/blast?company=X[&website=d.com]  SSE: meta, edge, vendor_error, done
GET /api/map                              SSE: meta, edge (+company), vendor_error, done  (all 12 companies)
GET /api/chokepoint                       SSE: meta, vendor_error, result, done
GET /api/monitor                          JSON: {ok, events, error}
Static: /, /app.js, /style.css
"""
import json, pathlib, re, subprocess, sys, threading, time, unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "shared"))
from parallel import decide  # noqa: E402

PORT = 4101
MONITOR_ID = "monitor_6dd03cdc7a164760b416e83fc432ff36"
WORKERS = 12

COMPANIES = ["Monzo", "Revolut", "Wise", "GoCardless", "Starling Bank", "Barclays", "Lloyds Banking Group",
             "Tesco", "ASOS", "Ocado", "Deliveroo", "Octopus Energy"]
CATEGORIES = {
    "Cloud": ["AWS", "Google Cloud", "Microsoft Azure"],
    "CDN/DNS": ["Cloudflare", "Fastly", "Akamai"],
    "Payments": ["Stripe", "Adyen", "Checkout.com"],
    "Identity/KYC": ["Auth0", "Okta", "Experian", "Onfido"],
    "Comms": ["Twilio", "SendGrid", "Slack"],
    "Observability": ["Datadog", "PagerDuty", "incident.io", "Atlassian Statuspage", "Sentry"],
    "Support": ["Zendesk", "Intercom", "Salesforce"],
    "Data": ["Snowflake", "MongoDB", "Segment", "GitHub"],
    "Security": ["CrowdStrike", "Zscaler"],
    "AI": ["OpenAI", "Anthropic"],
}
VENDORS = [(v, c) for c, vs in CATEGORIES.items() for v in vs]
ALIASES = {"AWS": ["aws", "amazon web services"], "Google Cloud": ["google cloud", "gcp", "bigquery"],
           "Microsoft Azure": ["azure"], "Atlassian Statuspage": ["statuspage"], "OpenAI": ["openai", "chatgpt"],
           "Anthropic": ["anthropic", "claude"]}
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$")


# ---- pure logic -------------------------------------------------------------
def edge_style(p, n_cites):
    """Edge rule. p None (refusal) -> hidden. solid: p>=0.8 and >=2 citations naming vendor.
    dashed: 0.5<=p<0.8, or p>=0.8 with only 1 naming citation. hidden otherwise."""
    if p is None or p < 0.5:
        return "hidden"
    if p >= 0.8 and n_cites >= 2:
        return "solid"
    if p >= 0.8 and n_cites == 1:
        return "dashed"
    if p >= 0.8:  # high p but no citation names the vendor: unsupported
        return "dashed"
    return "dashed"


def _self_check():
    assert edge_style(0.95, 2) == "solid"
    assert edge_style(0.8, 5) == "solid"
    assert edge_style(0.95, 1) == "dashed"
    assert edge_style(0.95, 0) == "dashed"
    assert edge_style(0.79, 9) == "dashed"
    assert edge_style(0.5, 9) == "dashed"
    assert edge_style(0.49, 9) == "hidden"
    assert edge_style(None, 9) == "hidden"
    assert clean_company("  Mon\x00zo\n ")[0] == "Monzo"
    assert clean_company("")[0] is None and clean_company("x" * 81)[0] is None
    assert clean_website("https://Monzo.com/")[0] == "monzo.com"
    assert clean_website("a b")[0] is None and clean_website("")[0] == ""
    assert clean_website("https://www.sainsburys.co.uk/shop?x=1")[0] == "sainsburys.co.uk"
    print("self-check ok")


def clean_company(raw):
    s = "".join(ch for ch in (raw or "") if unicodedata.category(ch)[0] != "C" or ch == " ").strip()
    s = re.sub(r"\s+", " ", s)
    if not s:
        return None, "company is required"
    if len(s) > 80:
        return None, "company must be at most 80 characters"
    return s, None


def clean_website(raw):
    s = (raw or "").strip().lower()
    if not s:
        return "", None
    s = re.sub(r"^https?://", "", s).split("/")[0].split("?")[0]  # keep the host, drop any path
    if s.startswith("www."):
        s = s[4:]
    if not DOMAIN_RE.match(s):
        return None, "website must be a plain domain like example.com"
    return s, None


def mentioning(vendor, citations):
    names = ALIASES.get(vendor, [vendor.lower()])
    pat = re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(n) for n in names) + r")(?![a-z0-9])")
    out = []
    for c in citations or []:
        ex = [e for e in (c.get("excerpts") or []) if pat.search(str(e).lower())]
        if ex:
            out.append({"url": str(c.get("url", "")), "title": str(c.get("title") or ""), "excerpts": [str(e)[:600] for e in ex[:3]]})
    return out


def question(company, vendor):
    return {"edge": {"type": "noul", "instructions":
                     f"Does {company} use {vendor} as a vendor, subprocessor or infrastructure provider?"}}


def probe(company, website, vendor, category):
    """One Decisions call for one pair. Returns a new dict; raises on failure."""
    state = {"company": company, **({"website": website} if website else {})}
    r = decide(state, question(company, vendor))
    a = (r.get("answers") or {}).get("edge") or {}
    p = a.get("noul") if a.get("type") == "noul" else None
    cites = mentioning(vendor, r.get("citations"))
    return {"vendor": vendor, "category": category, "p": p, "refused": p is None,
            "style": edge_style(p, len(cites)), "mentions": len(cites), "citations": cites,
            "cached": bool(r.get("_cached")), "ms": r.get("_ms")}


# ---- HTTP -------------------------------------------------------------------
_mon_lock = threading.Lock()
_mon_cache = {"t": 0.0, "val": None}


def monitor_events():
    with _mon_lock:
        if time.time() - _mon_cache["t"] < 10 and _mon_cache["val"]:
            return _mon_cache["val"]
    try:
        cp = subprocess.run(["parallel-cli", "monitor", "events", MONITOR_ID, "--json", "--limit", "10"],
                            capture_output=True, text=True, timeout=25)
        if cp.returncode != 0:
            val = {"ok": False, "events": [], "error": (cp.stderr or cp.stdout or "cli failed")[:300]}
        else:
            data = json.loads(cp.stdout or "{}")
            ev = data if isinstance(data, list) else (data.get("events") or data.get("items") or [])
            val = {"ok": True, "events": [json.loads(json.dumps(e, default=str)) for e in ev][:10], "error": None}
    except Exception as e:
        val = {"ok": False, "events": [], "error": f"{type(e).__name__}: {e}"[:300]}
    with _mon_lock:
        _mon_cache.update(t=time.time(), val=val)
    return val


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _sse_start(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

    def _sse(self, event, data):
        self.wfile.write(f"event: {event}\ndata: {json.dumps(data)}\n\n".encode())
        self.wfile.flush()

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == "/api/blast":
                return self.blast(q)
            if u.path == "/api/map":
                return self.map()
            if u.path == "/api/chokepoint":
                return self.chokepoint()
            if u.path == "/api/monitor":
                return self._json(200, monitor_events())
            files = {"/": ("index.html", "text/html"), "/index.html": ("index.html", "text/html"),
                     "/app.js": ("app.js", "text/javascript"), "/style.css": ("style.css", "text/css")}
            if u.path in files:
                name, ct = files[u.path]
                b = (HERE / name).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", ct + "; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
                return
            self._json(404, {"error": "not found"})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def blast(self, q):
        company, err = clean_company(q.get("company"))
        website, err2 = clean_website(q.get("website")) if not err else ("", None)
        if err or err2:
            return self._json(400, {"error": err or err2})
        self._sse_start()
        self._sse("meta", {"company": company, "website": website,
                           "vendors": [{"vendor": v, "category": c} for v, c in VENDORS]})
        ok = failed = 0
        with ThreadPoolExecutor(WORKERS) as ex:
            futs = {ex.submit(probe, company, website, v, c): (v, c) for v, c in VENDORS}
            for f in as_completed(futs):
                v, c = futs[f]
                try:
                    self._sse("edge", f.result())
                    ok += 1
                except (BrokenPipeError, ConnectionResetError):
                    for g in futs:
                        g.cancel()
                    return
                except Exception as e:
                    failed += 1
                    self._sse("vendor_error", {"vendor": v, "category": c, "message": str(e)[:200]})
        self._sse("done", {"ok": ok, "failed": failed})

    def map(self):
        """Whole map: every (company, vendor) pair as an edge event carrying its company. Cache makes this near instant."""
        self._sse_start()
        self._sse("meta", {"companies": COMPANIES, "vendors": [{"vendor": v, "category": c} for v, c in VENDORS]})
        ok = failed = 0
        with ThreadPoolExecutor(WORKERS) as ex:
            futs = {ex.submit(probe, co, "", v, c): (co, v, c) for co in COMPANIES for v, c in VENDORS}
            for f in as_completed(futs):
                co, v, c = futs[f]
                try:
                    e = f.result()
                    self._sse("edge", {**e, "company": co, "citations": e["citations"][:2]})
                    ok += 1
                except (BrokenPipeError, ConnectionResetError):
                    for g in futs:
                        g.cancel()
                    return
                except Exception as ex_:
                    failed += 1
                    self._sse("vendor_error", {"company": co, "vendor": v, "category": c, "message": str(ex_)[:200]})
        self._sse("done", {"ok": ok, "failed": failed})

    def chokepoint(self):
        self._sse_start()
        self._sse("meta", {"companies": COMPANIES, "vendors": [{"vendor": v, "category": c} for v, c in VENDORS]})
        deps = {}  # vendor -> tuple of companies (rebuilt, never mutated in place)
        failed = 0
        with ThreadPoolExecutor(WORKERS) as ex:
            futs = {ex.submit(probe, co, "", v, c): (co, v) for co in COMPANIES for v, c in VENDORS}
            for f in as_completed(futs):
                co, v = futs[f]
                try:
                    e = f.result()
                    if e["p"] is not None and e["p"] >= 0.6:
                        deps = {**deps, v: deps.get(v, ()) + (co,)}
                except Exception as ex_:
                    failed += 1
                    self._sse("vendor_error", {"company": co, "vendor": v, "message": str(ex_)[:200]})
        cat = dict(VENDORS)
        ranking = sorted(({"vendor": v, "category": cat[v], "count": len(cs), "companies": sorted(cs)}
                          for v, cs in deps.items()), key=lambda r: (-r["count"], r["vendor"]))
        self._sse("result", {"total": len(COMPANIES), "failed": failed, "ranking": ranking})
        self._sse("done", {"failed": failed})


if __name__ == "__main__":
    _self_check()
    if "--check" in sys.argv:
        sys.exit(0)
    print(f"Blast Radius on http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
