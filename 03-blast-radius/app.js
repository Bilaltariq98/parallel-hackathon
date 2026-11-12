"use strict";
/* Blast Radius map. Plain SVG + one rAF loop, no libraries.
   Layout = prototype variant B (radial, sector = vendor category, rings) stretched to many companies:
   companies sit on the rim, vendors sit in category sectors, and a vendor moves towards the centre as more
   companies depend on it. All citation/company text is untrusted: textContent only, never innerHTML. */

const NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);
const el = (n, a = {}, text) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; return e; };
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = k => 1 - Math.pow(1 - k, 3);

const MOTION = { stagger: 20, draw: 450, settle: 0.16, shock: 520 /* px per second */ };
const SHORT = { "Atlassian Statuspage": "Statuspage", "Microsoft Azure": "Azure" };
const GAP = 0.6; // empty slots between category sectors

const svg = el("svg", { role: "group", "aria-label": "Vendor dependency map" });
const gGuide = el("g", { class: "guide" }), gEdges = el("g"), gHits = el("g"), gFx = el("g"), gNodes = el("g"), gCentre = el("g", { class: "centre" });
const tBig = el("text", { class: "big", y: -6 }), tSub = el("text", { class: "sub", y: 38 }), tSub2 = el("text", { class: "sub2", y: 62 });
gCentre.append(tBig, tSub, tSub2);
// incident lines are masked out of a box around the centre counter so they never cross the digits
const mask = el("mask", { id: "keep-centre", maskUnits: "userSpaceOnUse" }), maskAll = el("rect", { fill: "#fff" }), maskHole = el("rect", { fill: "#000", rx: 4 });
mask.append(maskAll, maskHole); svg.append(el("defs"), gGuide, gEdges, gHits, gFx, gCentre, gNodes);
svg.firstChild.append(mask); gFx.setAttribute("mask", "url(#keep-centre)");
$("graph").append(svg);

const S = { companies: [], vendors: [], edges: new Map(), cats: [], checked: 0, total: 0, failed: 0,
  queue: [], hover: null, pin: null, trail: [], inc: null, geo: null, running: false };
const byId = new Map();

