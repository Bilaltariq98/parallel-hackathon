"""Blast Radius recon: 12 UK companies x 30 vendors, one Decisions call per edge, all parallel.
Prints a summary; raw responses go to blast_raw.json. Reads the key from disk; never prints it."""
import json, os, re, time, urllib.request, urllib.error
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

KEY = next(iter(json.load(open(os.path.expanduser("~/.config/parallel-web-tools/auth.json")))["orgs"].values()))["api_key"]
HERE = os.path.dirname(os.path.abspath(__file__))

COMPANIES = ["Monzo", "Revolut", "Wise", "GoCardless", "Starling Bank", "Barclays", "Lloyds Banking Group",
             "Tesco", "ASOS", "Ocado", "Deliveroo", "Octopus Energy"]
VENDORS = ["AWS", "Google Cloud", "Microsoft Azure", "Cloudflare", "Fastly", "Akamai",
           "Stripe", "Adyen", "Checkout.com", "Auth0", "Okta", "Twilio", "SendGrid",
           "Datadog", "PagerDuty", "incident.io", "Atlassian Statuspage", "Snowflake", "Salesforce",
           "Slack", "Zendesk", "Intercom", "GitHub", "MongoDB", "Segment", "Sentry",
           "CrowdStrike", "Experian", "Onfido", "Zscaler"]
ALIASES = {"AWS": ["aws", "amazon web services"], "Google Cloud": ["google cloud", "gcp", "bigquery"],
           "Microsoft Azure": ["azure"], "Atlassian Statuspage": ["statuspage"], "MongoDB": ["mongodb"]}


def decide(company, vendor):
    q = {"edge": {"type": "noul", "instructions":
                  f"Does {company} use {vendor} as a vendor, subprocessor or infrastructure provider?"}}
    body = json.dumps({"state": {"company": company}, "questions": q}).encode()
    req = urllib.request.Request("https://api.parallel.ai/v1/decisions", body,
                                 {"x-api-key": KEY, "Content-Type": "application/json", "User-Agent": "recon"})
    t = time.time()
    try:
        r = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        r = {"error": e.code}
    except Exception as e:  # network/timeouts
        r = {"error": type(e).__name__}
    r["_ms"] = int((time.time() - t) * 1000)
    return company, vendor, r


def mentions(vendor, cites):
    names = ALIASES.get(vendor, [vendor.lower()])
    hits = 0
    for c in cites:
        text = " ".join(c.get("excerpts") or []).lower()
        if any(re.search(r"\b" + re.escape(n) + r"\b", text) for n in names):
            hits += 1
    return hits


def main():
    pairs = [(c, v) for c in COMPANIES for v in VENDORS]
    t = time.time()
    with ThreadPoolExecutor(64) as ex:
        res = list(ex.map(lambda p: decide(*p), pairs))
    wall = int((time.time() - t) * 1000)
    errs = Counter(r["error"] for _, _, r in res if "error" in r)
    lat = sorted(r["_ms"] for _, _, r in res)
    print(f"calls={len(res)} wall={wall}ms p50={lat[len(lat)//2]} p95={lat[int(len(lat)*.95)]} errors={dict(errs)}")
    edges = []
    for c, v, r in res:
        if "error" in r:
            continue
        a = r["answers"]["edge"]
        p = a.get("noul", -1) if a["type"] == "noul" else -1
        cites = r.get("citations", [])
        edges.append({"company": c, "vendor": v, "p": p, "ms": r["_ms"], "ncites": len(cites),
                      "mention": mentions(v, cites), "top": cites[0]["url"] if cites else None})
    refusals = sum(1 for e in edges if e["p"] < 0)
    print(f"refusals={refusals}")
    choke = Counter(e["vendor"] for e in edges if e["p"] > 0.6)
    print("\nCHOKEPOINTS (companies with p>0.6, of 12):")
    for v, n in choke.most_common():
        solid = sum(1 for e in edges if e["vendor"] == v and e["p"] > 0.6 and e["mention"] >= 2)
        print(f"  {v:22s} {n:2d}   (solid, >=2 cites naming vendor: {solid})")
    hi = [e for e in edges if e["p"] > 0.8]
    print(f"\nedges p>0.8: {len(hi)}; mention-hist: {Counter(min(e['mention'], 3) for e in hi)}")
    for e in hi[:40]:
        print(f"  {e['company']:20s} {e['vendor']:20s} p={e['p']:.2f} mention={e['mention']} {e['top']}")
    per_co = {c: sum(1 for e in edges if e["company"] == c and e["p"] > 0.6) for c in COMPANIES}
    print("\nper-company edges p>0.6:", per_co)
    json.dump({"wall_ms": wall, "edges": edges, "raw": {f"{c}|{v}": r for c, v, r in res}},
              open(os.path.join(HERE, "blast_raw.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
