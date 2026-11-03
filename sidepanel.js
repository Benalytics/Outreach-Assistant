import { SEGMENTS, BODY_LIMIT, makeDraft, guessSegment, footer, makeFollowUp, FOLLOWUP_LIMIT, textLength, allowedStyles } from "./lib/templates.js";
import { LANGS, pickLang } from "./lib/i18n.js";
import { SUBJECT_STYLES, OPENER_STYLES, pickStyle } from "./lib/learn.js";
import { parseResearch, SIGN_LABELS } from "./lib/research.js";
import { STRICT } from "./lib/country.js";
import { toCsv } from "./lib/csv.js";
import { LEAD_COLUMNS } from "./lib/sheets.js";
import { scoreLead } from "./lib/score.js";

const $ = (id) => document.getElementById(id);

function send(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      res?.ok ? resolve(res.data) : reject(new Error(res?.error || "Something went wrong"));
    });
  });
}

let toastTimer;
function toast(text, kind = "ok") {
  const el = $("toast");
  $("toast-text").textContent = text;
  el.className = kind;
  el.querySelector("use").setAttribute("href", kind === "err" ? "#i-alert" : "#i-check");
  el.hidden = true;
  void el.offsetWidth; // replays the slide-in
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, kind === "err" ? 7000 : 4500);
}
$("toast").addEventListener("click", () => { $("toast").hidden = true; });

async function withBusy(button, fn) {
  button.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, "err"); } finally { button.disabled = false; }
}

// ---------- steps (tabs) and the "Next step" guide ----------
const currentTab = () => document.querySelector(".tab.active")?.dataset.tab;
function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "leads") { loadCaptures(true); if ($("saved-card").open) loadLeads(); }
  if (name === "analytics") loadAnalytics();
  if (name === "compose") { loadProfile(); if (!ready.length && !fus.length) loadReady(); }
  window.scrollTo({ top: 0 });
  updateGuide();
}
// Opens a step and points at one card in it.
function goTo(tab, cardId) {
  if (currentTab() !== tab) showTab(tab);
  const c = cardId && $(cardId);
  if (!c) return;
  if (c.tagName === "DETAILS") c.open = true;
  setTimeout(() => {
    c.scrollIntoView({ behavior: "smooth", block: "start" });
    c.classList.remove("flash");
    void c.offsetWidth;
    c.classList.add("flash");
  }, 60);
}
document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]"); if (g) showTab(g.dataset.goto); });

let st = {};            // the latest status from the background
let guideTarget = null;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function nextStep() {
  if (!st.signedIn) return ["Sign in with Google, so the tool can save your leads and send email from your Gmail.", "setup", "card-google"];
  if (!st.sheet) return ["Create your leads sheet. It takes one click.", "setup", "sheet-card"];
  if (!st.hasProfile) return ["Add your name and mailing address. They go under every email.", "setup", "profile-card"];
  const readyCaps = caps.filter((c) => c.status === "ready").length;
  if (readyCaps) return [`${plural(readyCaps, "new lead")} ready. Tick the good ones and save them to your sheet.`, "leads", "captured-card"];
  if (fus.length) return [`${plural(fus.length, "follow-up")} due. They're written for you.`, "compose", "fu-card", "fu"];
  if (ready.length) return [`${plural(ready.length, "lead")} waiting for a first email. Your best ones come first.`, "compose", "new-card", "new"];
  if (job?.status === "running") return ["Automatic search is running. New leads show up in Your leads as they're found.", "leads", "captured-card"];
  if (!caps.length) return ["Find your first leads: capture the page you're on, or start an automatic search.", "leads", "methods"];
  return ["All caught up. Find more leads, or see how your emails are doing.", "leads", "methods"];
}
function updateGuide() {
  if (st.signedIn === undefined) return;
  const [text, tab, card, view] = nextStep();
  guideTarget = { tab, card, view };
  $("guide").hidden = false;
  $("guide-text").textContent = text;
  $("guide-go").firstChild.textContent = currentTab() === tab ? "Show me" : "Go";
}
$("guide-go").addEventListener("click", () => {
  if (!guideTarget) return;
  if (guideTarget.view) setComposeView(guideTarget.view);
  goTo(guideTarget.tab, guideTarget.card);
});

// ---------- help ----------
$("btn-help").addEventListener("click", () => $("help").showModal());
$("help-close").addEventListener("click", () => $("help").close());
$("help").addEventListener("click", (e) => { if (e.target === $("help")) $("help").close(); });

function pill(id, on, onText, offText, optional) {
  $(id).textContent = on ? onText : offText;
  $(id).className = `pill ${on ? "on" : optional ? "off" : ""}`;
}
function render(state) {
  st = state;
  pill("pill-google", state.signedIn, "Done", "To do");
  pill("pill-sheet", !!state.sheet, "Done", "To do");
  pill("pill-profile", state.hasProfile, "Done", "To do");
  pill("pill-hunter", state.hasHunterKey, "On", "Off", true);
  pill("pill-apollo", state.hasApolloKey, "On", "Off", true);
  pill("pill-deepl", state.hasDeeplKey, "On", "Off", true);
  pill("pill-lookup", state.useLookup !== false || state.useJobCheck !== false, "On", "Off", true);
  const done = [state.signedIn, !!state.sheet, state.hasProfile].filter(Boolean).length;
  $("setup-bar").style.width = `${(done / 3) * 100}%`;
  $("setup-progress").textContent = done === 3 ? "All set. Head to Find leads whenever you're ready." : `${done} of 3 done`;
  document.querySelector('.tab[data-tab="setup"]').classList.toggle("done", done === 3);
  $("pip-analytics").textContent = state.unread ? String(state.unread) : "";
  $("profile-missing").hidden = !!state.hasProfile;
  $("use-lookup").checked = state.useLookup !== false;
  $("use-job-check").checked = state.useJobCheck !== false;
  $("lookup-status").textContent = `${state.searchesLeft} of ${state.dailySearches} look-ups left today. Each lead uses up to two. They reset every day.`;
  $("auth-status").textContent = state.signedIn ? `Signed in as ${state.userEmail || "your Google account"}` : "Not signed in yet. A Google window opens and asks you to allow access.";
  $("btn-signin").hidden = state.signedIn;
  $("send-from-box").hidden = !state.signedIn;
  if (state.signedIn && !sendAsLoaded) loadSendAs();
  $("btn-signout").hidden = !state.signedIn;
  $("sheet-card").style.opacity = state.signedIn ? 1 : 0.5;
  $("sheet-card").querySelectorAll("button, input").forEach((el) => { el.disabled = !state.signedIn; });
  $("apollo-status").textContent = state.hasApolloKey ? "Apollo key saved. Use it under Find leads, then Apollo." : "Paste your Apollo API key. It stays in this browser only.";
  $("use-hunter").checked = state.useHunter !== false;
  $("use-hunter-search").checked = state.useHunterSearch !== false;
  if (!state.hasHunterKey) { $("hunter-status").textContent = "Paste your Hunter API key. It stays in this browser only."; hunterShown = false; }
  else if (!hunterShown) { hunterShown = true; showHunterCredits(); }
  deeplOn = !!state.hasDeeplKey;
  $("btn-d-deepl").hidden = !deeplOn;
  $("btn-fu-deepl").hidden = !deeplOn;
  $("deepl-formal").value = state.deeplFormal === false ? "0" : "1";
  if (!deeplOn) { $("deepl-status").textContent = "Paste your DeepL API key. It stays in this browser only."; deeplShown = false; }
  else if (!deeplShown) { deeplShown = true; showDeeplUsage(); }
  $("sheet-connected").hidden = !state.sheet;
  $("sheet-setup").hidden = !!state.sheet;
  if (state.sheet) {
    $("sheet-link").textContent = state.sheet.title;
    $("sheet-link").href = state.sheet.url;
  }
  updateGuide();
}

