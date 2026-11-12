// Room Radar v2, guest phone. Three questioning rounds and consent, then a shortlist that refills as people are met.
// Everything from the server is untrusted: textContent only, URLs shown as text and never linked.
"use strict";
const $ = (s) => document.querySelector(s);
const H = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const KEY = "rr2.key", POLL_MS = 2500;
const LI_RE = /^(https:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9%_-]{3,100}\/?([?#].*)?$/;

const store = {
  get() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } },
  set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} },
};
let key = store.get(), step = 0, maxGoals = 2, lastView = "", timer = null;
const rounds = [...document.querySelectorAll(".round")];
const val = (id) => $("#" + id).value.trim();

// ---------- rounds ----------
function showStep(i, focus) {
  step = i;
  rounds.forEach((r, k) => { r.hidden = k !== i; });
  const last = i === rounds.length - 1;
  $("#roundTag").textContent = last ? "Last step" : `Round ${i + 1} of ${rounds.length - 1}`;
  [...$("#meter").children].forEach((m, k) => m.classList.toggle("on", k <= i));
  $("#question").textContent = rounds[i].dataset.q;
  $("#back").hidden = i === 0;
  $("#next").textContent = last ? "Join the room" : "Continue";
  $("#err").textContent = "";
  if (focus) { $("#question").focus(); scrollTo(0, 0); }
}

function stepError() {
  if (step === 0) {
    const li = val("linkedin");
    if (li && !LI_RE.test(li)) return ["linkedin", "That is not a LinkedIn profile address. It should look like linkedin.com/in/your-name"];
    if (!li && !(val("name") && val("company"))) return [val("name") ? "company" : "name", "Add your LinkedIn address, or your name and company"];
  }
  if (step === 1 && !val("wants") && !document.querySelector("#goals input:checked")) return ["wants", "Write a line, or pick an aim, so we know who to find for you"];
  if (step === 3 && !$("#consent").checked) return ["consent", "Tick the box to join"];
  return null;
}

async function submit() {
  const btn = $("#next"); btn.disabled = true; btn.textContent = "Joining…";
  const body = { linkedin: val("linkedin"), name: val("name"), role: val("role"), company: val("company"), wants: val("wants"), gives: val("gives"),
    goals: [...document.querySelectorAll("#goals input:checked")].map((c) => c.value), consent: $("#consent").checked,
    photo: $("#photo").checked && !!val("linkedin"), match: $("#match").checked };
  try {
    const r = await fetch("/api/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Could not join. Try again");
    key = j.key; store.set(key); start();
  } catch (e) {
    $("#err").textContent = e instanceof TypeError ? "No connection to the room. Check you are on the venue wifi and try again" : e.message;
  } finally { btn.disabled = false; btn.textContent = "Join the room"; }
}

$("#wizard").addEventListener("submit", (e) => {
  e.preventDefault();
  const bad = stepError();
  if (bad) { $("#err").textContent = bad[1]; const f = $("#" + bad[0]); f.setAttribute("aria-invalid", "true"); f.focus(); return; }
  if (step < rounds.length - 1) showStep(step + 1, true); else submit();
});
$("#wizard").addEventListener("input", (e) => { e.target.removeAttribute("aria-invalid"); $("#err").textContent = ""; });
$("#back").addEventListener("click", () => showStep(step - 1, true));
$("#goals").addEventListener("change", () => {
  const full = document.querySelectorAll("#goals input:checked").length >= maxGoals;
  document.querySelectorAll("#goals input").forEach((c) => { c.disabled = full && !c.checked; });
});

// ---------- my page ----------
const label = (p) => (p.role ? p.role + " at " + p.company : p.company);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const first = (p) => p.name.split(" ")[0];

async function post(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...body }) });
    if (!r.ok) throw new Error(String(r.status));
    return true;
  } catch (e) { alert("That did not go through. Check your connection and try again."); return false; }
}

