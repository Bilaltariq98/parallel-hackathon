// Room Radar v2, big screen. Radar after prototype variant F: guests on the rim, introductions as edges.
// Everything from the server is untrusted: textContent only, URLs shown as text and never linked.
"use strict";
const $ = (s) => document.querySelector(s);
const SVG = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const H = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const CX = 600, CY = 500, RAD = 385, MAX_EDGES = 60, MAX_LABELS = 30;
const DWELL_INTRO = 9000, DWELL_GOAL = 4000;
const HEADLINES = { arrive: "Who is in the room?", wants: "What the room came for", intros: "Who should talk" };

let state = { event: { name: "", brief: "" }, people: [], intros: [], join_url: "", pending: 0, calls: {} };
let mode = "arrive", goals = [], featKey = null, goalOn = null, lastSig = "", known = null, knownIntros = new Set();

// ---------- host key: taken out of the address bar straight away ----------
const params = new URLSearchParams(location.search);
if (params.get("host")) { try { sessionStorage.setItem("rr2.host", params.get("host")); } catch (e) {} history.replaceState(null, "", "/"); }
let hostKey = params.get("host") || "";
try { hostKey = hostKey || sessionStorage.getItem("rr2.host") || ""; } catch (e) {}
const hostPost = (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Host-Key": hostKey },
  body: JSON.stringify(body || {}) });

// ---------- scramble reveal for short status text (design.md section 5) ----------
const GLYPHS = "01<>/\\{}[]|_=+-;:#%*";
function scramble(el, text, ms = 500) {
  cancelAnimationFrame(el._s);
  if (RM()) { el.textContent = text; return; }
  const t0 = performance.now(), n = text.length; let last = 0;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    if (now - last > 40 || k === 1) {
      last = now; const done = Math.floor(k * n); let s = text.slice(0, done);
      for (let i = done; i < n; i++) s += text[i] === " " ? " " : i === done ? "█" : GLYPHS[Math.random() * GLYPHS.length | 0];
      el.textContent = s;
    }
    if (k < 1) el._s = requestAnimationFrame(step);
  };
  el._s = requestAnimationFrame(step);
}

// ---------- radar ----------
const svg = $("#radar"), gEdges = S("g"), gNodes = S("g");
for (const r of [RAD / 3, RAD * 2 / 3, RAD]) svg.append(S("circle", { class: r === RAD ? "guide" : "guide dash", cx: CX, cy: CY, r }));
const sweep = S("g", { class: "sweep" });
sweep.append(
  S("path", { d: `M${CX} ${CY} L${CX} ${CY - RAD} A${RAD} ${RAD} 0 0 0 ${(CX - RAD * Math.sin(.6)).toFixed(1)} ${(CY - RAD * Math.cos(.6)).toFixed(1)} Z`, fill: "var(--accent)", opacity: .07 }),
  S("line", { x1: CX, y1: CY, x2: CX, y2: CY - RAD, stroke: "var(--accent)", "stroke-width": 1.5, opacity: .6 }));
const centre = S("text", { class: "centre", x: CX, y: CY + 12 }), centreTag = S("text", { class: "centre-tag", x: CX, y: CY + 44 });
svg.append(sweep, gEdges, gNodes, centre, centreTag);

const nodes = new Map(), edges = new Map();
let running = false;
function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }
function tick(now) {
  let moving = false;
  for (const n of nodes.values()) {
    const dx = n.tx - n.x, dy = n.ty - n.y;
    if (!RM() && Math.abs(dx) + Math.abs(dy) > .4) { n.x += dx * .16; n.y += dy * .16; moving = true; } else { n.x = n.tx; n.y = n.ty; }
    n.g.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
  }
  for (const e of edges.values()) {
    const t = RM() ? 1 : Math.min(1, (now - e.t0) / 450), k = 1 - Math.pow(1 - t, 3);
    if (t < 1) moving = true;
    e.el.setAttribute("x1", e.a.x); e.el.setAttribute("y1", e.a.y);
    e.el.setAttribute("x2", e.a.x + (e.b.x - e.a.x) * k); e.el.setAttribute("y2", e.a.y + (e.b.y - e.a.y) * k);
  }
  if (moving) requestAnimationFrame(tick); else running = false;
}

