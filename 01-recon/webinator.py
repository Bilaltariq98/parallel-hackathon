"""Webinator recon: scale test, question bank, offline game simulation.
Usage: python3 webinator.py scale | bank | sim | outside
Bank answers cached to webinator_bank.json. Key read at runtime, never printed."""
import json, math, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = next(iter(json.load(open(os.path.expanduser("~/.config/parallel-web-tools/auth.json")))["orgs"].values()))["api_key"]

def decide(state, questions):
    body = json.dumps({"state": state, "questions": questions}).encode()
    req = urllib.request.Request("https://api.parallel.ai/v1/decisions", body,
                                 {"x-api-key": KEY, "Content-Type": "application/json", "User-Agent": "webinator"})
    t = time.time()
    try:
        r = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        r = {"error": e.code, "detail": e.read().decode()[:200]}
    except Exception as e:
        r = {"error": "exc", "detail": str(e)[:200]}
    r["_ms"] = int((time.time() - t) * 1000)
    return r

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
assert len(POOL) == 100 and len(set(POOL)) == 100

BANK = {
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
SCALE_KEYS = ["uk_hq", "public", "consumer", "software", "pre_1950"]

def qs(keys): return {k: {"type": "noul", "instructions": BANK[k]} for k in keys}

def fan(keys, conc, companies=POOL):
    t = time.time()
    with ThreadPoolExecutor(conc) as ex:
        res = list(ex.map(lambda c: (c, decide({"company": c}, qs(keys))), companies))
    return int((time.time() - t) * 1000), res

def summarize(wall, res):
    errs = [r.get("error") for _, r in res if "error" in r]
    ms = sorted(r["_ms"] for _, r in res if "error" not in r)
    refusals = sum(1 for _, r in res if "error" not in r for a in r["answers"].values() if a["type"] == "refusal")
    nans = sum(len(r["answers"]) for _, r in res if "error" not in r)
    mush = sum(1 for _, r in res if "error" not in r for a in r["answers"].values() if a["type"] == "noul" and 0.2 < a["noul"] < 0.8)
    p = lambda q: ms[min(len(ms) - 1, int(q * len(ms)))] if ms else -1
    print(f"wall={wall}ms ok={len(ms)} errors={errs[:5]}({len(errs)}) p50={p(.5)} p90={p(.9)} max={p(1)} "
          f"refusals={refusals}/{nans} mushy(0.2-0.8)={mush}/{nans}")

def test_scale():
    for conc in (100,):
        print(f"== scale: 100 companies x 5 q, concurrency {conc}")
        summarize(*fan(SCALE_KEYS, conc))

def test_bank():
    print("== bank: 100 companies x 20 q, concurrency 50")
    wall, res = fan(list(BANK), 50)
    summarize(wall, res)
    bank = {c: {k: (a.get("noul") if a["type"] == "noul" else None) for k, a in r["answers"].items()}
            for c, r in res if "error" not in r}
    json.dump(bank, open(os.path.join(HERE, "webinator_bank.json"), "w"), indent=1)

# Hand-labelled truth for the 5 secret companies (my knowledge), used to answer the game honestly.
TRUTH = {
    "Monzo": dict(uk_hq=1, us_hq=0, public=0, consumer=1, software=1, hardware=0, finance=1, food=0, fashion=0, auto_aero=0,
                  energy_pharma=0, pre_1950=0, post_2005=1, over_100k=0, trillion=0, founder_ceo=0, ai=0, europe=0, asia=0, retail_stores=0),
    "Nvidia": dict(uk_hq=0, us_hq=1, public=1, consumer=0, software=0, hardware=1, finance=0, food=0, fashion=0, auto_aero=0,
                   energy_pharma=0, pre_1950=0, post_2005=0, over_100k=0, trillion=1, founder_ceo=1, ai=1, europe=0, asia=0, retail_stores=0),
    "Lego": dict(uk_hq=0, us_hq=0, public=0, consumer=1, software=0, hardware=0, finance=0, food=0, fashion=0, auto_aero=0,
                 energy_pharma=0, pre_1950=1, post_2005=0, over_100k=0, trillion=0, founder_ceo=0, ai=0, europe=1, asia=0, retail_stores=1),
    "Ryanair": dict(uk_hq=0, us_hq=0, public=1, consumer=1, software=0, hardware=0, finance=0, food=0, fashion=0, auto_aero=0,
                    energy_pharma=0, pre_1950=0, post_2005=0, over_100k=0, trillion=0, founder_ceo=0, ai=0, europe=1, asia=0, retail_stores=0),
    "Starbucks": dict(uk_hq=0, us_hq=1, public=1, consumer=1, software=0, hardware=0, finance=0, food=1, fashion=0, auto_aero=0,
                      energy_pharma=0, pre_1950=0, post_2005=0, over_100k=1, trillion=0, founder_ceo=0, ai=0, europe=0, asia=0, retail_stores=1),
}

def play(bank, secret, mode, floor=0.1, eps=0.05):
    w = {c: 1.0 for c in bank}
    asked, trace = [], []
    while len(asked) < len(BANK):
        live = {c: v for c, v in w.items() if v > 0}
        tot = sum(live.values())
        top = max(live, key=live.get)
        if live[top] / tot >= 0.9 or len(live) == 1:
            break
        def split(k):
            y = sum(v * (bank[c][k] if bank[c][k] is not None else 0.5) for c, v in live.items()) / tot
            return abs(y - 0.5)
        k = min((k for k in BANK if k not in asked), key=split)
        asked.append(k)
        ans = TRUTH[secret][k]
        for c in live:
            p = bank[c][k]
            p = 0.5 if p is None else min(max(p, eps), 1 - eps)
            like = p if ans else 1 - p
            if mode == "hard":
                w[c] = w[c] if like >= 0.5 else 0
            else:
                w[c] = w[c] * like
        trace.append(sum(1 for c in w if w[c] > 0 and (mode == "hard" or w[c] / max(w.values()) > floor)))
    live = {c: v for c, v in w.items() if v > 0}
    top = max(live, key=live.get) if live else None
    rank = sorted(w, key=w.get, reverse=True).index(secret) + 1
    return dict(secret=secret, mode=mode, q=len(asked), guess=top, ok=top == secret, secret_alive=w[secret] > 0,
                secret_rank=rank, trace=trace)

def test_sim():
    bank = json.load(open(os.path.join(HERE, "webinator_bank.json")))
    for secret in TRUTH:
        disagree = [k for k in BANK if bank[secret][k] is not None and (bank[secret][k] >= 0.5) != bool(TRUTH[secret][k])]
        print(f"{secret}: decisions-vs-truth disagreements {len(disagree)}/20 {[(k, bank[secret][k]) for k in disagree]}")
        for mode in ("hard", "soft"):
            r = play(bank, secret, mode)
            print(f"   {mode}: q={r['q']} guess={r['guess']} ok={r['ok']} alive={r['secret_alive']} rank={r['secret_rank']} "
                  f"candidates-after-each-q={r['trace']}")

def test_outside():
    print("== outside-pool company, live call (incident.io, 20 q)")
    r = decide({"company": "incident.io"}, qs(list(BANK)))
    print(r.get("error") or f"{r['_ms']}ms cites={len(r['citations'])} " +
          " ".join(f"{k}={a.get('noul', 'R'):.2f}" if a['type'] == 'noul' else f"{k}=R" for k, a in r["answers"].items()))

if __name__ == "__main__":
    for n in sys.argv[1:]:
        globals()[f"test_{n}"]()
