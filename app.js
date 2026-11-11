// PARADOX / Volume 01 — original, offline-friendly mystery mechanics.
// No analytics, external model calls, account system, advertising or payment UI.
const STORAGE_KEY = "paradox-casefile-progress-v1";
const DAY_MS = 86_400_000;

export function dailyIndexAt(timestamp, count) {
  if (!Number.isFinite(timestamp) || !Number.isInteger(count) || count < 1) throw new RangeError("Invalid daily case input");
  return ((Math.floor(timestamp / DAY_MS) % count) + count) % count;
}

export function isCorrectPair(pick, answer) {
  return Array.isArray(pick) && Array.isArray(answer)
    && pick.length === 2 && answer.length === 2
    && new Set(pick).size === 2 && new Set(answer).size === 2
    && pick.slice().sort().join("|") === answer.slice().sort().join("|");
}

export function calculateScore(attempts, hints) {
  if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(hints) || hints < 0 || hints > 2)
    throw new RangeError("Invalid score input");
  return Math.max(10, 100 - ((attempts - 1) * 22) - (hints * 13));
}

export function dailyStreak(days, now = new Date()) {
  if (!Array.isArray(days) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return 0;
  const values = new Set(days.filter(x => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)));
  const todayUTC = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
  let current = values.has(todayUTC) ? todayUTC : values.has(yesterday) ? yesterday : null;
  if (current === null) return 0;
  let count = 0;
  let ts = Date.parse(current + "T00:00:00Z");
  while (values.has(new Date(ts).toISOString().slice(0, 10))) {
    count++;
    ts -= DAY_MS;
    if (count > 3650) break;
  }
  return count;
}

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return { solved: {}, dailyDays: [] };
    const solved = data.solved && typeof data.solved === "object" && !Array.isArray(data.solved) ? data.solved : {};
    const dailyDays = Array.isArray(data.dailyDays) ? data.dailyDays : [];
    return { solved, dailyDays };
  } catch { return { solved: {}, dailyDays: [] }; }
}

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch { toast("Your browser cannot save progress; play still works."); }
}

const state = {
  cases: [], index: 0, selected: [], attempts: 0, hintsUsed: 0,
  mode: "daily", solved: false, startedAt: 0, lastScore: 0
};
let progress = { solved: {}, dailyDays: [] };
let toastTimer;
const el = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
function currentCase() { return state.cases[state.index]; }
function utcToday() { return new Date().toISOString().slice(0, 10); }
function cleanUrl() { return new URL(window.location.href); }

function toast(message) {
  const target = el("toast");
  target.textContent = message;
  target.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { target.hidden = true; }, 3300);
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function safeCaseLink(id) {
  const u = cleanUrl();
  u.searchParams.delete("daily");
  u.searchParams.set("case", id);
  u.hash = "";
  return u.toString();
}

function renderArchive() {
  const root = el("case-list");
  root.replaceChildren();
  state.cases.forEach((caseFile, index) => {
    const complete = Boolean(progress.solved[caseFile.id]?.solved);
    const active = index === state.index && state.mode !== "daily";
    const button = element("button", "case-item" + (active ? " active" : "") + (complete ? " closed" : ""));
    button.type = "button";
    button.setAttribute("aria-current", active ? "true" : "false");
    const left = element("span", "case-index", pad(index + 1));
    const middle = element("span", "case-info");
    middle.append(element("span", "case-name", caseFile.title),
                  element("span", "case-difficulty", caseFile.difficulty.toUpperCase()));
    const right = element("span", "case-state", complete ? "✓" : "↗");
    button.append(left, middle, right);
    button.addEventListener("click", () => chooseCase(index, "archive"));
    root.append(button);
  });
  const completed = state.cases.filter(x => progress.solved[x.id]?.solved).length;
  el("archive-count").textContent = pad(completed) + " / " + pad(state.cases.length);
  el("solved-number").textContent = pad(completed);
  el("streak-number").textContent = pad(dailyStreak(progress.dailyDays));
  el("daily-button").classList.toggle("is-active", state.mode === "daily");
  el("daily-note").textContent = "Today's case / #" + pad(dailyIndexAt(Date.now(), state.cases.length) + 1);
}

