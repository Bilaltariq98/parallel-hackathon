"""Decisions API recon. Prints summaries; raw responses go to recon_raw.json."""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KEY = next(iter(json.load(open(os.path.expanduser("~/.config/parallel-web-tools/auth.json")))["orgs"].values()))["api_key"]
RAW = {}

def decide(state, questions, tag):
    body = json.dumps({"state": state, "questions": questions}).encode()
    req = urllib.request.Request("https://api.parallel.ai/v1/decisions", body,
                                 {"x-api-key": KEY, "Content-Type": "application/json", "User-Agent": "recon"})
    t = time.time()
    try:
        r = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        r = {"error": e.code, "detail": e.read().decode()[:300]}
    r["_ms"] = int((time.time() - t) * 1000)
    RAW[tag] = r
    return r

VENDORS = ["AWS", "Google Cloud", "Microsoft Azure", "Cloudflare", "Fastly", "Akamai", "Stripe", "Adyen",
           "Auth0", "Okta", "Twilio", "SendGrid", "Datadog", "PagerDuty", "Snowflake", "Salesforce",
           "Slack", "Zendesk", "Intercom", "GitHub", "MongoDB Atlas", "Segment", "Sentry", "OpenAI"]
COMPANIES = {"Monzo": "monzo.com", "Notion": "notion.so", "Tesco": "tesco.com",
             "incident.io": "incident.io", "Deliveroo": "deliveroo.co.uk", "HSBC": "hsbc.com"}

def slug(v): return v.lower().replace(" ", "_")

def vendor_qs(company, vendors):
    return {slug(v): {"type": "noul",
                      "instructions": f"Does {company} use {v} as a vendor, subprocessor or infrastructure provider?"}
            for v in vendors}

def fmt(r, top=8):
    if "error" in r: return f"ERROR {r['error']} {r['detail']}"
    a = r["answers"]
    ref = [k for k, v in a.items() if v["type"] == "refusal"]
    probs = sorted(((v.get("noul", -1), k) for k, v in a.items() if v["type"] == "noul"), reverse=True)
    hi = [f"{k}={p:.2f}" for p, k in probs if p >= 0.5]
    mid = [f"{k}={p:.2f}" for p, k in probs if 0.15 <= p < 0.5]
    return (f"{r['_ms']}ms cites={len(r.get('citations', []))} refusals={len(ref)} "
            f"tokens={r.get('usage', {}).get('input_tokens')}\n   YES: {', '.join(hi)}\n   MAYBE: {', '.join(mid)}")

def test_blast():
    print("== A. Blast Radius: 24 vendor questions in ONE call per company ==")
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda c: (c, decide({"company": c, "website": COMPANIES[c]}, vendor_qs(c, VENDORS), f"blast1/{c}")), COMPANIES))
    for c, r in res: print(f"{c}: {fmt(r)}")
    print("\n== A2. Monzo: ONE call PER vendor (24 parallel) -> per-edge citations ==")
    t = time.time()
    with ThreadPoolExecutor(24) as ex:
        res = list(ex.map(lambda v: (v, decide({"company": "Monzo", "website": "monzo.com"}, vendor_qs("Monzo", [v]), f"blast2/{v}")), VENDORS))
    print(f"wall {int((time.time()-t)*1000)}ms")
    for v, r in res:
        if "error" in r: print(v, fmt(r)); continue
        a = r["answers"][slug(v)]
        cites = r.get("citations", [])
        named = sum(1 for c in cites if v.lower() in json.dumps(c).lower())
        print(f"  {v}: p={a.get('noul', 'REFUSAL')} {r['_ms']}ms cites={len(cites)} mentioning_vendor={named} top={cites[0]['url'] if cites else '-'}")

CANDS = ["Stripe", "Monzo", "Revolut", "Spotify", "Deliveroo", "Notion", "Figma", "Shopify", "Airbnb", "Wise",
         "Octopus Energy", "Tesco", "ARM", "Klarna", "Canva", "Datadog", "Cloudflare", "Duolingo", "Ocado", "Starling Bank"]
WQ = {"uk_hq": "Is this company headquartered in the United Kingdom?",
      "public": "Is this company publicly traded on a stock exchange?",
      "consumer": "Does this company sell primarily to consumers rather than businesses?"}

def test_webinator():
    print("\n== B. Webinator: 3 attribute questions x 20 companies, one call per company (parallel) ==")
    t = time.time()
    qs = {k: {"type": "noul", "instructions": v} for k, v in WQ.items()}
    with ThreadPoolExecutor(20) as ex:
        res = list(ex.map(lambda c: (c, decide({"company": c}, qs, f"web/{c}")), CANDS))
    print(f"wall {int((time.time()-t)*1000)}ms")
    for c, r in res:
        if "error" in r: print(c, fmt(r)); continue
        print(f"  {c}: " + " ".join(f"{k}={v.get('noul', -1):.2f}" for k, v in r["answers"].items()) + f" {r['_ms']}ms")
    print("\n== B2. Same uk_hq question, 20 companies as 20 questions in ONE call ==")
    r = decide({"topic": "company headquarters"},
               {slug(c): {"type": "noul", "instructions": f"Is {c} headquartered in the United Kingdom?"} for c in CANDS}, "web1")
    if "error" in r: print(fmt(r))
    else: print(f"{r['_ms']}ms cites={len(r['citations'])}: " + " ".join(f"{k}={v.get('noul', -1):.2f}" for k, v in r["answers"].items()))

def test_room():
    print("\n== C. Room Radar: pairwise 'should these two talk' ==")
    pairs = [("incident.io", "Monzo"), ("Parallel Web Systems", "Red Badger"), ("Tesco", "Figma"), ("Stripe", "Deliveroo")]
    def one(p):
        a, b = p
        return p, decide({"company_a": a, "company_b": b}, {
            "customer": {"type": "noul", "instructions": f"Is {b} a publicly known customer of {a}, or {a} of {b}?"},
            "relation": {"type": "choice", "instructions": f"What is the most likely commercial relationship between {a} and {b}?",
                         "criteria": {"customer_vendor": "One is or plausibly would be a customer of the other.",
                                      "competitors": "They compete for the same customers.",
                                      "partners": "They integrate or partner.",
                                      "unrelated": "No meaningful commercial relationship."}},
            "shared_stack": {"type": "noul", "instructions": f"Do {a} and {b} both publicly use the same major cloud provider?"}}, f"room/{a}-{b}")
    with ThreadPoolExecutor(4) as ex:
        for p, r in ex.map(one, pairs):
            if "error" in r: print(p, fmt(r)); continue
            a = r["answers"]
            print(f"  {p}: customer={a['customer'].get('noul')} relation={a['relation'].get('choice')} "
                  f"{json.dumps(a['relation'].get('probabilities'))} shared_cloud={a['shared_stack'].get('noul')} {r['_ms']}ms cites={len(r['citations'])}")

if __name__ == "__main__":
    for name in sys.argv[1:] or ["blast", "webinator", "room"]:
        globals()[f"test_{name}"]()
    json.dump(RAW, open(os.path.join(os.path.dirname(__file__), "recon_raw.json"), "w"), indent=1)