async function refresh() {
  try { render(await send("status")); } catch (e) { toast(e.message, "err"); }
}

$("btn-signin").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const { userEmail } = await send("signIn");
  toast(`Signed in as ${userEmail}`);
  await refresh();
}));

$("btn-signout").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  await send("signOut");
  sendAsLoaded = false;
  await refresh();
}));

// ---------- which address emails go out as ----------
let sendAsLoaded = false;
async function loadSendAs() {
  sendAsLoaded = true;
  const sel = $("send-from");
  try {
    const { list, sendFrom, userEmail } = await send("sendAs");
    sel.replaceChildren();
    const all = list.length ? list : [{ email: userEmail, name: "", primary: true }];
    for (const a of all) {
      const o = document.createElement("option");
      o.value = a.primary ? "" : a.email;
      o.textContent = `${a.email}${a.name ? ` (${a.name})` : ""}${a.primary ? " · your Gmail" : ""}`;
      sel.append(o);
    }
    sel.value = sendFrom && all.some((a) => a.email === sendFrom) ? sendFrom : "";
    $("send-from-hint").firstChild.textContent = all.length > 1
      ? "These are the addresses Gmail lets this account send as. Replies go to the address you pick. To add another, use Gmail's Settings, See all settings, Accounts and Import, Send mail as, then "
      : "To send as another address you own, such as your business email, add it in Gmail first: Settings, See all settings, Accounts and Import, Send mail as. Then ";
  } catch (e) {
    sel.replaceChildren(Object.assign(document.createElement("option"), { value: "", textContent: st.userEmail || "Your Gmail address" }));
    $("send-from-hint").firstChild.textContent = `${e.message} `;
  }
}
$("send-from").addEventListener("change", async (e) => {
  try {
    await send("setSendFrom", { email: e.target.value });
    toast(`Emails will go out from ${e.target.value || st.userEmail}`);
  } catch (err) { toast(err.message, "err"); loadSendAs(); }
});
$("btn-send-from-refresh").addEventListener("click", (e) => withBusy(e.currentTarget, async () => { await loadSendAs(); toast("List updated"); }));

$("btn-sheet-create").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const { sheet } = await send("createSheet", { title: "Outreach Leads" });
  toast(`Created "${sheet.title}"`);
  await refresh();
}));

$("btn-sheet-connect").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const { sheet } = await send("connectSheet", { input: $("sheet-input").value });
  $("sheet-input").value = "";
  toast(`Connected to "${sheet.title}"`);
  await refresh();
}));

$("btn-sheet-disconnect").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  await send("disconnectSheet");
  await refresh();
}));

$("lead-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const lead = Object.fromEntries(new FormData(form).entries());
  lead.Source = "Manual";
  withBusy(form.querySelector("button"), async () => {
    const { leads: [checked] } = await send("verify", { leads: [lead] });
    if (checked.Verification === "Invalid") { toast(`Not saved: ${checked.verifyReason}`, "err"); return; }
    const { added } = await send("addLeads", { leads: [clean(checked)] });
    if (added) { toast(`Saved to your sheet (${checked.Verification}: ${checked.verifyReason})`); form.reset(); if ($("saved-card").open) loadLeads(); loadReady(); }
    else toast("That email is already in your sheet", "err");
  });
});

// ---------- Apollo key ----------
$("btn-apollo-save").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  await send("saveApolloKey", { key: $("apollo-key").value });
  $("apollo-key").value = "";
  toast("Apollo key saved");
  await refresh();
}));

// ---------- Hunter key ----------
let hunterShown = false;
function creditText(a) {
  const parts = [];
  if (a.verificationsLeft != null) parts.push(`${a.verificationsLeft} verifications`);
  if (a.searchesLeft != null) parts.push(`${a.searchesLeft} searches`);
  return `Hunter key saved${a.plan ? ` (${a.plan} plan)` : ""}.${parts.length ? ` Left this month: ${parts.join(", ")}.` : ""}`;
}
async function showHunterCredits() {
  try { $("hunter-status").textContent = creditText((await send("hunterCredits")).account); }
  catch (e) { $("hunter-status").textContent = `Hunter key saved, but: ${e.message}`; }
}
$("btn-hunter-save").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const key = $("hunter-key").value;
  const r = await send("saveHunterKey", { key });
  $("hunter-key").value = "";
  if (r.account) { $("hunter-status").textContent = creditText(r.account); toast("Hunter key saved and working"); }
  else toast("Hunter key removed");
  hunterShown = !!r.account;
  await refresh();
}));
$("use-hunter").addEventListener("change", (e) => send("setUseHunter", { on: e.target.checked }));
$("use-hunter-search").addEventListener("change", (e) => send("setUseHunterSearch", { on: e.target.checked }));
$("use-lookup").addEventListener("change", async (e) => { await send("setUseLookup", { on: e.target.checked }); refresh(); });
$("use-job-check").addEventListener("change", async (e) => { await send("setUseJobCheck", { on: e.target.checked }); refresh(); });

// ---------- DeepL key ----------
let deeplOn = false;
let deeplShown = false;
const usageText = (u) => `DeepL key saved. ${u.used.toLocaleString()} of ${u.limit.toLocaleString()} characters used this month.`;
async function showDeeplUsage() {
  try { $("deepl-status").textContent = usageText((await send("deeplUsage")).usage); }
  catch (e) { $("deepl-status").textContent = `DeepL key saved, but: ${e.message}`; }
}
$("btn-deepl-save").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const r = await send("saveDeeplKey", { key: $("deepl-key").value });
  $("deepl-key").value = "";
  if (r.usage) { $("deepl-status").textContent = usageText(r.usage); toast("DeepL key saved and working"); }
  else toast("DeepL key removed");
  deeplShown = !!r.usage;
  await refresh();
}));
$("deepl-formal").addEventListener("change", (e) => send("setDeeplFormal", { on: e.target.value === "1" }));