/* ---------- layout ---------- */
function layout() {
  const W = svg.clientWidth, H = svg.clientHeight, cx = W / 2, cy = H / 2, R = Math.max(220, Math.min(W, H) / 2 - 72);
  const rMin = R * 0.36, rMax = R * 0.66, N = Math.max(1, S.companies.length);
  S.geo = { cx, cy, R, rMin, rMax };
  S.companies.forEach((c, i) => {
    const a = (-90 + (i + 0.5) * 360 / N) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    c.tx = cx + R * co; c.ty = cy + R * si;
    const side = Math.abs(co) < 0.3;
    c.text.setAttribute("x", side ? 0 : co * 18); c.text.setAttribute("y", side ? si * 26 : si * 18);
    c.text.setAttribute("text-anchor", side ? "middle" : co > 0 ? "start" : "end");
  });
  // hubs are bigger and nearer the centre, so they get a wider angular slot: keeps neighbours from touching
  const wt = v => 1 + 2.4 * v.count / N;
  const shown = S.vendors.filter(v => v.count);
  for (const v of S.vendors) { v.g.classList.toggle("none", !v.count); if (!v.count) { v.tx = cx; v.ty = cy; } }
  svg.classList.toggle("empty", !shown.length);
  const units = shown.reduce((s, v) => s + wt(v), 0) + new Set(shown.map(v => v.category)).size * GAP, step = 360 / Math.max(1, units);
  let u = GAP / 2, prev = null; const sectors = [];
  for (const v of shown) {
    if (v.category !== prev) { if (prev !== null) u += GAP; sectors.push({ cat: v.category, from: u }); prev = v.category; }
    v.deg = -90 + (u + wt(v) / 2) * step; u += wt(v); sectors[sectors.length - 1].to = u;
    const a = v.deg * Math.PI / 180, r = rMax - (v.count / N) * (rMax - rMin);
    v.tx = cx + r * Math.cos(a); v.ty = cy + r * Math.sin(a);
    v.size = 5 + 17 * v.count / N;
    const flip = Math.cos(a) < 0;
    v.core.setAttribute("r", v.size); v.pad.setAttribute("r", Math.max(20, v.size + 6)); v.ring.setAttribute("r", v.size + 5);
    v.halo.setAttribute("r", v.size * 1.6); v.halo.setAttribute("opacity", Math.min(0.3, 0.32 * v.count / N));
    v.text.setAttribute("transform", `rotate(${flip ? v.deg + 180 : v.deg})`);
    v.text.setAttribute("x", flip ? -(v.size + 7) : v.size + 7); v.text.setAttribute("text-anchor", flip ? "end" : "start");
    v.g.classList.toggle("hub", v.count * 2 >= N && v.count > 0);
    v.g.setAttribute("aria-label", `${v.id}, ${v.category}, ${v.count} of ${N} companies depend on it. Enter shows who shares it; Enter again simulates an incident.`);
  }
  // guides: rim, 100% ring, dashed 50% ring, sector dividers, category names
  gGuide.replaceChildren(el("circle", { class: "ring", cx, cy, r: R }), el("circle", { class: "ring", cx, cy, r: rMax }),
    el("circle", { class: "ring", cx, cy, r: rMin }), el("circle", { class: "ring half", cx, cy, r: (rMin + rMax) / 2 }),
    el("text", { class: "ringlabel", x: cx, y: cy - (rMin + rMax) / 2 }, "50%"),
    el("text", { class: "ringlabel", x: cx, y: cy - rMin }, "100%"));
  for (const s of sectors) {
    const a0 = (-90 + (s.from - GAP / 2) * step) * Math.PI / 180, rl = R - 16;
    // keep the name clear of the company squares: if it sits on one, slide it along the rim to the nearest gap
    let mid = -90 + ((s.from + s.to) / 2) * step; const half = (s.cat.length * 11 + 20) / 2 / rl * 180 / Math.PI;
    const rel = (mid + 90) / (360 / N) - 0.5, off = (rel - Math.round(rel)) * (360 / N);   // degrees from nearest company
    if (N > 1 && Math.abs(off) < half) mid += (off >= 0 ? 1 : -1) * (half - Math.abs(off)) * (Math.abs(off) < 0.01 ? 1 : 1);
    const am = mid * Math.PI / 180;
    gGuide.append(el("line", { class: "spoke", x1: cx + rMin * Math.cos(a0), y1: cy + rMin * Math.sin(a0), x2: cx + R * Math.cos(a0), y2: cy + R * Math.sin(a0) }));
    const rot = Math.sin(am) > 0 ? mid - 90 : mid + 90;
    gGuide.append(el("text", { class: "cat", transform: `translate(${cx + rl * Math.cos(am)},${cy + rl * Math.sin(am)}) rotate(${rot})` }, s.cat.toUpperCase()));
  }
  gCentre.setAttribute("transform", `translate(${cx},${cy})`);
  for (const [k, v] of Object.entries({ x: 0, y: 0, width: W, height: H })) maskAll.setAttribute(k, v);
  for (const [k, v] of Object.entries({ x: cx - 170, y: cy - 70, width: 340, height: 150 })) maskHole.setAttribute(k, v);
  wake();
}

/* ---------- nodes and edges ---------- */
function addNode(type, id, category) {
  if (byId.has(type + ":" + id)) return byId.get(type + ":" + id);
  const g = el("g", { class: "node " + type, tabindex: 0, role: "button" });
  const n = { type, id, category, g, count: 0, edges: [], x: svg.clientWidth / 2, y: svg.clientHeight / 2, tx: 0, ty: 0 };
  if (type === "vendor") {
    n.halo = el("circle", { class: "halo" }); n.core = el("circle", { class: "core" }); n.ring = el("circle", { class: "focus" });
    n.pad = el("circle", { class: "pad" }); n.text = el("text", {}, SHORT[id] || id); g.append(n.halo, n.pad, n.ring, n.core, n.text);
  } else {
    n.pad = el("rect", { class: "pad", x: -20, y: -20, width: 40, height: 40 }); n.core = el("rect", { class: "core", x: -6, y: -6, width: 12, height: 12 }); n.ring = el("rect", { class: "focus", x: -11, y: -11, width: 22, height: 22 });
    n.text = el("text", {}, id); g.append(n.pad, n.ring, n.core, n.text);
    g.setAttribute("aria-label", `${id}, company. Enter lists its vendors.`);
  }
  g.addEventListener("mouseenter", () => setHover(n)); g.addEventListener("mouseleave", () => setHover(null));
  g.addEventListener("focus", () => setHover(n)); g.addEventListener("blur", () => setHover(null));
  g.addEventListener("click", ev => { ev.stopPropagation(); activate(n); });
  g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(n); } });
  gNodes.append(g); byId.set(type + ":" + id, n);
  (type === "vendor" ? S.vendors : S.companies).push(n);
  return n;
}