function avatar(p) {
  if (!p.photo) return "";
  const i = H("img", "avatar"); i.src = "/photo/" + encodeURIComponent(p.id); i.alt = ""; i.width = i.height = 56;
  i.addEventListener("error", () => i.remove());
  return i;
}

function nameEl(tag, p) {
  const h = H(tag, "", p.name);
  if (p.sample) h.append(" ", H("span", "sample", "Sample"));
  return h;
}

// Source addresses come from the web, so only plain http(s) ones become links; anything else stays text.
function srcLink(url) {
  let ok = false;
  try { ok = /^https?:$/.test(new URL(url).protocol); } catch (e) {}
  if (!ok) return H("div", "u", url);
  const a = H("a", "u", url); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
  return a;
}

function matchEl(m, i) {
  const d = H("article", "match"), head = H("div", "head"), acts = H("div", "acts");
  d.style.setProperty("--i", i);
  head.append(H("span", "tag accent", `${String(i + 1).padStart(2, "0")} · ${m.tier}`));
  if (m.goal_hit) head.append(H("span", "tag", "Fits your aim"));
  const open = H("div", "open"); open.append(H("span", "tag", "Open with"), m.opener);
  const det = H("details"), cites = H("div", "cites");
  det.append(H("summary", "", `Why we think so · ${m.citations.length} source${m.citations.length === 1 ? "" : "s"}`), cites);
  for (const c of m.citations) {
    const ce = H("div", "cite");
    ce.append(H("div", "host", host(c.url)), H("div", "t", c.title));
    if (c.excerpt) ce.append(H("div", "x", c.excerpt));
    ce.append(srcLink(c.url));
    cites.append(ce);
  }
  const met = H("button", i === 0 ? "btn primary" : "btn", "We have met"), skip = H("button", "btn quiet", "Not for me");
  met.type = skip.type = "button";
  met.addEventListener("click", async () => { if (await post("/api/mark", { other: m.other.id, as: "met" })) poll(); });
  skip.addEventListener("click", async () => { if (await post("/api/mark", { other: m.other.id, as: "skip" })) poll(); });
  acts.append(met, skip);
  d.append(head, avatar(m.other), nameEl("h3", m.other), H("div", "role", label(m.other)));
  if (LI_RE.test(m.other.linkedin || "")) {  // only a real LinkedIn profile address becomes a link
    const a = H("a", "u li", `${first(m.other)} on LinkedIn`); a.href = m.other.linkedin; a.target = "_blank"; a.rel = "noopener noreferrer";
    d.append(a);
  }
  d.append(H("p", "", m.why), open, det, acts);
  return d;
}

function guidance(v) {
  const n = v.shortlist.length, met = v.met.length;
  if (!v.me.match) return "You are on the radar only.";
  if (n) return (met ? "Next: " : "Start with ") + first(v.shortlist[0].other) + ".";
  if (v.pending) return "Finding your people…";
  if (met) return "You have met everyone on your list.";
  return "No strong match yet.";
}

function emptyText(v) {
  if (!v.me.match) return "You chose not to be matched, so nobody is suggested to you and you are not suggested to anyone. To change that, leave and join again.";
  if (v.pending) return `Comparing you with ${v.pending} more guest${v.pending === 1 ? "" : "s"}. This takes a few seconds.`;
  if (v.room < 2) return "You are the first one here. Your shortlist fills in as other guests join, so keep this page open.";
  if (v.met.length) return "Nice work. New guests are compared with you as they arrive, so check back later.";
  return "We only suggest someone when the web backs up the match. New guests are compared with you as they arrive, so check back later.";
}