// ---------- Captured (everything captured, by hand, automatically or from Apollo) ----------
const clean = (l) => { const { verifyReason, apolloStatus, hunterStatus, picked, offDomain, ...rest } = l; return rest; };
let caps = [];
let capFilter = "all";
const picks = new Map(); // "id|email" -> ticked
const STATUS_TEXT = { new: "Waiting", checking: "Checking", ready: "Ready", needs_website: "Needs website", no_email: "No email found", saved: "Saved", error: "Problem" };
const goodEmail = (l) => !l.offDomain && (l.Verification === "Verified" || l.Verification === "Valid");
const isPicked = (c, l) => { const k = `${c.id}|${l.Email}`; return picks.has(k) ? picks.get(k) : goodEmail(l); };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A short line about what was found on their website.
function researchLine(r) {
  if (!r) return "";
  return [
    r.titles?.length ? `📚 ${r.titles.join(", ")}` : "",
    [...(r.genres || []), r.ages].filter(Boolean).join(", "),
    (r.signs || []).map((k) => SIGN_LABELS[k]).join(", "),
    r.jobs?.length ? `💼 ${r.jobs.map((j) => j.title).join(", ")}` : "",
    r.quote ? `“${r.quote}”` : "",
  ].filter(Boolean).join(" · ");
}

// Initials in a coloured circle, the colour fixed per name.
function avatar(name, cls = "avatar") {
  const a = el("div", cls);
  const words = String(name || "?").replace(/^u\//, "").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  a.textContent = ((words[0]?.[0] || "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  a.style.setProperty("--h", h);
  return a;
}
const scoreClass = (n) => (n >= 60 ? "hi" : n >= 35 ? "mid" : "lo");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };

function tickedCount() {
  let n = 0;
  for (const c of caps) if (c.status === "ready") for (const l of c.leads || []) if (isPicked(c, l)) n++;
  return n;
}
function updateSaveButton() {
  const n = tickedCount();
  $("btn-cap-save").lastChild.textContent = n ? `Save ${n} ticked to my sheet` : "Save ticked to my sheet";
  $("btn-cap-save").disabled = !n;
}

let lastSig = "";
function renderCaptures(force) {
  const list = $("cap-list");
  if (!force && list.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type !== "checkbox") return;
  const inFilter = (c, f) => f === "all" || (f === "working" ? ["new", "checking"].includes(c.status) : f === "no_email" ? ["no_email", "error"].includes(c.status) : c.status === f);
  const shown = caps.filter((c) => inFilter(c, capFilter));
  const top = (c) => Math.max(0, ...(c.leads || []).map((l) => Number(l.Score) || 0));
  if (capFilter === "ready") shown.sort((a, b) => top(b) - top(a)); // best leads first
  const sig = capFilter + JSON.stringify(shown.map((c) => [c.id, c.status, c.step, c.leads?.length, c.website, !!c.research, c.jobs?.length]));
  const readyN = caps.filter((c) => c.status === "ready").length;
  $("pip-leads").textContent = readyN ? String(readyN) : "";
  updateGuide();
  if (!force && sig === lastSig) return;
  lastSig = sig;
  document.querySelectorAll("#cap-filters .chip").forEach((b) => {
    const n = caps.filter((c) => inFilter(c, b.dataset.f)).length;
    b.querySelector("b").textContent = n ? String(n) : "";
  });
  const count = (sts) => caps.filter((c) => sts.includes(c.status)).length;
  $("cap-counts").textContent = caps.length
    ? [`${count(["ready"])} ready to save`, count(["new", "checking"]) && `${count(["new", "checking"])} being checked`, count(["needs_website"]) && `${count(["needs_website"])} need a website`].filter(Boolean).join(" · ")
    : "Each one is checked for you: we find their website and email, check the email works, and look for job posts.";
  list.replaceChildren();
  if (!shown.length) {
    const li = el("li", "cap-empty");
    li.innerHTML = '<svg class="i"><use href="#i-inbox"/></svg>';
    li.append(el("div", "", caps.length ? "Nothing in this list right now." : "No leads yet. Capture a page, start an automatic search, or search Apollo, and they'll show up here."));
    list.append(li);
    updateSaveButton();
    return;
  }
  for (const c of shown.slice(0, 300)) {
    const who = c.business || c.name || host(c.website) || "(no name)";
    const li = el("li", `cap${c.status === "ready" ? " is-ready" : ""}${c.jobs?.length ? " is-job" : ""}`);
    const topRow = el("div", "cap-top");
    const body = el("div", "grow");
    const title = el("div", "cap-name", who);
    if (c.strict) title.append(el("span", "flag", `${c.country}: held back`));
    const meta = el("div", "cap-meta");
    meta.append(el("span", "src", c.source));
    meta.append([c.business && c.name ? c.name : "", c.country, c.handle && c.handle !== c.name ? c.handle : "", c.rating && `★ ${c.rating}${c.reviews ? ` (${c.reviews})` : ""}`, host(c.website)].filter(Boolean).join(" · "));
    body.append(title, meta);
    topRow.append(avatar(c.name || who), body, el("span", `status ${c.status}`, c.status === "checking" && c.step ? "Checking" : STATUS_TEXT[c.status] || c.status));
    li.append(topRow);
    if (c.note && !/^(Hiring|Reddit post):/.test(c.note)) li.append(el("div", "cap-meta", c.note));
    const rs = researchLine({ ...c.research, jobs: [] });
    const extra = [c.lookupVia && c.lookupVia !== "you" && c.website ? `🔎 Website found through ${c.lookupVia}` : "", c.lang && c.lang !== "en" ? `Writes in ${LANGS[c.lang]}` : ""].filter(Boolean).join(" · ");
    if (rs || extra) li.append(el("div", "cap-research", [rs, extra].filter(Boolean).join(" · ")));
    if (c.jobs?.length) {
      const box = el("div", "cap-jobs");
      box.append(el("strong", "", `💼 ${c.jobs.length === 1 ? "Job post" : `${c.jobs.length} job posts`}`));
      for (const j of c.jobs) {
        const a = el("a", "", `${j.title}${j.site ? ` · ${j.site}` : ""}`);
        a.href = j.url || "#";
        a.target = "_blank";
        a.title = j.title;
        box.append(a);
      }
      li.append(box);
    }
    if (c.status === "checking" && c.step) li.append(el("div", "cap-step", c.step));
    if (c.hint) li.append(el("div", "cap-hint", c.hint));
    if (c.error) li.append(el("div", "cap-hint", c.error));

    if (c.status === "ready" && c.leads?.length) {
      const ul = el("ul", "cap-emails");
      for (const l of c.leads) {
        const row = el("li");
        const box = el("input");
        box.type = "checkbox";
        box.checked = isPicked(c, l);
        box.addEventListener("change", () => { picks.set(`${c.id}|${l.Email}`, box.checked); updateSaveButton(); });
        const lb = el("div", "grow");
        const line = el("div", "email", l.Email);
        line.append(el("span", `badge ${l.Verification}`, l.Verification));
        if (l.Score) { const sc = el("span", `score ${scoreClass(Number(l.Score))}`, l.Score); sc.title = `Lead score ${l.Score}/100: ${l.scoreWhy || ""}`; line.append(sc); }
        lb.append(line, el("div", "meta", [l.Name !== c.name ? l.Name : "", l.verifyReason].filter(Boolean).join(" · ")));
        row.append(box, lb);
        ul.append(row);
      }
      li.append(ul);
    }
    if (c.status === "needs_website" || c.status === "no_email") {
      const fix = el("div", "cap-fix");
      const inp = el("input");
      inp.placeholder = c.status === "needs_website" ? "Type their website or email" : "Another website, or an email you found";
      const go = el("button", "btn btn-secondary", "Check");
      go.addEventListener("click", () => withBusy(go, async () => {
        const v = inp.value.trim();
        if (!v) throw new Error("Type a website or an email first.");
        await send("supplyContact", v.includes("@") ? { id: c.id, email: v } : { id: c.id, website: v });
        toast("Checking it now");
        await loadCaptures(true);
      }));
      fix.append(inp, go);
      li.append(fix);
    }
    const acts = el("div", "cap-actions");
    if (c.profileUrl) { const a = el("a", "", "Open where it was found"); a.href = c.profileUrl; a.target = "_blank"; acts.append(a); }
    if (c.status === "needs_website" || c.status === "no_email") {
      const a = el("a", "", "Search the web for them");
      a.href = `https://www.google.com/search?q=${encodeURIComponent([c.name && !/^u\//.test(c.name) ? c.name : c.business, c.note?.replace(/^(Book|Kickstarter project|Hiring|Reddit post): /, "").split(" · ")[0], c.name ? "author website" : "contact email"].filter(Boolean).join(" "))}`;
      a.target = "_blank";
      acts.append(a);
    }
    if (c.status === "error" || c.status === "no_email") { const b = el("button", "link", "Try again"); b.addEventListener("click", async () => { await send("retryCapture", { id: c.id }); loadCaptures(true); }); acts.append(b); }
    const rm = el("button", "link rm", "Remove");
    rm.addEventListener("click", async () => { await send("removeCaptures", { ids: [c.id] }); loadCaptures(true); });
    acts.append(rm);
    li.append(acts);
    list.append(li);
  }
  updateSaveButton();
}

