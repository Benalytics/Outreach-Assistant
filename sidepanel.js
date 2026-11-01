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
    if (btn.dataset.tab === "leads") loadLeads();
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

// ---------- Found emails (shared by page scan and Apollo) ----------
let found = [];
const clean = (l) => { const { verifyReason, apolloStatus, hunterStatus, picked, offDomain, ...rest } = l; return rest; };

function addFound(leads) {
  const have = new Set(found.map((l) => l.Email));
  for (const l of leads) {
    if (!l.Email || have.has(l.Email)) continue;
    have.add(l.Email);
    found.push({ ...l, picked: !l.offDomain && (l.Verification === "Verified" || l.Verification === "Valid") });
  }
  renderFound();
}

function renderFound() {
  $("found-card").hidden = !found.length;
  const list = $("found-list");
  list.replaceChildren();
  found.forEach((l, i) => {
    const li = document.createElement("li");
    li.className = "pick";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = l.picked;
    box.addEventListener("change", () => { found[i].picked = box.checked; });
    const body = document.createElement("div");
    const email = document.createElement("div");
    email.className = "email";
    email.textContent = l.Email;
    const badge = document.createElement("span");
    badge.className = `badge ${l.Verification}`;
    badge.textContent = l.Verification;
    email.append(badge);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [l.Name, l.Business, l.Source].filter(Boolean).join(" · ");
    const why = document.createElement("div");
    why.className = "meta";
    why.textContent = l.verifyReason || "";
    body.append(email, meta, why);
    li.append(box, body);
    list.append(li);
  });
}

$("btn-found-clear").addEventListener("click", () => { found = []; renderFound(); });

$("btn-found-save").addEventListener("click", (e) => withBusy(e.target, async () => {
  const picked = found.filter((l) => l.picked);
  if (!picked.length) { toast("Tick at least one email", "err"); return; }
  const { added, skipped } = await send("addLeads", { leads: picked.map(clean) });
  toast(`Saved ${added} lead${added === 1 ? "" : "s"}${skipped ? `, ${skipped} already in your sheet` : ""}`);
  found = found.filter((l) => !l.picked);
  renderFound();
  loadLeads();
}));

// ---------- Scan the open page ----------
$("btn-scan").addEventListener("click", (e) => withBusy(e.target, async () => {
  const info = $("scan-info");
  info.hidden = false;
  info.textContent = "Reading the page and checking the website…";
  const r = await send("scanActiveTab");
  const where = r.business.website ? `checked ${r.pagesChecked} page${r.pagesChecked === 1 ? "" : "s"} on ${new URL(r.business.website).hostname}` : "no website listed, so there's nowhere to look for an email";
  info.textContent = `${r.business.name || "This page"} (${r.business.site}): ${where}. ${r.leads.length ? `Found ${r.leads.length} email${r.leads.length === 1 ? "" : "s"}.` : "No emails found."}${r.websiteError ? " " + r.websiteError + "." : ""}${r.hunterNote ? " " + r.hunterNote : ""}${r.dropped ? ` Ignored ${r.dropped} that didn't belong to the business.` : ""}`;
  addFound(r.leads);
}));

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
  const { leads } = await send("apolloReveal", { ids });
  addFound(leads);
  apolloPeople = apolloPeople.filter((p) => !p.picked);
  renderApollo();
  toast(`Got ${leads.filter((l) => l.Email).length} email${leads.length === 1 ? "" : "s"} from Apollo`);
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
