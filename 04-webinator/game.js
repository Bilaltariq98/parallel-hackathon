// Webinator game logic. Pure functions: every function returns a NEW state, nothing is mutated.
// Works in the browser (window.Game) and in node (module.exports) so the self-check can run headless.
(function (root) {
  // Clamp keeps one noisy answer from zeroing a company, but must stay below GREY_RATIO/(1+GREY_RATIO)
  // (about 0.09) so a clear answer (p near 0 vs near 1) can push a candidate under the grey line.
  const P_MIN = 0.05, P_MAX = 0.95;
  const GREY_RATIO = 0.1;      // greyed out when weight < 10% of leader
  const GUESS_SHARE = 0.8;     // leader holds >= 80% of total weight -> guess
  const GUESS_AFTER = 8;       // or after 8 questions

  const clamp = (p) => (p === null || p === undefined ? 0.5 : Math.min(P_MAX, Math.max(P_MIN, p)));

  // bank: { name: {key: p|null} }  (only companies with data)
  function newGame(bank, keys) {
    const weights = {};
    Object.keys(bank).forEach((n) => { weights[n] = 1; });
    return advance({ weights, asked: [], guess: null, question: null, status: "asking" }, bank, keys);
  }

  function total(state) {
    return Object.values(state.weights).reduce((a, b) => a + b, 0);
  }

  function leader(state) {
    let best = null;
    Object.keys(state.weights).forEach((n) => {
      if (state.weights[n] > 0 && (best === null || state.weights[n] > state.weights[best])) best = n;
    });
    return best;
  }

  function liveNames(state) {
    const top = leader(state);
    if (top === null) return [];
    const floor = state.weights[top] * GREY_RATIO;
    return Object.keys(state.weights).filter((n) => state.weights[n] > 0 && state.weights[n] >= floor);
  }

  function leaderShare(state) {
    const top = leader(state), t = total(state);
    return top === null || t === 0 ? 0 : state.weights[top] / t;
  }

  const HQ_KEYS = ["uk_hq", "us_hq", "europe", "asia"]; // mutually exclusive: a yes on one settles the rest
  const SETTLED = 0.97;  // a question is settled when this share of live weight is confidently one side

  function isSettled(state, bank, k, live) {
    if (HQ_KEYS.includes(k) && state.asked.some((a) => a.answer === "yes" && HQ_KEYS.includes(a.key))) return true;
    let t = 0, yes = 0, no = 0;
    live.forEach((n) => {
      const w = state.weights[n], p = bank[n][k];
      t += w;
      if (p !== null && p !== undefined && p >= 0.9) yes += w;
      if (p !== null && p !== undefined && p <= 0.1) no += w;
    });
    return t > 0 && (yes / t >= SETTLED || no / t >= SETTLED);
  }

  // Question whose weighted P(yes) over remaining candidates is closest to 0.5.
  function pickQuestion(state, bank, keys) {
    const askedKeys = new Set(state.asked.map((a) => a.key));
    const t = total(state), live = liveNames(state);
    let best = null, bestScore = Infinity;
    keys.forEach((k) => {
      if (askedKeys.has(k) || t === 0 || isSettled(state, bank, k, live)) return;
      let yes = 0;
      Object.keys(state.weights).forEach((n) => {
        if (state.weights[n] > 0) yes += state.weights[n] * clamp(bank[n][k]);
      });
      const score = Math.abs(yes / t - 0.5);
      if (score < bestScore) { bestScore = score; best = k; }
    });
    return best;
  }

  // Decide next status: guess, ask a question, or give up.
  function advance(state, bank, keys) {
    const top = leader(state);
    if (top === null) return { ...state, status: "lost", guess: null, question: null };
    const question = pickQuestion(state, bank, keys);
    if (leaderShare(state) >= GUESS_SHARE || state.asked.length >= GUESS_AFTER || question === null) {
      return { ...state, status: "guessing", guess: top, question: null };
    }
    return { ...state, status: "asking", guess: null, question };
  }

  // answer: "yes" | "no" | "unsure"
  function applyAnswer(state, bank, keys, answer) {
    const key = state.question;
    if (state.status !== "asking" || key === null) return state;
    const weights = { ...state.weights };
    if (answer === "yes" || answer === "no") {
      Object.keys(weights).forEach((n) => {
        const p = clamp(bank[n][key]);
        weights[n] = weights[n] * (answer === "yes" ? p : 1 - p);
      });
    }
    return advance({ ...state, weights, asked: [...state.asked, { key, answer }] }, bank, keys);
  }

  function rejectGuess(state, bank, keys) {
    if (state.status !== "guessing") return state;
    return advance({ ...state, weights: { ...state.weights, [state.guess]: 0 }, guess: null }, bank, keys);
  }

  function confirmGuess(state) {
    return state.status === "guessing" ? { ...state, status: "won" } : state;
  }

  // Simulated game: the "player" answers from the bank itself (p >= 0.5 -> yes).
  function simulate(bank, keys, secret) {
    let s = newGame(bank, keys), rejections = 0, questions = 0;
    for (let i = 0; i < 200; i++) {
      if (s.status === "asking") {
        questions++;
        s = applyAnswer(s, bank, keys, bank[secret][s.question] >= 0.5 ? "yes" : "no");
      } else if (s.status === "guessing") {
        if (s.guess === secret) return { secret, guess: s.guess, ok: true, rejections, questions };
        rejections++;
        s = rejectGuess(s, bank, keys);
      } else break;
    }
    return { secret, guess: s.guess, ok: false, rejections, questions };
  }

  function selfCheck(bank, keys, secrets) {
    const results = secrets.map((n) => simulate(bank, keys, n));
    // purity: applying an answer must not touch the input state
    const s0 = newGame(bank, keys), snap = JSON.stringify(s0);
    applyAnswer(s0, bank, keys, "yes");
    const pure = JSON.stringify(s0) === snap;
    // "unsure" changes no weight
    const s1 = applyAnswer(s0, bank, keys, "unsure");
    const unsureOk = JSON.stringify(s1.weights) === JSON.stringify(s0.weights);
    return { results, pure, unsureOk, ok: pure && unsureOk && results.every((r) => r.ok && r.rejections === 0) };
  }

  const api = { clamp, newGame, total, leader, liveNames, leaderShare, pickQuestion, advance,
                applyAnswer, rejectGuess, confirmGuess, simulate, selfCheck };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== "undefined" ? window : globalThis);
