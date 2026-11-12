// Webinator UI. Two parts: Renderer (DOM only, replaceable) and Controller (wires Game + server to Renderer).
// All server/citation text goes through textContent, never innerHTML.

// ---------- Renderer ----------
const Renderer = (() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const button = (label, onClick, cls) => {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const setPanel = (...nodes) => {
    const p = $("panel");
    p.className = "";
    document.body.classList.remove("won");
    p.replaceChildren(...nodes);
  };
  // Focus the first answer button of the new panel so keyboard players can keep going.
  const focusFirst = () => { const b = $("panel").querySelector("button, input"); if (b) b.focus(); };

  // Board: one persistent chip per company, positioned and scaled by layout().
  // Greyed chips get struck through in a quick wave, then fade out while the survivors reflow larger.
  const CW = 198, CH = 48, MAX_SCALE = 3.6, WAVE_MS = 260, GREY_AT = 120;
  const chips = new Map(); // name -> {el, grey}
  let reflowTimer = null;
  function layout() {
    const pool = $("board"), A = [...chips.values()].filter((c) => !c.grey), n = A.length, W = pool.clientWidth, H = pool.clientHeight;
    if (!n || !W || !H) return;
    let best = { s: 0, cols: 1 };
    for (let cols = 1; cols <= n; cols++) {
      const s = Math.min(W / (cols * CW), H / (Math.ceil(n / cols) * CH), MAX_SCALE);
      if (s > best.s) best = { s, cols };
    }
    const { s, cols } = best, rows = Math.ceil(n / cols);
    const ox = (W - cols * CW * s) / 2 + 4 * s, oy = (H - rows * CH * s) / 2 + 4 * s;
    A.forEach((c, i) => { c.el.style.transform = `translate(${(ox + (i % cols) * CW * s).toFixed(1)}px,${(oy + Math.floor(i / cols) * CH * s).toFixed(1)}px) scale(${s.toFixed(3)})`; });
  }
  const snapLayout = () => { const b = $("board"); b.classList.add("snap"); layout(); b.offsetWidth; b.classList.remove("snap"); };
  const countUp = (() => {
    let shown = null, raf = 0;
    return (n) => {
      const num = $("num"); cancelAnimationFrame(raf);
      if (n === null) { shown = null; num.textContent = ""; return; }
      const from = shown === null || reduced() ? n : shown, t0 = performance.now();
      shown = n;
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 400);
        num.textContent = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
  })();

  return {
    board(cells) { // [{name, label, cls}]
      const pool = $("board"), seen = new Set(), newly = [];
      let created = false, relayout = false;
      cells.forEach((c) => {
        seen.add(c.name);
        let chip = chips.get(c.name);
        if (!chip) {
          const wrap = el("div", "chip"), inner = el("div", "in", c.label);
          wrap.setAttribute("role", "listitem"); wrap.append(inner); pool.append(wrap);
          chip = { el: wrap, inner, grey: false }; chips.set(c.name, chip); created = true;
        }
        chip.inner.title = c.label;
        if (chip.inner.textContent !== c.label) chip.inner.textContent = c.label;
        ["leader", "nodata", "pending", "fresh"].forEach((k) => chip.el.classList.toggle(k, c.cls === k));
        const wantGrey = c.cls === "grey";
        if (wantGrey && !chip.grey) { chip.grey = true; newly.push(chip); }
        else if (!wantGrey && chip.grey) { chip.grey = false; chip.el.classList.remove("grey", "gone"); chip.el.removeAttribute("aria-hidden"); relayout = true; }
      });
      chips.forEach((chip, name) => { if (!seen.has(name)) { chip.el.remove(); chips.delete(name); relayout = true; } });
      clearTimeout(reflowTimer);
      if (created) snapLayout();
      if (newly.length) {
        const gap = Math.min(10, WAVE_MS / newly.length);
        newly.forEach((chip, i) => { chip.el.style.setProperty("--d", `${Math.round(i * gap)}ms`); chip.el.classList.add("grey"); });
        const reflow = () => {
          newly.forEach((chip) => { chip.el.classList.add("gone"); chip.el.setAttribute("aria-hidden", "true"); });
          layout();
          chips.forEach((chip) => { if (!chip.grey) { chip.el.classList.add("pulse"); setTimeout(() => chip.el.classList.remove("pulse"), 650); } });
        };
        if (reduced()) reflow(); else reflowTimer = setTimeout(reflow, GREY_AT + WAVE_MS);
      } else if (relayout) layout();
    },
    relayout: layout,
    focusFirst,
    counter({ n, label }) {
      countUp(n);
      $("clabel").textContent = label || "";
      $("sr").textContent = n === null || n === undefined ? "" : `${n} ${label}`;
    },
    status(text, isError) { const s = $("status"); s.textContent = text || ""; s.className = isError ? "error" : ""; },
    toolbar({ rebuilding, hasMissing }) {
      $("rebuild").disabled = rebuilding;
      $("restart").disabled = rebuilding;
      $("retry").hidden = !hasMissing;
      $("retry").disabled = rebuilding;
    },
    question({ text, number, onAnswer, onNotOnBoard }) {
      const r = el("div", "row");
      [["Yes", "yes"], ["No", "no"], ["Not sure", "unsure"]].forEach(([l, a]) => r.append(button(l, () => onAnswer(a), "answer" + (a === "yes" ? " primary" : ""))));
      r.append(button("Not on the board", onNotOnBoard, "ghost"));
      setPanel(el("div", "qn enter", `Q${number}`), el("div", "question enter", text), r);
      focusFirst();
    },
    guess({ name, onYes, onNo }) {
      const r = el("div", "row"); r.append(button("Yes", onYes, "answer primary"), button("No", onNo, "answer"));
      setPanel(el("div", "qn enter", "Is it"), el("div", "guess enter", name + "?"), r);
      focusFirst();
    },
    lost({ onNotOnBoard, onRestart }) {
      const r = el("div", "row"); r.append(button("Not on the board", onNotOnBoard, "answer"), button("Restart", onRestart, "answer"));
      setPanel(el("div", "question enter", "I give up: nothing on the board fits."), r);
      focusFirst();
    },
    won({ name, rows, citations, error, loading, onRestart }) { // rows: [{q, you, p}]
      const left = el("div", "left"), right = el("div", "right");
      right.tabIndex = 0; right.setAttribute("role", "region"); right.setAttribute("aria-label", "Citations"); // keyboard-scrollable
      left.append(el("div", "label", "Got it"), el("div", "guess", name));
      if (rows.length) {
        const g = el("div", "deciding");
        ["Deciding answers", "You", "Web"].forEach((h) => g.append(el("div", "h", h)));
        rows.forEach((r) => g.append(el("div", "", r.q), el("div", "dim", r.you), el("div", "pct", r.p === null ? "n/a" : Math.round(r.p * 100) + "%")));
        left.append(g);
      }
      const play = el("div", "row"); play.append(button("Play again", onRestart, "answer primary")); left.append(play);
      right.append(el("div", "label", "Citations: shared evidence for this company"));
      if (loading) right.append(el("div", "dim", "Fetching live citations…"));
      if (error) right.append(el("div", "error", error));
      (citations || []).forEach((c) => {
        const d = el("div", "cite");
        d.append(el("div", "", c.title || "(untitled)"));
        if (/^https?:\/\//i.test(c.url)) {
          const a = el("a", "", c.url);
          a.href = c.url; a.target = "_blank"; a.rel = "noopener noreferrer";
          d.append(a);
        } else d.append(el("div", "dim", c.url));
        c.excerpts.forEach((x) => d.append(el("div", "excerpt", x)));
        right.append(d);
      });
      const had = $("panel").classList.contains("result");
      setPanel(left, right);
      $("panel").className = "result"; document.body.classList.add("won");
      if (!had) { left.classList.add("enter"); right.classList.add("enter"); play.firstChild.focus(); }
    },
    addForm({ message, busy, onSubmit, onCancel }) {
      const input = el("input"); input.maxLength = 80; input.placeholder = "Company name"; input.disabled = busy;
      const go = () => onSubmit(input.value);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      const row = el("div", "row"); const add = button("Add and restart", go, "answer primary"); add.disabled = busy;
      const cancel = button("Cancel", onCancel, "answer"); cancel.disabled = busy; row.append(add, cancel);
      setPanel(el("div", "question", "Which company were you thinking of?"), input, row,
        el("div", message && message.error ? "error" : "dim", busy ? "Asking the live web (20 questions)…" : (message ? message.text : "")));
      input.focus();
    },
  };
})();