let job = null;
function renderJob() {
  const running = job?.status === "running";
  $("btn-job-start").hidden = running;
  $("job-live").hidden = !running;
  $("job-done").hidden = running || !job?.message;
  if (!job) return;
  if (running) {
    $("job-info").textContent = job.message || "Working…";
    $("job-count").textContent = `${job.ready} of ${job.target} ready · ${job.captured} found`;
    $("job-bar").style.width = `${Math.min(100, Math.round((job.ready / Math.max(1, job.target)) * 100))}%`;
  } else $("job-done").textContent = job.message;
}

async function loadCaptures(force) {
  try {
    const r = await send("captures");
    caps = r.captures;
    const wasRunning = job?.status === "running";
    job = r.job;
    renderCaptures(force);
    renderJob();
    if (wasRunning && job?.status !== "running") refresh();
  } catch (e) { /* panel may be closing */ }
}

$("cap-filters").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  capFilter = b.dataset.f;
  document.querySelectorAll("#cap-filters .chip").forEach((x) => x.classList.toggle("active", x === b));
  renderCaptures(true);
});

$("btn-cap-save").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const chosen = [];
  for (const c of caps) if (c.status === "ready") for (const l of c.leads) if (isPicked(c, l)) chosen.push({ id: c.id, email: l.Email });
  if (!chosen.length) throw new Error("Nothing ticked to save yet.");
  const { added, skipped } = await send("saveCaptured", { picks: chosen });
  toast(`Saved ${added} lead${added === 1 ? "" : "s"} to your sheet${skipped ? `, ${skipped} already there` : ""}. Next: Write & send.`);
  await loadCaptures(true);
  if ($("saved-card").open) loadLeads();
  loadReady();
}));
$("btn-cap-clear-saved").addEventListener("click", async () => { await send("clearCaptures", { statuses: ["saved"] }); loadCaptures(true); });
$("btn-cap-clear-dead").addEventListener("click", async () => { await send("clearCaptures", { statuses: ["no_email", "error"] }); loadCaptures(true); });

// ---------- ways to find leads ----------
const METHODS = ["capture", "auto", "apollo", "manual"];
function setMethod(m) {
  if (!METHODS.includes(m)) m = "capture";
  document.querySelectorAll(".method").forEach((b) => b.classList.toggle("active", b.dataset.m === m));
  for (const k of METHODS) $(`m-${k}`).hidden = k !== m;
  try { localStorage.setItem("method", m); } catch (_) {}
}
document.querySelectorAll(".method").forEach((b) => b.addEventListener("click", () => setMethod(b.dataset.m)));
try { setMethod(localStorage.getItem("method") || "capture"); } catch (_) { setMethod("capture"); }

// Suggestion chips fill the box they belong to.
document.querySelectorAll(".ideas[data-for]").forEach((box) => box.addEventListener("click", (e) => {
  const b = e.target.closest(".idea");
  if (!b) return;
  $(box.dataset.for).value = b.textContent;
  $(box.dataset.for).focus();
}));

// ---------- Capture by hand ----------
async function capture(quiet) {
  const r = await send("capturePage", { quiet });
  if (quiet && !r.added) return;
  const info = $("capture-info");
  info.hidden = false;
  info.textContent = r.added || r.duplicates
    ? `${r.source}: captured ${r.added} new${r.duplicates ? `, ${r.duplicates} already captured` : ""}. ${r.message || ""} They're in Your leads below.`
    : r.message || "Nothing new on this page.";
  await loadCaptures(true);
}
$("btn-capture").addEventListener("click", (e) => withBusy(e.currentTarget, () => capture(false)));
let watchTimer = null;
$("watch").addEventListener("change", (e) => {
  clearInterval(watchTimer);
  if (e.target.checked) {
    watchTimer = setInterval(() => capture(true).catch(() => {}), 4000);
    toast("Capturing every few seconds while you scroll. Untick to stop.");
  }
});

