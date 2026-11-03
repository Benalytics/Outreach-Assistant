import { getToken, getUserEmail, signOut } from "./lib/auth.js";
import { createLeadsSheet, connectSheet, parseSheetId, appendLeads, getLeads, updateLead } from "./lib/sheets.js";
import { sendEmail, getThread } from "./lib/gmail.js";
import { FOLLOWUP_DAYS } from "./lib/templates.js";
import { checkInbox, summarize } from "./lib/tracker.js";
import { searchPeople, revealEmails } from "./lib/apollo.js";
import { verifyLeads } from "./lib/verify.js";
import { hunterAccount } from "./lib/hunter.js";
import { extractPage } from "./lib/extract.js";
import { addCaptures, addReadyLeads, allCaptures, runQueue, supplyContact, removeCaptures, clearCaptures, updateCapture } from "./lib/captures.js";
import { startJob, stopJob, getJob, runJob, AUTO_SOURCES } from "./lib/job.js";
import { styleStats } from "./lib/learn.js";
import { STRICT } from "./lib/country.js";
import { translate, deeplUsage } from "./lib/deepl.js";

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.alarms.create("check-inbox", { periodInMinutes: 10 });
  chrome.alarms.create("queue-tick", { periodInMinutes: 1 });
  runQueue();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("check-inbox", { periodInMinutes: 10 });
  chrome.alarms.create("queue-tick", { periodInMinutes: 1 });
  runQueue();
  runJob();
});

// The full-page dashboard: the same panel, opened in its own tab.
async function openDashboard() {
  const url = chrome.runtime.getURL("sidepanel.html?full=1");
  const [tab] = (await chrome.tabs.query({})).filter((t) => (t.url || "").startsWith(chrome.runtime.getURL("sidepanel.html?full")));
  if (tab) { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
}

// The page to capture from: the tab you're looking at, or the last web page you looked at
// when you're in the full-page dashboard. Never the automatic capture window.
async function targetTab() {
  const job = await getJob();
  const skip = job?.status === "running" ? job.windowId : -1;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active && /^https?:/.test(active.url || "") && active.windowId !== skip) return active;
  const tabs = (await chrome.tabs.query({})).filter((t) => /^https?:/.test(t.url || "") && t.windowId !== skip);
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0] || null;
}

// Every 10 minutes: look for replies and bounces, update the sheet, and notify you.
async function runInboxCheck() {
  const { sheet, userEmail } = await chrome.storage.local.get(["sheet", "userEmail"]);
  if (!sheet || !userEmail) return { changes: [], checked: 0 };
  const result = await checkInbox(sheet.id, userEmail);
  for (const c of result.changes) {
    const who = c.lead.Name || c.lead.Business || c.lead.Email;
    const title = c.type === "Replied" ? `${who} replied` : c.type === "Declined" ? `${who} said no thanks` : `Email to ${c.lead.Email} bounced`;
    chrome.notifications.create(`thread:${c.threadId}:${Date.now()}`, {
      type: "basic", iconUrl: "icons/icon128.png", title,
      message: c.snippet ? c.snippet.slice(0, 180) : (c.type === "Bounced" ? "Marked invalid in your sheet." : ""),
      priority: c.type === "Replied" ? 2 : 0,
    });
  }
  const { unread = 0 } = await chrome.storage.local.get("unread");
  const fresh = result.changes.filter((c) => c.type === "Replied").length;
  if (fresh) {
    await chrome.storage.local.set({ unread: unread + fresh });
    chrome.action.setBadgeText({ text: String(unread + fresh) });
    chrome.action.setBadgeBackgroundColor({ color: "#157a3c" });
  }
  await chrome.storage.local.set({ lastCheck: new Date().toISOString() });
  return result;
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "check-inbox") runInboxCheck().catch((e) => console.warn("Inbox check failed:", e.message));
  if (a.name === "queue-tick") runQueue();
  if (a.name === "job-tick") runJob();
});

