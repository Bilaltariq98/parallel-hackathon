# Parallel API recipes (recon, 11 Nov)

Measured with `01-recon/recon.py`; raw responses in `01-recon/recon_raw.json`. Total recon spend: under $0.10.

## Access

- CLI: `parallel-cli` 0.9.4, logged in. Covers search, extract, research (Task), findall, monitor. **No Decisions command.**
- REST key: read at runtime from `~/.config/parallel-web-tools/auth.json` → `orgs.<id>.api_key`. Send as `x-api-key`. Never print it, never ship it to the browser.
- Docs: append `.md` to any `docs.parallel.ai` URL. Index: `https://docs.parallel.ai/llms.txt`.

## Decisions: `POST https://api.parallel.ai/v1/decisions`

```json
{"state": {"company": "Monzo", "website": "monzo.com"},
 "questions": {"stripe": {"type": "noul", "instructions": "Does Monzo use Stripe as a vendor, subprocessor or infrastructure provider?"}}}
```

Response: `answers.<name>` is `{"type":"noul","noul":0.97}`, or `{"type":"refusal"}` inside a 200. Also `citations[]` (`url`, `title`, `excerpts[]`), `usage`, `decision_id`.

Types: `noul` (probability), `choice` (2 to 255 named options, returns pick plus probabilities), `score` (2 to 10 ordered levels). Up to 100 questions per call. $0.001 per call. Limit 600 calls/min.

### The finding that matters: one call per subject, not one big batch

All questions in a call share **one evidence set of 10 citations**, and citations are not mapped to answers.

| Shape | Result |
|---|---|
| Monzo, 24 vendors in ONE call | 770 ms. Only AWS and Google Cloud above 0.5. Everything else near zero. |
| Monzo, ONE call PER vendor, 24 in parallel | 1.2 s wall clock. 14 vendors above 0.6: Stripe 0.97, PagerDuty 0.98, Segment 0.93, Zendesk 0.86, Slack 0.86, Sentry 0.83, Cloudflare 0.83, Okta 0.82, GitHub 0.81, Intercom 0.78, MongoDB 0.75, Snowflake 0.61. Each call returns 10 citations specific to that edge. |
| "HQ in UK?" for 20 companies in ONE call | Mushy: Monzo 0.78, ARM 0.61, Figma 0.20. |
| Same, one call per company, 20 in parallel | 1.3 s wall clock. Crisp: 1.00 or 0.00 for almost all. |

So: fan out one call per (company, vendor) or per candidate. 24 edges cost $0.024 and still land in about a second. The "100 questions in one call" pitch only works when the questions are about the same thing.

### Other observations

- Latency per call: 580 to 1250 ms. No refusals in about 100 calls.
- Batched calls on other companies (Notion, Tesco, HSBC, incident.io) still found 4 to 6 real vendors each, so banks and retailers are not blank.
- Thin evidence shows as a flat band around 0.15 to 0.45 (Deliveroo batched). Treat below 0.5 as "unknown", draw dashed or hide.
- Some higher probabilities look generous (Monzo → Segment 0.93, MongoDB 0.75). Check that the vendor name appears in the citation excerpts before drawing a solid edge; `mentioning_vendor` in the recon output does this.
- Citations can be off-target in thin cases (first citation for Monzo → Azure was the AWS case study).
- Pairwise company questions work: incident.io ↔ Monzo customer 0.86; Stripe ↔ Deliveroo partners 0.99. But `choice` leans to "customer_vendor" even for unrelated pairs (Parallel ↔ Red Badger 0.85 with customer 0.05), so trust the specific `noul` over the vague `choice`.

## Not yet measured

- Monitor: time to first fire, webhook payload, what counts as a change. (A monitor runs once at creation and bills each execution; cancel is permanent.)
- Task latency per processor for the edge-click evidence panel.
- FindAll speed for seeding a candidate pool.