function syncRadar() {
  const ids = new Set(state.people.map((p) => p.id));
  for (const [id, n] of nodes) if (!ids.has(id)) { n.g.remove(); nodes.delete(id); }
  state.people.forEach((p, i) => {
    let n = nodes.get(p.id);
    if (!n) {
      n = { x: CX, y: CY, g: S("g"), lbl: S("text", { class: "lbl" }) };
      n.g.append(S("circle", { class: "dot", r: 9 }), n.lbl);
      gNodes.append(n.g); nodes.set(p.id, n);
    }
    const a = i / state.people.length * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    n.tx = CX + c * RAD; n.ty = CY + s * RAD; n.p = p;
    if (p.photo && !n.pic) {
      n.pic = S("image", { class: "pic", href: "/photo/" + encodeURIComponent(p.id), x: -17, y: -17, width: 34, height: 34, preserveAspectRatio: "xMidYMid slice" });
      n.pic.addEventListener("error", () => { n.pic.remove(); n.g.classList.remove("has-pic"); });
      n.g.insertBefore(n.pic, n.lbl);
    }
    const off = p.photo ? 32 : 22;
    n.g.setAttribute("class", "node" + (p.sample ? " sample" : "") + (p.status !== "ready" ? " pending" : "") + (p.photo ? " has-pic" : "") + (n.g.classList.contains("hot") ? " hot" : ""));
    n.lbl.textContent = p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name;
    n.lbl.setAttribute("x", (c * off).toFixed(1)); n.lbl.setAttribute("y", (s * off + 7).toFixed(1));
    n.lbl.setAttribute("text-anchor", c > .25 ? "start" : c < -.25 ? "end" : "middle");
  });
  // ponytail: the rim holds about 30 readable labels; past that only highlighted guests are named. Two rings if rooms get bigger.
  svg.classList.toggle("crowded", state.people.length > MAX_LABELS);

  const top = state.intros.slice(0, MAX_EDGES), keys = new Set(top.map((i) => i.key));
  for (const [k, e] of edges) if (!keys.has(k)) { e.el.remove(); edges.delete(k); }
  for (const it of top) {
    if (edges.has(it.key) || !nodes.has(it.a.id) || !nodes.has(it.b.id)) continue;
    const el = S("line", { class: "e" });
    el.style.setProperty("--o", (.25 + .6 * Math.min(1, (it.score - .6) / .4)).toFixed(2));
    gEdges.append(el);
    edges.set(it.key, { el, a: nodes.get(it.a.id), b: nodes.get(it.b.id), t0: performance.now() });
  }
  centre.textContent = state.people.length || "";
  centreTag.textContent = state.people.length ? "in the room" : "waiting for the first guest";
  kick();
}

function highlight() {
  const hot = new Set(); let hotEdge = null;
  if (mode === "intros" && featKey) { featKey.split("|").forEach((id) => hot.add(id)); hotEdge = featKey; }
  if (mode === "wants" && goalOn) state.people.forEach((p) => { if (p.goals.includes(goalOn)) hot.add(p.id); });
  svg.classList.toggle("focus", hot.size > 0);
  for (const [id, n] of nodes) n.g.classList.toggle("hot", hot.has(id));
  for (const [k, e] of edges) e.el.classList.toggle("hot", k === hotEdge);
}

// ---------- panels ----------
const label = (p) => (p.role ? p.role + " at " + p.company : p.company);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };

function citeEl(c) {
  const d = H("div", "cite");
  d.append(H("div", "host", host(c.url)), H("div", "t", c.title));
  if (c.excerpt) d.append(H("div", "x", c.excerpt));
  return d;
}

