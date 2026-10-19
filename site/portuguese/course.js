// Brazilian Portuguese course engine: dashboard, lessons, drills, flashcards,
// quizzes, pt-BR audio, speaking practice, progress, and cross-device sync.

// Course API (Lambda Function URL). Empty = progress stays in this browser only.
const COURSE_API = "";

// Weeks whose lesson file exists in data/. Add numbers here as lessons are published.
const PUBLISHED = [1];

const CATALOG = [
  { unit: 1, course: "PORT 101", name: "Foundations", weeks: [
    [1, "Sounds, Greetings, and Who You Are"],
    [2, "Present Tense of Regular Verbs"],
    [3, "Ser vs Estar, and Describing Things"],
    [4, "Key Irregular Verbs + Checkpoint 1"] ] },
  { unit: 2, course: "PORT 101", name: "Everyday Life", weeks: [
    [5, "What's Happening Now, and Future Plans"],
    [6, "Prepositions and Contractions"],
    [7, "Pronouns the Way Brazilians Use Them"],
    [8, "Real-World Situations + Midterm"] ] },
  { unit: 3, course: "PORT 102", name: "The Past and Storytelling", weeks: [
    [9, "Past Tense: Pretérito Perfeito"],
    [10, "Past Tense: Irregular Verbs"],
    [11, "Imperfeito, and Choosing Between Them"],
    [12, "Telling Your Story + Checkpoint 3"] ] },
  { unit: 4, course: "PORT 102", name: "Nuance and Real Brazilian Speech", weeks: [
    [13, "The Present Subjunctive"],
    [14, "Future Subjunctive and Politeness"],
    [15, "Commands, Diminutives, and Regional Brazil"],
    [16, "Final Exam"] ] },
];
const PASS = 80;

