// Anatomy Arcade: quiz rounds on the turntable models, plus the lecture videos. Hash routes, no framework.

const STEP = 5, ROUND = 10, MIX = 15, LIMIT = 25;
const LETTERS = "ABCDE";
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hl = (s) => esc(s).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = (t) => ((((t + 180) % 360) + 360) % 360) - 180;

const MAN = await (await fetch("manifest.json")).json();
const bySlug = new Map(MAN.map((l) => [l.slug, l]));
let gen = 0; // bumped on every route; async screens bail out when it moves on
const banks = {};
const bank = async (slug) => (banks[slug] ||= (await fetch(`questions/${slug}.json`)).json());

// ---------------------------------------------------------------- progress
const store = {
  get() { try { return JSON.parse(localStorage.getItem("arcade") || "{}"); } catch { return {}; } },
  set(v) { localStorage.setItem("arcade", JSON.stringify(v)); },
};
function record(slug, score, correct, total, missedKeys, rightKeys) {
  const s = store.get();
  const l = (s[slug] ||= { best: 0, plays: 0, seen: {} });
  l.best = Math.max(l.best, score);
  if (total) l.plays++;
  for (const k of rightKeys) l.seen[k] = 1;
  for (const k of missedKeys) l.seen[k] = 0;
  s.total = (s.total || 0) + correct; s.answered = (s.answered || 0) + total;
  store.set(s);
}
// progress is keyed by a hash of the question text (manifest ids), so edits to a bank never shift marks
const mastered = (slug) => { const seen = store.get()[slug]?.seen || {}; return bySlug.get(slug).ids.filter((id) => seen[id]).length; };

// ---------------------------------------------------------------- stage
// Frames are pre-rendered by tools/game_frames.mjs (a live model build takes seconds on a phone).
// Dragging scrubs the plain turntable frames; on release it eases back to the question's view.
const metas = {};
const meta = async (slug) => (metas[slug] ||= (await fetch(`frames/${slug}/meta.json`)).json());
const spinSrc = (slug, t) => `frames/${slug}/spin/${norm(Math.round(t / STEP) * STEP)}.webp`;
function preload(srcs) { for (const s of srcs) { const im = new Image(); im.src = s; } }

