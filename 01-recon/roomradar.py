"""Room Radar recon: pairwise vs attribute matching, obscure companies, hybrid blast table.
Raw responses -> roomradar_raw.json. Never prints the key."""
import json, os, sys, time, itertools, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KEY = next(iter(json.load(open(os.path.expanduser("~/.config/parallel-web-tools/auth.json")))["orgs"].values()))["api_key"]
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = {}
STATS = {"calls": 0, "429": 0, "err": 0}

def decide(state, questions, tag, tries=6):
    body = json.dumps({"state": state, "questions": questions}).encode()
    for i in range(tries):
        req = urllib.request.Request("https://api.parallel.ai/v1/decisions", body,
                                     {"x-api-key": KEY, "Content-Type": "application/json", "User-Agent": "recon"})
        t = time.time(); STATS["calls"] += 1
        try:
            r = json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            r = {"error": e.code, "detail": e.read().decode()[:300]}
            if e.code == 429: STATS["429"] += 1; time.sleep(2 * (i + 1)); continue
            STATS["err"] += 1
        except Exception as e:
            r = {"error": "net", "detail": str(e)[:200]}; STATS["err"] += 1
        r["_ms"] = int((time.time() - t) * 1000)
        RAW[tag] = r
        return r
    RAW[tag] = r
    return r

def p(r, k):
    if "error" in r: return None
    a = r["answers"].get(k, {})
    return a.get("noul") if a.get("type") == "noul" else None

KNOWN = ["incident.io", "Monzo", "Synthesia", "ElevenLabs", "PolyAI", "Cleo", "Tessl", "Wayve",
         "Faculty AI", "Red Badger", "Thoughtworks", "Parallel Web Systems", "Deliveroo", "Revolut", "Stability AI"]
OBSCURE = ["Kestrel Agents", "Tidepool Analytics", "Nimbus Forge Ltd", "Bilal Builds", "Zorblax Systems"]  # all made up / tiny
COS = KNOWN + OBSCURE

def pair_qs(a, b):
    return {
        "customer": {"type": "noul", "instructions": f"Is there public evidence that {a} is a customer of {b}, or {b} a customer of {a}?"},
        "same_buyer": {"type": "noul", "instructions": f"Do {a} and {b} sell to the same type of buyer (e.g. both sell to engineering teams, or both to banks)?"},
        "plugs_in": {"type": "noul", "instructions": f"Would one of {a}'s or {b}'s products plausibly plug into or be used inside the other's product or workflow?"},
        "compete": {"type": "noul", "instructions": f"Do {a} and {b} directly compete for the same customers?"},
    }

def attr_qs(c):
    ch = lambda ins, crit: {"type": "choice", "instructions": ins, "criteria": crit}
    n = lambda ins: {"type": "noul", "instructions": ins}
    return {
        "exists": n(f"Is there public web evidence describing what the company '{c}' (likely London-based) does?"),
        "sector": ch(f"What is {c}'s primary sector?", {"fintech": "banking, payments, money", "devtools": "software for engineers / ops",
               "ai_models": "builds foundation or media models", "ai_apps": "AI-powered application or agent product",
               "consultancy": "services / agency / consulting", "consumer": "consumer marketplace or app", "mobility": "autonomous vehicles / transport"}),
        "buyer": ch(f"Who primarily pays {c}?", {"consumers": "individual consumers", "developers": "developers and engineering teams",
               "enterprise": "large enterprises across industries", "financial": "banks and financial institutions", "smb": "small businesses"}),
        "stage": ch(f"What stage is {c}?", {"tiny": "pre-seed, solo or under 10 people", "venture": "seed to Series C",
               "late": "late-stage private or unicorn", "large": "public or very large established firm"}),
        "sells_api": n(f"Does {c} sell an API or developer platform that other companies build on?"),
        "buys_ai": n(f"Does {c} build products on third-party AI/LLM APIs or data APIs?"),
        "needs_build_help": n(f"Does {c} commonly buy outside engineering, design or AI consulting help?"),
        "sells_services": n(f"Does {c} sell engineering, design or AI consulting/implementation services?"),
        "regulated": n(f"Does {c} operate in a heavily regulated industry such as financial services?"),
        "sells_to_eng": n(f"Does {c} sell primarily to software engineering or SRE teams?"),
    }

VENDORS = ["AWS", "Google Cloud", "Microsoft Azure", "Cloudflare", "Stripe", "OpenAI", "Anthropic", "GitHub", "Datadog", "Slack",
           "Vercel", "Auth0", "Okta", "Twilio", "Snowflake", "Sentry", "PagerDuty", "Intercom", "HubSpot", "Notion"]

