import { getToken, getUserEmail, signOut } from "./lib/auth.js";
import { createLeadsSheet, connectSheet, parseSheetId, appendLeads, getLeads, updateLead } from "./lib/sheets.js";
import { sendEmail, getThread } from "./lib/gmail.js";
import { FOLLOWUP_DAYS } from "./lib/templates.js";
import { checkInbox, summarize } from "./lib/tracker.js";
import { searchPeople, revealEmails } from "./lib/apollo.js";
import { verifyLeads } from "./lib/verify.js";
import { hunterAccount, hunterDomainSearch, hunterKey } from "./lib/hunter.js";
import { scanWebsite } from "./lib/sitescan.js";
import { extractBusinessFromPage } from "./lib/extract.js";
import { filterBusinessEmails, isPlatformSite } from "./lib/emailfilter.js";

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.alarms.create("check-inbox", { periodInMinutes: 10 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("check-inbox", { periodInMinutes: 10 });
});

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
    const { apolloKey, hunterKey: hk, useHunter = true } = await chrome.storage.local.get(["apolloKey", "hunterKey", "useHunter"]);
    return { signedIn, userEmail: signedIn ? userEmail : null, sheet: sheet || null, hasApolloKey: !!apolloKey, hasHunterKey: !!hk, useHunter };
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
    return { leads: await verifyLeads(await revealEmails(ids)) };
  },
  // Reads the business on the open tab, checks its website for emails, and verifies them.
  async scanActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !/^https?:/.test(tab.url || "")) throw new Error("Open a Google Maps place, a Yelp business page, or a business website first.");
    const [{ result: biz }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractBusinessFromPage });
    if (biz.platform && !biz.name) {
      if (biz.site === "Google Maps") throw new Error("Click one business in Google Maps so its details panel opens on the left, then try again.");
      if (biz.site === "Yelp") throw new Error("Open a single business page on Yelp (its address starts with yelp.com/biz/), then try again.");
      throw new Error("This page isn't a business. Open a business on Google Maps or Yelp, or the business's own website.");
    }
    if (biz.website && isPlatformSite(biz.website)) biz.website = "";
    const site = biz.website ? await scanWebsite(biz.website) : { emails: [], pagesChecked: 0 };
    const { keep, dropped } = filterBusinessEmails([...(biz.pageEmails || []), ...site.emails], biz.website);
    const emails = keep.map((k) => k.email);
    const offDomain = new Set(keep.filter((k) => k.offDomain).map((k) => k.email));
    const base = {
      Name: "", Business: biz.name, Website: biz.website, Phone: biz.phone,
      Location: biz.address, Source: biz.site, "Source URL": biz.url,
    };
    let candidates = emails.map((Email) => ({ ...base, Email }));
    // Nothing on the website: ask Hunter who works at that domain (1 search credit).
    let hunterNote = null;
    if (!candidates.length && biz.website && await hunterKey()) {
      try {
        const found = await hunterDomainSearch(biz.website);
        candidates = found.map((h) => ({ ...base, ...h, Source: `${biz.site} + Hunter` }));
        hunterNote = found.length ? `Hunter found ${found.length}.` : "Hunter found none either.";
      } catch (e) { hunterNote = e.message; }
    }
    const leads = (await verifyLeads(candidates)).map((l) => offDomain.has(l.Email)
      ? { ...l, offDomain: true, verifyReason: `${l.verifyReason}. Different domain from the business website, check it's theirs` }
      : l);
    return { business: biz, pagesChecked: site.pagesChecked, websiteError: site.error || null, hunterNote, dropped, leads };
  },
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
    return { ready, sentToday, followUps, weekend: isWeekend() };
  },
  async sendLeadEmail({ row, to, subject, text }) {
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
    const { threadId } = await sendEmail({ to, subject, text, from: userEmail });
    await updateLead(sheet.id, row, {
      "Email Status": "Sent", "Sent At": new Date().toISOString(), Subject: subject, "Gmail Thread ID": threadId,
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
  async checkNow() {
    const r = await runInboxCheck();
    return { checked: r.checked, changes: r.changes.length };
  },
  async analytics() {
    const { sheet, lastCheck } = await chrome.storage.local.get(["sheet", "lastCheck"]);
    if (!sheet) throw new Error("Connect a Google Sheet first.");
    await chrome.storage.local.set({ unread: 0 });
    chrome.action.setBadgeText({ text: "" });
    return { ...summarize(await getLeads(sheet.id)), lastCheck: lastCheck || null };
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
