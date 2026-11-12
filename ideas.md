# Agentic Web build night: idea scorecard

*Parallel x No Agenda, thanks to Incident. Solo build, ~100 real minutes, fresh code on the night.*

## The story to beat

> "At 19 I made 20,000 invisible batch jobs legible. Tonight I pointed that at the internet."

Your recurring move is to find the system nobody can see, then make it visible. The strongest idea is the one that lets you tell that story in one sentence and prove it in one screen.

## The Parallel toolbox

| API | Push or pull | Speed | What it's good for tonight |
|---|---|---|---|
| **Decisions** (new) | Pull | Under 1s, up to 100 questions per call | Yes/no and multiple-choice answers from the live web, with a probability and citations. The answer to "Task is too slow for a live demo." |
| Search / Extract | Pull | Fast | First-pass evidence, clean page content |
| Task | Pull | Seconds to minutes | Deep research into a JSON schema you define, with citations |
| FindAll | Pull | Async | Build a list of entities from a natural-language query |
| Monitor | **Push** | Scheduled | Watches for changes and fires webhooks |

**Opinion:** Decisions is the hidden unlock. It's newly launched, Parallel's own team will be in the room, and sub-second answers mean the graph or game can update *live during your demo* instead of behind a spinner. Using it well is the most direct path to "best use of Parallel."

## The scoring model

Each idea is scored 1 to 5 per criterion, weighted, then scaled to 100.

| Criterion | Weight | 1 means | 5 means |
|---|---|---|---|
| Story fit | 20% | Anyone could pitch it | Only you could tell it |
| Wow | 20% | Polite clap | Audible gasp or laugh |
| Parallel depth | 20% | One search call | Push and pull, citations on screen, Decisions used well |
| Solo feasibility | 15% | Needs a team or luck | Comfortable in 100 minutes, with polish |
| Novelty in the room | 15% | Several people will build it | Nobody else will |
| Afterlife | 10% | Dies at 22:00 | Feeds MAKE ME MONEY, portfolio or LinkedIn |

## Leaderboard

| # | Idea | Score | Story | Wow | Parallel | Solo | Novel | After | My call |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Blast Radius** | **90** | 5 | 5 | 5 | 4 | 4 | 3 | **Build this** |
| 2 | Webinator | 70 | 2 | 5 | 4 | 3 | 5 | 1 | Best backup |
| 3 | Room Radar | 66 | 3 | 5 | 3 | 3 | 3 | 2 | Side project, share before the night |
| 4 | Prior Art | 65 | 2 | 4 | 4 | 4 | 3 | 2 | Cut |
| 5 | Day One | 63 | 4 | 2 | 4 | 4 | 1 | 4 | Cut (crowded) |
| 6 | Opportunity Radar | 62 | 3 | 2 | 5 | 3 | 1 | 5 | Save for MAKE ME MONEY |
| 7 | Schema → Screen | 60 | 5 | 3 | 3 | 2 | 2 | 2 | Cut |

---

## 1. Blast Radius: 90

**Pitch:** Type in a company and watch its dependency graph grow live: cloud, payments, auth, CDN, email. Each edge has a probability and a citation. When an upstream vendor wobbles, everything downstream lights up.

**How Parallel fits:**
- **Decisions** fans out about 40 yes/no questions in one call ("Does X use AWS? Stripe? Cloudflare? Auth0? Twilio?…"). The probability sets edge thickness, so the graph grows in under a second.
- **Task** runs only when you click an edge, pulling deep evidence from subprocessor lists and engineering blogs into a schema.
- **Monitor** watches the upstream vendors and pushes incidents so the affected nodes turn red. That covers push and pull in one product.

**Thoughts:** Your career thesis, applied to the web. Decisions fixes the biggest risk from earlier, which was Task latency killing the live demo. The sponsor (Incident) understands it instantly. The chokepoint reveal ("12 of 15 UK companies share one vendor") is a strong closing image.

**Risks:** Decisions answers can be confidently wrong when evidence is thin, so show low-probability edges as dashed and never present them as fact. Recon how well it does on non-SaaS companies such as banks and retailers.

**Opinion:** This is the one. High score across the board, and nobody else in the room can tell your story with it.

## 2. Webinator: 70 (new, Decisions-native)

