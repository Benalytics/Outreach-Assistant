// Automatic capture. You enter what to look for and where, pick the sites, and press Start.
// A small separate window opens and goes through the search result pages by itself, at a
// human pace, capturing the businesses or authors on each page. It stops when enough of them
// have a checked email, when the pages run out, at the daily page limit, or when you stop it.
import { extractPage, scrollMapsList } from "./extract.js";
import { addCaptures, allCaptures, readyCount, runQueue } from "./captures.js";

export const AUTO_SOURCES = { maps: "Google Maps", yelp: "Yelp", trustpilot: "Trustpilot", amazon: "Amazon" };
const PAGES_PER_SOURCE = { maps: 3, yelp: 10, trustpilot: 10, amazon: 10 };
const AMAZON_TLD = {
  "united kingdom": "co.uk", uk: "co.uk", england: "co.uk", germany: "de", austria: "de", france: "fr", spain: "es",
  italy: "it", netherlands: "nl", belgium: "nl", canada: "ca", australia: "com.au", india: "in", mexico: "com.mx", brazil: "com.br",
};

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

function amazonTld(place) {
  const p = (place || "").toLowerCase();
  for (const [k, v] of Object.entries(AMAZON_TLD)) if (p.includes(k)) return v;
  return "com";
}

function buildTasks({ keyword, place, sources }) {
  const lists = sources.map((src) => {
    const t = [];
    const n = PAGES_PER_SOURCE[src];
    if (src === "maps") {
      const base = [keyword, place && `in ${place}`].filter(Boolean).join(" ");
      [base, `best ${base}`, `${keyword} near ${place}`].slice(0, n).forEach((qq, i) => t.push({ src, page: i + 1, url: `https://www.google.com/maps/search/${q(qq)}?hl=en` }));
    }
    if (src === "yelp") for (let p = 0; p < n; p++) t.push({ src, page: p + 1, url: `https://www.yelp.com/search?find_desc=${q(keyword)}&find_loc=${q(place)}${p ? `&start=${p * 10}` : ""}` });
    if (src === "trustpilot") for (let p = 0; p < n; p++) t.push({ src, page: p + 1, url: `https://www.trustpilot.com/search?query=${q([keyword, place].filter(Boolean).join(" "))}${p ? `&page=${p + 1}` : ""}` });
    if (src === "amazon") {
      const tld = amazonTld(place);
      for (let p = 0; p < n; p++) t.push({ src, page: p + 1, url: `https://www.amazon.${tld}/s?k=${q(keyword)}&i=stripbooks${p ? `&page=${p + 1}` : ""}` });
    }
    return t;
  });
  // One page from each site in turn, so no single site is hammered.
  const tasks = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) tasks.push(l[i]);
  return tasks;
}

export async function startJob({ keyword, place, sources, target = 30, pagesPerDay = 40 }) {
  const existing = await getJob();
  if (existing?.status === "running") throw new Error("Automatic capture is already running.");
  if (!keyword?.trim()) throw new Error("Enter what to look for first, for example \"children's book author\" or \"preschool\".");
  sources = (sources || []).filter((s) => AUTO_SOURCES[s]);
  if (!sources.length) throw new Error("Tick at least one site.");
  const { jobDaily } = await chrome.storage.local.get("jobDaily");
  const used = jobDaily?.date === today() ? jobDaily.pages : 0;
  if (used >= pagesPerDay) throw new Error(`You've reached today's limit of ${pagesPerDay} pages. It resets tomorrow, or raise it in the settings.`);
  const tasks = buildTasks({ keyword: keyword.trim(), place: (place || "").trim(), sources });
  const win = await chrome.windows.create({ url: "about:blank", type: "popup", width: 1100, height: 800, focused: false });
  const job = {
    status: "running", startedAt: Date.now(), keyword, place, sources, target: Number(target) || 30, pagesPerDay: Number(pagesPerDay) || 40,
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
        const r = await addCaptures(items, AUTO_SOURCES[task.src], { auto: true });
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