// ---------- Automatic capture ----------
const JOB_SOURCES = ["linkedinjobs", "indeed", "reddit"];
function syncSources() {
  const on = (v) => document.querySelector(`input[name="job-src"][value="${v}"]`)?.checked;
  $("job-words-field").hidden = !JOB_SOURCES.some(on);
  document.querySelectorAll(".src-group").forEach((g) => {
    const boxes = [...g.querySelectorAll('input[name="job-src"]')];
    g.querySelector(".src-all").textContent = boxes.every((b) => b.checked) ? "None" : "All";
  });
}
document.querySelectorAll('input[name="job-src"]').forEach((x) => x.addEventListener("change", syncSources));
document.querySelectorAll(".src-all").forEach((b) => b.addEventListener("click", () => {
  const boxes = [...b.closest(".src-group").querySelectorAll('input[name="job-src"]')];
  const all = boxes.every((x) => x.checked);
  boxes.forEach((x) => { x.checked = !all; });
  syncSources();
}));
$("btn-job-start").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const sources = [...document.querySelectorAll('input[name="job-src"]:checked')].map((x) => x.value);
  await send("jobStart", {
    keyword: $("job-keyword").value, place: $("job-place").value, sources, jobWords: $("job-words").value,
    target: Number($("job-target").value), pagesPerDay: Number($("job-pages").value),
  });
  try { localStorage.setItem("jobForm", JSON.stringify({ k: $("job-keyword").value, p: $("job-place").value, s: sources, w: $("job-words").value, t: $("job-target").value, n: $("job-pages").value })); } catch (_) {}
  toast("Automatic search started in a small separate window. Leave it open.");
  await loadCaptures(true);
}));
$("btn-job-stop").addEventListener("click", (e) => withBusy(e.currentTarget, async () => { await send("jobStop"); await loadCaptures(true); }));
try {
  const f = JSON.parse(localStorage.getItem("jobForm") || "null");
  if (f) {
    $("job-keyword").value = f.k || ""; $("job-place").value = f.p || ""; $("job-target").value = f.t || 30; $("job-pages").value = f.n || 40; $("job-words").value = f.w || "";
    const known = new Set([...document.querySelectorAll('input[name="job-src"]')].map((x) => x.value));
    const saved = (f.s || []).filter((v) => known.has(v)); // Yelp and Trustpilot are no longer here
    if (saved.length) document.querySelectorAll('input[name="job-src"]').forEach((x) => { x.checked = saved.includes(x.value); });
  }
} catch (_) {}
syncSources();

// Your leads refresh every few seconds while you're on Find leads, and now and then otherwise (for the counts).
let tick = 0;
setInterval(() => {
  tick++;
  if (document.hidden) return;
  if (currentTab() === "leads" || tick % 5 === 0) loadCaptures(false);
}, 3000);

// ---------- Full page ----------
if (new URLSearchParams(location.search).get("full")) document.body.classList.add("full");
$("btn-full").addEventListener("click", () => send("openDashboard"));

// ---------- Apollo search ----------
// The keyword box is free text. The suggestions under it fill in a keyword and job titles to start from.
$("apollo-ideas").addEventListener("click", (e) => {
  const b = e.target.closest(".idea");
  if (!b) return;
  $("apollo-q").value = b.dataset.q;
  $("apollo-titles").value = b.dataset.t;
});
$("apollo-q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("btn-apollo-search").click(); });

let apolloPage = 1;
let apolloPeople = [];

async function runApolloSearch(page) {
  const r = await send("apolloSearch", {
    titles: $("apollo-titles").value, keywords: $("apollo-q").value,
    locations: $("apollo-locations").value, page,
  });
  apolloPage = page;
  if (page === 1) apolloPeople = [];
  apolloPeople.push(...r.people.map((p) => ({ ...p, picked: false })));
  $("apollo-results").hidden = false;
  $("apollo-count").textContent = `${r.total ?? "?"} people match. Showing ${apolloPeople.length}. Tick the ones you want.`;
  renderApollo();
}

function renderApollo() {
  const list = $("apollo-list");
  list.replaceChildren();
  apolloPeople.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "pick";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = p.picked;
    box.disabled = !p.hasEmail;
    box.addEventListener("change", () => { apolloPeople[i].picked = box.checked; });
    const body = document.createElement("div");
    const name = document.createElement("div");
    name.className = "email";
    name.textContent = p.name || "(no name)";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [p.title, p.company, p.hasEmail ? "" : "no email on file"].filter(Boolean).join(" · ");
    body.append(name, meta);
    li.append(box, body);
    list.append(li);
  });
}

$("btn-apollo-search").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  if (!$("apollo-q").value.trim() && !$("apollo-titles").value.trim()) throw new Error("Type a keyword or a job title to search for.");
  await runApolloSearch(1);
}));
$("btn-apollo-more").addEventListener("click", (e) => withBusy(e.currentTarget, () => runApolloSearch(apolloPage + 1)));
$("btn-apollo-all").addEventListener("click", () => {
  const all = apolloPeople.every((p) => p.picked || !p.hasEmail);
  apolloPeople.forEach((p) => { if (p.hasEmail) p.picked = !all; });
  renderApollo();
});
$("btn-apollo-reveal").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const ids = apolloPeople.filter((p) => p.picked).map((p) => p.id);
  if (!ids.length) { toast("Tick at least one person", "err"); return; }
  const { count } = await send("apolloReveal", { ids });
  apolloPeople = apolloPeople.filter((p) => !p.picked);
  renderApollo();
  toast(`Got ${count} email${count === 1 ? "" : "s"} from Apollo. They're in Your leads, ready to save.`);
  loadCaptures(true);
}));

$("btn-refresh").addEventListener("click", loadLeads);
$("saved-card").addEventListener("toggle", () => { if ($("saved-card").open) loadLeads(); });

// ---------- CSV export and backup ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const CAP_COLUMNS = ["Status", "Score", "Name", "Business", "Email", "Verification", "Website", "Phone", "Location", "Country", "Language", "Source", "Source URL", "Notes", "Research", "Rating"];

$("btn-cap-csv").addEventListener("click", () => {
  if (!caps.length) { toast("Nothing captured yet", "err"); return; }
  const rows = [];
  for (const c of caps) {
    const base = { Status: STATUS_TEXT[c.status] || c.status, Name: c.name, Business: c.business, Website: c.website, Phone: c.phone, Location: c.address, Country: c.country, Language: c.lang ? LANGS[c.lang] : "", Source: c.source, "Source URL": c.profileUrl, Notes: c.note, Research: researchLine(c.research), Rating: c.rating };
    if (c.leads?.length) for (const l of c.leads) rows.push({ ...base, Name: l.Name || c.name, Email: l.Email, Verification: l.Verification, Score: l.Score || "" });
    else rows.push(base);
  }
  download(`captured-leads-${stamp()}.csv`, toCsv(rows, CAP_COLUMNS), "text/csv;charset=utf-8");
  toast(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
});

$("btn-leads-csv").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const { leads } = await send("listLeads");
  if (!leads.length) throw new Error("Your sheet has no leads yet.");
  download(`saved-leads-${stamp()}.csv`, toCsv(leads, LEAD_COLUMNS), "text/csv;charset=utf-8");
  toast(`Exported ${leads.length} lead${leads.length === 1 ? "" : "s"}`);
}));

