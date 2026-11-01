// Runs inside the page you have open (Google Maps, Yelp, or any business website)
// and reads the business details shown on it. Must be self-contained: Chrome copies
// only this function into the page.
export function extractBusinessFromPage() {
  const host = location.hostname;
  const txt = (el) => (el ? el.textContent.trim() : "");
  // Google and Yelp wrap outgoing links in their own redirect; return the real address.
  const unwrap = (href) => {
    if (!href) return "";
    try {
      const u = new URL(href, location.href);
      for (const k of ["q", "url", "u", "adurl"]) {
        const v = u.searchParams.get(k);
        if (v && /^https?:\/\//i.test(v)) return v;
      }
      return u.href;
    } catch (_) { return ""; }
  };
  const out = { site: "Website", name: "", website: "", phone: "", address: "", url: location.href, pageEmails: [], platform: false };
  const isGoogle = /(^|\.)google\.[a-z.]+$/.test(host);
  const isMaps = (isGoogle && location.pathname.startsWith("/maps")) || /^maps\.google\./.test(host);

  if (isMaps) {
    out.site = "Google Maps";
    out.platform = true;
    // The open place's details panel. Only read inside it, never the whole Maps page.
    const panels = [...document.querySelectorAll('div[role="main"][aria-label]')];
    const panel = panels.find((p) => p.querySelector('a[data-item-id="authority"], button[data-item-id="address"], button[data-item-id^="phone:"]')) || null;
    if (!panel) return out; // no place open
    out.name = txt(panel.querySelector("h1")) || panel.getAttribute("aria-label") || "";
    const web = panel.querySelector('a[data-item-id="authority"]');
    out.website = web ? unwrap(web.getAttribute("href")) : "";
    const phone = panel.querySelector('button[data-item-id^="phone:tel:"]');
    out.phone = phone ? phone.getAttribute("data-item-id").replace("phone:tel:", "") : "";
    const addr = panel.querySelector('button[data-item-id="address"]');
    out.address = addr ? (addr.getAttribute("aria-label") || txt(addr)).replace(/^Address:\s*/i, "") : "";
    return out;
  }

  if (/(^|\.)yelp\.[a-z.]+$/.test(host)) {
    out.site = "Yelp";
    out.platform = true;
    if (!location.pathname.startsWith("/biz/")) return out; // not a business page
    out.name = txt(document.querySelector("h1"));
    const redir = [...document.querySelectorAll('a[href*="biz_redir"]')].map((a) => unwrap(a.getAttribute("href"))).find((u) => u && !/yelp\./i.test(new URL(u).hostname));
    out.website = redir || "";
    const phoneP = [...document.querySelectorAll("p")].find((p) => /^\+?[\d\s().-]{10,18}$/.test(p.textContent.trim()));
    out.phone = txt(phoneP);
    out.address = txt(document.querySelector("address"));
    return out;
  }

  // Search engines and social sites: not a business's own website.
  if (isGoogle || /(^|\.)(bing|duckduckgo|yahoo|facebook|instagram|linkedin|twitter|x|tiktok|upwork|fiverr)\.[a-z.]+$/.test(host)) {
    out.site = host;
    out.platform = true;
    return out;
  }

  // A business's own website: read emails from this page too.
  out.name = (document.querySelector('meta[property="og:site_name"]')?.content || document.title || host).trim();
  out.website = location.origin;
  const found = new Set();
  for (const a of document.querySelectorAll('a[href^="mailto:" i]')) {
    const v = decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]).trim().toLowerCase();
    if (v) found.add(v);
  }
  for (const m of (document.body?.innerText || "").matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi)) found.add(m[0].toLowerCase());
  out.pageEmails = [...found];
  return out;
}