// ---------- Controller ----------
const App = (() => {
  const S = { questions: {}, keys: [], companies: [], state: null, rebuilding: false, pending: new Set(), fresh: new Set(), es: null };
  const byName = (n) => S.companies.find((c) => c.name === n);
  const okBank = () => { const b = {}; S.companies.filter((c) => c.status === "ok").forEach((c) => { b[c.name] = c.p; }); return b; };

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  function draw() {
    const st = S.state, live = st ? new Set(Game.liveNames(st)) : new Set();
    const top = st ? Game.leader(st) : null;
    const cells = S.companies.map((c) => {
      let cls = "";
      if (S.pending.has(c.name)) cls = "pending";
      else if (c.status !== "ok") cls = "nodata";
      else if (S.rebuilding) cls = S.fresh.has(c.name) ? "fresh" : "";
      else if (st && !live.has(c.name)) cls = "grey";
      else if (st && c.name === top && st.status !== "lost") cls = "leader";
      return { name: c.name, label: c.status !== "ok" && !S.pending.has(c.name) ? c.name + " (no data)" : c.name, cls };
    });
    Renderer.board(cells);
    const nOk = S.companies.filter((c) => c.status === "ok").length;
    Renderer.counter(S.rebuilding ? { n: S.companies.length - S.pending.size, label: `of ${S.companies.length} rebuilt` } : st ? { n: live.size, label: `live candidates of ${nOk}` + (nOk < S.companies.length ? ` (${S.companies.length - nOk} no data)` : "") } : { n: null, label: "" });
    Renderer.toolbar({ rebuilding: S.rebuilding, hasMissing: S.companies.some((c) => c.status !== "ok") });
  }

  function showPanel() {
    const st = S.state;
    if (S.rebuilding) return;
    if (st.status === "asking") {
      Renderer.question({ text: S.questions[st.question], number: st.asked.length + 1, onAnswer: answer, onNotOnBoard: showAdd });
    } else if (st.status === "guessing") {
      Renderer.guess({ name: st.guess, onYes: confirm, onNo: reject });
    } else if (st.status === "lost") {
      Renderer.lost({ onNotOnBoard: showAdd, onRestart: start });
    }
  }

  function update(next) { S.state = next; showPanel(); draw(); } // panel first: its height sets the board's room
  const answer = (a) => update(Game.applyAnswer(S.state, okBank(), S.keys, a));
  const reject = () => update(Game.rejectGuess(S.state, okBank(), S.keys));

  async function confirm() {
    const st = Game.confirmGuess(S.state); S.state = st; draw();
    const name = st.guess, company = byName(name);
    const given = st.asked.filter((a) => a.answer !== "unsure");
    const rows = given.map((a) => ({ q: S.questions[a.key], you: a.answer, p: company.p[a.key] ?? null }));
    const view = { name, rows, onRestart: start };
    Renderer.won({ ...view, loading: true });
    try {
      const ev = await api("/api/evidence", { company: name, keys: given.map((a) => a.key) });
      Renderer.won({ ...view, rows: rows.map((r, i) => ({ ...r, p: ev.answers[given[i].key] ?? r.p })), citations: ev.citations });
    } catch (e) {
      Renderer.won({ ...view, error: "Could not fetch citations: " + e.message });
    }
  }

  function showAdd(message, busy) {
    Renderer.addForm({ message, busy: !!busy, onSubmit: submitAdd, onCancel: () => (S.state.status === "asking" || S.state.status === "guessing" || S.state.status === "lost") ? showPanel() : start() });
  }

  async function submitAdd(raw) {
    const name = raw.trim();
    if (!name || name.length > 80) return showAdd({ text: "Enter 1-80 characters.", error: true });
    showAdd(null, true);
    try {
      const { company } = await api("/api/add", { name });
      S.companies = [...S.companies, company];
      Renderer.status(`Added ${company.name}.`);
      start();
    } catch (e) {
      showAdd({ text: e.message, error: true });
    }
  }

  function start() {
    Renderer.status("");
    const bank = okBank();
    if (!Object.keys(bank).length) { S.state = null; draw(); return Renderer.status("No company data. Rebuild from the live web.", true); }
    update(Game.newGame(bank, S.keys));
  }

  async function load() {
    const data = await api("/api/bank");
    S.questions = data.questions; S.keys = Object.keys(data.questions); S.companies = data.companies;
  }

  function rebuild(onlyMissing) {
    if (S.rebuilding) return;
    S.rebuilding = true; S.fresh = new Set(); S.state = null;
    S.pending = new Set(S.companies.filter((c) => !onlyMissing || c.status !== "ok").map((c) => c.name));
    Renderer.status("Rebuilding from the live web...");
    draw();
    const es = new EventSource("/api/rebuild" + (onlyMissing ? "?only=missing" : ""));
    let finished = false;
    const finish = async (msg, isErr) => {
      if (finished) return; finished = true; es.close();
      try { await load(); } catch (e) { msg = (msg || "") + " " + e.message; isErr = true; }
      S.rebuilding = false; S.pending = new Set();
      start(); Renderer.status(msg, isErr);
    };
    const apply = (ev, ok) => {
      const d = JSON.parse(ev.data);
      S.pending.delete(d.name);
      const c = byName(d.name);
      if (c) { c.status = ok ? "ok" : "nodata"; c.p = ok ? d.p : null; }
      if (ok) S.fresh.add(d.name);
      Renderer.status(`Rebuilding ${d.done}/${d.total}` + (ok ? "" : `; ${d.name}: no data (${d.message})`), !ok);
      draw();
    };
    es.addEventListener("company", (ev) => apply(ev, true));
    es.addEventListener("error", (ev) => { if (ev.data) apply(ev, false); else finish("Rebuild connection lost or already running.", true); });
    es.addEventListener("done", (ev) => { const d = JSON.parse(ev.data); finish(`Rebuild done: ${d.ok} ok, ${d.failed} no data.`, d.failed > 0); });
  }

  async function init() {
    new ResizeObserver(Renderer.relayout).observe(document.getElementById("board"));
    document.getElementById("restart").addEventListener("click", start);
    document.getElementById("rebuild").addEventListener("click", () => rebuild(false));
    document.getElementById("retry").addEventListener("click", () => rebuild(true));
    try { await load(); start(); } catch (e) { Renderer.status("Could not load bank: " + e.message, true); }
  }
  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