$("btn-backup").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const { data } = await send("backup");
  try { data.jobForm = JSON.parse(localStorage.getItem("jobForm") || "null"); } catch (_) {}
  download(`outreach-assistant-backup-${stamp()}.json`, JSON.stringify(data, null, 1), "application/json");
  const n = Object.keys(data.local.captures || {}).length;
  $("backup-info").textContent = `Backup downloaded: ${n} captured lead${n === 1 ? "" : "s"}${data.sheetLeads ? ` and ${data.sheetLeads.length} sheet lead${data.sheetLeads.length === 1 ? "" : "s"}` : ""}.`;
}));
$("btn-restore").addEventListener("click", () => $("backup-file").click());
$("backup-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const r = await send("restore", { data });
    try { if (data.jobForm) localStorage.setItem("jobForm", JSON.stringify(data.jobForm)); } catch (_) {}
    $("backup-info").textContent = `Restored your details and settings, and added ${r.captures} captured lead${r.captures === 1 ? "" : "s"}.`;
    toast("Backup restored");
    await refresh();
    loadCaptures(true);
  } catch (err) { toast(err instanceof SyntaxError ? "That file isn't a backup file." : err.message, "err"); }
});

async function loadLeads() {
  const list = $("lead-list");
  try {
    const { leads } = await send("listLeads");
    list.replaceChildren();
    if (!leads.length) { list.innerHTML = '<li class="muted">No leads yet.</li>'; return; }
    for (const l of leads.slice(-50).reverse()) {
      const li = document.createElement("li");
      const email = document.createElement("div");
      email.className = "email";
      email.textContent = l.Email;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = [l.Business || l.Name, l.Source, l.Verification].filter(Boolean).join(" · ");
      li.append(email, meta);
      list.append(li);
    }
  } catch (e) {
    list.innerHTML = "";
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = e.message;
    list.append(li);
  }
}


// ---------- Compose ----------
let profile = {};
let ready = [];
let idx = 0;
let version = 0;
let stats = null;   // reply rates per style, from the sheet
let combos = [];    // style combinations for "New version"
let draft = null;   // the draft as built, so DeepL can redo it from English

for (const sel of ["d-lang", "fu-lang"]) {
  for (const [k, v] of Object.entries(LANGS)) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = v;
    $(sel).append(o);
  }
}
const leadLang = (lead) => (LANGS[lead.Language] ? lead.Language : pickLang({ country: lead.Country }));

for (const sel of ["d-segment", "fu-segment"]) {
  for (const [k, v] of Object.entries(SEGMENTS)) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = v;
    $(sel).append(o);
  }
}

async function loadProfile() {
  ({ profile } = await send("getProfile"));
  $("pf-name").value = profile.name;
  $("pf-portfolio").value = profile.portfolio;
  $("pf-address").value = profile.address;
  $("pf-limit").value = profile.dailyLimit;
  $("pf-samples").value = profile.samples || "";
  $("pf-reviews").value = profile.reviews || "";
  if (ready[idx]) showDraft(false);
  if (fus[fuIdx]) showFollowUp(false);
}

$("btn-profile-save").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  profile = {
    name: $("pf-name").value.trim(), portfolio: $("pf-portfolio").value.trim(),
    address: $("pf-address").value.trim(), dailyLimit: Number($("pf-limit").value) || 30,
    samples: $("pf-samples").value.trim(), reviews: $("pf-reviews").value.trim(),
  };
  if (!profile.name || !profile.address) throw new Error("Add at least your name and your mailing address.");
  await send("saveProfile", { profile });
  if (ready[idx]) $("d-footer").textContent = footer(profile, ready[idx], $("d-lang").value).trim();
  toast("Details saved");
  await refresh();
}));

// ---------- new emails / follow-ups switch (side panel shows one at a time) ----------
function setComposeView(v) {
  document.querySelectorAll("#compose-switch button").forEach((b) => b.classList.toggle("active", b.dataset.c === v));
  $("new-card").hidden = v !== "new";
  $("fu-card").hidden = v !== "fu";
}
document.querySelectorAll("#compose-switch button").forEach((b) => b.addEventListener("click", () => setComposeView(b.dataset.c)));
$("btn-goto-profile").addEventListener("click", () => goTo("setup", "profile-card"));

let sentToday = 0;
function updateCounts() {
  $("cnt-ready").textContent = ready.length ? String(ready.length) : "";
  $("cnt-fu").textContent = fus.length ? String(fus.length) : "";
  const n = ready.length + fus.length;
  $("pip-compose").textContent = n ? String(n) : "";
  const limit = Number(profile.dailyLimit) || 30;
  $("sent-bar").style.width = `${Math.min(100, (sentToday / limit) * 100)}%`;
  $("sent-text").textContent = `Sent today: ${sentToday} of your ${limit} a day`;
  $("ready-info").textContent = ready.length
    ? `Lead ${idx + 1} of ${ready.length} · best first`
    : "No leads waiting for a first email.";
  updateGuide();
}

let readyLoaded = false;
async function loadReady() {
  try {
    const r = await send("readyLeads");
    ready = r.ready;
    stats = r.stats;
    sentToday = r.sentToday;
    idx = 0;
    readyLoaded = true;
    setFollowUps(r);
    showDraft(true);
    if (!ready.length && fus.length) setComposeView("fu");
  } catch (e) {
    $("ready-info").textContent = e.message;
    $("draft").hidden = true;
  }
}

function updateCount() {
  const n = $("d-body").value.length;
  $("d-count").textContent = `${n} / ${BODY_LIMIT} characters`;
  $("d-count").className = n > BODY_LIMIT ? "over" : "";
  $("d-meter").style.width = `${Math.min(100, (n / BODY_LIMIT) * 100)}%`;
  $("d-meter").className = n > BODY_LIMIT ? "over" : "";
}

// Picks the subject and opener styles: the first draft leans on what's getting replies,
// "New version" then walks through the other combinations.
function styleCombos(lead) {
  const allowed = allowedStyles(lead);
  const first = [pickStyle(stats?.subject, allowed.subject), pickStyle(stats?.opener, allowed.opener)];
  const list = [first];
  for (const o of allowed.opener) for (const sub of allowed.subject) if (!(sub === first[0] && o === first[1])) list.push([sub, o]);
  return list;
}