function whoEl(p) {
  const d = H("div", "who"), h = H("h2", "", p.name);
  if (p.sample) h.append(" ", H("span", "sample", "Sample"));
  if (p.photo) {
    const i = H("img", "avatar"); i.src = "/photo/" + encodeURIComponent(p.id); i.alt = ""; i.width = i.height = 56;
    i.addEventListener("error", () => i.remove()); d.append(i);
  }
  d.append(h, H("div", "role", label(p)));
  return d;
}

function renderIntros() {
  const list = state.intros, f = $("#feature");
  let i = list.findIndex((x) => x.key === featKey);
  if (i < 0) { i = 0; featKey = list.length ? list[0].key : null; }
  f.textContent = "";
  if (!list.length) {
    f.append(H("p", "lede", state.people.length < 2
      ? "No introductions yet. They appear here once two guests have joined and the web backs up the match."
      : state.pending ? "Comparing guests… introductions appear here as the evidence comes in."
      : "No strong introductions yet. Each one needs a source behind it, so more will appear as guests join."));
    $("#bar").className = "";
    return;
  }
  const it = list[i], pair = H("div", "pair"), cites = H("div", "cites");
  pair.append(whoEl(it.a), H("div", "link", it.tier), whoEl(it.b));
  it.citations.slice(0, 2).forEach((c) => cites.append(citeEl(c)));
  f.append(H("span", "tag", `Suggestion ${i + 1} of ${list.length} · a suggestion, not a verdict`), pair, H("p", "reason", it.reason),
    H("span", "tag", "Grounded in"), cites);
  const bar = $("#bar"); bar.className = ""; void bar.offsetWidth; bar.style.setProperty("--dwell", DWELL_INTRO + "ms"); bar.className = "run";
}

function tallies() {
  return goals.map((g) => ({ ...g, n: state.people.filter((p) => p.goals.includes(g.id)).length })).sort((a, b) => b.n - a.n);
}

function renderWants() {
  const t = tallies(), max = Math.max(1, ...t.map((g) => g.n)), said = state.people.filter((p) => p.goals.length).length;
  const live = t.filter((g) => g.n);
  if (!live.some((g) => g.id === goalOn)) goalOn = live.length ? live[0].id : null;
  $("#wantsLede").textContent = said
    ? `${said} of ${state.people.length} guests said what they came for. Guests with the highlighted aim light up on the radar.`
    : "Nobody has said what they came for yet. Each guest picks up to two aims when they join, and the tally builds here.";
  const bars = $("#bars"); bars.textContent = "";
  for (const g of t) {
    const row = H("div", "bar" + (g.id === goalOn ? " on" : "")), w = Math.round(g.n / max * 16);
    row.append(H("span", "n", g.label), H("span", "b", "█".repeat(w) + "░".repeat(16 - w)), H("span", "c", g.n));
    bars.append(row);
  }
}

function renderStatus() {
  const c = state.calls, st = $("#status"); st.textContent = "";
  const b = (v) => H("b", "", v);
  st.append(H("span", "live"), "opted in ", b(state.people.length), " · introductions ", b(state.intros.length),
    state.pending ? " · comparing " : "", state.pending ? b(state.pending) : "",
    " · Parallel calls: decisions ", b(c.decide || 0), " extract ", b(c.extract || 0), " search ", b(c.search || 0));
}

function feed() {
  const box = $("#feed"), log = (t) => { box.append(H("div", "", "> " + t)); while (box.children.length > 7) box.firstChild.remove(); };
  const first = !primed; known = known || new Set();
  for (const p of state.people) {
    if (p.status === "ready" && !known.has(p.id)) { known.add(p.id); if (!first) log(p.name.toLowerCase() + " joined"); }
  }
  for (const it of state.intros) {
    if (!knownIntros.has(it.key)) { knownIntros.add(it.key); if (!first) log(`${it.a.name} ↔ ${it.b.name} · ${it.tier.toLowerCase()}`); }
  }
}

