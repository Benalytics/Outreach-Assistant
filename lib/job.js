// Automatic capture. You enter what to look for and where, pick the sites, and press Start.
// A small separate window opens and goes through the search result pages by itself, at a
// human pace, capturing the businesses or authors on each page. It stops when enough of them
// have a checked email, when the pages run out, at the daily page limit, or when you stop it.
import { extractPage, scrollMapsList } from "./extract.js";
import { addCaptures, allCaptures, readyCount, runQueue } from "./captures.js";

// The sites automatic capture can go through, in three groups.
export const AUTO_SOURCES = {
  amazon: "Amazon books", goodreads: "Goodreads", kickstarter: "Kickstarter", booksites: "More book sites", maps: "Google Maps",
  instagram: "Instagram", facebook: "Facebook", threads: "Threads", linkedin: "LinkedIn", x: "X (Twitter)",
  linkedinjobs: "LinkedIn Jobs", indeed: "Indeed", reddit: "Reddit hiring posts",
};
export const SOURCE_GROUPS = {
  books: ["amazon", "goodreads", "kickstarter", "booksites", "maps"],
  social: ["instagram", "facebook", "threads", "linkedin", "x"],
  jobs: ["linkedinjobs", "indeed", "reddit"],
};
const PAGES_PER_SOURCE = { maps: 3, amazon: 8, goodreads: 6, kickstarter: 5, booksites: 4, instagram: 5, facebook: 4, threads: 4, linkedin: 5, x: 4, linkedinjobs: 4, indeed: 4, reddit: 3 };
const AMAZON_TLD = {
  "united kingdom": "co.uk", uk: "co.uk", england: "co.uk", scotland: "co.uk", wales: "co.uk", ireland: "co.uk", germany: "de", austria: "de", france: "fr", spain: "es",
  italy: "it", netherlands: "nl", belgium: "nl", canada: "ca", australia: "com.au", india: "in", mexico: "com.mx", brazil: "com.br",
};
const INDEED_HOST = {
  "united kingdom": "uk", uk: "uk", england: "uk", scotland: "uk", ireland: "ie", germany: "de", austria: "at", switzerland: "ch", france: "fr", spain: "es",
  italy: "it", netherlands: "nl", belgium: "be", canada: "ca", australia: "au", "new zealand": "nz", india: "in", nigeria: "ng", "south africa": "za", mexico: "mx", brazil: "br", portugal: "pt",
};
// Book platforms read through a web search (their own search pages need you signed in or run on scripts).
const BOOK_SITES = "(site:reedsy.com/discovery OR site:bookbub.com/authors OR site:bookshop.org OR site:barnesandnoble.com/w OR site:lulu.com/shop OR site:blurb.com/b)";
const SOCIAL_SITE = {
  instagram: "site:instagram.com", facebook: "site:facebook.com", threads: "(site:threads.net OR site:threads.com)",
  linkedin: "site:linkedin.com/in", x: "(site:x.com OR site:twitter.com)",
};
const SUBREDDITS = ["HungryArtists", "IllustratorsForHire", "starvingartists"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = encodeURIComponent;
const today = () => new Date().toISOString().slice(0, 10);

export async function getJob() { return (await chrome.storage.local.get("job")).job || null; }
async function setJob(fn) {
  const job = await getJob();
  if (!job) return null;
  fn(job);
  await chrome.storage.local.set({ job });
  return job;
}

function lookupIn(map, place, fallback) {
  const p = (place || "").toLowerCase();
  for (const [k, v] of Object.entries(map)) if (p.includes(k)) return v;
  return fallback;
}
// "children's book author" -> "children's book": words like author or writer don't help a book search.
const bookWords = (k) => k.replace(/\b(authors?|writers?|illustrators?|creators?|self[- ]published|indie)\b/gi, " ").replace(/\s+/g, " ").trim() || k;
const bing = (query, p) => `https://www.bing.com/search?q=${q(query)}&setlang=en${p ? `&first=${p * 10 + 1}` : ""}`;

function buildTasks({ keyword, place, sources, jobWords }) {
  const where = place ? ` ${place}` : "";
  const lists = sources.map((src) => {
    const t = [];
    const n = PAGES_PER_SOURCE[src];
    const add = (url, page) => t.push({ src, page, url });
    if (src === "maps") {
      const base = [keyword, place && `in ${place}`].filter(Boolean).join(" ");
      [base, `best ${base}`, `${keyword} near ${place}`].slice(0, n).forEach((qq, i) => add(`https://www.google.com/maps/search/${q(qq)}?hl=en`, i + 1));
    }
    if (src === "amazon") {
      const tld = lookupIn(AMAZON_TLD, place, "com");
      for (let p = 0; p < n; p++) add(`https://www.amazon.${tld}/s?k=${q(bookWords(keyword))}&i=stripbooks${p ? `&page=${p + 1}` : ""}`, p + 1);
    }
    if (src === "goodreads") for (let p = 0; p < n; p++) add(`https://www.goodreads.com/search?q=${q(bookWords(keyword))}&search_type=books${p ? `&page=${p + 1}` : ""}`, p + 1);
    if (src === "kickstarter") for (let p = 0; p < n; p++) add(`https://www.kickstarter.com/discover/advanced?category_id=47&sort=newest${p ? `&page=${p + 1}` : ""}`, p + 1);
    if (src === "booksites") for (let p = 0; p < n; p++) add(bing(`${BOOK_SITES} "${bookWords(keyword)}"`, p), p + 1);
    if (SOCIAL_SITE[src]) for (let p = 0; p < n; p++) add(bing(`${SOCIAL_SITE[src]} "${keyword}"${where}${p % 2 ? " email" : ""}`, Math.floor(p / 2)), p + 1);
    if (src === "linkedinjobs") for (let p = 0; p < n; p++) add(`https://www.linkedin.com/jobs/search?keywords=${q(jobWords)}${place ? `&location=${q(place)}` : ""}&f_TPR=r2592000${p ? `&start=${p * 25}` : ""}`, p + 1);
    if (src === "indeed") {
      const sub = lookupIn(INDEED_HOST, place, "www");
      for (let p = 0; p < n; p++) add(`https://${sub}.indeed.com/jobs?q=${q(jobWords)}${place ? `&l=${q(place)}` : ""}&fromage=30${p ? `&start=${p * 10}` : ""}`, p + 1);
    }
    if (src === "reddit") {
      const topic = jobWords.replace(/\b(illustrators?|illustration|artists?|designers?|formatters?|formatting)\b/gi, " ").replace(/\s+/g, " ").trim() || "book";
      SUBREDDITS.slice(0, n).forEach((sub, i) => add(`https://old.reddit.com/r/${sub}/search?q=${q(`hiring ${topic}`)}&restrict_sr=on&sort=new&t=month`, 1 + i * 0));
    }
    return t;
  });
  // One page from each site in turn, so no single site is hammered.
  const tasks = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) tasks.push(l[i]);
  return tasks;
}

