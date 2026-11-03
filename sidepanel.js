import { SEGMENTS, BODY_LIMIT, makeDraft, guessSegment, footer, makeFollowUp, FOLLOWUP_LIMIT, textLength } from "./lib/templates.js";

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
  el.textContent = text;
  el.className = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

async function withBusy(button, fn) {
  button.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, "err"); } finally { button.disabled = false; }
}

// Tabs
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === "leads") { loadLeads(); loadCaptures(true); }
    if (btn.dataset.tab === "analytics") loadAnalytics();
    if (btn.dataset.tab === "compose") { loadProfile(); if (!ready.length) loadReady(); }
  });
});

function render(state) {
  $("auth-status").textContent = state.signedIn ? `Signed in as ${state.userEmail || "your Google account"}` : "Not signed in";
  $("btn-signin").hidden = state.signedIn;
  $("btn-signout").hidden = !state.signedIn;
  $("sheet-card").style.opacity = state.signedIn ? 1 : 0.5;
  $("sheet-card").querySelectorAll("button, input").forEach((el) => { el.disabled = !state.signedIn; });
  $("apollo-status").textContent = state.hasApolloKey ? "Apollo key saved." : "Used to find people on Apollo. It stays in this browser only.";
  $("use-hunter").checked = state.useHunter !== false;
  $("use-hunter-search").checked = state.useHunterSearch !== false;
  if (!state.hasHunterKey) $("hunter-status").textContent = "Checks each mailbox for real, and finds emails when a website lists none. It stays in this browser only.";
  else if (!hunterShown) { hunterShown = true; showHunterCredits(); }
  $("sheet-connected").hidden = !state.sheet;
  $("sheet-setup").hidden = !!state.sheet;
  if (state.sheet) {
    $("sheet-link").textContent = state.sheet.title;
    $("sheet-link").href = state.sheet.url;
  }
}

async function refresh() {
  try { render(await send("status")); } catch (e) { toast(e.message, "err"); }
}

$("btn-signin").addEventListener("click", (e) => withBusy(e.target, async () => {
  const { userEmail } = await send("signIn");
  toast(`Signed in as ${userEmail}`);
  await refresh();
}));

$("btn-signout").addEventListener("click", (e) => withBusy(e.target, async () => {
  await send("signOut");
  await refresh();
}));

$("btn-sheet-create").addEventListener("click", (e) => withBusy(e.target, async () => {
  const { sheet } = await send("createSheet", { title: "Outreach Leads" });
  toast(`Created "${sheet.title}"`);
  await refresh();
}));

$("btn-sheet-connect").addEventListener("click", (e) => withBusy(e.target, async () => {
  const { sheet } = await send("connectSheet", { input: $("sheet-input").value });
  $("sheet-input").value = "";
  toast(`Connected to "${sheet.title}"`);
  await refresh();
}));

$("btn-sheet-disconnect").addEventListener("click", (e) => withBusy(e.target, async () => {
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
    if (added) { toast(`Saved (${checked.Verification}: ${checked.verifyReason})`); form.reset(); loadLeads(); }
    else toast("That email is already in your sheet", "err");
  });
});