function addEdge(d) {
  const key = d.company + "|" + d.vendor;
  if (S.edges.has(key)) return;
  const c = addNode("company", d.company), v = addNode("vendor", d.vendor, d.category);
  const line = el("line", { class: "edge " + d.style }), hit = el("line", { class: "hit", "pointer-events": "stroke" });
  const e = { key, c, v, d, line, hit, t0: performance.now() };
  hit.addEventListener("mouseenter", ev => setHover(e, ev)); hit.addEventListener("mouseleave", () => setHover(null));
  gEdges.append(line); gHits.append(hit); S.edges.set(key, e); c.edges.push(e); v.edges.push(e);
  v.count = v.edges.length; c.count = c.edges.length;
  layout(); readout(); applyLit(); renderDrill();
}

function frame(now) {
  let busy = false;
  for (const n of [...S.companies, ...S.vendors]) {
    const dx = n.tx - n.x, dy = n.ty - n.y;
    if (!reduced() && Math.abs(dx) + Math.abs(dy) > 0.4) { n.x += dx * MOTION.settle; n.y += dy * MOTION.settle; busy = true; } else { n.x = n.tx; n.y = n.ty; }
    n.g.setAttribute("transform", `translate(${n.x},${n.y})`);
  }
  for (const e of S.edges.values()) {   // draws from the company on the rim inwards to the vendor
    const k = reduced() ? 1 : Math.max(0, Math.min(1, (now - e.t0) / MOTION.draw)), q = easeOut(k);
    if (k < 1) busy = true;
    const x2 = e.c.x + (e.v.x - e.c.x) * q, y2 = e.c.y + (e.v.y - e.c.y) * q;
    for (const l of [e.line, e.hit]) { l.setAttribute("x1", e.c.x); l.setAttribute("y1", e.c.y); l.setAttribute("x2", x2); l.setAttribute("y2", y2); }
  }
  if (S.inc && stepIncident(now)) busy = true;
  if (busy) requestAnimationFrame(frame); else S.running = false;
}
function wake() { if (!S.running) { S.running = true; requestAnimationFrame(frame); } }

/* ---------- hover / pin ---------- */
function applyLit() {
  const f = S.pin || S.hover;
  svg.classList.toggle("dim", !!f && !S.inc);
  const lit = new Set();
  if (f) { if (f.key) { lit.add(f).add(f.c).add(f.v); } else { lit.add(f); for (const e of f.edges) lit.add(e).add(e.c).add(e.v); } }
  for (const n of [...S.companies, ...S.vendors]) { n.g.classList.toggle("lit", lit.has(n)); n.g.classList.toggle("pin", n === S.pin); }
  for (const e of S.edges.values()) e.line.classList.toggle("lit", lit.has(e));
}
function setHover(x, ev) { S.hover = x; applyLit(); x ? showCard(x, ev) : ($("card").hidden = true); }

