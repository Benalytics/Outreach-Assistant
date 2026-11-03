// Web look-ups for captures that are missing something. Runs in the background.
//
// findWebsite(): many captures from Amazon, Goodreads, Kickstarter, Instagram, X, LinkedIn and
// job boards come without a website, and the website is where the email usually is. This looks
// in the places an author lists their site (their Goodreads author page, a link-in-bio page) and
// then does a quick web search for their name, keeping only a result that is clearly their own site.
//
// findJobPosts(): searches for job posts the lead has put up for illustration, cover design or
// book formatting. A lead who is hiring right now is the best lead there is.
//
// Searches go to Bing (DuckDuckGo if Bing refuses), one at a time with a pause in between, and
// stop at a daily limit so no search site is hammered.
import { siteDomain } from "./emailfilter.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
export const DAILY_SEARCHES = 150;
const GAP_MS = 4500;

// Sites that are never somebody's own website.
const PLATFORM = /(^|\.)(google|bing|duckduckgo|yahoo|amazon|audible|goodreads|kickstarter|indiegogo|reddit|facebook|fb|instagram|threads|twitter|x|tiktok|youtube|youtu|linkedin|pinterest|indeed|glassdoor|wikipedia|wikidata|imdb|bookbub|barnesandnoble|bookshop|waterstones|thalia|fnac|kobo|apple|spotify|soundcloud|medium|wattpad|etsy|ebay|walmart|target|booktopia|abebooks|thriftbooks|bookdepository|blackwells|hive|upwork|fiverr|freelancer|peopleperhour|quora|scribd|issuu|smashwords|lulu|blurb|ingramspark|draft2digital|reedsy|yelp|trustpilot|crunchbase|zoominfo|rocketreach|apollo|signalhire|contactout|linktr|beacons|biolinky|campsite|lnk|later|tap|archive|worldcat|librarything|storygraph|publishersweekly|kirkusreviews|scbwi|behance|dribbble|deviantart|artstation|patreon|ko-fi|buymeacoffee|gofundme|eventbrite|meetup|craigslist|ziprecruiter|monster|simplyhired|careerbuilder|stepstone|xing|jooble|adzuna|reed|totaljobs|cvlibrary|welcometothejungle|infojobs|tecnoempleo|bark|thumbtack|houzz|mapquest|tripadvisor|foursquare|issuu|prezi|slideshare)\.[a-z]{2,3}(\.[a-z]{2})?$/i;
export const isPlatform = (url) => { try { return PLATFORM.test(new URL(url).hostname.replace(/^www\./, "")); } catch (_) { return true; } };
const LINK_IN_BIO = /^(linktr\.ee|beacons\.ai|bio\.link|campsite\.bio|lnk\.bio|linkin\.bio|tap\.bio|solo\.to|carrd\.co|msha\.ke|withkoji\.com|hoo\.be|stan\.store|bio\.site|komi\.io|direct\.me)$/i;
const isLinkInBio = (url) => { try { return LINK_IN_BIO.test(new URL(url).hostname.replace(/^www\./, "")); } catch (_) { return false; } };

const decode = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

async function getHtml(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: "omit", signal: ctl.signal, headers: { "Accept-Language": "en-GB,en;q=0.9" } });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 800000);
  } catch (_) { return ""; } finally { clearTimeout(t); }
}

// ---------- web search ----------
let gate = Promise.resolve();
let lastAt = 0;
let pausedUntil = 0;

export async function searchesLeft() {
  const { lookupDaily } = await chrome.storage.local.get("lookupDaily");
  return DAILY_SEARCHES - (lookupDaily?.date === today() ? lookupDaily.n : 0);
}
async function countSearch() {
  const { lookupDaily } = await chrome.storage.local.get("lookupDaily");
  const n = lookupDaily?.date === today() ? lookupDaily.n : 0;
  await chrome.storage.local.set({ lookupDaily: { date: today(), n: n + 1 } });
}