function renderMine(v) {
  const root = $("#mine"); root.textContent = "";
  const me = v.me;
  if (me.status === "failed") {
    const again = H("button", "btn primary", "Start again"); again.type = "button";
    again.addEventListener("click", async () => { await post("/api/leave"); reset(); });
    root.append(H("h1", "", "We could not read that profile"), H("p", "lede", "The page did not give us a name and company. Start again and type them in instead."), H("div", "nav"));
    root.lastChild.append(again);
    return;
  }
  if (me.status !== "ready") {
    const ol = H("ol", "checks");
    ol.append(H("li", "now", "Reading your public profile"), H("li", "", "Comparing you with the room"), H("li", "", "Picking your three people"));
    root.append(H("h1", "", "Getting you into the room…"), ol);
    return;
  }

  // who the room sees
  const card = H("section", "card"), kv = H("dl", "kv");
  card.append(H("span", "tag", "You are in"), avatar(me), nameEl("h2", me), H("div", "role", label(me)));
  if (me.summary) card.append(H("p", "sum", me.summary));
  const row = (k, t) => { if (t) kv.append(H("dt", "", k), H("dd", "", t)); };
  row("Aims", me.goal_labels.join(", ")); row("Want", me.wants); row("Offer", me.gives);
  if (kv.children.length) card.append(kv);
  card.append(H("div", "src", "Built from " + me.source_label + ". The room sees your name, role, company and aims. Want and offer stay private."));

  // shortlist
  const sec = H("section", "sec"), tag = H("div", "tag");
  tag.append(H("span", "", "Your shortlist"), H("span", "", `${v.met.length} met · ${v.room} in the room`));
  sec.append(tag, H("p", "guide-line", guidance(v)));
  if (v.shortlist.length) {
    const list = H("div", "matches"); v.shortlist.forEach((m, i) => list.append(matchEl(m, i))); sec.append(list);
  } else sec.append(H("p", "empty", emptyText(v)));
  root.append(card, sec);

  if (v.met.length) {
    const ms = H("section", "sec"); ms.append(H("div", "tag", "Met"));
    for (const m of v.met) {
      const r = H("div", "metrow"), undo = H("button", "btn quiet", "Undo"); undo.type = "button";
      undo.addEventListener("click", async () => { if (await post("/api/mark", { other: m.other.id, as: "undo" })) poll(); });
      r.append(H("span", "", `${m.other.name}, ${m.other.company}`), undo); ms.append(r);
    }
    root.append(ms);
  }

  const fine = H("div", "fine"), leave = H("button", "btn quiet danger", "Leave and delete my data"); leave.type = "button";
  leave.addEventListener("click", async () => {
    if (confirm("Leave the room? Your profile and shortlist are deleted straight away.") && await post("/api/leave")) reset();
  });
  fine.append(H("span", "", "Suggestions, not verdicts. Each one is a probability from Parallel, backed by the sources shown."), leave);
  root.append(fine);
}

async function poll() {
  if (!key) return;
  try {
    const r = await fetch("/api/me?key=" + encodeURIComponent(key));
    if (r.status === 404) return reset("The room was cleared, so you are no longer in it. Join again if you like.");
    const text = await r.text();
    if (text !== lastView) { lastView = text; const v = JSON.parse(text); $("#event").textContent = v.event.name; renderMine(v); }
  } catch (e) { console.error("poll failed", e); }  // keep the last view; the next poll retries
}

function start() {
  $("#wizard").hidden = true; $("#mine").hidden = false; lastView = "";
  clearInterval(timer); poll(); timer = setInterval(poll, POLL_MS);
  scrollTo(0, 0);
}

function reset(note) {
  clearInterval(timer); key = ""; store.set("");
  $("#mine").hidden = true; $("#wizard").hidden = false; $("#consent").checked = false;
  showStep(0); $("#err").textContent = note || "";
}

(async () => {
  try {
    const [g, s] = await Promise.all([fetch("/api/goals").then((r) => r.json()), fetch("/api/state").then((r) => r.json())]);
    maxGoals = g.max; $("#event").textContent = s.event.name;
    for (const goal of g.goals) {
      const l = H("label", "chip"), c = H("input"); c.type = "checkbox"; c.value = goal.id;
      l.append(c, H("span", "", goal.label)); $("#goals").append(l);
    }
  } catch (e) { $("#err").textContent = "No connection to the room. Check you are on the venue wifi and reload"; }
  if (key) start(); else { $("#wizard").hidden = false; showStep(0); }
})();