**Pitch:** Akinator for companies. The audience thinks of a company, and the agent asks *them* yes/no questions. After each answer it tests 100 candidate companies against the web in a single Decisions call and shows the candidate list collapsing live.

**How Parallel fits:** FindAll seeds the candidate pool, and Decisions does the batch elimination at sub-second speed. That shows off exactly what's new about the API.

**Thoughts:** Highest novelty on the board, very interactive, and genuinely funny. It doesn't fit your story, though, and it has no afterlife. If the audience picks something obscure, the demo can stall.

**Opinion:** Your backup if Blast Radius recon shows thin dependency evidence. It's a crowd-pleaser, not a career move.

## 3. Room Radar: 66

**Pitch:** Attendees opt in with their LinkedIn or company, and you get a live map of who's in the room and who should talk to whom.

**Thoughts:** It's the biggest crowd moment, but it's a trick rather than a product. It needs the organisers' blessing, strict opt-in, and deleting the data afterwards. It works better as matchmaking than as profiling people.

**Opinion:** Build it before the night as a side project and share it, not as your entry. Its "where do you work?" answers can feed Blast Radius's room reveal ("Here's what takes most of you down at once").

## 4. Prior Art: 65

**Pitch:** Paste an idea and get a novelty score with receipts showing who's already built it.

**Thoughts:** Decisions makes the "has this been built?" check fast. It's funny and meta, but if you run it on other people's demos, it risks punching at people rather than ideas, and it has little link to your story. The push side is weak.

**Opinion:** Cut. It's a good tweet, not a good demo.

## 5. Day One: 63

**Pitch:** A client briefing before your first meeting: their stack, org shape, incidents and regulation, kept fresh by Monitor.

**Thoughts:** It's your consulting superpower, and Decisions makes a 30-question checklist instant. But "researches companies" is the brief's first example, so expect several of these in the room.

**Opinion:** Cut as an entry. If you have time left over, add it as the click-through panel inside Blast Radius.

## 6. Opportunity Radar: 62

**Pitch:** Use FindAll to find SMBs with a detectable pain, qualify them with Decisions, enrich them with Task, and have Monitor push new matches.

**Thoughts:** The deepest Parallel combo, and directly reusable as your MAKE ME MONEY lead engine. However, lead qualification is the exact example Parallel launched Decisions with, so it won't feel new to them. It's also low on "gasp" for an audience of builders.

**Opinion:** Don't demo it. Build it in November when it can earn money.

## 7. Schema → Screen: 60

**Pitch:** The agent writes the output schema for your question, Task fills it, and your renderer generates the UI to fit.

**Thoughts:** It's the most "you" technically (your rendering engine reborn), but generative UI is a crowded meme and the wow depends on polish you can't get solo in 100 minutes.

**Opinion:** Cut. Write a blog post about it instead.

---

## Recon before the night (no build code)

1. **Decisions on dependencies:** for 15 mixed companies (SaaS, bank, retailer, startup), ask about 40 vendor questions each. Record the hit rate, how calibrated the probabilities are, how many refusals you get, and the latency.
2. **Task depth:** for a few edges, check whether Task finds a real citation such as a subprocessor list or an engineering blog. Note how long it takes at each processor tier.
3. **Monitor:** how soon does a new monitor fire? What does the webhook payload look like? What counts as a "material change"?
4. **Webinator sanity check:** does one Decisions call over 100 candidates eliminate reliably? (This is your backup plan.)
5. Write each experiment up as a recipe: request, response shape, timing, gotchas.

## The night (Blast Radius)

| Time | Do |
|---|---|
| 18:15 | Scaffold one screen: graph, side panel, counter |
| 18:30 | Decisions fan-out → live graph |
| 19:15 | Click an edge → Task evidence in the panel |
| 19:30 | Batch 15 companies (or the room's companies) and start the monitors |
| 19:45 | Chokepoint view |
| 20:00 | Polish and a demo dry run |
| 20:15 | Code freeze |

## Demo script (2–3 min)

1. The story line (10s).
2. An audience member shouts a company, and the graph grows live (45s).
3. Click an edge to show the citation (20s).
4. The chokepoint reveal across 15 companies (30s).
5. Monitor: what it caught tonight, honestly reported, even if it's nothing (20s).
6. "Making invisible infrastructure legible: that's been my job for ten years. Parallel just made the web one of those systems." (10s)