function bingTarget(href) {
  try {
    const u = new URL(decode(href), "https://www.bing.com");
    const enc = u.searchParams.get("u");
    if (/bing\.com$/.test(u.hostname) && enc && enc.startsWith("a1")) return atob(enc.slice(2).replace(/-/g, "+").replace(/_/g, "/"));
    return u.href;
  } catch (_) { return ""; }
}
export function parseBing(html) {
  const out = [];
  for (const block of html.split(/<li[^>]+class="[^"]*\bb_algo\b[^"]*"[^>]*>/i).slice(1)) {
    const a = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const snip = (block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/class="b_lineclamp\d?[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i) || [])[1] || "";
    const url = bingTarget(a[1]);
    if (/^https?:/.test(url)) out.push({ url, title: decode(a[2]), snippet: decode(snip) });
  }
  return out;
}
export function parseDdg(html) {
  const out = [];
  for (const block of html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"[^>]*>/i).slice(1)) {
    const a = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let url = decode(a[1]);
    const m = url.match(/[?&]uddg=([^&]+)/);
    if (m) url = decodeURIComponent(m[1]);
    if (url.startsWith("//")) url = `https:${url}`;
    const snip = (block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "";
    if (/^https?:/.test(url) && !/duckduckgo\.com\/y\.js/.test(url)) out.push({ url, title: decode(a[2]), snippet: decode(snip) });
  }
  return out;
}

const BLOCK = /captcha|unusual traffic|are you a robot|verify you are human|challenge-form|anomaly-modal|detected unusual/i;

// Returns [{url, title, snippet}], or [] when searching is off for now.
export function webSearch(query) {
  const run = gate.then(async () => {
    if (Date.now() < pausedUntil || (await searchesLeft()) <= 0) return [];
    const wait = lastAt + GAP_MS + Math.random() * 2500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    await countSearch();
    const bHtml = await getHtml(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&count=15`);
    let results = parseBing(bHtml);
    if (!results.length) {
      const dHtml = await getHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
      results = parseDdg(dHtml);
      // Both refused (not just "no results"): give the search sites a rest for a while.
      const refused = (h) => !h || BLOCK.test(h);
      if (!results.length && refused(bHtml) && refused(dHtml)) pausedUntil = Date.now() + 15 * 60000;
    }
    return results;
  });
  gate = run.catch(() => {});
  return run;
}

// ---------- finding their own website ----------
const nameTokens = (s) => fold(s).replace(/^u\//, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^(the|and|books?|press|publishing|author|official|llc|ltd|inc|kids|children|illustrat\w*|studio|media|group|company)$/.test(w));

function looksLikeTheirs(result, who) {
  if (isPlatform(result.url) || isLinkInBio(result.url)) return false;
  const host = fold(new URL(result.url).hostname.replace(/^www\./, ""));
  const domain = host.replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9]/g, "");
  const toks = nameTokens(who);
  if (!toks.length) return false;
  const inDomain = toks.filter((t) => domain.includes(t)).length;
  const title = fold(result.title);
  const allInTitle = toks.every((t) => title.includes(t));
  const bookish = /book|author|writ|illustrat|stor(y|ies)|publish|picture|children|kids|educat|learning|school|coach/.test(fold(`${result.title} ${result.snippet}`));
  if (toks.length >= 2 ? inDomain >= 2 || (inDomain >= 1 && allInTitle) : inDomain >= 1 && (allInTitle || bookish)) return true;
  // e.g. "Maya Brooks | Official Website" on brightpagesbooks.com
  return allInTitle && toks.length >= 2 && /official|author|home|website|welcome/.test(title) && bookish;
}

// Real websites and emails linked from a link-in-bio page (linktr.ee/…).
async function fromLinkInBio(url) {
  const html = await getHtml(url);
  if (!html) return {};
  const emails = [...new Set((html.match(EMAIL) || []).map((e) => e.toLowerCase()))].filter((e) => !/\.(png|jpg|gif|webp|svg)$/.test(e)).slice(0, 5);
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => decode(m[1]))
    .filter((u) => !isPlatform(u) && !isLinkInBio(u) && !/\.(png|jpe?g|gif|webp|svg|css|js)(\?|$)/i.test(u) && !/cdn|static|assets|fonts\.|gstatic|cloudfront|schema\.org|w3\.org/i.test(u));
  return { website: links[0] ? new URL(links[0]).origin : "", emails };
}

// The Website line on a Goodreads author page.
async function fromGoodreads(url) {
  const html = await getHtml(url);
  const m = html.match(/dataTitle">\s*Website\s*<\/div>\s*<div[^>]*class="dataItem"[^>]*>\s*<a[^>]+href="([^"]+)"/i);
  const site = m ? decode(m[1]) : "";
  return { website: site && !isPlatform(site) ? new URL(site).origin : "" };
}

// Returns { website, emails, via } with whatever it found, or {} when nothing.
export async function findWebsite(c) {
  const linkInBio = [c.website, c.profileUrl, ...(String(`${c.bio} ${c.note}`).match(/https?:\/\/\S+|\b(?:linktr\.ee|beacons\.ai|bio\.link|lnk\.bio|campsite\.bio)\/\S+/gi) || [])]
    .filter(Boolean).map((u) => (/^https?:/.test(u) ? u : `https://${u}`)).find(isLinkInBio);
  if (linkInBio) {
    const r = await fromLinkInBio(linkInBio);
    if (r.website || r.emails?.length) return { ...r, via: "their link-in-bio page" };
  }
  if (/goodreads\.com\/author\/show\//.test(c.profileUrl || "")) {
    const r = await fromGoodreads(c.profileUrl);
    if (r.website) return { ...r, via: "their Goodreads page" };
  }
  const who = (c.name && !/^u\//.test(c.name) ? c.name : c.business || "").trim();
  if (nameTokens(who).length === 0 || who.length < 4) return {};
  const role = /Kickstarter|Amazon|Goodreads|Instagram|Threads|X$|Facebook|Reddit/.test(c.source) || c.name ? "author" : "";
  const results = await webSearch(`"${who}" ${role || ""} ${c.business && c.name ? c.business : ""} official website`.replace(/\s+/g, " ").trim());
  const hit = results.find((r) => looksLikeTheirs(r, who));
  if (hit) return { website: new URL(hit.url).origin, emails: [...new Set((hit.snippet.match(EMAIL) || []).map((e) => e.toLowerCase()))], via: "a web search for their name" };
  // An author with only a social profile sometimes lists a link-in-bio page in the results.
  const lib = results.find((r) => isLinkInBio(r.url) && nameTokens(who).some((t) => fold(r.title + r.url).includes(t)));
  if (lib) {
    const r = await fromLinkInBio(lib.url);
    if (r.website || r.emails?.length) return { ...r, via: "their link-in-bio page" };
  }
  return {};
}

// ---------- job posts ----------
const JOB_SITE = /(^|\.)(linkedin\.com\/jobs|indeed\.[a-z.]+|glassdoor\.[a-z.]+|reddit\.com\/r\/(hungryartists|illustratorsforhire|forhire|artcommissions|starvingartists|commissions|hireanillustrator|selfpublish|kdp)|upwork\.com\/(freelance-jobs|jobs)|freelancer\.[a-z.]+\/projects|peopleperhour\.com\/freelance-jobs|guru\.com\/jobs|behance\.net\/joblist|dribbble\.com\/jobs|reedsy\.com|bark\.com|ziprecruiter\.[a-z.]+|simplyhired\.[a-z.]+|stepstone\.[a-z.]+|welcometothejungle\.com|jooble\.org|adzuna\.[a-z.]+|bookcareers\.com|publishersmarketplace\.com\/jobs|workinpublishing|creativepool\.com|artstation\.com\/jobs|cartoonbrew\.com\/jobs|mediabistro\.com)/i;
const JOB_WORDS = /\b(hiring|job|jobs|wanted|looking for|seeking|vacanc|position|role|commission|gig|freelance|contract|opportunit)\w*/i;
export const JOB_TOPIC = /illustrat|artist|\bart\b|cover (art|design)|book design|graphic design|character design|format|layout|typeset|interior design|book designer|picture book|children'?s book/i;

// Up to 3 job posts by this lead: [{ title, url, site }]
export async function findJobPosts(c) {
  const who = (c.business || (c.name && !/^u\//.test(c.name) ? c.name : "")).trim();
  if (who.length < 4 || nameTokens(who).length === 0) return [];
  const results = await webSearch(`"${who}" (illustrator OR "cover design" OR "book formatting" OR "book layout" OR "children's book") (hiring OR job OR "looking for")`);
  const toks = nameTokens(who);
  const jobs = [];
  for (const r of results) {
    const text = fold(`${r.title} ${r.snippet}`);
    const onJobSite = JOB_SITE.test(r.url.replace(/^https?:\/\/(www\.)?/, ""));
    if (!onJobSite && !JOB_WORDS.test(r.title)) continue;
    if (!JOB_TOPIC.test(`${r.title} ${r.snippet}`)) continue;
    if (!toks.every((t) => text.includes(t))) continue;
    if (/\[for hire\]|for hire\b|my portfolio|commissions open/i.test(r.title)) continue;
    let site = "";
    try { site = new URL(r.url).hostname.replace(/^www\./, ""); } catch (_) { continue; }
    jobs.push({ title: r.title.replace(/\s*[|–-]\s*(LinkedIn|Indeed\.com|Indeed|Glassdoor|Reddit|Upwork)\b.*$/i, "").replace(/\s*:\s*r\/\w+\s*$/i, "").replace(/[;|]/g, ",").slice(0, 90), url: r.url, site });
    if (jobs.length >= 3) break;
  }
  return jobs;
}

// The capture itself is a job post (LinkedIn Jobs, Indeed, Glassdoor, a Reddit hiring post).
export function ownJobPost(c) {
  const m = (c.note || "").match(/^(?:Hiring|Reddit post): (.+)$/);
  if (!m || !(c.note.startsWith("Hiring:") || /hiring|looking for|seeking/i.test(m[1]))) return null;
  let site = c.source;
  try { site = new URL(c.profileUrl).hostname.replace(/^www\./, ""); } catch (_) {}
  return { title: m[1].replace(/[;|]/g, ",").slice(0, 90), url: c.profileUrl || "", site };
}

export const sameSite = (a, b) => !!a && !!b && siteDomain(a) === siteDomain(b);