const pct = p => "p = " + p.toFixed(2);
function cite(card, d) {   // top citation that names the vendor; text only, URL shown but never linked
  const c = d.citations[0];
  if (!c) { card.append(mk("div", "m", "no citation excerpt names this vendor")); return; }
  card.append(mk("div", "q", "“" + String(c.excerpts[0] || "").slice(0, 260) + "”"), mk("div", "u", (c.title ? c.title.slice(0, 80) + " · " : "") + c.url.slice(0, 120)));
}
function showCard(x, ev) {
  const card = $("card"), N = S.companies.length; card.replaceChildren();
  if (x.key) {
    card.append(mk("div", "t", `${x.c.id} → ${x.v.id}`), mk("div", "p", pct(x.d.p)),
      mk("div", "m", `${x.d.style === "solid" ? "confirmed" : "unconfirmed"} · ${x.d.mentions} citation(s) name the vendor`));
    cite(card, x.d);
  } else {
    const es = [...x.edges].sort((a, b) => b.d.p - a.d.p), solid = es.filter(e => e.d.style === "solid").length, top = es[0];
    card.append(mk("div", "t", x.id));
    if (x.type === "vendor") card.append(mk("div", "p", `${es.length} of ${N}`), mk("div", "m", `${x.category} · ${solid} confirmed · ${es.length - solid} possible`));
    else card.append(mk("div", "p", `${es.length} vendors`), mk("div", "m", `${solid} confirmed · ${es.length - solid} possible`));
    if (top) { card.append(mk("div", "m", `strongest: ${x.type === "vendor" ? top.c.id : top.v.id} · ${pct(top.d.p)}`)); cite(card, top.d); }
    else card.append(mk("div", "m", "no dependency found at p ≥ 0.5"));
  }
  card.hidden = false;   // docked top-left by CSS so it never covers the map
}

/* ---------- incident (simulated, client-side only) ---------- */
function activate(n) {
  if (S.inc && S.inc.v === n) return endIncident();
  if (S.pin !== n) return focusNode(n);
  if (n.type === "vendor" && n.edges.length) startIncident(n); else clearFocus();   // second click
}

/* ---------- drill: company -> a vendor it uses -> the companies sharing it -> ... ---------- */
const linked = (a, b) => a.edges.some(e => e.c === b || e.v === b);
function focusNode(n) {
  endIncident();
  const i = S.trail.indexOf(n), last = S.trail[S.trail.length - 1];
  S.trail = i >= 0 ? S.trail.slice(0, i + 1) : last && linked(last, n) ? [...S.trail, n] : [n];
  S.pin = n; applyLit(); renderDrill();
}
function clearFocus() { S.pin = null; S.trail = []; applyLit(); renderDrill(); $("card").hidden = true; }
function renderDrill() {
  const p = $("drill"), n = S.pin;
  if (!n) { p.hidden = true; return; }
  const isV = n.type === "vendor", N = S.companies.length, crumbs = mk("div", "crumbs");
  S.trail.forEach((x, i) => {
    if (i) crumbs.append(mk("span", "arrow", "→"));
    const b = mk("button", x === n ? "cur" : "", SHORT[x.id] || x.id); b.type = "button"; b.addEventListener("click", () => focusNode(x)); crumbs.append(b);
  });
  // a company's vendors: most shared first, since those are the ones worth walking to
  const es = [...n.edges].sort((x, y) => isV ? y.d.p - x.d.p : (y.v.count - x.v.count) || y.d.p - x.d.p);
  const list = mk("div", "rows");
  for (const e of es) {
    const to = isV ? e.c : e.v, others = e.v.count - 1, row = mk("button", "row " + e.d.style); row.type = "button";
    row.append(mk("span", "n", SHORT[to.id] || to.id),
      mk("span", "s", isV ? pct(e.d.p) : others ? `shared with ${others} other${others > 1 ? "s" : ""}` : "only this company"));
    row.addEventListener("click", () => focusNode(to));
    for (const [on, off] of [["mouseenter", "mouseleave"], ["focus", "blur"]]) { row.addEventListener(on, () => setHover(e)); row.addEventListener(off, () => setHover(null)); }
    list.append(row);
  }
  p.replaceChildren(crumbs, mk("div", "h", isV ? `${es.length} of ${N} companies depend on ${n.id}` : `${n.id} depends on ${es.length} vendor${es.length === 1 ? "" : "s"}`),
    mk("div", "m", !es.length ? "nothing found at p ≥ 0.5" : isV ? "pick a company to see what else it depends on" : "pick a vendor to see who else depends on it"));
  if (isV && es.length) { const b = mk("button", "sim", `Simulate ${SHORT[n.id] || n.id} outage`); b.type = "button"; b.addEventListener("click", () => startIncident(n)); p.append(b); }
  p.append(list); p.hidden = false;
}
function startIncident(v) {
  endIncident();
  const items = v.edges.map(e => ({ e, line: el("line", { class: "shock " + e.d.style }), hit: false }));
  const wave = el("circle", { class: "wave" });
  gFx.append(wave, ...items.map(i => i.line));
  S.inc = { v, items, wave, t0: performance.now(), n: 0 };
  v.g.classList.add("src"); svg.classList.add("incident"); gCentre.classList.add("inc");
  $("sim-label").hidden = false; $("clear").hidden = false;
  applyLit(); readout(); wake();
}
function stepIncident(now) {
  const { v, items, wave, t0 } = S.inc, rad = reduced() ? Infinity : (now - t0) / 1000 * MOTION.shock; let far = 0;
  for (const i of items) {
    const dx = i.e.c.x - v.x, dy = i.e.c.y - v.y, len = Math.hypot(dx, dy) || 1, k = Math.min(1, rad / len); far = Math.max(far, len);
    i.line.setAttribute("x1", v.x); i.line.setAttribute("y1", v.y); i.line.setAttribute("x2", v.x + dx * k); i.line.setAttribute("y2", v.y + dy * k);
    if (k >= 1 && !i.hit) { i.hit = true; i.e.c.g.classList.add("down"); S.inc.n++; readout(); }
  }
  const live = rad < far;
  wave.setAttribute("cx", v.x); wave.setAttribute("cy", v.y); wave.setAttribute("r", live ? rad : 0); wave.setAttribute("opacity", live ? 1 - rad / far : 0);
  return live;
}
function endIncident() {
  if (!S.inc) return;
  S.inc.v.g.classList.remove("src"); for (const i of S.inc.items) i.e.c.g.classList.remove("down");
  gFx.replaceChildren(); S.inc = null; svg.classList.remove("incident"); gCentre.classList.remove("inc");
  $("sim-label").hidden = true; $("clear").hidden = true; applyLit(); readout();
}