def fan(jobs, workers=25):
    t = time.time()
    with ThreadPoolExecutor(workers) as ex: res = list(ex.map(lambda j: (j[0], decide(*j[1:])), jobs))
    return res, int((time.time() - t) * 1000)

def run_pairs():
    pairs = list(itertools.combinations(COS, 2))
    res, ms = fan([((a, b), {"company_a": a, "company_b": b}, pair_qs(a, b), f"pair/{a}|{b}") for a, b in pairs])
    rows = []
    for (a, b), r in res:
        v = {k: p(r, k) for k in ("customer", "same_buyer", "plugs_in", "compete")}
        if None in v.values(): rows.append((a, b, None, v, r.get("error"))); continue
        score = 0.35 * v["plugs_in"] + 0.35 * v["customer"] + 0.2 * v["same_buyer"] + 0.1 * v["compete"]
        rows.append((a, b, score, v, len(r.get("citations", []))))
    print(f"PAIRS {len(pairs)} wall={ms}ms failed={sum(1 for x in rows if x[2] is None)}")
    good = sorted((x for x in rows if x[2] is not None), key=lambda x: -x[2])
    for a, b, s, v, c in good[:12]:
        print(f"  {s:.2f} {a} <> {b} " + " ".join(f"{k}={x:.2f}" for k, x in v.items()))
    obs = [x for x in good if x[0] in OBSCURE or x[1] in OBSCURE]
    print("  obscure pairs: n=%d mean=%.2f max=%.2f" % (len(obs), sum(x[2] for x in obs) / len(obs), max(x[2] for x in obs)))
    for a, b, s, v, c in sorted(obs, key=lambda x: -x[2])[:5]:
        print(f"    {s:.2f} {a} <> {b} " + " ".join(f"{k}={x:.2f}" for k, x in v.items()))
    json.dump([[a, b, s, v] for a, b, s, v, _ in rows], open(os.path.join(HERE, "rr_pairs.json"), "w"))

def run_attrs():
    res, ms = fan([(c, {"company": c, "context": "attendee at a London AI agents hackathon"}, attr_qs(c), f"attr/{c}") for c in COS])
    out = {}
    print(f"ATTRS {len(COS)} wall={ms}ms")
    for c, r in res:
        if "error" in r: print(" ", c, r["error"]); continue
        a = r["answers"]; d = {}
        for k, v in a.items():
            d[k] = v.get("choice") if v["type"] == "choice" else (round(v["noul"], 2) if v["type"] == "noul" else "REFUSAL")
            if v["type"] == "choice": d[k + "_p"] = round(max(v["probabilities"].values()), 2)
        out[c] = d
        print(f"  {c}: " + " ".join(f"{k}={x}" for k, x in d.items()) + f" cites={len(r.get('citations', []))}")
    json.dump(out, open(os.path.join(HERE, "rr_attrs.json"), "w"))

def run_vendors():
    jobs = [((c, v), {"company": c}, {"uses": {"type": "noul", "instructions": f"Does {c} use {v} as a vendor, subprocessor or infrastructure provider?"}},
             f"vend/{c}|{v}") for c in COS for v in VENDORS]
    res, ms = fan(jobs, 8)  # 25 workers hit the per-minute key quota (429 code 8) after ~200 calls
    grid = {}
    for (c, v), r in res: grid.setdefault(c, {})[v] = p(r, "uses")
    print(f"VENDORS {len(jobs)} wall={ms}ms failed={sum(1 for (_, r) in res if 'error' in r)}")
    for v in VENDORS:
        hit = [c for c in COS if (grid[c][v] or 0) >= 0.6]
        print(f"  {v}: {len(hit)}/20 known={sum(c in KNOWN for c in hit)} obscure={sum(c in OBSCURE for c in hit)}")
    for c in OBSCURE: print(f"  {c}: " + " ".join(f"{v}={grid[c][v]:.2f}" for v in VENDORS if grid[c][v] is not None and grid[c][v] >= 0.3))
    json.dump(grid, open(os.path.join(HERE, "rr_vendors.json"), "w"))

if __name__ == "__main__":
    for name in sys.argv[1:]:
        globals()[f"run_{name}"]()
        print("STATS", STATS)
    json.dump(RAW, open(os.path.join(HERE, f"roomradar_raw_{'_'.join(sys.argv[1:])}.json"), "w"))