function showDraft(fresh) {
  const lead = ready[idx];
  $("draft").hidden = !lead;
  $("draft-empty").hidden = !!lead || !readyLoaded;
  updateCounts();
  if (!lead) return;
  if (fresh) {
    version = 0;
    $("d-segment").value = guessSegment(lead);
    $("d-lang").value = leadLang(lead);
    $("d-anyway").checked = false;
    combos = styleCombos(lead);
  }
  if (!combos.length) combos = styleCombos(lead);
  const [subjectStyle, openerStyle] = combos[version % combos.length];
  const lang = $("d-lang").value;
  draft = makeDraft(lead, { segment: $("d-segment").value, lang, subjectStyle, openerStyle });
  const name = lead.Name || lead.Business || lead.Email;
  $("d-avatar").replaceWith(Object.assign(avatar(name, "avatar lg"), { id: "d-avatar" }));
  $("d-name").textContent = name;
  $("d-to").textContent = lead.Email;
  $("d-who").textContent = [lead.Name && lead.Business ? lead.Business : "", lead.Country, lead.Source, lead.Verification].filter(Boolean).join(" · ");
  const sc = Number(lead.Score) || scoreLead(lead).score;
  const ring = $("d-score");
  ring.textContent = String(sc);
  ring.style.setProperty("--p", sc);
  ring.style.setProperty("--c", sc >= 60 ? "var(--ok)" : sc >= 35 ? "var(--warn)" : "var(--muted)");
  ring.title = `Lead score ${sc}/100: ${scoreLead(lead).reasons.join(", ")}`;
  $("d-subject").value = draft.subject;
  $("d-body").value = draft.body;
  const r = researchLine(parseResearch(lead.Research));
  $("d-research").hidden = !r;
  $("d-research").textContent = r ? `What we found: ${r}` : "";
  const strict = STRICT.has(lead.Country);
  $("d-strict").hidden = !strict;
  $("d-strict-text").textContent = strict ? `${lead.Country} has strict rules on cold email to businesses: it's generally only allowed with their prior consent. This lead is held back unless you tick Send anyway.` : "";
  $("d-footer").textContent = footer(profile, lead, lang).trim();
  const st = (kind, k) => { const x = stats?.[kind]?.[k]; return x?.sent ? ` (${x.replies}/${x.sent} replied)` : ""; };
  $("d-styles").textContent = `Subject: ${SUBJECT_STYLES[draft.subjectStyle]}${st("subject", draft.subjectStyle)} · Opener: ${OPENER_STYLES[draft.openerStyle]}${st("opener", draft.openerStyle)}`;
  updateCount();
}

$("d-body").addEventListener("input", updateCount);
$("d-segment").addEventListener("change", () => showDraft(false));
$("d-lang").addEventListener("change", () => showDraft(false));
$("btn-d-deepl").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const lead = ready[idx];
  const lang = $("d-lang").value;
  if (lang === "en") throw new Error("Pick the language to translate into first.");
  // Starts from the English version of this draft, unless you've edited the text yourself.
  const edited = $("d-subject").value !== draft.subject || $("d-body").value !== draft.body;
  const en = edited ? { subject: $("d-subject").value, body: $("d-body").value } : makeDraft(lead, { segment: draft.segment, lang: "en", subjectStyle: draft.subjectStyle, openerStyle: draft.openerStyle });
  const { texts } = await send("translate", { texts: [en.subject, en.body], lang, country: lead.Country });
  $("d-subject").value = texts[0];
  $("d-body").value = texts[1];
  draft = { ...draft, subject: texts[0], body: texts[1] };
  updateCount();
  toast(`Translated into ${LANGS[lang]} with DeepL`);
}));
$("btn-d-new").addEventListener("click", () => { version++; showDraft(false); });
$("btn-ready-load").addEventListener("click", loadReady);

function nextLead() {
  ready.splice(idx, 1);
  if (idx >= ready.length) idx = 0;
  showDraft(true);
}

$("btn-d-skip").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  await send("skipLead", { row: ready[idx].row });
  nextLead();
}));

$("btn-d-send").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  if (!profile.name || !profile.address) { goTo("setup", "profile-card"); throw new Error("Add your name and mailing address under Your details first."); }
  const body = $("d-body").value.trim();
  const subject = $("d-subject").value.trim();
  if (!subject) throw new Error("Add a subject.");
  if (body.length > BODY_LIMIT) throw new Error(`Shorten the message to ${BODY_LIMIT} characters or less.`);
  const lead = ready[idx];
  if (STRICT.has(lead.Country) && !$("d-anyway").checked) throw new Error(`Held back: ${lead.Country} has strict cold email rules. Tick Send anyway if you're sure, or skip this lead.`);
  const lang = $("d-lang").value;
  await send("sendLeadEmail", {
    row: lead.row, to: lead.Email, subject, text: `${body}\n${footer(profile, lead, lang)}`,
    subjectStyle: draft.subjectStyle, openerStyle: draft.openerStyle, mainPoint: draft.mainPoint, lang, sendAnyway: $("d-anyway").checked,
  });
  toast(`Sent to ${lead.Email}`);
  sentToday++;
  nextLead();
}));

