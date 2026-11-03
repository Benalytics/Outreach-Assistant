// The capture queue. Everything captured (by hand or automatically) lands here first.
// The background then looks for an email for each one, checks it, and marks it ready to save.
import { scanWebsite } from "./sitescan.js";
import { filterBusinessEmails, isPlatformSite, siteDomain } from "./emailfilter.js";
import { hunterKey, hunterDomainSearch } from "./hunter.js";
import { verifyLeads } from "./verify.js";
import { guessCountry, STRICT } from "./country.js";
import { researchPages, researchText } from "./research.js";
import { pickLang } from "./i18n.js";

const KEY = "captures";
let chain = Promise.resolve();

// One writer at a time, so overlapping updates never overwrite each other.
function mutate(fn) {
  chain = chain.then(async () => {
    const all = (await chrome.storage.local.get(KEY))[KEY] || {};
    const r = await fn(all);
    await chrome.storage.local.set({ [KEY]: all });
    return r;
  }).catch((e) => { console.warn("capture update failed", e); return null; });
  return chain;
}
export async function allCaptures() {
  return (await chrome.storage.local.get(KEY))[KEY] || {};
}

const dedupeKey = (c) => {
  const d = c.website ? siteDomain(c.website) : "";
  if (d) return `site:${d}`;
  if (c.handle) return `handle:${c.source}:${c.handle.toLowerCase()}`;
  return `name:${c.source}:${(c.name || c.business || "").toLowerCase()}:${(c.address || "").toLowerCase().slice(0, 30)}`;
};

// Adds page items to the queue. Returns { added, duplicates, ids }.
export async function addCaptures(items, source, extra = {}) {
  return mutate((all) => {
    const keys = new Set(Object.values(all).map((c) => c.key));
    let added = 0, duplicates = 0;
    const ids = [];
    for (const it of items) {
      const c = {
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        source, name: it.name || "", business: it.business || "", website: it.website && !isPlatformSite(it.website) ? it.website : "",
        phone: it.phone || "", address: it.address || "", profileUrl: it.profileUrl || "", handle: it.handle || "",
        bio: it.bio || "", note: it.note || "", rating: it.rating || "", reviews: it.reviews || "",
        pageEmails: it.emails || [], amazonTld: it.amazonTld || "", needsLookup: !!it.needsLookup,
        status: "new", leads: [], addedAt: Date.now(), ...extra,
      };
      c.country = it.country || guessCountry(c);
      c.key = dedupeKey(c);
      if (keys.has(c.key)) { duplicates++; continue; }
      keys.add(c.key);
      all[c.id] = c;
      ids.push(c.id);
      added++;
    }
    return { added, duplicates, ids };
  });
}

// Apollo results arrive with emails already; they go straight in as ready.
export async function addReadyLeads(leads, source) {
  return mutate((all) => {
    for (const l of leads) {
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const country = l.Country || guessCountry({ address: l.Location || "", website: l.Website || "" });
      all[id] = {
        id, source, name: l.Name, business: l.Business, website: l.Website, address: l.Location, country, strict: STRICT.has(country),
        profileUrl: l["Source URL"], note: l.Notes, status: "ready", addedAt: Date.now(), key: `email:${l.Email}`,
        leads: [{ ...l, Country: country, Language: pickLang({ country }) }],
      };
    }
  });
}

export const updateCapture = (id, fn) => mutate((all) => { if (all[id]) fn(all[id]); return all[id]; });
export const removeCaptures = (ids) => mutate((all) => { ids.forEach((id) => delete all[id]); });
export const clearCaptures = (statuses) => mutate((all) => {
  for (const [id, c] of Object.entries(all)) if (!statuses || statuses.includes(c.status)) delete all[id];
});

