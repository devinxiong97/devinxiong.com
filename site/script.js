// ---------- Theme toggle (remembers choice, defaults to OS setting) ----------
const root = document.documentElement;
const savedTheme = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
root.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");

document.getElementById("theme-toggle").addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch {}
});

// ---------- Typed role line ----------
const roles = [
  "Senior IT Support Analyst",
  "Identity & Access (Okta, Entra ID)",
  "Endpoint Management (Jamf, Windows)",
  "Automation with PowerShell, Python & AI",
];
const typed = document.getElementById("typed");
let roleIdx = 0, charIdx = 0, deleting = false;

function typeLoop() {
  const word = roles[roleIdx];
  typed.textContent = word.slice(0, charIdx);
  if (!deleting && charIdx < word.length) charIdx++;
  else if (deleting && charIdx > 0) charIdx--;
  else if (!deleting) { deleting = true; return setTimeout(typeLoop, 1600); }
  else { deleting = false; roleIdx = (roleIdx + 1) % roles.length; }
  setTimeout(typeLoop, deleting ? 35 : 65);
}
typeLoop();

// ---------- Count-up stats ----------
document.querySelectorAll("[data-count]").forEach(el => {
  const target = +el.dataset.count;
  const start = performance.now();
  const duration = 1200;
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});

// ---------- Scroll reveal ----------
const revealer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("visible"); revealer.unobserve(e.target); }
  });
}, { threshold: 0.1 });
document.querySelectorAll(".reveal").forEach(el => revealer.observe(el));

// ---------- Skill chips highlight matching experience bullets ----------
const page = document.body;
const chips = document.querySelectorAll(".skill-group .chip");
const bullets = document.querySelectorAll(".job li, .ai-card, .project-card");

chips.forEach(chip => {
  chip.addEventListener("click", () => {
    const wasActive = chip.classList.contains("active");
    chips.forEach(c => c.classList.remove("active"));
    document.querySelectorAll(".job").forEach(j => j.classList.remove("has-match"));
    bullets.forEach(b => b.classList.remove("match"));

    if (wasActive) { page.classList.remove("filtering"); return; }

    chip.classList.add("active");
    page.classList.add("filtering");
    const term = chip.dataset.match.toLowerCase();
    let first = null;
    bullets.forEach(b => {
      if (b.textContent.toLowerCase().includes(term)) {
        b.classList.add("match");
        const job = b.closest(".job");
        if (job) job.classList.add("has-match");
        first = first || b;
      }
    });
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

// ---------- Active nav link on scroll ----------
const navLinks = document.querySelectorAll(".nav nav a");
const sectionSpy = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }
  });
}, { rootMargin: "-40% 0px -55% 0px" });
document.querySelectorAll("section[id]").forEach(s => sectionSpy.observe(s));

// ---------- Footer year ----------
document.getElementById("year").textContent = "© " + new Date().getFullYear();

// ---------- Chatbot ----------
// Paste your Lambda Function URL here. The chat button stays hidden until it's set.
const CHAT_API = "https://e3ubcamxxls34duz4qzcs46fxe0iinud.lambda-url.us-east-2.on.aws/";