function readout() {
  const N = S.companies.length;
  if (S.inc) {
    const solid = S.inc.items.filter(i => i.hit && i.e.d.style === "solid").length;
    tBig.textContent = `${S.inc.n} OF ${N}`; tSub.textContent = `AFFECTED · ${(SHORT[S.inc.v.id] || S.inc.v.id).toUpperCase()} DOWN`;
    tSub2.textContent = `${solid} CONFIRMED · ${S.inc.n - solid} POSSIBLE`;
  } else {
    const used = S.vendors.filter(v => v.count).length;
    if (!N) { tBig.textContent = ""; tSub.textContent = "TYPE A COMPANY TO START"; tSub2.textContent = "ITS VENDORS APPEAR HERE, EACH WITH A SOURCE"; }
    else { tBig.textContent = String(S.edges.size); tSub.textContent = "DEPENDENCIES"; tSub2.textContent = used ? `${N} ${N === 1 ? "COMPANY" : "COMPANIES"} · ${used} VENDORS` : "CHECKING THE WEB…"; }
  }
  $("status").textContent = `${S.checked}/${S.total} pairs checked · ${S.edges.size} edges` + (S.failed ? ` · ${S.failed} failed` : "");
}

/* ---------- streams ---------- */
setInterval(() => {   // staggered reveal, also when the server answers from cache in one burst
  if (!S.queue.length) return;
  for (const d of reduced() ? S.queue.splice(0) : [S.queue.shift()]) addEdge(d);
}, MOTION.stagger);