// ---------- finding the email ----------
async function yelpWebsite(url) {
  try {
    const html = await (await fetch(url, { credentials: "omit" })).text();
    const m = html.match(/biz_redir\?url=([^&"']+)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch (_) { return ""; }
}

function toLead(c, email, extra = {}) {
  const notes = [c.note, c.handle, c.bio && c.bio.slice(0, 160)].filter(Boolean).join(" · ");
  return {
    Name: extra.Name || c.name || "", Business: c.business || "", Email: email, Website: c.website || "",
    Phone: c.phone || "", Location: c.address || "", Country: c.country || "", Source: extra.Source || c.source,
    "Source URL": c.profileUrl || "", Notes: extra.Notes ? [extra.Notes, notes].filter(Boolean).join(" · ") : notes,
    Rating: c.rating ? `${c.rating}${c.reviews ? ` (${c.reviews})` : ""}` : "", hunterStatus: extra.hunterStatus || "",
    Research: researchText(c.research), Language: c.lang || pickLang({ country: c.country }),
  };
}

async function processOne(id) {
  const c = (await allCaptures())[id];
  if (!c || c.status !== "new") return;
  await updateCapture(id, (x) => { x.status = "checking"; x.checkingAt = Date.now(); x.error = ""; });
  try {
    let website = c.website;
    if (!website && c.source === "Yelp" && /yelp\.[a-z.]+\/biz\//.test(c.profileUrl)) {
      website = await yelpWebsite(c.profileUrl);
      if (website && isPlatformSite(website)) website = "";
      if (website) await updateCapture(id, (x) => { x.website = website; x.country = x.country || guessCountry(x); });
    }
    const site = website ? await scanWebsite(website) : { emails: [], pagesChecked: 0 };
    const { keep } = filterBusinessEmails([...(c.pageEmails || []), ...site.emails], website || "");
    const offDomain = new Set(keep.filter((k) => k.offDomain).map((k) => k.email));
    const research = researchPages(site.pages || [], { note: c.note, bio: c.bio });
    const country = c.country || guessCountry({ ...c, website });
    const lang = pickLang({ siteLang: research.lang, country });
    await updateCapture(id, (x) => { x.research = research; x.lang = lang; x.country = country; });
    const fresh = { ...c, website, country, research, lang };
    let candidates = keep.map((k) => toLead(fresh, k.email));
    let hunterNote = "";
    const { useHunterSearch = true } = await chrome.storage.local.get("useHunterSearch");
    if (!candidates.length && website && useHunterSearch && await hunterKey()) {
      try {
        const found = await hunterDomainSearch(website);
        candidates = found.map((h) => toLead(fresh, h.Email, { Name: h.Name, Notes: h.Notes, Source: `${c.source} + Hunter`, hunterStatus: h.hunterStatus }));
        hunterNote = found.length ? "" : "Hunter had none either.";
      } catch (e) { hunterNote = e.message; }
    }
    if (!website && !candidates.length) {
      await updateCapture(id, (x) => { x.status = "needs_website"; });
      return;
    }
    const leads = (await verifyLeads(candidates)).map((l) => offDomain.has(l.Email)
      ? { ...l, offDomain: true, verifyReason: `${l.verifyReason}. Different domain from the website, check it's theirs` } : l);
    await updateCapture(id, (x) => {
      x.leads = leads;
      x.pagesChecked = site.pagesChecked;
      x.status = leads.length ? "ready" : "no_email";
      x.error = !leads.length ? (site.error || hunterNote || "") : "";
      x.strict = STRICT.has(x.country);
    });
  } catch (e) {
    await updateCapture(id, (x) => { x.status = "error"; x.error = e.message; });
  }
}

let running = false;
let again = false;
// Works through new captures, three at a time.
export async function runQueue() {
  if (running) { again = true; return; }
  running = true;
  try {
    do {
      again = false;
      const all = await allCaptures();
      // A check cut off by Chrome closing goes back in line.
      for (const c of Object.values(all)) {
        if (c.status === "checking" && Date.now() - (c.checkingAt || 0) > 120000) await updateCapture(c.id, (x) => { x.status = "new"; });
      }
      const ids = Object.values(await allCaptures()).filter((c) => c.status === "new").sort((a, b) => a.addedAt - b.addedAt).map((c) => c.id);
      const worker = async () => { while (ids.length) await processOne(ids.shift()); };
      await Promise.all([worker(), worker(), worker()]);
    } while (again);
  } finally { running = false; }
}

// You typed a website or an email for a capture that had none.
export async function supplyContact(id, { website, email }) {
  await updateCapture(id, (x) => {
    if (website) { x.website = /^https?:/i.test(website) ? website : `https://${website}`; x.country = x.country || guessCountry(x); }
    if (email) x.pageEmails = [...new Set([...(x.pageEmails || []), email.trim().toLowerCase()])];
    x.status = "new";
  });
  runQueue();
}

export function readyCount(all, since = 0) {
  return Object.values(all).filter((c) => c.addedAt >= since && c.status === "ready" && c.leads.some((l) => ["Verified", "Valid"].includes(l.Verification))).length;
}
