// Checks Gmail for replies and bounces to emails the extension sent, updates the
// sheet, and returns what changed so the background can notify you.
import { googleFetch } from "./auth.js";
import { getLeads, updateLead } from "./sheets.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const DECLINE = /\b(not interested|no thanks|no thank you|unsubscribe|remove me|take me off|stop emailing|don'?t (contact|email)|not at this time|we'?re (all )?set|pass on this)\b|^\s*no\b/i;
const AUTO = /out of (the )?office|automatic reply|auto[- ]?reply|autoreply|away from (the|my) (office|desk)|on vacation|on leave/i;
const BOUNCER = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;

const header = (msg, name) => (msg.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
const fromAddr = (v) => ((v.match(/<([^>]+)>/) || [, v])[1] || "").trim().toLowerCase();

export function classifyReply(subject, snippet) {
  if (AUTO.test(subject) || AUTO.test(snippet)) return "Auto-reply";
  if (DECLINE.test(snippet)) return "Declined";
  return "Interested";
}

async function bouncedAddresses(days = 30) {
  const found = new Set();
  const list = await googleFetch(`${API}/messages?maxResults=100&q=${encodeURIComponent(`from:(mailer-daemon OR postmaster) newer_than:${days}d`)}`);
  for (const m of list.messages || []) {
    const msg = await googleFetch(`${API}/messages/${m.id}?format=metadata&metadataHeaders=X-Failed-Recipients`);
    const failed = header(msg, "X-Failed-Recipients");
    failed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((a) => found.add(a));
    for (const a of (msg.snippet || "").toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []) found.add(a);
  }
  return found;
}

// myEmails: every address you send as (your Gmail address and any Send mail as addresses).
export async function checkInbox(spreadsheetId, myEmails) {
  const mine = new Set([].concat(myEmails || []).map((e) => String(e).toLowerCase()).filter(Boolean));
  const leads = await getLeads(spreadsheetId);
  const open = leads.filter((l) => l["Gmail Thread ID"] && ["Sent", "Opened"].includes(l["Email Status"]));
  if (!open.length) return { changes: [], checked: 0 };

  const bounced = await bouncedAddresses();
  const changes = [];
  for (const lead of open) {
    let status = null;
    let fields = {};
    if (bounced.has(lead.Email.toLowerCase())) {
      status = "Bounced";
      fields = { "Email Status": "Bounced", Verification: "Invalid" };
    } else {
      let thread;
      try {
        thread = await googleFetch(`${API}/threads/${lead["Gmail Thread ID"]}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      } catch (_) { continue; }
      const others = (thread.messages || []).filter((m) => !mine.has(fromAddr(header(m, "From"))));
      const bounce = others.find((m) => BOUNCER.test(header(m, "From")));
      const reply = others.find((m) => !BOUNCER.test(header(m, "From")));
      if (bounce && !reply) {
        status = "Bounced";
        fields = { "Email Status": "Bounced", Verification: "Invalid" };
      } else if (reply) {
        const type = classifyReply(header(reply, "Subject"), reply.snippet || "");
        if (type === "Auto-reply" && others.every((m) => classifyReply(header(m, "Subject"), m.snippet || "") === "Auto-reply")) {
          if (lead["Reply Type"] === "Auto-reply") continue;
          fields = { "Reply Type": "Auto-reply" };
          status = "Auto-reply";
        } else {
          const real = others.find((m) => classifyReply(header(m, "Subject"), m.snippet || "") !== "Auto-reply") || reply;
          const t = classifyReply(header(real, "Subject"), real.snippet || "");
          status = t === "Declined" ? "Declined" : "Replied";
          fields = {
            "Email Status": status, Replied: new Date(Number(real.internalDate)).toISOString(), "Reply Type": t,
          };
          changes.push({ type: status, lead, snippet: real.snippet || "", threadId: lead["Gmail Thread ID"] });
          await updateLead(spreadsheetId, lead.row, fields);
          continue;
        }
      }
    }
    if (status) {
      await updateLead(spreadsheetId, lead.row, fields);
      if (status !== "Auto-reply") changes.push({ type: status, lead, snippet: "", threadId: lead["Gmail Thread ID"] });
    }
  }
  return { changes, checked: open.length };
}

export function summarize(leads) {
  const sent = leads.filter((l) => l["Sent At"]);
  const count = (s) => sent.filter((l) => l["Email Status"] === s).length;
  const replied = count("Replied");
  const declined = count("Declined");
  const bounced = count("Bounced");
  const delivered = sent.length - bounced;
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const byDay = {};
  for (const l of sent) { const d = l["Sent At"].slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
  return {
    totalLeads: leads.length,
    waiting: leads.filter((l) => !l["Email Status"] && ["Verified", "Valid"].includes(l.Verification)).length,
    sent: sent.length, delivered, bounced, replied, declined,
    autoReplies: sent.filter((l) => l["Reply Type"] === "Auto-reply").length,
    followUps: sent.reduce((n, l) => n + (Number(l["Follow-ups Sent"]) || 0), 0),
    awaiting: count("Sent"),
    replyRate: pct(replied + declined, delivered),
    positiveRate: pct(replied, delivered),
    bounceRate: pct(bounced, sent.length),
    byDay: Object.entries(byDay).sort().slice(-14),
    recent: sent.filter((l) => ["Replied", "Declined", "Bounced"].includes(l["Email Status"]))
      .sort((a, b) => (b.Replied || b["Sent At"]).localeCompare(a.Replied || a["Sent At"])).slice(0, 15),
  };
}