// ---------- Apollo key ----------
$("btn-apollo-save").addEventListener("click", (e) => withBusy(e.target, async () => {
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
$("btn-hunter-save").addEventListener("click", (e) => withBusy(e.target, async () => {
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

// ---------- Captured (everything captured, by hand, automatically or from Apollo) ----------
const clean = (l) => { const { verifyReason, apolloStatus, hunterStatus, picked, offDomain, ...rest } = l; return rest; };
let caps = [];
let capFilter = "all";
const picks = new Map(); // "id|email" -> ticked
const STATUS_TEXT = { new: "Waiting", checking: "Checking…", ready: "Ready", needs_website: "Needs website", no_email: "No email found", saved: "Saved", error: "Error" };
const goodEmail = (l) => !l.offDomain && (l.Verification === "Verified" || l.Verification === "Valid");
const isPicked = (c, l) => { const k = `${c.id}|${l.Email}`; return picks.has(k) ? picks.get(k) : goodEmail(l); };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

let lastSig = "";
function renderCaptures(force) {
  const list = $("cap-list");
  if (!force && list.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type !== "checkbox") return;
  const shown = caps.filter((c) => capFilter === "all" || (capFilter === "working" ? ["new", "checking"].includes(c.status) : c.status === capFilter));
  const sig = capFilter + JSON.stringify(shown.map((c) => [c.id, c.status, c.leads?.length, c.website]));
  if (!force && sig === lastSig) return;
  lastSig = sig;
  const count = (st) => caps.filter((c) => st.includes(c.status)).length;
  $("cap-counts").textContent = caps.length ? `${count(["ready"])} ready · ${count(["new", "checking"])} checking · ${count(["needs_website"])} need a website` : "";
  list.replaceChildren();
  if (!shown.length) { list.append(el("li", "muted small", caps.length ? "Nothing here." : "Nothing captured yet. Capture a page, start automatic capture, or search Apollo.")); return; }
  for (const c of shown.slice(0, 300)) {
    const li = el("li");
    const head = el("div", "cap-head");
    const title = el("div", "cap-name", c.business || c.name || c.website || "(no name)");
    if (c.strict) title.append(el("span", "flag", `${c.country}: held back from sending`));
    head.append(title, el("span", `status ${c.status}`, STATUS_TEXT[c.status] || c.status));
    li.append(head);
    const metaBits = [c.business && c.name ? c.name : "", c.source, c.country, c.handle, c.rating && `★ ${c.rating}${c.reviews ? ` (${c.reviews})` : ""}`, c.website && new URL(c.website).hostname.replace(/^www\./, "")].filter(Boolean);
    li.append(el("div", "cap-meta", metaBits.join(" · ")));
    if (c.note) li.append(el("div", "cap-meta", c.note));
    if (c.error) li.append(el("div", "cap-meta", c.error));

    if (c.status === "ready" && c.leads?.length) {
      const ul = el("ul", "cap-emails");
      for (const l of c.leads) {
        const row = el("li");
        const box = el("input");
        box.type = "checkbox";
        box.checked = isPicked(c, l);
        box.addEventListener("change", () => picks.set(`${c.id}|${l.Email}`, box.checked));
        const body = el("div");
        const line = el("div", "email", l.Email);
        const badge = el("span", `badge ${l.Verification}`, l.Verification);
        line.append(badge);
        body.append(line, el("div", "meta", [l.Name !== c.name ? l.Name : "", l.verifyReason].filter(Boolean).join(" · ")));
        row.append(box, body);
        ul.append(row);
      }
      li.append(ul);
    }
    if (c.status === "needs_website" || c.status === "no_email") {
      const fix = el("div", "cap-fix");
      const inp = el("input");
      inp.placeholder = c.status === "needs_website" ? "Their website or email" : "Another website, or an email you found";
      const go = el("button", "secondary", "Check");
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
    if (c.profileUrl) { const a = el("a", "small", "Open source"); a.href = c.profileUrl; a.target = "_blank"; acts.append(a); }
    if (c.status === "needs_website" || c.status === "no_email") {
      const a = el("a", "small", "Search Google for them");
      a.href = `https://www.google.com/search?q=${encodeURIComponent([c.name || c.business, c.note?.replace(/^Book: /, "").split(" · ")[0], c.name ? "author website" : "contact email"].filter(Boolean).join(" "))}`;
      a.target = "_blank";
      acts.append(a);
    }
    if (c.status === "error" || c.status === "no_email") { const b = el("button", "link small", "Try again"); b.addEventListener("click", async () => { await send("retryCapture", { id: c.id }); loadCaptures(true); }); acts.append(b); }
    const rm = el("button", "link small", "Remove");
    rm.addEventListener("click", async () => { await send("removeCaptures", { ids: [c.id] }); loadCaptures(true); });
    acts.append(rm);
    li.append(acts);
    list.append(li);
  }
}

let job = null;
function renderJob() {
  const running = job?.status === "running";
  $("btn-job-start").hidden = running;
  $("btn-job-stop").hidden = !running;
  if (!job) { $("job-info").textContent = ""; return; }
  $("job-info").textContent = running
    ? `${job.message || "Working…"} Captured ${job.captured}, ${job.ready} of ${job.target} ready. Page ${Math.min(job.idx + 1, job.tasks.length)} of ${job.tasks.length}.`
    : job.message || "";
}

async function loadCaptures(force) {
  try {
    const r = await send("captures");
    caps = r.captures;
    job = r.job;
    renderCaptures(force);
    renderJob();
  } catch (e) { /* panel may be closing */ }
}

$("cap-filters").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  capFilter = b.dataset.f;
  document.querySelectorAll("#cap-filters .chip").forEach((x) => x.classList.toggle("active", x === b));
  renderCaptures(true);
});

$("btn-cap-save").addEventListener("click", (e) => withBusy(e.target, async () => {
  const chosen = [];
  for (const c of caps) if (c.status === "ready") for (const l of c.leads) if (isPicked(c, l)) chosen.push({ id: c.id, email: l.Email });
  if (!chosen.length) throw new Error("Nothing ticked to save yet.");
  const { added, skipped } = await send("saveCaptured", { picks: chosen });
  toast(`Saved ${added} lead${added === 1 ? "" : "s"} to your sheet${skipped ? `, ${skipped} already there` : ""}`);
  await loadCaptures(true);
  loadLeads();
}));
$("btn-cap-clear-saved").addEventListener("click", async () => { await send("clearCaptures", { statuses: ["saved"] }); loadCaptures(true); });
$("btn-cap-clear-dead").addEventListener("click", async () => { await send("clearCaptures", { statuses: ["no_email", "error"] }); loadCaptures(true); });

// ---------- Capture by hand ----------
async function capture(quiet) {
  const r = await send("capturePage", { quiet });
  if (quiet && !r.added) return;
  const info = $("capture-info");
  info.hidden = false;
  info.textContent = r.added || r.duplicates
    ? `${r.source}: captured ${r.added} new${r.duplicates ? `, ${r.duplicates} already captured` : ""}. ${r.message || ""}`
    : r.message || "Nothing new on this page.";
  await loadCaptures(true);
}
$("btn-capture").addEventListener("click", (e) => withBusy(e.target, () => capture(false)));
let watchTimer = null;
$("watch").addEventListener("change", (e) => {
  clearInterval(watchTimer);
  if (e.target.checked) {
    watchTimer = setInterval(() => capture(true).catch(() => {}), 4000);
    toast("Capturing every few seconds while you scroll. Untick to stop.");
  }
});

// ---------- Automatic capture ----------
$("btn-job-start").addEventListener("click", (e) => withBusy(e.target, async () => {
  const sources = [...document.querySelectorAll('input[name="job-src"]:checked')].map((x) => x.value);
  await send("jobStart", {
    keyword: $("job-keyword").value, place: $("job-place").value, sources,
    target: Number($("job-target").value), pagesPerDay: Number($("job-pages").value),
  });
  try { localStorage.setItem("jobForm", JSON.stringify({ k: $("job-keyword").value, p: $("job-place").value, s: sources, t: $("job-target").value, n: $("job-pages").value })); } catch (_) {}
  toast("Automatic capture started in a small separate window");
  await loadCaptures(true);
}));
$("btn-job-stop").addEventListener("click", (e) => withBusy(e.target, async () => { await send("jobStop"); await loadCaptures(true); }));
try {
  const f = JSON.parse(localStorage.getItem("jobForm") || "null");
  if (f) {
    $("job-keyword").value = f.k || ""; $("job-place").value = f.p || ""; $("job-target").value = f.t || 30; $("job-pages").value = f.n || 40;
    document.querySelectorAll('input[name="job-src"]').forEach((x) => { x.checked = (f.s || []).includes(x.value); });
  }
} catch (_) {}

setInterval(() => { if (!document.hidden && $("tab-leads").classList.contains("active")) loadCaptures(false); }, 3000);

// ---------- Full page ----------
if (new URLSearchParams(location.search).get("full")) document.body.classList.add("full");
$("btn-full").addEventListener("click", () => send("openDashboard"));

// ---------- Apollo search ----------
const PRESETS = {
  authors: { titles: "Author, Children's Book Author, Writer, Self-Published Author", keywords: "children's book" },
  publishers: { titles: "Publisher, Editor, Acquisitions Editor, Managing Editor, Founder", keywords: "children's publishing" },
  educators: { titles: "Curriculum Director, Founder, Content Director, Head of Content", keywords: "early learning" },
  coaches: { titles: "Coach, Founder, Course Creator", keywords: "online course" },
};
$("apollo-preset").addEventListener("change", (e) => {
  const p = PRESETS[e.target.value];
  if (!p) return;
  $("apollo-titles").value = p.titles;
  $("apollo-keywords").value = p.keywords;
});

let apolloPage = 1;
let apolloPeople = [];

async function runApolloSearch(page) {
  const r = await send("apolloSearch", {
    titles: $("apollo-titles").value, keywords: $("apollo-keywords").value,
    locations: $("apollo-locations").value, page,
  });
  apolloPage = page;
  if (page === 1) apolloPeople = [];
  apolloPeople.push(...r.people.map((p) => ({ ...p, picked: false })));
  $("apollo-results").hidden = false;
  $("apollo-count").textContent = `${r.total ?? "?"} people match. Showing ${apolloPeople.length}.`;
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

$("btn-apollo-search").addEventListener("click", (e) => withBusy(e.target, () => runApolloSearch(1)));
$("btn-apollo-more").addEventListener("click", (e) => withBusy(e.target, () => runApolloSearch(apolloPage + 1)));
$("btn-apollo-all").addEventListener("click", () => {
  const all = apolloPeople.every((p) => p.picked || !p.hasEmail);
  apolloPeople.forEach((p) => { if (p.hasEmail) p.picked = !all; });
  renderApollo();
});
$("btn-apollo-reveal").addEventListener("click", (e) => withBusy(e.target, async () => {
  const ids = apolloPeople.filter((p) => p.picked).map((p) => p.id);
  if (!ids.length) { toast("Tick at least one person", "err"); return; }
  const { count } = await send("apolloReveal", { ids });
  apolloPeople = apolloPeople.filter((p) => !p.picked);
  renderApollo();
  toast(`Got ${count} email${count === 1 ? "" : "s"} from Apollo. They're in Captured, ready to save.`);
  loadCaptures(true);
}));

$("btn-refresh").addEventListener("click", loadLeads);

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

refresh();

// ---------- Compose ----------
let profile = {};
let ready = [];
let idx = 0;
let version = 0;

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
  $("profile-card").open = !profile.name || !profile.address;
  $("d-footer").textContent = footer(profile).trim();
}

$("btn-profile-save").addEventListener("click", (e) => withBusy(e.target, async () => {
  profile = {
    name: $("pf-name").value.trim(), portfolio: $("pf-portfolio").value.trim(),
    address: $("pf-address").value.trim(), dailyLimit: Number($("pf-limit").value) || 30,
    samples: $("pf-samples").value.trim(), reviews: $("pf-reviews").value.trim(),
  };
  await send("saveProfile", { profile });
  $("d-footer").textContent = footer(profile).trim();
  $("profile-card").open = false;
  toast("Details saved");
}));

async function loadReady() {
  try {
    const r = await send("readyLeads");
    ready = r.ready;
    idx = 0;
    setFollowUps(r);
    $("ready-info").textContent = ready.length
      ? `${ready.length} lead${ready.length === 1 ? "" : "s"} waiting. Sent today: ${r.sentToday}.`
      : `No verified leads waiting. Sent today: ${r.sentToday}.`;
    showDraft(true);
  } catch (e) {
    $("ready-info").textContent = e.message;
    $("draft").hidden = true;
  }
}

function updateCount() {
  const n = $("d-body").value.length;
  $("d-count").textContent = `(${n}/${BODY_LIMIT})`;
  $("d-count").className = n > BODY_LIMIT ? "over" : "";
}

function showDraft(fresh) {
  const lead = ready[idx];
  $("draft").hidden = !lead;
  if (!lead) return;
  if (fresh) { version = 0; $("d-segment").value = guessSegment(lead); }
  const d = makeDraft(lead, $("d-segment").value, version);
  $("d-to").textContent = lead.Email;
  $("d-who").textContent = `(${[lead.Name, lead.Business].filter(Boolean).join(", ") || "no name"}) · ${idx + 1} of ${ready.length}`;
  $("d-subject").value = d.subject;
  $("d-body").value = d.body;
  updateCount();
}

$("d-body").addEventListener("input", updateCount);
$("d-segment").addEventListener("change", () => { version = 0; showDraft(false); });
$("btn-d-new").addEventListener("click", () => { version++; showDraft(false); });
$("btn-ready-load").addEventListener("click", loadReady);

function nextLead() {
  ready.splice(idx, 1);
  if (idx >= ready.length) idx = 0;
  $("ready-info").textContent = `${ready.length} lead${ready.length === 1 ? "" : "s"} waiting.`;
  showDraft(true);
}

$("btn-d-skip").addEventListener("click", (e) => withBusy(e.target, async () => {
  await send("skipLead", { row: ready[idx].row });
  nextLead();
}));

$("btn-d-send").addEventListener("click", (e) => withBusy(e.target, async () => {
  if (!profile.name || !profile.address) { $("profile-card").open = true; throw new Error("Add your name and mailing address under Your details first."); }
  const body = $("d-body").value.trim();
  const subject = $("d-subject").value.trim();
  if (!subject) throw new Error("Add a subject.");
  if (body.length > BODY_LIMIT) throw new Error(`Shorten the message to ${BODY_LIMIT} characters or less.`);
  const lead = ready[idx];
  await send("sendLeadEmail", { row: lead.row, to: lead.Email, subject, text: `${body}\n${footer(profile)}` });
  toast(`Sent to ${lead.Email}`);
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
  $("an-rates").textContent = a.sent
    ? `Reply rate ${a.replyRate}% (${a.positiveRate}% interested) · Bounce rate ${a.bounceRate}% · ${a.waiting} leads waiting to be emailed${a.followUps ? ` · ${a.followUps} follow-ups sent` : ""}${a.autoReplies ? ` · ${a.autoReplies} auto-replies` : ""}`
    : `Nothing sent yet. ${a.waiting} leads waiting to be emailed.`;
  $("an-last").textContent = a.lastCheck ? `Inbox last checked ${new Date(a.lastCheck).toLocaleString()}. It checks every 10 minutes.` : "Inbox not checked yet.";

  const days = $("an-days");
  days.replaceChildren();
  const max = Math.max(1, ...a.byDay.map(([, n]) => n));
  if (!a.byDay.length) days.innerHTML = '<p class="muted small">No emails sent yet.</p>';
  for (const [d, n] of a.byDay) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.title = `${d}: ${n}`;
    bar.innerHTML = `<span class="v">${n}</span><div class="fill" style="height:${Math.round((n / max) * 70)}%"></div><span class="d">${d.slice(5)}</span>`;
    days.append(bar);
  }

  const list = $("an-recent");
  list.replaceChildren();
  if (!a.recent.length) list.innerHTML = '<li class="muted">No replies or bounces yet.</li>';
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

$("btn-check").addEventListener("click", (e) => withBusy(e.target, async () => {
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
    : "No follow-ups due. Leads with no reply get one after 4 days, and a last one 7 days after that.";
  showFollowUp(true);
}

function fuCount() {
  const n = textLength($("fu-body").value);
  $("fu-count").textContent = `(${n}/${FOLLOWUP_LIMIT}, links not counted)`;
  $("fu-count").className = n > FOLLOWUP_LIMIT ? "over" : "";
}

function showFollowUp(fresh) {
  const lead = fus[fuIdx];
  $("fu").hidden = !lead;
  if (!lead) return;
  const step = (Number(lead["Follow-ups Sent"]) || 0) + 1;
  if (fresh) $("fu-segment").value = guessSegment(lead);
  $("fu-to").textContent = lead.Email;
  $("fu-who").textContent = `(${[lead.Name, lead.Business].filter(Boolean).join(", ") || "no name"}) · ${fuIdx + 1} of ${fus.length}`;
  $("fu-step").textContent = step === 1
    ? `Follow-up 1 of 2: shares your samples. First email sent ${new Date(lead["Sent At"]).toLocaleDateString()}: "${lead.Subject}"`
    : "Follow-up 2 of 2: a polite last email. After this, no more emails to this lead.";
  $("fu-body").value = makeFollowUp(lead, $("fu-segment").value, step, profile);
  fuCount();
}

function nextFollowUp() {
  fus.splice(fuIdx, 1);
  if (fuIdx >= fus.length) fuIdx = 0;
  $("fu-info").textContent = fus.length ? `${fus.length} follow-up${fus.length === 1 ? "" : "s"} due.` : "All follow-ups done for now.";
  showFollowUp(true);
}

$("fu-body").addEventListener("input", fuCount);
$("fu-segment").addEventListener("change", () => showFollowUp(false));
$("btn-fu-load").addEventListener("click", loadReady);
$("btn-fu-later").addEventListener("click", () => { if (fus.length > 1) { fuIdx = (fuIdx + 1) % fus.length; showFollowUp(true); } else toast("This is the only one due"); });
$("btn-fu-stop").addEventListener("click", (e) => withBusy(e.target, async () => {
  await send("stopFollowUps", { row: fus[fuIdx].row });
  toast("No more follow-ups to this lead");
  nextFollowUp();
}));
$("btn-fu-send").addEventListener("click", (e) => withBusy(e.target, async () => {
  if (!profile.name || !profile.address) { $("profile-card").open = true; throw new Error("Add your name and mailing address under Your details first."); }
  const body = $("fu-body").value.trim();
  if (textLength(body) > FOLLOWUP_LIMIT) throw new Error(`Shorten the follow-up to ${FOLLOWUP_LIMIT} characters or less (links not counted).`);
  const lead = fus[fuIdx];
  if (!(Number(lead["Follow-ups Sent"]) || 0) && !profile.samples && !profile.portfolio) { $("profile-card").open = true; throw new Error("Add a samples link under Your details first."); }
  const { n } = await send("sendFollowUp", { row: lead.row, text: `${body}\n${footer(profile)}` });
  toast(`Follow-up ${n} sent to ${lead.Email}`);
  nextFollowUp();
}));
