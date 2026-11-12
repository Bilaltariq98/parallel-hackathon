"""Shared Parallel Decisions client: key loading, in-flight cap, retry, disk cache. Stdlib only.

Usage (from a sibling folder):
    import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "shared"))
    from parallel import decide
    r = decide({"company": "Monzo", "website": "monzo.com"},
               {"stripe": {"type": "noul", "instructions": "Does Monzo use Stripe as a vendor?"}})
    r["answers"]["stripe"]  # {"type": "noul", "noul": 0.97} or {"type": "refusal"}
    r["citations"]          # [{"url", "title", "excerpts": [...]}], shared by the whole call

One call per subject (company, or company+vendor pair): questions in a call share one evidence set.
"""
import hashlib, json, os, pathlib, random, threading, time, urllib.error, urllib.request

URL = "https://api.parallel.ai/v1/decisions"
CACHE_DIR = pathlib.Path(__file__).resolve().parent / ".cache"
# ponytail: per-process cap; three apps running at once share one 600/min key, so keep this low.
_inflight = threading.Semaphore(int(os.environ.get("PARALLEL_MAX_INFLIGHT", "8")))
_key = None


def _api_key():
    global _key
    if _key is None:
        _key = os.environ.get("PARALLEL_API_KEY")
        if not _key:
            auth = json.load(open(os.path.expanduser("~/.config/parallel-web-tools/auth.json")))
            _key = auth["orgs"][auth["selected_org_id"]]["api_key"]
    return _key


def decide(state, questions, cache=True, retries=4, timeout=30):
    """POST /v1/decisions. Returns the response dict plus `_ms` and `_cached`. Raises RuntimeError on failure."""
    body = json.dumps({"state": state, "questions": questions}, sort_keys=True).encode()
    path = CACHE_DIR / (hashlib.sha256(body).hexdigest()[:24] + ".json")
    if cache and path.exists():
        return {**json.loads(path.read_text()), "_cached": True}
    last = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(URL, body, {"x-api-key": _api_key(), "Content-Type": "application/json",
                                                 "User-Agent": "hackathon-client"})
        started = time.time()
        try:
            with _inflight:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    result = json.load(resp)
            result["_ms"] = int((time.time() - started) * 1000)
            if cache:
                CACHE_DIR.mkdir(exist_ok=True)
                path.write_text(json.dumps(result))
            return {**result, "_cached": False}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}"
            if e.code not in (408, 429) and e.code < 500:
                break  # 4xx other than rate limit: retrying will not help
        except (urllib.error.URLError, TimeoutError) as e:
            last = f"network: {e}"
        time.sleep(min(8, 0.5 * 2 ** attempt) + random.random() * 0.3)
    raise RuntimeError(f"Decisions call failed: {last}")


if __name__ == "__main__":
    r = decide({"company": "Monzo", "website": "monzo.com"},
               {"aws": {"type": "noul", "instructions": "Does Monzo use AWS as an infrastructure provider?"}})
    a = r["answers"]["aws"]
    assert a["type"] in ("noul", "refusal"), a
    assert decide({"company": "Monzo", "website": "monzo.com"},
                  {"aws": {"type": "noul", "instructions": "Does Monzo use AWS as an infrastructure provider?"}})["_cached"]
    print("ok", a, f"{r['_ms']}ms", len(r["citations"]), "citations")