// ---------- Analytics ----------
async function loadAnalytics() {
  let a;
  try { a = await send("analytics"); } catch (e) { $("an-last").textContent = e.message; return; }
  $("st-sent").textContent = a.sent;
  $("st-bounced").textContent = a.bounced;
  $("st-replied").textContent = a.replied;
  $("st-declined").textContent = a.declined;
  $("st-awaiting").textContent = a.awaiting;
  $("st-rate").textContent = a.sent ? `${a.replyRate}%` : "–";
  $("pip-analytics").textContent = "";
  $("an-rates").textContent = a.sent
    ? `Reply rate ${a.replyRate}% (${a.positiveRate}% interested) · Bounce rate ${a.bounceRate}% · ${a.waiting} leads waiting to be emailed${a.followUps ? ` · ${a.followUps} follow-ups sent` : ""}${a.autoReplies ? ` · ${a.autoReplies} auto-replies` : ""}`
    : `Nothing sent yet. ${a.waiting} lead${a.waiting === 1 ? "" : "s"} waiting to be emailed.`;
  $("an-last").textContent = a.lastCheck ? `Inbox last checked ${new Date(a.lastCheck).toLocaleString()}. It checks every 10 minutes.` : "Inbox not checked yet.";

  renderStyles(a.stats);
  const days = $("an-days");
  days.replaceChildren();
  const max = Math.max(1, ...a.byDay.map(([, n]) => n));
  if (!a.byDay.length) days.innerHTML = '<p class="muted small">No emails sent yet. Your daily totals show here.</p>';
  for (const [d, n] of a.byDay) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.title = `${d}: ${n}`;
    bar.innerHTML = `<span class="v">${n}</span><div class="fill" style="height:${Math.round((n / max) * 70)}%"></div><span class="d">${d.slice(5)}</span>`;
    days.append(bar);
  }

  const list = $("an-recent");
  list.replaceChildren();
  if (!a.recent.length) list.innerHTML = '<li class="muted small">No replies or bounces yet. You get a notification as soon as someone answers.</li>';
  for (const l of a.recent) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = "email";
    link.href = `https://mail.google.com/mail/u/0/#all/${l["Gmail Thread ID"]}`;
    link.target = "_blank";
    link.textContent = l.Name || l.Business || l.Email;
    const badge = document.createElement("span");
    badge.className = `badge ${l["Email Status"] === "Replied" ? "Valid" : l["Email Status"] === "Bounced" ? "Invalid" : "Unknown"}`;
    badge.textContent = l["Email Status"];
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${l.Email} · ${l.Subject || ""}`;
    li.append(link, badge, meta);
    list.append(li);
  }
}

function renderStyles(st) {
  const box = $("an-styles");
  box.replaceChildren();
  const any = st && [...Object.values(st.subject), ...Object.values(st.opener)].some((x) => x.sent);
  if (!any) { box.append(el("p", "muted small", "Nothing to compare yet. Results show here once emails sent with this version have had 3 days.")); return; }
  for (const [kind, names, title] of [["subject", SUBJECT_STYLES, "Subject line"], ["opener", OPENER_STYLES, "Opening line"]]) {
    const t = el("table", "styles");
    t.innerHTML = `<tr><th>${title}</th><th class="n">Sent</th><th class="n">Replies</th><th class="n">Rate</th></tr>`;
    const rows = Object.entries(st[kind]).map(([k, x]) => [k, x, x.sent ? x.replies / x.sent : -1]);
    const best = Math.max(...rows.filter(([, x]) => x.sent >= 5).map(([, , r]) => r), 0);
    for (const [k, x, r] of rows) {
      const tr = el("tr", best > 0 && r === best && x.sent >= 5 ? "best" : "");
      tr.append(el("td", "", names[k]), el("td", "n", String(x.sent)), el("td", "n", String(x.replies)), el("td", "n", x.sent ? `${Math.round(r * 100)}%` : "–"));
      t.append(tr);
    }
    box.append(t);
  }
}

$("btn-check").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const r = await send("checkNow");
  toast(r.checked ? `Checked ${r.checked} conversation${r.checked === 1 ? "" : "s"}, ${r.changes} new update${r.changes === 1 ? "" : "s"}` : "No sent emails to check yet");
  await loadAnalytics();
}));

// ---------- Follow-ups ----------
let fus = [];
let fuIdx = 0;

function setFollowUps(r) {
  fus = r.followUps || [];
  fuIdx = 0;
  $("fu-info").textContent = fus.length
    ? `${fus.length} follow-up${fus.length === 1 ? "" : "s"} due.${r.weekend ? " It's the weekend, so they'll wait until Monday." : ""}`
    : "None due. Leads with no reply get one after 4 days, and a last one 7 days after that. Then it stops.";
  showFollowUp(true);
}

function fuCount() {
  const n = textLength($("fu-body").value);
  $("fu-count").textContent = `${n} / ${FOLLOWUP_LIMIT} characters (links not counted)`;
  $("fu-count").className = n > FOLLOWUP_LIMIT ? "over" : "";
  $("fu-meter").style.width = `${Math.min(100, (n / FOLLOWUP_LIMIT) * 100)}%`;
  $("fu-meter").className = n > FOLLOWUP_LIMIT ? "over" : "";
}

function showFollowUp(fresh) {
  const lead = fus[fuIdx];
  $("fu").hidden = !lead;
  updateCounts();
  if (!lead) return;
  const step = (Number(lead["Follow-ups Sent"]) || 0) + 1;
  const name = lead.Name || lead.Business || lead.Email;
  $("fu-avatar").replaceWith(Object.assign(avatar(name, "avatar lg"), { id: "fu-avatar" }));
  $("fu-name").textContent = name;
  if (fresh) { $("fu-segment").value = guessSegment(lead); $("fu-lang").value = leadLang(lead); }
  $("fu-to").textContent = lead.Email;
  $("fu-who").textContent = [lead.Name && lead.Business ? lead.Business : "", lead.Country, `${fuIdx + 1} of ${fus.length}`].filter(Boolean).join(" · ");
  $("fu-step").textContent = step === 1
    ? `Follow-up 1 of 2: shares your samples. First email sent ${new Date(lead["Sent At"]).toLocaleDateString()}: "${lead.Subject}"`
    : "Follow-up 2 of 2: a polite last email. After this, no more emails to this lead.";
  $("fu-body").value = makeFollowUp(lead, $("fu-segment").value, step, profile, $("fu-lang").value);
  fuCount();
}

function nextFollowUp() {
  fus.splice(fuIdx, 1);
  if (fuIdx >= fus.length) fuIdx = 0;
  $("fu-info").textContent = fus.length ? `${fus.length} follow-up${fus.length === 1 ? "" : "s"} due.` : "All follow-ups done for now. Nice work.";
  showFollowUp(true);
}

$("fu-body").addEventListener("input", fuCount);
$("fu-segment").addEventListener("change", () => showFollowUp(false));
$("fu-lang").addEventListener("change", () => showFollowUp(false));
$("btn-fu-deepl").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  const lead = fus[fuIdx];
  const lang = $("fu-lang").value;
  if (lang === "en") throw new Error("Pick the language to translate into first.");
  const step = (Number(lead["Follow-ups Sent"]) || 0) + 1;
  const en = makeFollowUp(lead, $("fu-segment").value, step, profile, "en");
  const { texts } = await send("translate", { texts: [en], lang, country: lead.Country });
  $("fu-body").value = texts[0];
  fuCount();
  toast(`Translated into ${LANGS[lang]} with DeepL`);
}));
$("btn-fu-load").addEventListener("click", loadReady);
$("btn-fu-later").addEventListener("click", () => { if (fus.length > 1) { fuIdx = (fuIdx + 1) % fus.length; showFollowUp(true); } else toast("This is the only one due"); });
$("btn-fu-stop").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  await send("stopFollowUps", { row: fus[fuIdx].row });
  toast("No more follow-ups to this lead");
  nextFollowUp();
}));
$("btn-fu-send").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
  if (!profile.name || !profile.address) { goTo("setup", "profile-card"); throw new Error("Add your name and mailing address under Your details first."); }
  const body = $("fu-body").value.trim();
  if (textLength(body) > FOLLOWUP_LIMIT) throw new Error(`Shorten the follow-up to ${FOLLOWUP_LIMIT} characters or less (links not counted).`);
  const lead = fus[fuIdx];
  if (!(Number(lead["Follow-ups Sent"]) || 0) && !profile.samples && !profile.portfolio) { goTo("setup", "profile-card"); throw new Error("Add a samples link under Your details first."); }
  const { n } = await send("sendFollowUp", { row: lead.row, text: `${body}\n${footer(profile, lead, $("fu-lang").value)}` });
  toast(`Follow-up ${n} sent to ${lead.Email}`);
  sentToday++;
  nextFollowUp();
}));

// ---------- start ----------
(async () => {
  await refresh();
  loadProfile().catch(() => {});
  await loadCaptures(true);
  if (job?.status === "running") setMethod("auto");
  if (st.signedIn && st.sheet) loadReady();
  const t = new URLSearchParams(location.search).get("tab");
  if (t) showTab(t);
})();