let primed = false, qrFor = "";
function renderJoin() {
  if (qrFor === state.join_url) return;
  qrFor = state.join_url; $("#joinUrl").textContent = state.join_url.replace(/^https?:\/\//, "");
  try { const q = qrcode(0, "M"); q.addData(state.join_url); q.make(); $("#qr").innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  catch (e) { $("#qr").hidden = true; }  // no CDN on stage: the typed address still works
}

function render() {
  if ($("#title").textContent !== state.event.name) scramble($("#title"), state.event.name);
  $("#brief").textContent = state.event.brief;
  syncRadar(); renderJoin(); renderStatus(); feed();
  const sig = mode + JSON.stringify(mode === "intros" ? [state.intros.map((i) => i.key), state.people.length < 2, !!state.pending]
    : mode === "wants" ? state.people.map((p) => p.goals) : 0);
  if (sig !== lastSig) { lastSig = sig; if (mode === "intros") renderIntros(); if (mode === "wants") renderWants(); }
  highlight();
  $("#seed").disabled = state.people.some((p) => p.sample);
}

function setMode(m) {
  mode = m; lastSig = "";
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === m));
  for (const k of Object.keys(HEADLINES)) $("#v-" + k).hidden = k !== m;
  scramble($("#headline"), HEADLINES[m]);
  render();
}

// one clock for both rotations
setInterval(() => {
  if (mode !== "intros" || state.intros.length < 2) return;
  const i = state.intros.findIndex((x) => x.key === featKey);
  featKey = state.intros[(i + 1) % state.intros.length].key; renderIntros(); highlight();
}, DWELL_INTRO);
setInterval(() => {
  if (mode !== "wants") return;
  const live = tallies().filter((g) => g.n); if (live.length < 2) return;
  goalOn = live[(live.findIndex((g) => g.id === goalOn) + 1) % live.length].id; renderWants(); highlight();
}, DWELL_GOAL);

// ---------- wiring ----------
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
  const m = { 1: "arrive", 2: "wants", 3: "intros" }[e.key]; if (m) setMode(m);
});

const dlg = $("#dlg");
$("#edit").addEventListener("click", () => { $("#evName").value = state.event.name; $("#evBrief").value = state.event.brief; $("#evErr").textContent = ""; dlg.showModal(); });
$("#evCancel").addEventListener("click", () => dlg.close());
$("#eventForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await hostPost("/api/event", { name: $("#evName").value, brief: $("#evBrief").value });
    if (r.ok) dlg.close(); else $("#evErr").textContent = (await r.json()).error || "Could not save the details";
  } catch (err) { $("#evErr").textContent = "Could not reach the server. Check it is still running"; }
});
const hostAction = async (path, failed) => {
  try { const r = await hostPost(path); if (!r.ok && r.status !== 409) alert(failed); } catch (e) { alert(failed + " The server did not answer."); }
};
$("#seed").addEventListener("click", () => hostAction("/api/seed", "Could not add the sample guests."));
$("#wipe").addEventListener("click", () => {
  if (confirm("Clear the room? This deletes every guest and every introduction, and cannot be undone.")) hostAction("/api/wipe", "Could not clear the room.");
});

(async () => {
  try { goals = (await (await fetch("/api/goals")).json()).goals; } catch (e) { console.error("goals failed", e); }
  if (hostKey) {
    try { if ((await fetch("/api/host", { headers: { "X-Host-Key": hostKey } })).ok) { $("#host").hidden = false; $("#privacy").hidden = true; } }
    catch (e) { console.error("host check failed", e); }
  }
  setMode("arrive");
  const es = new EventSource("/events");
  es.addEventListener("state", (ev) => { try { state = JSON.parse(ev.data); render(); primed = true; } catch (e) { console.error("bad state", e); } });
  es.onerror = () => { const st = $("#status"); st.textContent = "Connection lost. Reconnecting…"; };
})();