function updateSelection() {
  const caseFile = currentCase();
  const nodes = el("clue-grid").querySelectorAll(".clue-card");
  for (const button of nodes) {
    const selected = state.selected.includes(button.dataset.clue);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
  ["selection-one", "selection-two"].forEach((id, i) => {
    const root = el(id);
    const clueId = state.selected[i];
    const clue = caseFile.clues.find(x => x.id === clueId);
    root.querySelector("span").textContent = pad(i + 1);
    root.querySelector("strong").textContent = clue ? clue.id + " / " + clue.tag : "NOT SELECTED";
  });
  el("submit-button").disabled = state.selected.length !== 2 || state.solved;
  el("clear-button").disabled = state.selected.length === 0 || state.solved;
  const status = el("dock-status");
  if (state.solved) status.textContent = "Case closed. Reopen another file to keep playing.";
  else if (state.selected.length === 0) status.textContent = "Select two evidence cards to begin.";
  else if (state.selected.length === 1) status.textContent = "One piece selected. Find its impossible counterpart.";
  else status.textContent = "Two pieces selected. Are you ready to lock this verdict?";
}

function toggleClue(id) {
  if (state.solved) return;
  if (state.selected.includes(id)) state.selected = state.selected.filter(x => x !== id);
  else if (state.selected.length === 2) state.selected = [state.selected[1], id];
  else state.selected.push(id);
  updateSelection();
}

function renderEvidence() {
  const root = el("clue-grid");
  root.replaceChildren();
  for (const clue of currentCase().clues) {
    const button = element("button", "clue-card");
    button.type = "button";
    button.dataset.clue = clue.id;
    button.setAttribute("aria-label", "Evidence " + clue.id + ": " + clue.tag + ". " + clue.text);
    button.setAttribute("aria-pressed", "false");
    const top = element("span", "clue-top");
    top.append(element("span", "clue-id", clue.id),
               element("span", "clue-tag", clue.tag));
    button.append(top, element("span", "clue-text", clue.text),
                  element("span", "clue-bottom", "SELECT EVIDENCE  ↗"));
    button.addEventListener("click", () => toggleClue(clue.id));
    root.append(button);
  }
}

function chooseCase(index, mode = "archive", updateLocation = true) {
  if (index < 0 || index >= state.cases.length) return;
  state.index = index;
  state.mode = mode;
  state.selected = [];
  state.attempts = 0;
  state.hintsUsed = 0;
  state.solved = false;
  state.lastScore = 0;
  state.startedAt = performance.now();
  const c = currentCase();
  el("case-reference").textContent = "CASEFILE / " + String(index + 1).padStart(3, "0") + (mode === "daily" ? " · DAILY" : "");
  el("case-category").textContent = "◉ " + c.difficulty.toUpperCase() + " / LOGIC";
  el("case-title").textContent = c.title;
  el("case-hook").textContent = c.hook;
  el("case-scene").textContent = c.scene;
  el("evidence-count").textContent = pad(c.clues.length) + " DOCUMENTS";
  el("hint-copy").textContent = "A good detective knows when to look twice.";
  el("hint-button").disabled = false;
  el("hints-left").textContent = "02 LEFT";
  renderEvidence();
  updateSelection();
  renderArchive();
  if (el("result-dialog").open) el("result-dialog").close();
  if (updateLocation) {
    const u = cleanUrl();
    if (mode === "daily") { u.searchParams.delete("case"); u.searchParams.set("daily", "1"); }
    else { u.searchParams.delete("daily"); u.searchParams.set("case", c.id); }
    u.hash = "";
    window.history.pushState({ case: c.id, mode }, "", u.pathname + u.search);
  }
}

function showResult() {
  const c = currentCase();
  const already = progress.solved[c.id];
  const score = calculateScore(state.attempts, state.hintsUsed);
  state.lastScore = score;
  state.solved = true;
  const elapsed = Math.max(1, Math.round((performance.now() - state.startedAt) / 1000));
  if (!already || !already.solved || score > Number(already.bestScore || 0)) {
    progress.solved[c.id] = { solved: true, bestScore: score, bestHints: state.hintsUsed };
  }
  if (state.mode === "daily" && !progress.dailyDays.includes(utcToday())) {
    progress.dailyDays.push(utcToday());
    if (progress.dailyDays.length > 3700) progress.dailyDays = progress.dailyDays.slice(-3700);
  }
  saveProgress();
  renderArchive();
  updateSelection();
  const box = el("result-dialog");
  el("result-kicker").textContent = "CASE " + pad(state.index + 1) + " / SOLVED";
  el("result-heading").textContent = "You found the fracture.";
  el("result-message").textContent = "Two statements. One impossible reality. The truth held.";
  el("result-why").textContent = c.why;
  const stats = el("result-stats");
  stats.replaceChildren(
    element("span", "", String(score) + " POINTS"),
    element("span", "", String(state.attempts) + " " + (state.attempts === 1 ? "VERDICT" : "VERDICTS")),
    element("span", "", state.hintsUsed + " HINTS"),
    element("span", "", elapsed + " SEC")
  );
  el("share-status").textContent = "";
  if (!box.open) box.showModal();
}

function lockVerdict() {
  if (state.selected.length !== 2 || state.solved) return;
  state.attempts++;
  if (isCorrectPair(state.selected, currentCase().answer)) {
    showResult();
  } else {
    state.selected = [];
    updateSelection();
    el("dock-status").textContent = "Verdict rejected. Those statements can coexist. Look again.";
    toast("Not the contradiction. The case stays open.");
  }
}

function revealHint() {
  if (state.solved || state.hintsUsed >= 2) return;
  const c = currentCase();
  el("hint-copy").textContent = c.hints[state.hintsUsed];
  state.hintsUsed++;
  el("hints-left").textContent = pad(2 - state.hintsUsed) + " LEFT";
  if (state.hintsUsed >= 2) el("hint-button").disabled = true;
}

async function shareChallenge() {
  const c = currentCase();
  const message = "I cracked PARADOX Case #" + pad(state.index + 1) + " — " + c.title
    + " — with " + state.attempts + " verdict" + (state.attempts === 1 ? "" : "s") + "."
    + "\nCan you spot the impossible pair? " + safeCaseLink(c.id);
  try {
    if (navigator.share) { await navigator.share({ title: "PARADOX / " + c.title, text: message }); el("share-status").textContent = "Challenge ready to share."; return; }
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(message); el("share-status").textContent = "Spoiler-free challenge copied."; return; }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  el("share-status").textContent = "Copy this case link: " + safeCaseLink(c.id);
}

function validateCases(cases) {
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > 40) throw new Error("Case archive unavailable");
  const ids = new Set();
  for (const c of cases) {
    if (!c || !/^[a-z0-9-]{4,42}$/.test(c.id) || ids.has(c.id)) throw new Error("Invalid case identifier");
    ids.add(c.id);
    if (typeof c.title !== "string" || typeof c.hook !== "string" || typeof c.scene !== "string"
      || !Array.isArray(c.clues) || c.clues.length < 4 || c.clues.length > 8
      || !Array.isArray(c.answer) || c.answer.length !== 2
      || !Array.isArray(c.hints) || c.hints.length !== 2 || typeof c.why !== "string")
      throw new Error("Invalid case data");
    const available = new Set(c.clues.map(x => x.id));
    if (available.size !== c.clues.length || c.answer[0] === c.answer[1] || !c.answer.every(x => available.has(x)))
      throw new Error("Unsolvable case data");
  }
  return cases;
}

