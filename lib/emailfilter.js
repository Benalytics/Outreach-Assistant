// Decides which emails found on a page actually belong to the business.

// Addresses from platforms, website builders and tracking scripts. Never a lead.
const JUNK_DOMAINS = /(^|\.)(google|googlemail\.google|gstatic|googleusercontent|yelp|yelpcdn|facebook|fb|instagram|linkedin|twitter|x|tiktok|apple|microsoft|bing|sentry|sentry-next\.wixpress|wixpress|wix|squarespace|godaddy|shopify|weebly|wordpress|cloudflare|w3|schema|example|domain|email|yourdomain|yoursite|company|sitename|mysite|mailchimp|hubspot|zendesk|intercom|jquery|github|stripe|paypal)\.[a-z.]+$/;
const JUNK_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|privacy|abuse|postmaster|webmaster|dmca|legal|security|example|test|user|name|email|your(name|email)?)@/;
const WEBMAIL = /(^|\.)(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail|zoho|gmx|mail|yandex)\.[a-z.]+$/;

const baseDomain = (h) => h.replace(/^www\./, "").split(".").slice(-2).join(".");

export function siteDomain(website) {
  try { return baseDomain(new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.toLowerCase()); } catch (_) { return ""; }
}

// Returns { keep: [{email, offDomain}], dropped: n }
export function filterBusinessEmails(emails, website) {
  const own = siteDomain(website);
  const keep = [];
  let dropped = 0;
  for (const raw of emails) {
    const e = (raw || "").toLowerCase().trim();
    const domain = e.split("@")[1] || "";
    if (!domain || JUNK_DOMAINS.test(domain) || JUNK_LOCAL.test(e)) { dropped++; continue; }
    const match = own && baseDomain(domain) === own;
    keep.push({ email: e, offDomain: !match && !WEBMAIL.test(domain) });
  }
  // Prefer the business's own addresses: if any exist, other-company ones are left out.
  const ownOnes = keep.filter((k) => !k.offDomain);
  if (ownOnes.length) { dropped += keep.length - ownOnes.length; return { keep: ownOnes, dropped }; }
  return { keep, dropped };
}

export function isPlatformSite(website) {
  return JUNK_DOMAINS.test(siteDomain(website));
}
