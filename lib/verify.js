import { hunterKey, hunterVerify } from "./hunter.js";

// Email checks that work from a browser: format, throwaway domains, and whether the
// domain can receive mail (MX lookup). A browser can't log in to a mail server to test
// a single mailbox, so Apollo's own status is used when we have it, and bounces are
// tracked after sending.

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com", "dispostable.com",
  "maildrop.cc", "fakeinbox.com", "throwawaymail.com", "mohmal.com", "emailondeck.com",
]);
const PLACEHOLDER = new Set(["example.com", "domain.com", "email.com", "yourdomain.com", "company.com", "sentry.io", "wixpress.com", "sentry-next.wixpress.com"]);
const ROLE = /^(info|contact|hello|hi|admin|office|support|sales|team|enquiries|inquiries|mail|help|booking|bookings)@/;
const SYNTAX = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

const mxCache = new Map();
async function hasMx(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok = null;
  const q = `name=${encodeURIComponent(domain)}&type=MX`;
  for (const url of [`https://dns.google/resolve?${q}`, `https://cloudflare-dns.com/dns-query?${q}`]) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.Status !== 0 && data.Status !== 3) continue; // lookup failed, try the next resolver
      ok = Array.isArray(data.Answer) && data.Answer.some((a) => a.type === 15 && !/^0\s+\.$/.test(a.data.trim()));
      break;
    } catch (_) { /* try the next resolver */ }
  }
  mxCache.set(domain, ok);
  return ok;
}

// Returns { status, reason }. status is one of: Verified, Valid, Invalid, Unknown.
// Verified and Valid are kept; Invalid and Unknown are filtered out by default.
export async function verifyEmail(email, apolloStatus = "", opts = {}) {
  const e = (email || "").trim().toLowerCase();
  if (!SYNTAX.test(e)) return { status: "Invalid", reason: "Not a real email format" };
  const domain = e.split("@")[1];
  if (DISPOSABLE.has(domain)) return { status: "Invalid", reason: "Throwaway email service" };
  if (PLACEHOLDER.has(domain)) return { status: "Invalid", reason: "Placeholder address" };

  const s = apolloStatus.toLowerCase();
  if (s === "verified") return { status: "Verified", reason: "Verified by Apollo" };
  if (s === "unavailable" || s === "bounced" || s === "invalid") return { status: "Invalid", reason: `Apollo marks it ${s}` };

  const mx = await hasMx(domain);
  if (mx === false) return { status: "Invalid", reason: "Domain can't receive email" };

  // Hunter checks the actual mailbox, when you've added a key and left it switched on.
  if (opts.useHunter && !opts.hunterError && await hunterKey()) {
    try {
      const h = await hunterVerify(e);
      if (h) return h;
    } catch (err) {
      opts.hunterError = err.message;
    }
  }
  if (mx === null) return { status: "Unknown", reason: "Couldn't check the domain" };
  const role = ROLE.test(e) ? " (shared inbox)" : "";
  if (s === "extrapolated" || s === "guessed" || s === "likely to engage") {
    return { status: "Valid", reason: `Domain accepts email; Apollo says ${s}${role}` };
  }
  return { status: "Valid", reason: `Domain accepts email${role}` };
}

export async function verifyLeads(leads) {
  const { useHunter = true } = await chrome.storage.local.get("useHunter");
  const opts = { useHunter };
  // One at a time when Hunter is on, to stay inside its rate limit.
  const out = [];
  for (const l of leads) {
    const v = l.hunterStatus === "valid" && SYNTAX.test(l.Email || "")
      ? { status: "Verified", reason: "Verified by Hunter" }
      : await verifyEmail(l.Email, l.apolloStatus, opts);
    out.push({ ...l, Verification: v.status, verifyReason: v.reason + (opts.hunterError && !/Hunter/.test(v.reason) ? ` (Hunter skipped: ${opts.hunterError})` : ""), "Verified At": new Date().toISOString() });
  }
  return out;
}