class Stage {
  constructor(el) {
    this.el = el; this.spin = el.querySelector(".spin"); this.img = el.querySelector(".qimg"); this.chips = el.querySelector(".chips"); this.read = el.querySelector(".drag");
    this.onPin = null; this.turn = 0; this.home = 0; this.raf = 0;
    let x0 = null, y0 = 0, t0 = 0, moved = 0;
    el.addEventListener("pointerdown", (e) => {
      x0 = e.clientX; y0 = e.clientY; t0 = this.turn; moved = 0;
      clearTimeout(this.wait); cancelAnimationFrame(this.raf);
    });
    el.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      moved = Math.max(moved, Math.hypot(e.clientX - x0, e.clientY - y0));
      if (moved > 8 && Math.abs(e.clientX - x0) > Math.abs(e.clientY - y0)) { this.loose(true); this.setTurn(t0 + (e.clientX - x0) * 0.8); }
    });
    const up = (e) => {
      if (x0 === null) return;
      const tap = moved <= 8; x0 = null;
      const loose = this.el.classList.contains("loose");
      if (tap && !loose && this.onPin && e) {
        const chip = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains("chip"));
        if (chip) this.onPin(+chip.dataset.i);
      }
      if (loose) this.wait = setTimeout(() => this.back(), tap ? 0 : 900);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", () => up(null));
    addEventListener("resize", () => this.last && this.el.isConnected && this.layout(...this.last));
  }
  setTurn(t) {
    this.turn = t;
    this.spin.src = spinSrc(this.slug, t);
    this.read.textContent = `turn ${((Math.round(t) % 360) + 360) % 360}° · drag to rotate`;
  }
  loose(on) { this.el.classList.toggle("loose", on); }
  // ease the turntable back to the framed question view, then show it
  back() {
    if (this.el.classList.contains("loose") === false) return;
    cancelAnimationFrame(this.raf);
    const step = () => {
      const d = norm(this.home - this.turn);
      if (Math.abs(d) < 3) { this.setTurn(this.home); this.loose(false); return; }
      this.setTurn(this.turn + Math.sign(d) * Math.max(5, Math.abs(d) * 0.18));
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  show(slug, m, i, state, cls = []) {
    this.slug = slug; this.home = m.turn;
    cancelAnimationFrame(this.raf); this.loose(false); this.setTurn(m.turn);
    this.img.src = `frames/${slug}/q${i}${state}.webp`;
    this.layout(m[state].pins, cls);
  }
  // chips start up-right of their pin head and are pushed apart until none overlap; a leader line ties each to its pin
  layout(pins, cls) {
    this.last = [pins, cls];
    const r = this.el.getBoundingClientRect(), w = r.width || 358, h = r.height || 322, R = 18, GAP = 2 * R + 4;
    const cs = Object.entries(pins).map(([id, [x, y]], n) => ({ id, j: LETTERS.indexOf(id), px: x * w, py: y * h, n }));
    // start each chip 38 px out from its pin, pointing away from the pins' centre (up-right when it's alone)
    const mx = cs.reduce((a, c) => a + c.px, 0) / (cs.length || 1), my = cs.reduce((a, c) => a + c.py, 0) / (cs.length || 1);
    for (const c of cs) {
      let dx = c.px - mx, dy = c.py - my, d = Math.hypot(dx, dy);
      if (d < 6) { const ang = -Math.PI / 4 + (c.n - (cs.length - 1) / 2) * 1.1; dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
      c.x = c.px + (dx / d) * 38; c.y = c.py + (dy / d) * 38;
    }
    const nudge = (c, ox, oy, min, share) => {
      let dx = c.x - ox, dy = c.y - oy, d = Math.hypot(dx, dy);
      if (d >= min) return false;
      if (d < 0.01) { dx = 1; dy = -1; d = Math.SQRT2; }
      const push = (min - d) * share + 0.5;
      c.x += (dx / d) * push; c.y += (dy / d) * push;
      return true;
    };
    for (let it = 0; it < 120; it++) {
      let hit = false;
      for (const a of cs) for (const b of cs) {
        if (a.n >= b.n) continue;
        const ax = a.x, ay = a.y;
        if (nudge(a, b.x, b.y, GAP, 0.5)) { nudge(b, ax, ay, GAP, 0.5); hit = true; }
      }
      for (const c of cs) for (const p of cs) if (nudge(c, p.px, p.py, R + 7, 0.6)) hit = true;
      for (const c of cs) { c.x = Math.max(R + 2, Math.min(w - R - 2, c.x)); c.y = Math.max(R + 26, Math.min(h - R - 26, c.y)); }
      if (!hit) break;
    }
    const lead = cs.map((c) => `<line x1="${c.px.toFixed(1)}" y1="${c.py.toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}"/><circle cx="${c.px.toFixed(1)}" cy="${c.py.toFixed(1)}" r="3.2"/>`).join("");
    this.chips.innerHTML = `<svg class="leads" viewBox="0 0 ${w} ${h}">${lead}</svg>` + cs.map((c) =>
      `<div class="chip ${cls[c.j] || ""}" data-i="${c.j}" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px">${c.id}</div>`).join("");
  }
}

// ---------------------------------------------------------------- screens
function setAccent(c) { document.body.style.setProperty("--accent", c || "#e2678a"); }

function home() {
  setAccent("#e2678a");
  const s = store.get();
  const totalQ = MAN.reduce((a, l) => a + l.count, 0);
  const done = MAN.reduce((a, l) => a + mastered(l.slug), 0);
  app.innerHTML = `
    <div class="hero"><h1>Anatomy <span class="hl">Arcade</span></h1><p>Gross anatomy, one spin at a time. Drag the models, tap the pins, beat your best.</p></div>
    <div class="stats">
      <div class="stat"><b>${done}<span class="muted" style="font-size:16px"> / ${totalQ}</span></b><span>questions mastered</span></div>
      <div class="stat"><b>${s.answered ? Math.round((100 * s.total) / s.answered) : 0}%</b><span>all-time accuracy</span></div>
    </div>
    <button class="mix" data-go="#/mix">⚡ Mixed review · ${MIX} random</button>
    <div class="grid">${MAN.map((l) => {
      const [region, name] = l.series.split(" · ");
      const m = mastered(l.slug), best = s[l.slug]?.best;
      return `<button class="tile" style="--c:${l.accent}" data-go="#/l/${l.slug}">
        <div><div class="region">${esc(region)}</div><div class="name">${esc(name)}</div></div>
        <div><div class="meta">${best ? `best ${best} · ` : ""}${m}/${l.count} mastered</div><div class="bar"><i style="width:${(100 * m) / l.count}%"></i></div></div>
      </button>`;
    }).join("")}</div>
    <p class="note">Made for Sophie ❤️ · Questions follow her lecture slides; check anything surprising against the slides.</p>`;
}

function lecture(slug) {
  const l = bySlug.get(slug); if (!l) return (location.hash = "#/");
  setAccent(l.accent);
  const best = store.get()[slug]?.best;
  app.innerHTML = `
    <button class="back" data-go="#/">‹ All lectures</button>
    <div class="lec"><div class="muted">${esc(l.series.split(" · ")[0])}</div><h2>${esc(l.series.split(" · ")[1])}</h2>
    <div class="muted">${l.count} questions · ${mastered(slug)} mastered${best ? ` · best ${best}` : ""}</div></div>
    <div class="modes">
      <button class="mode" data-go="#/q/${slug}"><div class="ic">🎯</div><div><b>Play quiz</b><span>${ROUND} questions on the 3D model, ${LIMIT} s each</span></div></button>
      <button class="mode" data-go="#/q/${slug}/missed"><div class="ic">🔁</div><div><b>Fix my misses</b><span>Questions you haven't nailed yet</span></div></button>
    </div>
    <div class="videos">${l.videos.map((v, i) => `
      <div><div class="vt">Part ${i + 1} · ${esc(v.title)}</div>
      <video src="${v.src}" poster="${v.poster}" controls playsinline preload="none"></video></div>`).join("")}</div>`;
}

async function quiz(slugs, mode) {
  const my = ++gen, live = () => my === gen;
  app.innerHTML = `<p class="muted">Loading…</p>`;
  let pool = [];
  const bs = await Promise.all(slugs.map(bank));
  if (!live()) return;
  bs.forEach((b, n) => b.questions.forEach((q, i) => pool.push({ ...q, slug: slugs[n], accent: b.accent, key: String(i), id: bySlug.get(slugs[n]).ids[i] })));
  if (mode === "missed") {
    const seen = store.get()[slugs[0]]?.seen || {};
    const left = pool.filter((q) => !seen[q.id]);
    pool = left.length ? left : pool;
  }
  const qs = shuffle(pool).slice(0, slugs.length > 1 ? MIX : ROUND);
  const accent = slugs.length > 1 ? "#c77dff" : qs[0].accent;
  setAccent(accent);
  const back = slugs.length > 1 ? "#/" : `#/l/${slugs[0]}`;
  app.innerHTML = `
    <div class="hud"><button class="back" data-go="${back}">‹ Quit</button><span class="pill" id="num"></span><span class="pill streak" id="streak">🔥 0</span><span class="pill" id="score">0</span></div>
    <div class="timer"><i id="time"></i></div>
    <div class="stage" id="stage"><img class="spin" alt=""><img class="qimg" alt="3D anatomy model"><div class="chips"></div><span class="tag" id="tag"></span><span class="lbl" id="lbl"></span><span class="drag"></span></div>
    <div id="qa"></div>`;
  const $ = (id) => document.getElementById(id);
  const stage = new Stage($("stage"));
  const preloaded = new Set(slugs.length === 1 ? slugs : []);
  if (slugs.length === 1) preload(Array.from({ length: 72 }, (_, j) => spinSrc(slugs[0], j * STEP - 180)));
  let i = 0, score = 0, streak = 0, bestStreak = 0, correct = 0, timer = 0;
  const missed = [], right = [];

  async function ask() {
    const q = qs[i];
    const m = (await meta(q.slug)).questions[+q.key];
    if (!live()) return;
    if (slugs.length > 1) {
      setAccent(q.accent);
      if (!preloaded.has(q.slug)) { preloaded.add(q.slug); preload(Array.from({ length: 72 }, (_, j) => spinSrc(q.slug, j * STEP - 180))); }
    }
    const nx = qs[i + 1];
    preload([`frames/${q.slug}/q${q.key}b.webp`, ...(nx ? [`frames/${nx.slug}/q${nx.key}a.webp`] : [])]);
    $("num").textContent = `${i + 1}/${qs.length}`;
    $("tag").textContent = slugs.length > 1 ? bySlug.get(q.slug).series : `Fig ${i + 1}`;
    $("lbl").textContent = "";
    stage.show(q.slug, m, q.key, "a");
    $("qa").innerHTML = `<div class="q">${hl(q.q)}</div><div class="opts">${q.options.map((o, j) =>
      `<button class="opt" data-i="${j}"><b>${LETTERS[j]}</b><span>${hl(o)}</span></button>`).join("")}</div>`;
    scrollTo(0, 0);
    let done = false;
    const t0 = performance.now();
    const answer = (pick) => {
      if (done || (pick !== -1 && performance.now() - t0 < 400)) return; // a double tap on Next must not answer the new question
      done = true; cancelAnimationFrame(timer);
      const left = Math.max(0, 1 - (performance.now() - t0) / (LIMIT * 1000));
      const ok = pick === q.answer;
      if (ok) {
        streak++; bestStreak = Math.max(bestStreak, streak); correct++;
        const pts = 100 + Math.round(60 * left) + Math.min(5, streak - 1) * 20;
        score += pts; right.push(q); popup(`+${pts}`, "var(--ok)");
      } else {
        streak = 0; missed.push({ q, pick }); popup(pick === -1 ? "Time!" : "Nope", "var(--bad)");
        $("qa").classList.add("shake"); navigator.vibrate?.(80);
      }
      $("score").textContent = score;
      $("streak").textContent = `🔥 ${streak}`; $("streak").classList.toggle("on", streak >= 3);
      document.querySelectorAll(".opt").forEach((b, j) => b.classList.add(j === q.answer ? "ok" : j === pick ? "bad" : "dim"));
      stage.show(q.slug, m, q.key, "b", q.options.map((_, j) => (j === q.answer ? "ok" : j === pick ? "bad" : "dim")));
      $("lbl").textContent = m.label;
      $("qa").insertAdjacentHTML("beforeend", `<div class="explain">${hl(q.explain)}${q.pages?.length ? `<span class="src">Lecture slides p. ${q.pages.join(", ")}</span>` : ""}</div>
        <button class="next" id="next">${i + 1 < qs.length ? "Next →" : "See results"}</button>`);
      $("next").onclick = () => { $("next").disabled = true; i++; $("qa").classList.remove("shake"); i < qs.length ? ask() : results(); };
      requestAnimationFrame(() => $("next")?.scrollIntoView({ behavior: "smooth", block: "end" }));
    };
    document.querySelectorAll(".opt").forEach((b) => (b.onclick = () => answer(+b.dataset.i)));
    stage.onPin = (j) => answer(j);
    const tick = () => {
      const k = (performance.now() - t0) / (LIMIT * 1000);
      if (!live() || !$("time")) return;
      $("time").style.width = `${100 * Math.max(0, 1 - k)}%`;
      if (k >= 1) return answer(-1);
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
  }

  function popup(text, color) {
    const p = document.createElement("div");
    p.className = "pop"; p.textContent = text; p.style.color = color;
    document.body.appendChild(p); setTimeout(() => p.remove(), 900);
  }

  function results() {
    const slug = slugs.length > 1 ? "mix" : slugs[0];
    const prevBest = store.get()[slug]?.best || 0;
    for (const s of slugs) {
      const mine = (xs) => xs.filter((q) => q.slug === s).map((q) => q.id);
      if (slugs.length > 1 && !qs.some((q) => q.slug === s)) continue;
      if (slugs.length === 1) record(s, score, correct, qs.length, mine(missed.map((m) => m.q)), mine(right));
      else record(s, 0, 0, 0, mine(missed.map((m) => m.q)), mine(right));
    }
    if (slugs.length > 1) { const st = store.get(); st.mix = { best: Math.max(prevBest, score) }; st.total = (st.total || 0) + correct; st.answered = (st.answered || 0) + qs.length; store.set(st); }
    const pct = correct / qs.length;
    const grade = pct === 1 ? "Perfect. Ace that exam 🏆" : pct >= 0.8 ? "Exam ready 💪" : pct >= 0.6 ? "Getting there 📈" : "Run it back 🔁";
    app.innerHTML = `
      <div class="result"><div class="muted">${slugs.length > 1 ? "Mixed review" : esc(bySlug.get(slug).series)}</div>
      <div class="big">${score}</div><div class="grade">${grade}</div>
      <div class="muted" style="margin-top:6px">${correct}/${qs.length} correct · best streak ${bestStreak}${score > prevBest ? " · new best!" : ""}</div></div>
      ${missed.length ? `<h3 style="margin:22px 2px 0">Review your misses</h3><div class="missed">${missed.map(({ q }) =>
        `<div>${hl(q.q)}<br><b>${hl(q.options[q.answer])}</b><br><span class="muted">${hl(q.explain)}</span></div>`).join("")}</div>` : ""}
      <div class="row2"><button data-go="${back}">Back</button><button class="pri" id="again">Play again</button></div>`;
    $("again").onclick = () => quiz(slugs, mode);
  }
  ask();
}

// ---------------------------------------------------------------- router
app.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) location.hash = g.dataset.go; });
function route() {
  gen++;
  const [, kind, slug, mode] = (location.hash || "#/").split("/");
  scrollTo(0, 0);
  if (kind === "l") return lecture(slug);
  if (kind === "q" && bySlug.has(slug)) return quiz([slug], mode);
  if (kind === "mix") return quiz(MAN.map((l) => l.slug), "mix");
  home();
}
addEventListener("hashchange", route);
route();
