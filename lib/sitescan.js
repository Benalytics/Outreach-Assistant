// Finds email addresses on a business website: the homepage plus up to 3 contact/about pages.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const JUNK_END = /\.(png|jpe?g|gif|svg|webp|css|js|ico)$/i;

function decodeCfEmail(hex) {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

export function emailsFromHtml(html) {
  const text = html
    .replace(/&#64;|&#x40;|\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*|\s*\(\s*dot\s*\)\s*/gi, ".");
  const found = new Set();
  for (const m of text.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) found.add(decodeCfEmail(m[1]));
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]));
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0]);
  return [...found]
    .map((e) => e.toLowerCase().replace(/^[.]+|[.]+$/g, ""))
    .filter((e) => !JUNK_END.test(e) && !/^\d+x@/.test(e) && e.length < 80);
}

async function getHtml(url) {
  try {
    const res = await fetch(url, { redirect: "follow", credentials: "omit" });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("html")) return null;
    return { html: (await res.text()).slice(0, 2_000_000), url: res.url };
  } catch (_) { return null; }
}

export async function scanWebsite(website) {
  if (!website) return { emails: [], pagesChecked: 0 };
  let start;
  try { start = new URL(/^https?:/i.test(website) ? website : `https://${website}`); } catch (_) { return { emails: [], pagesChecked: 0 }; }
  const home = await getHtml(start.href);
  if (!home) return { emails: [], pagesChecked: 0, error: "Couldn't open the website" };

  const emails = new Set(emailsFromHtml(home.html));
  const origin = new URL(home.url).origin;
  const links = new Set();
  for (const m of home.html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!/contact|about|team|connect|reach|get-in-touch/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], home.url);
      if (u.origin === origin) links.add(u.href);
    } catch (_) {}
  }
  let pagesChecked = 1;
  for (const link of [...links].slice(0, 3)) {
    const page = await getHtml(link);
    if (!page) continue;
    pagesChecked++;
    emailsFromHtml(page.html).forEach((e) => emails.add(e));
  }
  return { emails: [...emails], pagesChecked };
}