// durable views: / starts empty, /?n=5 shows the first 5 base companies, /?n=12 shows all. Bookmark either.
const viewN = s => { const n = parseInt(s, 10); return Number.isInteger(n) ? Math.min(12, Math.max(0, n)) : 0; };
const VIEW_N = viewN(new URLSearchParams(location.search).get("n"));
function stream(url, company) {
  let keep = null;
  const es = new EventSource(url);
  es.addEventListener("meta", ev => {
    const m = JSON.parse(ev.data);
    S.cats = [...new Set(m.vendors.map(v => v.category))];
    for (const v of m.vendors) addNode("vendor", v.vendor, v.category);
    const cos = m.companies ? m.companies.slice(0, VIEW_N) : [m.company];
    if (m.companies) keep = new Set(cos);
    for (const c of cos) addNode("company", c);
    if (m.company) company = m.company;
    S.total += m.vendors.length * cos.length;
    layout(); readout();
  });
  es.addEventListener("edge", ev => {
    const d = JSON.parse(ev.data);
    if (keep && d.company && !keep.has(d.company)) return;   // outside this view
    S.checked++;
    if (d.style !== "hidden") S.queue.push({ ...d, company: d.company || company }); else readout();
  });
  es.addEventListener("vendor_error", ev => { if (ev.data) { S.checked++; S.failed++; readout(); } });
  es.addEventListener("done", () => { es.close(); readout(); });
  es.onerror = () => { es.close(); if (company) saveAdded(list => list.filter(a => a.name !== company)); $("status").textContent = "could not add: checking why…";
    // EventSource hides the reason, so ask once more with fetch to tell bad input from a dead server
    fetch(url).then(r => r.ok ? "stream dropped, try again" : r.json().then(j => j.error || "rejected"), () => "server not reachable on this port")
      .then(why => { $("status").textContent = "could not add: " + why; }); };
}

/* typed companies survive reload: names only, re-requested on load (the server caches answers) */
const KEY = "blast-radius.added";
function loadAdded() {
  try { const l = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(l) ? l.filter(a => a && typeof a.name === "string").slice(0, 12) : []; } catch (e) { return []; }
}
function saveAdded(fn) { try { localStorage.setItem(KEY, JSON.stringify(fn(loadAdded()))); } catch (e) { /* storage off: skip */ } }
function addCompany(name, website) { stream("/api/blast?" + new URLSearchParams({ company: name, website }), name); }

// one box: a name ("Monzo") or a website ("https://www.red-badger.com/work" -> Red Badger + red-badger.com)
function parseEntry(raw) {
  const s = raw.trim();
  const m = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#].*)?$/i.exec(s);
  if (!m) return { name: s, website: "" };
  const website = m[1].toLowerCase();
  // brand-style domains (incident.io, parallel.ai) are the company's name; plain ones become "Red Badger"
  const name = /\.(com|net|org|co\.uk|uk)$/.test(website)
    ? website.split(".")[0].split("-").filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : website;
  return { name, website };
}
console.assert(parseEntry("https://www.red-badger.com/work").name === "Red Badger" && parseEntry("Monzo").website === "" && parseEntry("incident.io").name === "incident.io");
$("add").addEventListener("submit", ev => {
  ev.preventDefault();
  const { name, website } = parseEntry($("company").value);
  if (!name) return;
  const have = S.companies.find(c => c.id.toLowerCase() === name.toLowerCase());
  if (have) { focusNode(have); have.g.focus(); }
  else {
    saveAdded(list => [...list.filter(a => a.name.toLowerCase() !== name.toLowerCase()), { name, website }]);
    addCompany(name, website);
  }
  $("company").value = "";
});
$("add").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); $("add").requestSubmit(); } });
$("clear").addEventListener("click", endIncident);
$("reset").addEventListener("click", () => { saveAdded(() => []); location.reload(); });
for (const l of document.querySelectorAll("#views a")) if (viewN(new URL(l.href).searchParams.get("n")) === VIEW_N) l.setAttribute("aria-current", "page");
svg.addEventListener("click", clearFocus);
addEventListener("keydown", ev => { if (ev.key === "Escape") { if (S.inc) endIncident(); else clearFocus(); } });
addEventListener("resize", layout);

async function pollMonitor() {
  const box = $("mon-out");
  try {
    const m = await (await fetch("/api/monitor")).json(); box.replaceChildren();
    if (!m.ok) return box.append(mk("div", "ev", "unavailable"));
    if (!m.events.length) return box.append(mk("div", "ev", "no events yet"));
    for (const e of m.events.slice(0, 3)) {
      const why = e?.output?.basis?.[0]?.reasoning || e?.output?.content || "";
      const row = mk("div", "ev"); row.append(mk("span", "d", String(e.event_date || "").slice(0, 10) + " "), String(why).slice(0, 180)); box.append(row);
    }
  } catch (err) { box.textContent = "poll failed"; }
}

stream("/api/map");
for (const a of loadAdded()) addCompany(a.name, typeof a.website === "string" ? a.website : "");
pollMonitor(); setInterval(pollMonitor, 30000);