chrome.notifications.onClicked.addListener((id) => {
  const threadId = id.split(":")[1];
  if (threadId) chrome.tabs.create({ url: `https://mail.google.com/mail/u/0/#all/${threadId}` });
  chrome.notifications.clear(id);
});

const today = () => new Date().toISOString().slice(0, 10);
// Emails sent today: first emails plus follow-ups.
const sentTodayCount = (leads) => leads.filter((l) => (l["Sent At"] || "").startsWith(today())).length
  + leads.filter((l) => (l["Last Follow-up At"] || "").startsWith(today())).length;
const daysSince = (iso) => (Date.now() - Date.parse(iso)) / 864e5;
const isWeekend = () => [0, 6].includes(new Date().getDay());

function followUpDue(l) {
  if (l["Email Status"] !== "Sent" || !l["Gmail Thread ID"] || !l["Sent At"]) return false;
  const n = Number(l["Follow-ups Sent"]) || 0;
  if (n >= 2) return false;
  const since = n === 0 ? l["Sent At"] : (l["Last Follow-up At"] || l["Sent At"]);
  return daysSince(since) >= FOLLOWUP_DAYS[n];
}

const handlers = {
  async status() {
    const { userEmail, sheet } = await chrome.storage.local.get(["userEmail", "sheet"]);
    let signedIn = false;
    try { await getToken(false); signedIn = true; } catch (_) {}
    const { apolloKey, hunterKey: hk, useHunter = true, useHunterSearch = true, deeplKey, deeplFormal = true } = await chrome.storage.local.get(["apolloKey", "hunterKey", "useHunter", "useHunterSearch", "deeplKey", "deeplFormal"]);
    return { signedIn, userEmail: signedIn ? userEmail : null, sheet: sheet || null, hasApolloKey: !!apolloKey, hasHunterKey: !!hk, useHunter, useHunterSearch, hasDeeplKey: !!deeplKey, deeplFormal };
  },
  async signIn() {
    const token = await getToken(true);
    const userEmail = await getUserEmail(token);
    await chrome.storage.local.set({ userEmail });
    return { userEmail };
  },
  async signOut() {
    await signOut();
    return {};
  },
  async createSheet({ title }) {
    const sheet = await createLeadsSheet(title || "Outreach Leads");
    await chrome.storage.local.set({ sheet });
    return { sheet };
  },
  async connectSheet({ input }) {
    const id = parseSheetId(input);
    if (!id) throw new Error("That doesn't look like a Google Sheet link.");
    const sheet = await connectSheet(id);
    await chrome.storage.local.set({ sheet });
    return { sheet };
  },
  async disconnectSheet() {
    await chrome.storage.local.remove("sheet");
    return {};
  },
  async addLeads({ leads }) {
    const { sheet } = await chrome.storage.local.get("sheet");
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    return appendLeads(sheet.id, leads);
  },
  async saveApolloKey({ key }) {
    const k = (key || "").trim();
    if (k) await chrome.storage.local.set({ apolloKey: k });
    else await chrome.storage.local.remove("apolloKey");
    return {};
  },
  async saveHunterKey({ key }) {
    const k = (key || "").trim();
    if (k) await chrome.storage.local.set({ hunterKey: k });
    else await chrome.storage.local.remove("hunterKey");
    return k ? { account: await hunterAccount() } : {};
  },
  async setUseHunter({ on }) {
    await chrome.storage.local.set({ useHunter: !!on });
    return {};
  },
  async hunterCredits() {
    return { account: await hunterAccount() };
  },
  async apolloSearch(filters) {
    return searchPeople(filters);
  },
  async apolloReveal({ ids }) {
    const leads = await verifyLeads(await revealEmails(ids));
    await addReadyLeads(leads.filter((l) => l.Email), "Apollo");
    return { count: leads.filter((l) => l.Email).length };
  },
  // ---------- capture ----------
  async openDashboard() { await openDashboard(); return {}; },
  async capturePage({ quiet } = {}) {
    const tab = await targetTab();
    if (!tab) throw new Error("Open a web page to capture first.");
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    if (!result || result.kind === "none" || !result.items.length) {
      if (quiet) return { added: 0, duplicates: 0, source: result?.source || "", message: "" };
      throw new Error(result?.message || "Nothing to capture on this page.");
    }
    const r = await addCaptures(result.items, result.source);
    runQueue();
    return { ...r, source: result.source, kind: result.kind, message: result.message, title: tab.title };
  },
  async captures() {
    const all = await allCaptures();
    const job = await getJob();
    return { captures: Object.values(all).sort((a, b) => b.addedAt - a.addedAt), job };
  },
  async supplyContact({ id, website, email }) { await supplyContact(id, { website, email }); return {}; },
  async removeCaptures({ ids }) { await removeCaptures(ids); return {}; },
  async clearCaptures({ statuses }) { await clearCaptures(statuses); return {}; },
  async retryCapture({ id }) { await updateCapture(id, (x) => { x.status = "new"; }); runQueue(); return {}; },
  // Saves the ticked emails to the sheet and marks those captures as saved.
  async saveCaptured({ picks }) {
    const { sheet } = await chrome.storage.local.get("sheet");
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    const all = await allCaptures();
    const leads = [];
    for (const { id, email } of picks) {
      const l = all[id]?.leads.find((x) => x.Email === email);
      if (!l) continue;
      const { verifyReason, apolloStatus, hunterStatus, offDomain, ...clean } = l;
      leads.push(clean);
    }
    const r = await appendLeads(sheet.id, leads);
    const savedIds = new Set(picks.map((p) => p.id));
    for (const id of savedIds) await updateCapture(id, (x) => { x.status = "saved"; x.savedAt = Date.now(); });
    return r;
  },
  async jobStart(opts) { await startJob(opts); return {}; },
  async jobStop() { await stopJob(); return {}; },
  async setUseHunterSearch({ on }) { await chrome.storage.local.set({ useHunterSearch: !!on }); return {}; },
  async verify({ leads }) {
    return { leads: await verifyLeads(leads) };
  },
  async getProfile() {
    const { profile } = await chrome.storage.local.get("profile");
    return { profile: { name: "", portfolio: "", address: "", dailyLimit: 30, ...(profile || {}) } };
  },
  async saveProfile({ profile }) {
    await chrome.storage.local.set({ profile });
    return {};
  },
  // Leads that passed the checks and haven't been emailed yet.
  async readyLeads() {
    const { sheet } = await chrome.storage.local.get("sheet");
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    await connectSheet(sheet.id); // makes sure the header has the newest columns
    const leads = await getLeads(sheet.id);
    const sentToday = sentTodayCount(leads);
    const ready = leads.filter((l) => l.Email && !l["Email Status"] && ["Verified", "Valid"].includes(l.Verification));
    const followUps = leads.filter(followUpDue);
    return { ready, sentToday, followUps, weekend: isWeekend(), stats: styleStats(leads) };
  },
  async sendLeadEmail({ row, to, subject, text, subjectStyle = "", openerStyle = "", lang = "", sendAnyway = false }) {
    const { sheet, userEmail, profile } = await chrome.storage.local.get(["sheet", "userEmail", "profile"]);
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    const limit = Number(profile?.dailyLimit) || 30;
    const leads = await getLeads(sheet.id);
    if (sentTodayCount(leads) >= limit) {
      throw new Error(`You've hit today's limit of ${limit} emails. Sending more from a new address hurts delivery. Change it under Your details if needed.`);
    }
    const lead = leads.find((l) => l.row === row);
    if (!lead || lead.Email !== to) throw new Error("The sheet changed. Reload leads and try again.");
    if (lead["Email Status"]) throw new Error("This lead has already been emailed.");
    if (STRICT.has(lead.Country) && !sendAnyway) {
      throw new Error(`${lead.Country} has strict rules on cold email to businesses. Tick "Send anyway" if you're sure it's allowed for this lead.`);
    }
    const { threadId } = await sendEmail({ to, subject, text, from: userEmail });
    await updateLead(sheet.id, row, {
      "Email Status": "Sent", "Sent At": new Date().toISOString(), Subject: subject, "Gmail Thread ID": threadId,
      "Subject Style": subjectStyle, "Opener Style": openerStyle, ...(lang ? { Language: lang } : {}),
    });
    return { threadId };
  },
  async sendFollowUp({ row, text }) {
    const { sheet, userEmail, profile } = await chrome.storage.local.get(["sheet", "userEmail", "profile"]);
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    if (isWeekend()) throw new Error("Follow-ups only go out on weekdays. Try again on Monday.");
    const limit = Number(profile?.dailyLimit) || 30;
    const leads = await getLeads(sheet.id);
    if (sentTodayCount(leads) >= limit) throw new Error(`You've hit today's limit of ${limit} emails.`);
    const lead = leads.find((l) => l.row === row);
    if (!lead || !followUpDue(lead)) throw new Error("This lead isn't due a follow-up any more. Reload the list.");

    // Check the conversation again right before sending: never follow up on someone who answered.
    const thread = await getThread(lead["Gmail Thread ID"]);
    const hdr = (m, n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
    const me = (userEmail || "").toLowerCase();
    const theirs = (thread.messages || []).filter((m) => !hdr(m, "From").toLowerCase().includes(me));
    if (theirs.length) {
      await runInboxCheck().catch(() => {});
      throw new Error(`${lead.Name || lead.Email} has already answered. Check Analytics or Gmail. No follow-up sent.`);
    }
    const last = (thread.messages || []).at(-1);
    const original = (thread.messages || [])[0];
    const subj = hdr(original, "Subject") || lead.Subject || "";
    const n = (Number(lead["Follow-ups Sent"]) || 0) + 1;
    await sendEmail({
      to: lead.Email, subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`, text, from: userEmail,
      threadId: lead["Gmail Thread ID"], inReplyTo: hdr(last, "Message-ID") || undefined,
    });
    await updateLead(sheet.id, row, { "Follow-ups Sent": String(n), "Last Follow-up At": new Date().toISOString() });
    return { n };
  },
  async stopFollowUps({ row }) {
    const { sheet } = await chrome.storage.local.get("sheet");
    await updateLead(sheet.id, row, { "Follow-ups Sent": "2" });
    return {};
  },
  async skipLead({ row }) {
    const { sheet } = await chrome.storage.local.get("sheet");
    await updateLead(sheet.id, row, { "Email Status": "Skipped" });
    return {};
  },
  // ---------- DeepL ----------
  async saveDeeplKey({ key }) {
    const k = (key || "").trim();
    if (!k) { await chrome.storage.local.remove("deeplKey"); return {}; }
    await chrome.storage.local.set({ deeplKey: k });
    try { return { usage: await deeplUsage() }; } catch (e) { await chrome.storage.local.remove("deeplKey"); throw e; }
  },
  async deeplUsage() { return { usage: await deeplUsage() }; },
  async setDeeplFormal({ on }) { await chrome.storage.local.set({ deeplFormal: !!on }); return {}; },
  async translate({ texts, lang, country }) {
    const { deeplFormal = true } = await chrome.storage.local.get("deeplFormal");
    return { texts: await translate(texts, lang, { formal: deeplFormal, country }) };
  },
  async checkNow() {
    const r = await runInboxCheck();
    return { checked: r.checked, changes: r.changes.length };
  },
  async analytics() {
    const { sheet, lastCheck } = await chrome.storage.local.get(["sheet", "lastCheck"]);
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    await chrome.storage.local.set({ unread: 0 });
    chrome.action.setBadgeText({ text: "" });
    const leads = await getLeads(sheet.id);
    return { ...summarize(leads), stats: styleStats(leads), lastCheck: lastCheck || null };
  },
  async listLeads() {
    const { sheet } = await chrome.storage.local.get("sheet");
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    return { leads: await getLeads(sheet.id) };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  fn(msg.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // keep the channel open for the async reply
});