export const DEFAULT_JOB_WORDS = "children's book illustrator";

export async function startJob({ keyword, place, sources, jobWords, target = 30, pagesPerDay = 40 }) {
  const existing = await getJob();
  if (existing?.status === "running") throw new Error("Automatic capture is already running.");
  sources = (sources || []).filter((s) => AUTO_SOURCES[s]);
  if (!sources.length) throw new Error("Pick at least one place to look.");
  const needsKeyword = sources.some((s) => !SOURCE_GROUPS.jobs.includes(s) && s !== "kickstarter");
  if (needsKeyword && !keyword?.trim()) throw new Error("Type who you're looking for first, for example \"children's book author\".");
  jobWords = (jobWords || "").trim() || DEFAULT_JOB_WORDS;
  const { jobDaily } = await chrome.storage.local.get("jobDaily");
  const used = jobDaily?.date === today() ? jobDaily.pages : 0;
  if (used >= pagesPerDay) throw new Error(`You've reached today's limit of ${pagesPerDay} pages. It resets tomorrow, or raise it in the settings.`);
  const tasks = buildTasks({ keyword: (keyword || "").trim(), place: (place || "").trim(), sources, jobWords });
  const win = await chrome.windows.create({ url: "about:blank", type: "popup", width: 1100, height: 800, focused: false });
  const job = {
    status: "running", startedAt: Date.now(), keyword, place, sources, jobWords, target: Number(target) || 30, pagesPerDay: Number(pagesPerDay) || 40,
    tasks, idx: 0, windowId: win.id, tabId: win.tabs[0].id, captured: 0, ready: 0, skipped: [], message: "Starting…",
  };
  await chrome.storage.local.set({ job });
  chrome.alarms.create("job-tick", { periodInMinutes: 1 });
  runJob();
  return job;
}