// ---------- Small helpers ----------
const $ = sel => document.querySelector(sel);
function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Lesson markup: **bold**, *italic*, and [[Portuguese]] becomes a tap-to-hear button.
function rich(text) {
  return escapeHtml(text)
    .replace(/\[\[(.+?)\]\]/g, (_, pt) => `<button type="button" class="say" data-say="${pt}">${pt}</button>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}
function normalize(s) {
  return String(s).toLowerCase().replace(/[.,!?¿¡"“”]/g, "").replace(/\s+/g, " ").trim();
}
function stripAccents(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }
// Returns "good", "close" (right except accents), or "bad".
function check(input, answers) {
  const list = (Array.isArray(answers) ? answers : [answers]).map(normalize);
  const given = normalize(input);
  if (list.includes(given)) return "good";
  if (list.map(stripAccents).includes(stripAccents(given))) return "close";
  return "bad";
}
function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// ---------- Theme (shared with the resume site, stored as a plain string) ----------
function savedTheme() { try { return localStorage.getItem("theme"); } catch { return null; } }
const startTheme = savedTheme();
document.documentElement.dataset.theme = startTheme === "dark" || startTheme === "light"
  ? startTheme
  : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.addEventListener("click", e => {
  if (e.target.closest("#theme-toggle")) {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch {}
  }
});

// ---------- Audio: Amazon Polly recordings, Brazilian browser voice as backup ----------
// Recordings live at audio/<id>.mp3, where <id> is the first 16 hex characters of
// the phrase's SHA-1. tools/make_audio.py creates them with the same id.
async function audioId(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text.trim()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
// Only ever a Brazilian voice. Portugal Portuguese (pt-PT) sounds very different.
let ptVoice = null;
function pickVoice() {
  ptVoice = speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").toLowerCase() === "pt-br") || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function browserVoice(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR"; u.rate = 0.9;
  if (ptVoice) u.voice = ptVoice;
  speechSynthesis.speak(u);
}
let playing = null;
async function speak(text) {
  if (playing) { playing.pause(); playing = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  try {
    const clip = new Audio(`audio/${await audioId(text)}.mp3`);
    playing = clip;
    await clip.play();
  } catch {
    browserVoice(text);
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-say]");
  if (b) speak(b.dataset.say);
});
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(onResult) {
  if (!Recognition) return false;
  const r = new Recognition();
  r.lang = "pt-BR"; r.interimResults = false; r.maxAlternatives = 3;
  r.onresult = ev => onResult([...ev.results[0]].map(a => a.transcript));
  r.onerror = () => onResult([]);
  r.start();
  return true;
}

// ---------- Progress + sync ----------
// Shape: { weeks: { "1": { quiz: 90, drills: 100, done: true } }, last: 1, updated: 0 }
function loadProgress() { return store("port-progress") || { weeks: {}, last: 1, updated: 0 }; }
function saveProgress(p) { p.updated = Date.now(); store("port-progress", p); pushProgress(p); }
function syncKey() { return store("port-sync-key") || ""; }
function merge(a, b) {
  const out = { weeks: {}, last: Math.max(a.last || 1, b.last || 1), updated: Math.max(a.updated || 0, b.updated || 0) };
  new Set([...Object.keys(a.weeks || {}), ...Object.keys(b.weeks || {})]).forEach(k => {
    const x = (a.weeks || {})[k] || {}, y = (b.weeks || {})[k] || {};
    out.weeks[k] = { quiz: Math.max(x.quiz || 0, y.quiz || 0), drills: Math.max(x.drills || 0, y.drills || 0), done: !!(x.done || y.done) };
  });
  return out;
}
async function pullProgress() {
  if (!COURSE_API || !syncKey()) return loadProgress();
  try {
    const res = await fetch(COURSE_API + "progress", { headers: { "x-course-key": syncKey() } });
    if (!res.ok) return loadProgress();
    const merged = merge(loadProgress(), await res.json());
    store("port-progress", merged);
    return merged;
  } catch { return loadProgress(); }
}
function pushProgress(p) {
  if (!COURSE_API || !syncKey()) return;
  fetch(COURSE_API + "progress", {
    method: "PUT", headers: { "Content-Type": "application/json", "x-course-key": syncKey() }, body: JSON.stringify(p),
  }).catch(() => {});
}
function isUnlocked(p, n) { return n === 1 || !!(p.weeks[n - 1] && p.weeks[n - 1].done); }

// ---------- Settings dialog (sync key) ----------
function setupSettings() {
  const dlg = $("#settings");
  if (!dlg) return;
  $("#settings-btn").addEventListener("click", () => { $("#sync-key").value = syncKey(); dlg.showModal(); });
  $("#settings-save").addEventListener("click", () => { store("port-sync-key", $("#sync-key").value.trim()); dlg.close(); location.reload(); });
  const reset = $("#settings-reset");
  reset.addEventListener("click", () => {
    // Two-step confirm in the page itself (browser confirm() isn't available everywhere).
    if (reset.dataset.armed) { try { localStorage.removeItem("port-progress"); } catch {} location.reload(); return; }
    reset.dataset.armed = "1";
    reset.textContent = "Click again to clear progress";
  });
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const p = await pullProgress();
  const total = CATALOG.reduce((n, u) => n + u.weeks.length, 0);
  const done = Object.values(p.weeks).filter(w => w.done).length;
  $("#progress-bar").style.width = Math.round((done / total) * 100) + "%";
  $("#progress-text").textContent = `${done} of ${total} weeks complete`;
  const next = Math.min(Math.max(p.last || 1, 1), total);
  const cont = $("#continue");
  cont.href = `lesson.html?week=${next}`;
  cont.textContent = done === 0 ? "Start Week 1 →" : `Continue: Week ${next} →`;

  const root = $("#units");
  CATALOG.forEach(u => {
    const sec = document.createElement("section");
    sec.className = "unit";
    sec.innerHTML = `<div class="unit-head"><span class="tag">${u.course} · Unit ${u.unit}</span><h2 style="margin:0">${escapeHtml(u.name)}</h2></div><div class="week-grid"></div>`;
    const grid = sec.querySelector(".week-grid");
    u.weeks.forEach(([n, title]) => {
      const w = p.weeks[n] || {};
      const a = document.createElement("a");
      a.className = "week";
      a.href = `lesson.html?week=${n}`;
      let status = "Open";
      if (!PUBLISHED.includes(n)) { a.classList.add("soon"); status = "Coming soon"; a.removeAttribute("href"); }
      else if (w.done) { a.classList.add("done"); status = `✓ Passed · ${w.quiz}%`; }
      else if (!isUnlocked(p, n)) { a.classList.add("locked"); status = `🔒 Pass Week ${n - 1} to unlock`; }
      else if (w.quiz) status = `Quiz ${w.quiz}%, need ${PASS}%`;
      a.innerHTML = `<span class="num">Week ${n}</span><span class="title">${escapeHtml(title)}</span><span class="status">${status}</span>`;
      grid.appendChild(a);
    });
    root.appendChild(sec);
  });
}

// ---------- Lesson page ----------
async function renderLesson() {
  const n = parseInt(new URLSearchParams(location.search).get("week"), 10) || 1;
  const p = await pullProgress();
  const meta = CATALOG.flatMap(u => u.weeks.map(([w, t]) => ({ w, t, u }))).find(x => x.w === n);
  const root = $("#lesson");
  if (!meta || !PUBLISHED.includes(n)) { root.innerHTML = `<p>This week isn't published yet. <a href="index.html">Back to the course</a>.</p>`; return; }
  if (!isUnlocked(p, n)) { root.innerHTML = `<p>🔒 Pass the Week ${n - 1} quiz with ${PASS}% to unlock this week. <a href="lesson.html?week=${n - 1}">Go to Week ${n - 1}</a>.</p>`; return; }

  let data;
  try { data = await (await fetch(`data/week-${String(n).padStart(2, "0")}.json`, { cache: "no-store" })).json(); }
  catch { root.innerHTML = `<p>Couldn't load this lesson. Try refreshing.</p>`; return; }

  p.last = n; saveProgress(p);
  document.title = `Week ${n}: ${data.title} | Brazilian Portuguese`;
  $("#crumb-unit").textContent = `${meta.u.course} · Unit ${meta.u.unit}: ${meta.u.name}`;

  root.innerHTML = `
    <header class="lesson-head">
      <h1>Week ${n}: ${escapeHtml(data.title)}</h1>
      <p>${rich(data.summary || "")}</p>
      <div class="card objectives"><h3>By the end of this week you can</h3><ul>${data.objectives.map(o => `<li>${rich(o)}</li>`).join("")}</ul></div>
    </header>
    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="learn">📖 Lesson</button>
      <button class="tab" data-tab="drills">✍️ Drills</button>
      <button class="tab" data-tab="cards">🃏 Flashcards</button>
      <button class="tab" data-tab="quiz">✅ Quiz</button>
      <button class="tab" data-tab="tutor">💬 Tutor</button>
    </div>
    <div class="panel" id="tab-learn"></div>
    <div class="panel" id="tab-drills" hidden></div>
    <div class="panel" id="tab-cards" hidden></div>
    <div class="panel" id="tab-quiz" hidden></div>
    <div class="panel" id="tab-tutor" hidden></div>
    <nav style="display:flex;justify-content:space-between;margin-top:40px">
      ${n > 1 ? `<a class="btn" href="lesson.html?week=${n - 1}">← Week ${n - 1}</a>` : "<span></span>"}
      <a class="btn" href="index.html">Course home</a>
    </nav>`;

  root.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    root.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    root.querySelectorAll(".panel").forEach(x => { x.hidden = x.id !== "tab-" + t.dataset.tab; });
  }));

  renderSections($("#tab-learn"), data.sections);
  renderDrills($("#tab-drills"), data.drills, n);
  renderCards($("#tab-cards"), data.flashcards);
  renderQuiz($("#tab-quiz"), data.quiz, n);
  renderTutor($("#tab-tutor"), data, n);
}