async function initialize() {
  progress = loadProgress();
  try {
    const response = await fetch("./data/cases.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Case archive unavailable");
    state.cases = validateCases(await response.json());
  } catch {
    el("case-title").textContent = "The casefiles could not open.";
    el("case-hook").textContent = "Start this app using its local server and reload. No account or internet API is required.";
    el("case-scene").textContent = "Launch with: python3 server.py --port 0";
    return;
  }
  const u = new URL(window.location.href);
  const id = u.searchParams.get("case");
  const index = id ? state.cases.findIndex(x => x.id === id) : dailyIndexAt(Date.now(), state.cases.length);
  chooseCase(index >= 0 ? index : dailyIndexAt(Date.now(), state.cases.length), id && index >= 0 ? "archive" : "daily", false);
  el("daily-button").addEventListener("click", () => chooseCase(dailyIndexAt(Date.now(), state.cases.length), "daily"));
  el("submit-button").addEventListener("click", lockVerdict);
  el("clear-button").addEventListener("click", () => { state.selected = []; updateSelection(); });
  el("hint-button").addEventListener("click", revealHint);
  el("next-button").addEventListener("click", () => chooseCase((state.index + 1) % state.cases.length, "archive"));
  el("share-button").addEventListener("click", shareChallenge);
  el("how-button").addEventListener("click", () => el("how-dialog").showModal());
  el("how-start").addEventListener("click", () => el("how-dialog").close());
  el("reset-button").addEventListener("click", () => {
    if (window.confirm("Reset all solved cases and your daily streak on this device? This cannot be undone.")) {
      progress = { solved: {}, dailyDays: [] };
      saveProgress();
      chooseCase(state.index, state.mode, false);
      toast("Your local progress is reset.");
    }
  });
  window.addEventListener("popstate", () => {
    const url = new URL(location.href);
    const item = state.cases.findIndex(x => x.id === url.searchParams.get("case"));
    chooseCase(item >= 0 ? item : dailyIndexAt(Date.now(), state.cases.length), item >= 0 ? "archive" : "daily", false);
  });
}
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initialize);
}