if (CHAT_API) {
  const toggle = document.getElementById("chat-toggle");
  const panel = document.getElementById("chat-panel");
  const log = document.getElementById("chat-log");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const history = [];

  toggle.hidden = false;
  toggle.addEventListener("click", () => { panel.hidden = false; toggle.hidden = true; input.focus(); });
  document.getElementById("chat-close").addEventListener("click", () => { panel.hidden = true; toggle.hidden = false; });

  function addMessage(text, who) {
    const div = document.createElement("div");
    div.className = "msg " + who;
    div.textContent = text;  // textContent, never innerHTML, so replies can't inject code
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    ask(question);
  });

  log.querySelectorAll("[data-ask]").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".chat-samples").remove();
      ask(btn.dataset.ask);
    });
  });

  // Builds the mock-ticket card with textContent only, so model output can't inject HTML.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderTicket(t) {
    const card = el("div", "ticket");
    card.appendChild(el("div", "ticket-label", "Demo ticket · Devin's IT Service Agent approach"));

    const tags = el("div", "ticket-tags");
    const level = /^P[1-4]$/.test(t.priority) ? t.priority : "P3";
    tags.appendChild(el("span", "badge " + level.toLowerCase(), level));
    tags.appendChild(el("span", "badge cat", t.category));
    card.appendChild(tags);

    card.appendChild(el("p", "ticket-issue", "“" + t.issue + "”"));
    card.appendChild(el("p", "ticket-reason", t.priority_reason));
    card.appendChild(el("p", "ticket-summary", t.summary));

    const steps = el("ol", "ticket-steps");
    (t.steps || []).forEach(s => steps.appendChild(el("li", null, s)));
    card.appendChild(steps);

    if (/^[\w.-]+$/.test(t.related_repo || "")) {
      const link = el("a", "ticket-link", "Related project: " + t.related_repo + " →");
      link.href = "https://github.com/devinxiong97/" + t.related_repo;
      link.target = "_blank";
      link.rel = "noopener";
      card.appendChild(link);
    }

    log.appendChild(card);
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function ask(question) {
    input.disabled = true;
    addMessage(question, "user");
    const typing = addMessage("Thinking…", "bot typing");

    try {
      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: history.slice(-6) }),
      });
      const data = await res.json();
      typing.remove();
      if (data.ticket) {
        renderTicket(data.ticket);
        history.push({ role: "user", content: question }, { role: "assistant", content: "Mock ticket demo: " + data.ticket.summary });
      } else {
        const answer = data.answer || data.error || "Something went wrong. Please try again.";
        addMessage(answer, "bot");
        if (data.answer) history.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
      }
    } catch {
      typing.remove();
      addMessage("I couldn't connect. Please try again, or email Devin at devin.xiong97@outlook.com.", "bot");
    } finally {
      input.disabled = false;
      input.focus();
    }
  }
}

// ---------- Site stats (visit counter) ----------
// /api/visit is served on this same domain through CloudFront, which adds the
// visitor's country code. Each browser session counts once; refreshes only read.
// The section stays hidden if the counter can't be reached (e.g. local preview).
(async () => {
  const section = document.getElementById("site-stats");
  let counted = false;
  try { counted = sessionStorage.getItem("visit-counted") === "1"; } catch {}

  try {
    const res = await fetch("/api/visit?count=" + (counted ? "0" : "1"), { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    try { sessionStorage.setItem("visit-counted", "1"); } catch {}

    document.getElementById("visit-total").textContent = (data.total || 0).toLocaleString();
    document.getElementById("visit-countries").textContent = (data.country_count || 0).toLocaleString();

    let names = null;
    try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch {}
    const flag = code => /^[A-Z]{2}$/.test(code) && code !== "XX"
      ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))
      : "🌐";
    const countryName = code => {
      if (code === "XX") return "Unknown";
      try { return (names && names.of(code)) || code; } catch { return code; }
    };

    const list = document.getElementById("country-list");
    const countries = Array.isArray(data.countries) ? data.countries : [];
    const max = Math.max(1, ...countries.map(c => c.visits || 0));
    countries.forEach(c => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "country-name";
      name.textContent = flag(c.code) + " " + countryName(c.code);
      const bar = document.createElement("span");
      bar.className = "country-bar";
      const fill = document.createElement("span");
      fill.style.width = Math.round((c.visits / max) * 100) + "%";
      bar.appendChild(fill);
      const count = document.createElement("span");
      count.className = "country-count";
      count.textContent = (c.visits || 0).toLocaleString();
      li.append(name, bar, count);
      list.appendChild(li);
    });

    section.hidden = false;
  } catch {}
})();