const LABELS = { grammar: "Grammar & conjugation", structure: "Structure", vocab: "Vocabulary", nuance: "Nuance", slang: "Slang (gíria)", pronunciation: "Pronunciation" };
function renderSections(el, sections) {
  sections.forEach(s => {
    const div = document.createElement("div");
    div.className = "section";
    let html = `<span class="section-label label-${s.kind === "pronunciation" ? "structure" : s.kind}">${LABELS[s.kind] || s.kind}</span>`;
    if (s.heading) html += `<h3>${rich(s.heading)}</h3>`;
    (s.paragraphs || []).forEach(t => { html += `<p>${rich(t)}</p>`; });
    if (s.bullets) html += `<ul>${s.bullets.map(b => `<li>${rich(b)}</li>`).join("")}</ul>`;
    if (s.table) {
      html += `<div class="table-wrap"><table><thead><tr>${s.table.columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${
        s.table.rows.map(r => `<tr>${r.map(c => `<td>${rich(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    if (s.phrases) {
      html += `<div class="phrase-list">${s.phrases.map(([pt, en]) =>
        `<div class="phrase"><button type="button" class="say" data-say="${escapeHtml(pt)}">${escapeHtml(pt)}</button><span class="en">${escapeHtml(en)}</span></div>`).join("")}</div>`;
    }
    div.innerHTML = html;
    el.appendChild(div);
  });
}

function renderDrills(el, drills, n) {
  let order = shuffle(drills), i = 0, right = 0;
  el.innerHTML = `<div class="card drill">
      <span class="counter" id="d-count"></span>
      <div class="drill-prompt" id="d-prompt"></div>
      <div class="muted" id="d-note"></div>
      <div class="drill-row"><input id="d-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the Portuguese…"><button class="btn primary" id="d-check">Check</button></div>
      <div class="feedback" id="d-feedback"></div>
    </div>`;
  const input = $("#d-input"), fb = $("#d-feedback");
  function show() {
    if (i >= order.length) {
      const pct = Math.round((right / order.length) * 100);
      const p = loadProgress(); p.weeks[n] = { ...(p.weeks[n] || {}), drills: Math.max(pct, (p.weeks[n] || {}).drills || 0) }; saveProgress(p);
      el.querySelector(".drill").innerHTML = `<div class="drill-prompt">Drills done: ${right} / ${order.length} (${pct}%)</div><button class="btn primary" id="d-again">Go again</button>`;
      $("#d-again").addEventListener("click", () => renderDrills((el.innerHTML = "", el), drills, n));
      return;
    }
    const d = order[i];
    $("#d-count").textContent = `${i + 1} of ${order.length}`;
    $("#d-prompt").innerHTML = rich(d.prompt);
    $("#d-note").innerHTML = d.note ? rich(d.note) : "";
    input.value = ""; fb.textContent = ""; fb.className = "feedback"; input.disabled = false; input.focus();
    $("#d-check").textContent = "Check";
  }
  let checked = false;
  function act() {
    const d = order[i];
    if (checked) { checked = false; i++; show(); return; }
    if (!input.value.trim()) return;
    const result = check(input.value, d.answer);
    const answer = Array.isArray(d.answer) ? d.answer[0] : d.answer;
    if (result === "good") { right++; fb.textContent = "✓ Correct!"; }
    else if (result === "close") { right++; fb.textContent = `Almost! Watch the accents: ${answer}`; }
    else fb.textContent = `✗ It's: ${answer}`;
    fb.className = "feedback " + result;
    speak(answer);
    checked = true; input.disabled = true; $("#d-check").textContent = "Next →"; $("#d-check").focus();
  }
  $("#d-check").addEventListener("click", act);
  input.addEventListener("keydown", e => { if (e.key === "Enter") act(); });
  show();
}

function renderCards(el, cards) {
  let order = shuffle(cards), i = 0, flipped = false;
  el.innerHTML = `<div class="card flashcard" id="fc"></div>
    <div class="card-actions">
      <button class="btn" id="fc-hear">🔊 Hear it</button>
      ${Recognition ? `<button class="btn" id="fc-say">🎙️ Say it</button>` : ""}
      <button class="btn primary" id="fc-next">Next card →</button>
    </div>
    <p class="feedback" id="fc-fb" style="text-align:center;margin-top:10px"></p>`;
  const fc = $("#fc"), fb = $("#fc-fb");
  function show() {
    const c = order[i % order.length];
    fc.innerHTML = flipped ? `${escapeHtml(c[1])}<span class="hint">tap to flip back</span>` : `${escapeHtml(c[0])}<span class="hint">tap to see the meaning · ${i % order.length + 1} of ${order.length}</span>`;
  }
  fc.addEventListener("click", () => { flipped = !flipped; show(); });
  $("#fc-next").addEventListener("click", () => { i++; flipped = false; fb.textContent = ""; show(); });
  $("#fc-hear").addEventListener("click", () => speak(order[i % order.length][0]));
  const sayBtn = $("#fc-say");
  if (sayBtn) sayBtn.addEventListener("click", () => {
    fb.className = "feedback"; fb.textContent = "Listening…";
    listen(heard => {
      const target = order[i % order.length][0];
      const ok = heard.some(h => check(h, target) !== "bad");
      fb.className = "feedback " + (ok ? "good" : "bad");
      fb.textContent = ok ? "✓ Sounded right!" : heard.length ? `I heard: "${heard[0]}". Try again.` : "Didn't catch that. Try again.";
    });
  });
  show();
}

function renderQuiz(el, quiz, n) {
  const best = (loadProgress().weeks[n] || {}).quiz;
  el.innerHTML = `<p class="muted">Score ${PASS}% or higher to pass this week and unlock the next one.${best ? ` Your best: ${best}%.` : ""}</p><div id="q-list"></div>
    <button class="btn primary" id="q-submit" style="margin-top:20px">Submit quiz</button><div class="score" id="q-score"></div>`;
  const list = $("#q-list");
  quiz.forEach((q, qi) => {
    const div = document.createElement("div");
    div.className = "question card";
    if (q.choices) {
      div.innerHTML = `<p>${qi + 1}. ${rich(q.q)}</p><div class="choices">${q.choices.map((c, ci) => `<button type="button" class="choice" data-ci="${ci}">${rich(c)}</button>`).join("")}</div>`;
      div.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => {
        div.querySelectorAll(".choice").forEach(x => x.classList.remove("picked")); b.classList.add("picked");
      }));
    } else {
      div.innerHTML = `<p>${qi + 1}. ${rich(q.q)}</p><div class="drill-row"><input autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Your answer"></div><div class="feedback"></div>`;
    }
    list.appendChild(div);
  });
  $("#q-submit").addEventListener("click", () => {
    let right = 0;
    [...list.children].forEach((div, qi) => {
      const q = quiz[qi];
      if (q.choices) {
        const picked = div.querySelector(".choice.picked");
        div.querySelectorAll(".choice").forEach(b => { if (+b.dataset.ci === q.answer) b.classList.add("right"); });
        if (picked && +picked.dataset.ci === q.answer) right++; else if (picked) picked.classList.add("wrong");
      } else {
        const input = div.querySelector("input"), fb = div.querySelector(".feedback");
        const result = check(input.value, q.answers);
        if (result !== "bad") right++;
        fb.className = "feedback " + result;
        fb.textContent = result === "good" ? "✓" : result === "close" ? `Almost, watch the accents: ${q.answers[0]}` : `✗ ${q.answers[0]}`;
      }
    });
    const pct = Math.round((right / quiz.length) * 100);
    const p = loadProgress(); const w = p.weeks[n] || {};
    p.weeks[n] = { ...w, quiz: Math.max(pct, w.quiz || 0), done: w.done || pct >= PASS };
    saveProgress(p);
    $("#q-score").innerHTML = pct >= PASS
      ? `🎉 ${pct}%. Passed! ${PUBLISHED.includes(n + 1) ? `<a class="btn primary" href="lesson.html?week=${n + 1}">Start Week ${n + 1} →</a>` : "Next week is coming soon."}`
      : `${pct}%. You need ${PASS}% to pass. Review the lesson and try again.`;
    $("#q-submit").disabled = true;
  });
}

function renderTutor(el, data, n) {
  if (!COURSE_API || !syncKey()) {
    el.innerHTML = `<div class="card"><h3>💬 AI tutor</h3><p>The tutor unlocks with your private sync key (⚙️ in the top bar). Until then, use these prompts with any AI chat:</p><ul>${(data.tutor_prompts || []).map(t => `<li>${rich(t)}</li>`).join("")}</ul></div>`;
    return;
  }
  el.innerHTML = `<div class="card"><div class="tutor-log" id="t-log"></div>
    <div class="drill-row" style="margin-top:12px"><input id="t-input" placeholder="Escreva em português… (or ask in English)" autocomplete="off"><button class="btn primary" id="t-send">Send</button></div>
    <div class="card-actions" style="justify-content:flex-start">${(data.tutor_prompts || []).map(t => `<button class="btn" data-prompt="${escapeHtml(t)}">${escapeHtml(t.length > 48 ? t.slice(0, 48) + "…" : t)}</button>`).join("")}</div></div>`;
  const log = $("#t-log"), input = $("#t-input"), history = [];
  const add = (text, who) => { const d = document.createElement("div"); d.className = "msg " + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  add(`Oi! I'm your tutor for Week ${n}: ${data.title}. Pick a practice prompt below, or just start talking.`, "bot");
  async function send(text) {
    if (!text.trim()) return;
    add(text, "user"); history.push({ role: "user", content: text });
    const wait = add("…", "bot");
    try {
      const res = await fetch(COURSE_API + "tutor", {
        method: "POST", headers: { "Content-Type": "application/json", "x-course-key": syncKey() },
        body: JSON.stringify({ week: n, messages: history.slice(-12) }),
      });
      const out = await res.json();
      wait.textContent = out.reply || out.error || "Something went wrong.";
      if (out.reply) history.push({ role: "assistant", content: out.reply });
    } catch { wait.textContent = "Couldn't reach the tutor. Try again."; }
  }
  $("#t-send").addEventListener("click", () => { send(input.value); input.value = ""; });
  input.addEventListener("keydown", e => { if (e.key === "Enter") { send(input.value); input.value = ""; } });
  el.querySelectorAll("[data-prompt]").forEach(b => b.addEventListener("click", () => send(b.dataset.prompt)));
}

// ---------- Boot ----------
setupSettings();
if ($("#units")) renderDashboard();
if ($("#lesson")) renderLesson();