export async function stopJob(message = "Stopped by you. Everything captured is kept.") {
  const job = await setJob((j) => { if (j.status === "running") { j.status = "stopped"; j.message = message; j.finishedAt = Date.now(); } });
  chrome.alarms.clear("job-tick");
  if (job?.windowId) { try { await chrome.windows.remove(job.windowId); } catch (_) {} }
  return job;
}

async function finish(status, message) {
  await setJob((j) => { j.status = status; j.message = message; j.finishedAt = Date.now(); });
  chrome.alarms.clear("job-tick");
  const job = await getJob();
  if (job?.windowId) { try { await chrome.windows.remove(job.windowId); } catch (_) {} }
  try { chrome.notifications.create(`job:${Date.now()}`, { type: "basic", iconUrl: "icons/icon128.png", title: "Automatic capture finished", message }); } catch (_) {}
}

async function waitForLoad(tabId, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if ((await chrome.tabs.get(tabId)).status === "complete") return true; } catch (_) { return false; }
    await sleep(500);
  }
  return true;
}

const BLOCKED = /captcha|unusual traffic|are you a robot|verify you are human|access denied|robot check|enter the characters you see/i;

let looping = false;
// Picks up where it left off, also after Chrome has paused the background (the alarm calls it again).
export async function runJob() {
  if (looping) return;
  looping = true;
  try {
    for (;;) {
      const job = await getJob();
      if (!job || job.status !== "running") return;
      try { await chrome.windows.get(job.windowId); } catch (_) { return finish("stopped", "The capture window was closed, so automatic capture stopped. Everything captured is kept."); }

      const ready = readyCount(await allCaptures(), job.startedAt);
      await setJob((j) => { j.ready = ready; });
      if (ready >= job.target) return finish("done", `Done: ${ready} leads with a checked email are ready to review.`);
      if (job.idx >= job.tasks.length) return finish("done", `Ran out of pages with ${ready} of ${job.target} ready. Try a broader search or another place.`);

      const { jobDaily } = await chrome.storage.local.get("jobDaily");
      const used = jobDaily?.date === today() ? jobDaily.pages : 0;
      if (used >= job.pagesPerDay) return finish("stopped", `Reached today's limit of ${job.pagesPerDay} pages, with ${ready} leads ready. It carries on tomorrow if you start it again.`);

      const task = job.tasks[job.idx];
      if (job.skipped.includes(task.src)) { await setJob((j) => { j.idx++; }); continue; }
      await setJob((j) => { j.message = `Reading ${AUTO_SOURCES[task.src]}, page ${task.page}…`; });
      await chrome.tabs.update(job.tabId, { url: task.url });
      await waitForLoad(job.tabId);
      await sleep(2500 + Math.random() * 2000);
      await chrome.storage.local.set({ jobDaily: { date: today(), pages: used + 1 } });

      let result = null;
      try {
        if (task.src === "maps") await chrome.scripting.executeScript({ target: { tabId: job.tabId }, func: scrollMapsList, args: [8] });
        [{ result }] = await chrome.scripting.executeScript({ target: { tabId: job.tabId }, func: extractPage });
      } catch (e) { result = null; }

      let pageText = "";
      try { [{ result: pageText }] = await chrome.scripting.executeScript({ target: { tabId: job.tabId }, func: () => (document.title + " " + (document.body?.innerText || "").slice(0, 3000)) }); } catch (_) {}
      if (BLOCKED.test(pageText) && !(result?.items?.length)) {
        await setJob((j) => { j.skipped.push(task.src); j.idx++; j.message = `${AUTO_SOURCES[task.src]} asked to check you're human, so it's skipped for this run.`; });
        continue;
      }
      const items = result?.items || [];
      if (items.length) {
        const label = { booksites: "Book sites", reddit: "Reddit" }[task.src] || AUTO_SOURCES[task.src];
        const r = await addCaptures(items, label, { auto: true });
        await setJob((j) => { j.captured += r?.added || 0; });
        runQueue();
      } else if (task.page > 1) {
        // An empty results page means that site has no more results.
        await setJob((j) => { j.skipped.push(task.src); });
      }
      await setJob((j) => { j.idx++; });
      await sleep(3000 + Math.random() * 4000); // human pace between pages
    }
  } catch (e) {
    console.warn("Automatic capture error", e);
  } finally { looping = false; }
}
