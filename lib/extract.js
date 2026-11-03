// Page readers. Each function here is copied by Chrome into the page you have open,
// so it must be completely self-contained (no imports, no outside helpers).
//
// extractPage() reads whatever the current page shows and returns
//   { source, kind: "one" | "list" | "none", items: [...], message }
// Each item: { name, business, website, phone, address, country, profileUrl, handle,
//              bio, note, emails: [], rating, reviews, needsLookup }

export function extractPage() {
  const host = location.hostname.replace(/^www\./, "");
  const path = location.pathname;
  const T = (el) => (el ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const Q = (sel, root = document) => root.querySelector(sel);
  const QA = (sel, root = document) => [...root.querySelectorAll(sel)];
  const meta = (p) => (Q(`meta[property="${p}"]`) || Q(`meta[name="${p}"]`))?.getAttribute("content")?.trim() || "";
  const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
  const emailsIn = (s) => [...new Set((String(s || "").match(EMAIL) || []).map((e) => e.toLowerCase()))];
  const SOCIAL = /(^|\.)(google|goo\.gl|g\.page|yelp|trustpilot|amazon|facebook|fb|instagram|threads|twitter|x|tiktok|youtube|linkedin|pinterest|linktr\.ee|indeed|glassdoor|wa\.me|t\.co)\.?[a-z.]*$/i;
  // Platforms wrap outgoing links in their own redirect. Return the real address.
  const unwrap = (href) => {
    if (!href) return "";
    try {
      let u = new URL(href, location.href);
      for (let i = 0; i < 2; i++) {
        const inner = ["q", "url", "u", "adurl", "dest", "target"].map((k) => u.searchParams.get(k)).find((v) => v && /^https?:\/\//i.test(v));
        if (!inner) break;
        u = new URL(inner);
      }
      return u.href;
    } catch (_) { return ""; }
  };
  const ownSite = (href) => {
    const u = unwrap(href);
    if (!u) return "";
    try {
      const h = new URL(u).hostname.replace(/^www\./, "");
      return SOCIAL.test(h) ? "" : new URL(u).origin;
    } catch (_) { return ""; }
  };
  const textSite = (s) => {
    const m = String(s || "").match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s]*)?)/i);
    return m ? ownSite(/^https?:/i.test(m[1]) ? m[1] : `https://${m[1]}`) : "";
  };
  const num = (s) => {
    const m = String(s || "").replace(/,/g, "").match(/([\d.]+)\s*([kKmM])?/);
    if (!m) return "";
    let n = parseFloat(m[1]);
    if (/k/i.test(m[2] || "")) n *= 1000;
    if (/m/i.test(m[2] || "")) n *= 1e6;
    return Number.isFinite(n) ? String(Math.round(n)) : "";
  };
  const ratingIn = (el) => {
    if (!el) return {};
    const labels = QA("[aria-label]", el).map((x) => x.getAttribute("aria-label")).concat([T(el).slice(0, 400)]);
    let rating = "", reviews = "";
    for (const l of labels) {
      const r = l.match(/(\d(?:[.,]\d)?)\s*(?:stars?|star rating|out of 5)/i);
      if (r && !rating) rating = r[1].replace(",", ".");
      const c = l.match(/([\d.,]+[kK]?)\s*(?:reviews?|ratings?)/i) || l.match(/\(([\d.,]+[kK]?)\)/);
      if (c && !reviews) reviews = num(c[1]);
    }
    return { rating, reviews };
  };
  const item = (o) => ({ name: "", business: "", website: "", phone: "", address: "", country: "", profileUrl: location.href, handle: "", bio: "", note: "", emails: [], rating: "", reviews: "", ...o });
  const out = (source, kind, items, message = "") => ({ source, kind, items: items.filter((i) => i.name || i.business || i.website || i.emails.length || i.handle), message });

  // ---------------- Google Maps ----------------
  if ((/^google\./.test(host) && path.startsWith("/maps")) || /^maps\.google\./.test(host)) {
    const panels = QA('div[role="main"][aria-label]');
    const panel = panels.find((p) => Q('a[data-item-id="authority"], button[data-item-id="address"], button[data-item-id^="phone:"]', p));
    if (panel) {
      const h1 = QA("h1", panel).map(T).filter((t) => t && !/^(results?|sponsored)$/i.test(t));
      const web = Q('a[data-item-id="authority"]', panel);
      const phone = Q('button[data-item-id^="phone:tel:"]', panel);
      const addr = Q('button[data-item-id="address"]', panel);
      const name = h1[0] || panel.getAttribute("aria-label") || "";
      return out("Google Maps", "one", [item({
        business: name, website: web ? ownSite(web.getAttribute("href")) : "",
        phone: phone ? phone.getAttribute("data-item-id").replace("phone:tel:", "") : "",
        address: addr ? (addr.getAttribute("aria-label") || T(addr)).replace(/^Address:\s*/i, "") : "",
        ...ratingIn(Q("div.F7nice", panel)?.parentElement || panel),
      })]);
    }
    const cards = QA('div[role="feed"] a[href*="/maps/place/"]');
    if (cards.length) {
      const items = [];
      for (const a of cards) {
        const card = a.closest("div.Nv2PK") || a.parentElement?.parentElement;
        const site = card && Q('a[data-value="Website"], a[aria-label^="Website"], a[aria-label^="Visit"]', card);
        items.push(item({
          business: (a.getAttribute("aria-label") || T(a)).trim(),
          website: site ? ownSite(site.getAttribute("href")) : "",
          profileUrl: a.href, ...ratingIn(card),
          needsLookup: !site,
        }));
      }
      return out("Google Maps", "list", items, "Captured the businesses visible in the list. Scroll for more, then capture again.");
    }
    return out("Google Maps", "none", [], "Search for something on Google Maps, or click a business so its details open.");
  }

  // ---------------- Yelp ----------------
  if (/^yelp\./.test(host)) {
    if (path.startsWith("/biz/")) {
      const redir = QA('a[href*="biz_redir"]').map((a) => ownSite(a.getAttribute("href"))).find(Boolean);
      const phoneP = QA("p").find((p) => /^\+?[\d\s().-]{10,18}$/.test(T(p)));
      return out("Yelp", "one", [item({
        business: T(Q("h1")), website: redir || "", phone: T(phoneP), address: T(Q("address")),
        ...ratingIn(Q("h1")?.parentElement?.parentElement),
      })]);
    }
    const seen = new Set();
    const items = [];
    for (const a of QA('a[href^="/biz/"]')) {
      const href = a.getAttribute("href").split("?")[0];
      const name = T(a);
      if (seen.has(href) || !name || name.length < 2 || /^(more|read more|\d+)$/i.test(name) || a.closest("[class*=photo]")) continue;
      seen.add(href);
      const card = a.closest("li") || a.closest('div[class*="container"]');
      items.push(item({ business: name, profileUrl: new URL(href, location.origin).href, ...ratingIn(card), needsLookup: true }));
    }
    return out("Yelp", items.length ? "list" : "none", items, items.length ? "Captured the businesses on this results page." : "Search on Yelp or open a business page.");
  }

  // ---------------- Trustpilot ----------------
  if (/(^|\.)trustpilot\./.test(host)) {
    const m = path.match(/^\/review\/([^/?#]+)/);
    if (m) {
      return out("Trustpilot", "one", [item({
        business: T(Q("h1")).replace(/\s*Reviews?\s*[\d,.]*$/i, ""), website: ownSite(`https://${m[1]}`),
        address: T(Q('[data-business-location], address')),
        emails: emailsIn(T(Q("aside")) || ""), ...ratingIn(Q("h1")?.parentElement?.parentElement),
      })]);
    }
    const seen = new Set();
    const items = [];
    for (const a of QA('a[href^="/review/"]')) {
      const dom = a.getAttribute("href").split("/")[2]?.split("?")[0];
      if (!dom || seen.has(dom) || !dom.includes(".")) continue;
      seen.add(dom);
      const card = a.closest("div[class*=card], article, li") || a;
      const name = T(Q("p, h3, span", a)) || T(a).split(/\s{2,}|\n/)[0];
      items.push(item({ business: name || dom, website: ownSite(`https://${dom}`), profileUrl: new URL(a.getAttribute("href"), location.origin).href, ...ratingIn(card) }));
    }
    return out("Trustpilot", items.length ? "list" : "none", items, items.length ? "Captured the companies on this page." : "Search on Trustpilot or open a company page.");
  }

  // ---------------- Amazon ----------------
  if (/^amazon\./.test(host) || /(^|\.)amazon\.[a-z.]+$/.test(host)) {
    const tld = host.replace(/^.*?amazon\./, "");
    const isBook = /\/(dp|gp\/product)\//.test(path) && Q("#productTitle");
    const isAuthor = /\/(e|stores\/[^/]+\/author)\//.test(path) || /\/-\/e\//.test(path) || /\/author\//.test(path);
    if (isBook) {
      const title = T(Q("#productTitle"));
      const detail = T(Q("#detailBullets_feature_div")) + " " + T(Q("#rpi-attribute-book_details-publisher")) + " " + T(Q("#productDetailsTable"));
      const pub = (detail.match(/(?:Publisher|Herausgeber|Verlag|Éditeur|Editorial|Editore|Uitgever|Editora)\s*[:‏‎\s]*([^;(\n]{2,60})/i) || [])[1]?.trim() || "";
      const selfPub = /independently published|unabhängig veröffentlicht|publié indépendamment|publicado de forma independiente|pubblicato in modo indipendente|createspace|kdp/i.test(pub + detail);
      const authors = QA("#bylineInfo .author").map((s) => ({
        name: T(Q("a", s)).replace(/\s*\(Author\)|\s*\(Illustrator\)/gi, "").trim(),
        role: T(Q(".contribution", s)).replace(/[(),]/g, "").trim(),
        link: Q("a", s)?.href || "",
      })).filter((a) => a.name);
      const writers = authors.filter((a) => !a.role || /auth?or|auteur|autore|auteur/i.test(a.role));
      const hasIllustrator = authors.some((a) => /illustra|ilustra|zeichn/i.test(a.role));
      const note = [`Book: ${title}`, pub && `Publisher: ${pub}`, selfPub && "Self-published", hasIllustrator && "Already credits an illustrator"].filter(Boolean).join(" · ");
      return out("Amazon", "one", (writers.length ? writers : authors).slice(0, 3).map((a) => item({
        name: a.name, business: "", profileUrl: a.link || location.href, note, amazonTld: tld, needsLookup: true,
      })), selfPub ? "Self-published book: a good sign." : "");
    }
    if (isAuthor) {
      const name = T(Q("h1")) || meta("og:title").replace(/^Amazon\.[a-z.]+:\s*/i, "");
      const bio = T(Q('[data-testid="author-bio"], #authorBio, .AuthorBio__author-bio__author-biography__WeqwH')) || meta("description");
      const site = QA("a[href]").map((a) => a.getAttribute("href")).filter((h) => /^https?:/i.test(h || "")).map(ownSite).find(Boolean) || textSite(bio);
      return out("Amazon", "one", [item({ name, website: site, bio: bio.slice(0, 400), emails: emailsIn(bio), note: "Amazon author page", amazonTld: tld, needsLookup: !site })]);
    }
    const results = QA('div[data-component-type="s-search-result"]');
    if (results.length) {
      const items = [];
      const seen = new Set();
      for (const r of results) {
        const title = T(Q("h2", r));
        const byRow = QA(".a-row", r).find((row) => /^\s*by\s/i.test(T(row)) || /\bby\b/i.test(T(row).slice(0, 4)));
        const names = byRow ? QA("a, span.a-size-base", byRow).map(T).filter((t) => t && !/^(by|and|,|\||kindle|paperback|hardcover|\d.*)$/i.test(t) && t.length < 60) : [];
        const name = names[0] || "";
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        const link = Q("h2 a", r)?.href || Q("a.a-link-normal", r)?.href || "";
        items.push(item({ name, profileUrl: link, note: `Book: ${title}`, amazonTld: tld, needsLookup: true }));
      }
      return out("Amazon", items.length ? "list" : "none", items, "Captured the authors on this results page.");
    }
    return out("Amazon", "none", [], "Open an Amazon book page, an author page, or book search results.");
  }

  // ---------------- Goodreads (authors and their books) ----------------
  if (/(^|\.)goodreads\.com$/.test(host)) {
    if (/^\/author\/show\//.test(path)) {
      const name = T(Q("h1.authorName span, h1.authorName, h1[data-testid='name'], h1"));
      const field = (label) => { const d = QA(".dataTitle").find((x) => new RegExp(label, "i").test(T(x))); return d ? d.nextElementSibling : null; };
      const webEl = field("^website");
      const site = webEl ? QA("a", webEl).map((a) => ownSite(a.getAttribute("href"))).find(Boolean) || "" : "";
      const bio = T(Q(".aboutAuthorInfo span[style*='display:none'], .aboutAuthorInfo, [data-testid='description'], .authorBio")).slice(0, 400);
      const genre = T(field("^genre"));
      const books = QA("a.bookTitle span[itemprop='name'], a.bookTitle").map(T).filter(Boolean);
      const tw = T(field("^twitter"));
      return out("Goodreads", "one", [item({
        name, website: site || textSite(bio), bio, emails: emailsIn(bio), handle: tw ? `@${tw.replace(/^@/, "")}` : "",
        address: T(field("^born")).replace(/^in\s+/i, "").slice(0, 80),
        note: [books[0] && `Book: ${books[0]}`, genre && `Genre: ${genre}`].filter(Boolean).join(" · ") || "Goodreads author",
        profileUrl: location.origin + path, needsLookup: !site,
      })]);
    }
    if (/^\/book\/show\//.test(path)) {
      const title = T(Q("h1[data-testid='bookTitle'], h1#bookTitle, h1"));
      const people = QA(".ContributorLink, a.authorName").map((a) => ({
        name: T(Q("[data-testid='name'], span[itemprop='name']", a)) || T(a),
        role: T(Q("[data-testid='role'], .role", a.parentElement)).replace(/[()]/g, ""),
        link: a.href,
      })).filter((x) => x.name);
      const writers = people.filter((x) => !/illustrat/i.test(x.role));
      const illustrated = people.some((x) => /illustrat/i.test(x.role));
      const note = [`Book: ${title}`, illustrated && "Already credits an illustrator"].filter(Boolean).join(" · ");
      return out("Goodreads", "one", (writers.length ? writers : people).slice(0, 2).map((x) => item({ name: x.name, profileUrl: x.link, note, needsLookup: true })));
    }
    const items = [];
    const seen = new Set();
    for (const r of QA("tr[itemtype*='schema.org/Book'], table.tableList tr, [data-testid='bookListItem']")) {
      const a = Q("a.authorName, a[href*='/author/show/']", r);
      if (!a) continue;
      const name = T(Q("span[itemprop='name']", a)) || T(a);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const title = T(Q("a.bookTitle span[itemprop='name'], a.bookTitle, a[href*='/book/show/']", r));
      items.push(item({ name, profileUrl: a.href.split("?")[0], note: title ? `Book: ${title}` : "", ...ratingIn(Q(".minirating", r)), needsLookup: true }));
    }
    return out("Goodreads", items.length ? "list" : "none", items, items.length ? "Captured the authors on this page. Their Goodreads pages are checked for a website." : "Search books on Goodreads, or open an author or book page.");
  }

  // ---------------- Kickstarter (children's book projects) ----------------
  if (/(^|\.)kickstarter\.com$/.test(host)) {
    const parse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
    if (/^\/projects\//.test(path)) {
      const title = meta("og:title").replace(/\s*(—|-|by)\s.*?Kickstarter$/i, "") || T(Q("h1, h2.project-name"));
      const creator = T(Q("[data-test-id='creator-name'], .creator-name, a[href*='/creator_bio'], a[href*='/profile/'] span, a[href*='/profile/']"));
      const loc = T(Q("a[href*='/discover/places/']"));
      const blurb = meta("og:description") || meta("description");
      return out("Kickstarter", "one", [item({
        name: creator.replace(/^by\s+/i, ""), address: loc, bio: blurb.slice(0, 400), emails: emailsIn(blurb),
        profileUrl: location.origin + path.split("/").slice(0, 4).join("/"), note: `Kickstarter project: ${title}`, needsLookup: true,
      })], "Kickstarter creators often still need art, layout or a print-ready file.");
    }
    const items = [];
    const seen = new Set();
    for (const el of QA("[data-project]")) {
      const pr = parse(el.getAttribute("data-project"));
      const name = pr?.creator?.name;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      items.push(item({ name, address: pr.location?.displayable_name || pr.location?.name || "", bio: (pr.blurb || "").slice(0, 300),
        profileUrl: pr.urls?.web?.project || location.href, note: `Kickstarter project: ${pr.name}`, needsLookup: true }));
    }
    if (!items.length) {
      for (const card of QA("[class*='project-card'], .js-react-proj-card, div[data-ref='project_card']")) {
        const a = Q("a[href*='/projects/']", card);
        const name = T(Q("a[href*='/profile/'], [class*='creator'], .project-byline", card)).replace(/^by\s+/i, "");
        if (!a || !name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        items.push(item({ name, profileUrl: a.href.split("?")[0], note: `Kickstarter project: ${T(Q("h3, [class*='title']", card)) || T(a)}`, needsLookup: true }));
      }
    }
    return out("Kickstarter", items.length ? "list" : "none", items, items.length ? "Captured the creators on this page." : "Open Kickstarter's Children's Books projects, or a single project.");
  }

  // ---------------- LinkedIn: people, companies and job posts ----------------
  if (/(^|\.)linkedin\.com$/.test(host)) {
    if (path.startsWith("/jobs")) {
      const one = /\/jobs\/view\//.test(path) || location.search.includes("currentJobId");
      const title1 = T(Q("h1.top-card-layout__title, .job-details-jobs-unified-top-card__job-title h1, .t-24.job-details-jobs-unified-top-card__job-title"));
      if (one && title1) {
        const company = T(Q("a.topcard__org-name-link, .topcard__org-name-link, .job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name"));
        const loc = T(Q(".topcard__flavor--bullet, .job-details-jobs-unified-top-card__primary-description-container .tvm__text"));
        const desc = T(Q(".show-more-less-html__markup, #job-details")).slice(0, 3000);
        return out("LinkedIn Jobs", "one", [item({ business: company, address: loc, note: `Hiring: ${title1}`, emails: emailsIn(desc), bio: desc.slice(0, 300), needsLookup: true })]);
      }
      const items = QA("ul.jobs-search__results-list > li, li.jobs-search-results__list-item, .job-card-container, .base-search-card").map((c) => item({
        business: T(Q(".base-search-card__subtitle, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle", c)),
        address: T(Q(".job-search-card__location, .job-card-container__metadata-item, .artdeco-entity-lockup__caption", c)),
        note: `Hiring: ${T(Q(".base-search-card__title, .job-card-list__title, .artdeco-entity-lockup__title", c))}`,
        profileUrl: (Q("a.base-card__full-link, a.job-card-container__link, a[href*='/jobs/view/']", c)?.href || location.href).split("?")[0], needsLookup: true,
      })).filter((i) => i.business && i.note !== "Hiring: ");
      const seen = new Set();
      const uniq = items.filter((i) => { const k = (i.business + i.note).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      return out("LinkedIn Jobs", uniq.length ? "list" : "none", uniq, uniq.length ? "Captured the companies hiring on this page." : "Search LinkedIn Jobs, for example \"children's book illustrator\".");
    }
    if (path.startsWith("/in/")) {
      const name = T(Q("h1"));
      const headline = T(Q(".top-card-layout__headline, .text-body-medium.break-words"));
      const loc = T(Q(".top-card__subline-item, .text-body-small.inline.t-black--light.break-words, .not-first-middot span"));
      const site = QA("a[href*='/redir/redirect'], .pv-contact-info a[href^='http'], a[data-tracking-control-name*='website']").map((a) => ownSite(a.getAttribute("href"))).find(Boolean) || "";
      const about = T(Q(".core-section-container__content .show-more-less-text, #about ~ div, section.summary")).slice(0, 400);
      if (!name) return out("LinkedIn", "none", [], "Open a LinkedIn profile, company page or job post.");
      return out("LinkedIn", "one", [item({ name, bio: [headline, about].filter(Boolean).join(" · ").slice(0, 400), address: loc, handle: path.split("/")[2] || "", website: site,
        emails: emailsIn(about), profileUrl: location.origin + path.split("?")[0], needsLookup: !site })]);
    }
    if (path.startsWith("/company/")) {
      const name = T(Q("h1"));
      const site = QA("a[data-tracking-control-name*='website'], dd a[href^='http'], a[href*='/redir/redirect'], a.link-without-visited-state[href^='http']").map((a) => ownSite(a.getAttribute("href"))).find(Boolean) || "";
      const bio = T(Q(".about-us__description, p.break-words, [data-test-id='about-us__description']")).slice(0, 400);
      return out("LinkedIn", "one", [item({ business: name, website: site, bio, address: T(Q(".top-card-layout__first-subline, [data-test-id='about-us__headquarters'] dd")), needsLookup: !site })]);
    }
    return out("LinkedIn", "none", [], "Open a LinkedIn profile, company page, or LinkedIn Jobs search.");
  }

  // ---------------- Reddit (people posting that they're hiring an illustrator) ----------------
  if (/(^|\.)reddit\.com$/.test(host)) {
    const HIRING = /\[\s*hiring\s*\]|\bhiring\b|looking for an? (children'?s )?(book )?(illustrator|artist|designer|formatter)|seeking an? (illustrator|artist)|need(ed)? an? (illustrator|artist|formatter)/i;
    if (/\/comments\//.test(path)) {
      const post = Q("shreddit-post");
      const title = post?.getAttribute("post-title") || T(Q("h1, a.title"));
      const author = (post?.getAttribute("author") || T(Q("a.author, [data-testid='post_author_link']"))).replace(/^u\//, "");
      const body = T(Q("shreddit-post [slot='text-body'], .usertext-body .md, [data-test-id='post-content']")).slice(0, 800);
      if (!author) return out("Reddit", "none", [], "Open a Reddit post.");
      return out("Reddit", "one", [item({ name: `u/${author}`, handle: `u/${author}`, bio: body.slice(0, 400), emails: emailsIn(body), website: textSite(body),
        note: `Reddit post: ${title}`, profileUrl: location.origin + path.split("?")[0], needsLookup: true })], HIRING.test(title + body) ? "This looks like a hiring post." : "");
    }
    const rows = QA("shreddit-post").map((p) => ({ title: p.getAttribute("post-title") || "", author: p.getAttribute("author") || "", link: new URL(p.getAttribute("permalink") || "", location.origin).href }))
      .concat(QA(".search-result-link, div.thing.link").map((r) => ({ title: T(Q("a.search-title, a.title", r)), author: T(Q("a.author", r)), link: Q("a.search-title, a.title", r)?.href || "" })));
    const seen = new Set();
    const items = rows.filter((r) => r.author && r.title && HIRING.test(r.title) && !/\[\s*for hire\s*\]/i.test(r.title) && !seen.has(r.link) && seen.add(r.link))
      .map((r) => item({ name: `u/${r.author}`, handle: `u/${r.author}`, note: `Reddit post: ${r.title}`, profileUrl: r.link, needsLookup: true }));
    return out("Reddit", items.length ? "list" : "none", items, items.length ? "Captured the hiring posts on this page. Reply to them on Reddit, or add their email if they share one." : "Open r/HungryArtists or r/IllustratorsForHire and search for children's book.");
  }

  // ---------------- Search results (Bing, DuckDuckGo, Google): social profiles and job posts ----------------
  const isSearch = (/^google\./.test(host) && path === "/search") || (/(^|\.)bing\.com$/.test(host) && path.startsWith("/search")) || /(^|\.)duckduckgo\.com$/.test(host);
  if (isSearch) {
    const bingUrl = (href) => {
      try {
        const u = new URL(href, location.href);
        const enc = u.searchParams.get("u");
        if (/bing\.com$/.test(u.hostname) && enc && enc.startsWith("a1")) return atob(enc.slice(2).replace(/-/g, "+").replace(/_/g, "/"));
        const dd = u.searchParams.get("uddg");
        if (dd) return dd;
        return unwrap(u.href);
      } catch (_) { return ""; }
    };
    const results = [
      ...QA("#b_results > li.b_algo").map((li) => ({ a: Q("h2 a", li), snip: T(Q(".b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4, .b_algoSlug", li)) })),
      ...QA(".result, .web-result").map((r) => ({ a: Q("a.result__a", r), snip: T(Q(".result__snippet", r)) })),
      ...QA("article[data-testid='result']").map((r) => ({ a: Q("a[data-testid='result-title-a']", r), snip: T(Q("[data-result='snippet']", r)) })),
      ...QA("div.g, div.MjjYud").map((g) => ({ a: Q("h3", g)?.closest("a"), snip: T(Q(".VwiC3b", g)) })),
    ].filter((r) => r.a).map((r) => ({ url: bingUrl(r.a.getAttribute("href")), title: T(r.a), snip: r.snip }));
    const items = [];
    const seen = new Set();
    for (const r of results) {
      let u;
      try { u = new URL(r.url); } catch (_) { continue; }
      const h = u.hostname.replace(/^(www|m|mobile|web|[a-z]{2})\./, "");
      const seg = u.pathname.split("/").filter(Boolean);
      const bits = { bio: r.snip.slice(0, 400), emails: emailsIn(`${r.title} ${r.snip}`), website: textSite(r.snip.replace(/\S+@\S+/g, "")), profileUrl: u.origin + u.pathname };
      let it = null;
      const nameBefore = (re) => (r.title.split(re)[0] || "").trim();
      if (/^instagram\.com$/.test(h) && seg[0] && !["p", "reel", "reels", "explore", "stories", "tv"].includes(seg[0])) {
        it = item({ ...bits, source: "Instagram", name: nameBefore(/\s*\(@|\s+•\s+|\s+\|\s+/), handle: `@${seg[0]}`, profileUrl: `https://www.instagram.com/${seg[0]}/` });
      } else if (/^threads\.(net|com)$/.test(h) && /^@/.test(seg[0] || "")) {
        it = item({ ...bits, source: "Threads", name: nameBefore(/\s*\(@|\s+•\s+/), handle: seg[0] });
      } else if (/^facebook\.com$/.test(h) && seg[0] && !["groups", "events", "watch", "share", "photo", "photos", "story.php", "permalink.php", "marketplace"].includes(seg[0])) {
        it = item({ ...bits, source: "Facebook", business: nameBefore(/\s+[|\-–]\s+Facebook|\s+\|\s+/) });
      } else if (/^linkedin\.com$/.test(h) && seg[0] === "in") {
        it = item({ ...bits, source: "LinkedIn", name: nameBefore(/\s+[-–]\s+|\s+\|\s+/), handle: seg[1] || "", bio: [r.title.split(/\s+[-–]\s+/).slice(1).join(" · ").replace(/\s*\|\s*LinkedIn$/, ""), r.snip].filter(Boolean).join(" · ").slice(0, 400) });
      } else if (/^linkedin\.com$/.test(h) && seg[0] === "company") {
        it = item({ ...bits, source: "LinkedIn", business: nameBefore(/\s+[|\-–]\s+/) });
      } else if (/^linkedin\.com$/.test(h) && seg[0] === "jobs") {
        const m = r.title.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+?))?\s*\|\s*LinkedIn/i);
        if (m) it = item({ ...bits, source: "LinkedIn Jobs", business: m[1], note: `Hiring: ${m[2]}`, address: m[3] || "" });
      } else if (/^(x|twitter)\.com$/.test(h) && seg[0] && !["search", "hashtag", "i", "home", "explore"].includes(seg[0]) && seg.length === 1) {
        it = item({ ...bits, source: "X", name: nameBefore(/\s*\(@/), handle: `@${seg[0]}`, profileUrl: `https://x.com/${seg[0]}` });
      } else if (/^goodreads\.com$/.test(h) && seg[0] === "author") {
        it = item({ ...bits, source: "Goodreads", name: nameBefore(/\s*\(|\s+\|\s+/) });
      } else if (/^reddit\.com$/.test(h) && seg.includes("comments") && /hiring|looking for|seeking/i.test(r.title)) {
        it = item({ ...bits, source: "Reddit", name: "", note: `Reddit post: ${r.title}` });
      } else if (/^bookbub\.com$/.test(h) && seg[0] === "authors") {
        it = item({ ...bits, source: "BookBub", name: nameBefore(/\s+Books\b|\s+[|\-–]\s+/) });
      } else if (/^(reedsy\.com|bookshop\.org|barnesandnoble\.com|lulu\.com|blurb\.com|blurb\.co\.uk)$/.test(h)) {
        const m = r.title.match(/^(.+?),?\s+(?:a book\s+)?by\s+(.+?)(?:,|\s+[|–-]\s+|\s*\(|\s+on\s+|$)/i);
        const who = m ? m[2].split(/\s+(?:and|&)\s+/)[0].trim() : "";
        const label = { "reedsy.com": "Reedsy", "bookshop.org": "Bookshop.org", "barnesandnoble.com": "Barnes & Noble", "lulu.com": "Lulu" }[h] || "Blurb";
        if (who && who.length < 60 && !/^(the|unknown|anonymous)$/i.test(who)) it = item({ ...bits, source: label, name: who, note: `Book: ${m[1].trim().slice(0, 80)}` });
      } else if (/(^|\.)indeed\.[a-z.]+$/.test(h) || /(^|\.)glassdoor\.[a-z.]+$/.test(h)) {
        const m = r.title.match(/^(.+?)\s+[-–]\s+(.+?)\s+[-–]\s+/);
        if (m) it = item({ ...bits, source: /indeed/.test(h) ? "Indeed" : "Glassdoor", business: m[2], note: `Hiring: ${m[1]}` });
      }
      if (!it || !(it.name || it.business || it.note) || seen.has(it.profileUrl)) continue;
      seen.add(it.profileUrl);
      it.needsLookup = !it.website;
      items.push(it);
    }
    return out("Web search", items.length ? "list" : "none", items, items.length
      ? "Captured the profiles and job posts in these search results."
      : "No author profiles, book listings or job posts in these results. Try a search like: site:instagram.com \"children's book author\" London");
  }

  // ---------------- Instagram ----------------
  if (/(^|\.)instagram\.com$/.test(host)) {
    const handle = (path.split("/").filter(Boolean)[0] || "").replace(/^@/, "");
    if (!handle || ["p", "reel", "explore", "stories", "accounts"].includes(handle)) return out("Instagram", "none", [], "Open someone's Instagram profile page.");
    const title = meta("og:title");
    const name = (title.match(/^(.*?)\s*\(@/) || [])[1] || T(Q("header h2, header h1")) || handle;
    const desc = meta("og:description");
    const bio = T(Q("header section > div:last-child")) || T(Q("header")) || desc;
    const links = QA('a[href*="l.instagram.com"], header a[href^="http"]').map((a) => ownSite(a.getAttribute("href"))).filter(Boolean);
    return out("Instagram", "one", [item({ name, handle: `@${handle}`, bio: bio.slice(0, 400), website: links[0] || textSite(bio), emails: emailsIn(bio + " " + desc), profileUrl: `https://www.instagram.com/${handle}/` })]);
  }

  // ---------------- Threads ----------------
  if (/(^|\.)threads\.(net|com)$/.test(host)) {
    const m = path.match(/^\/@([^/]+)/);
    if (!m) return out("Threads", "none", [], "Open someone's Threads profile page.");
    const title = meta("og:title");
    const name = (title.match(/^(.*?)\s*\(@/) || [])[1] || m[1];
    const bio = meta("og:description");
    const links = QA('a[href*="l.threads"], a[href^="http"]').map((a) => ownSite(a.getAttribute("href"))).filter(Boolean);
    return out("Threads", "one", [item({ name, handle: `@${m[1]}`, bio: bio.slice(0, 400), website: links[0] || textSite(bio), emails: emailsIn(bio + " " + T(Q("main")).slice(0, 2000)) })]);
  }

  // ---------------- Facebook ----------------
  if (/(^|\.)facebook\.com$/.test(host)) {
    const name = T(Q("h1")) || meta("og:title");
    if (!name || /^(facebook|log in)/i.test(name)) return out("Facebook", "none", [], "Open a Facebook page or profile (its About section shows the most).");
    const main = T(Q('div[role="main"]')).slice(0, 6000);
    const links = QA('a[href*="l.facebook.com"]').map((a) => ownSite(a.getAttribute("href"))).filter(Boolean);
    return out("Facebook", "one", [item({ business: name, bio: meta("og:description").slice(0, 400), website: links[0] || textSite(main.match(/\b[a-z0-9-]+\.(com|net|org|co\.uk|de|fr|es|it|nl|io|art|studio|design|ie|eu)\b\S*/i)?.[0]), emails: emailsIn(main) })]);
  }

  // ---------------- X (Twitter) ----------------
  if (/(^|\.)(x|twitter)\.com$/.test(host)) {
    const handle = path.split("/").filter(Boolean)[0] || "";
    if (!handle || ["home", "search", "explore", "i", "notifications", "messages", "settings"].includes(handle)) return out("X", "none", [], "Open someone's X profile page.");
    const name = T(Q('[data-testid="UserName"] span')) || (document.title.match(/^(.*?)\s*\(@/) || [])[1] || handle;
    const bio = T(Q('[data-testid="UserDescription"]'));
    const url = T(Q('[data-testid="UserUrl"]'));
    return out("X", "one", [item({ name, handle: `@${handle}`, bio: bio.slice(0, 400), website: textSite(url) || textSite(bio), emails: emailsIn(bio), address: T(Q('[data-testid="UserLocation"]')), profileUrl: `https://x.com/${handle}` })]);
  }

  // ---------------- Indeed (the company hiring is the lead) ----------------
  if (/(^|\.)indeed\.[a-z.]+$/.test(host)) {
    const job = T(Q('[data-testid="jobsearch-JobInfoHeader-title"], h1.jobsearch-JobInfoHeader-title, h2[data-testid="jobsearch-JobInfoHeader-title"]'));
    const company = T(Q('[data-testid="inlineHeader-companyName"], [data-company-name], .jobsearch-InlineCompanyRating a, .jobsearch-CompanyInfoContainer a'));
    if (job || company) {
      const loc = T(Q('[data-testid="inlineHeader-companyLocation"], [data-testid="job-location"], .jobsearch-JobInfoHeader-subtitle > div:last-child'));
      return out("Indeed", "one", [item({ business: company, address: loc, note: job ? `Hiring: ${job}` : "", emails: emailsIn(T(Q("#jobDescriptionText"))), needsLookup: true })]);
    }
    if (path.startsWith("/cmp/")) {
      const site = QA('a[data-testid="companyLink[]"], a[data-tn-element="companyLink[]"], [data-testid="AboutSection"] a[href^="http"]').map((a) => ownSite(a.getAttribute("href"))).find(Boolean);
      return out("Indeed", "one", [item({ business: T(Q("h1")) || meta("og:title"), website: site || "", needsLookup: !site })]);
    }
    const items = QA(".job_seen_beacon, [data-testid='slider_item'], .resultContent").map((c) => item({
      business: T(Q('[data-testid="company-name"], .companyName', c)), address: T(Q('[data-testid="text-location"], .companyLocation', c)),
      note: `Hiring: ${T(Q("h2, .jobTitle", c))}`, needsLookup: true,
    })).filter((i) => i.business);
    return out("Indeed", items.length ? "list" : "none", items, items.length ? "Captured the companies hiring on this page." : "Open an Indeed job, a company page, or job search results.");
  }

  // ---------------- Glassdoor ----------------
  if (/(^|\.)glassdoor\.[a-z.]+$/.test(host)) {
    const site = QA('[data-test="employer-website"] a, a[data-test="employer-website"]').map((a) => ownSite(a.getAttribute("href"))).find(Boolean) || "";
    const company = T(Q('[data-test="employer-name"], [data-test="employerName"], [class*="EmployerProfile_employerName"], h1[data-test="employer-name"]')) || (path.includes("/Overview/") ? T(Q("h1")) : "");
    const job = T(Q('[data-test="job-title"], h1[id^="jd-job-title"], [class*="JobDetails_jobTitle"]'));
    if (company || job) {
      return out("Glassdoor", "one", [item({ business: company.replace(/\s*\d(\.\d)?\s*★?$/, ""), website: site, address: T(Q('[data-test="location"], [data-test="emp-location"]')), note: job ? `Hiring: ${job}` : "", needsLookup: !site })]);
    }
    const items = QA('[data-test="jobListing"], li[data-test="jobListing"]').map((c) => item({
      business: T(Q('[class*="EmployerProfile_compactEmployerName"], [data-test="employer-short-name"], .employer-name', c)),
      note: `Hiring: ${T(Q('[data-test="job-title"], a[class*="JobCard_jobTitle"]', c))}`, address: T(Q('[data-test="emp-location"]', c)), needsLookup: true,
    })).filter((i) => i.business);
    return out("Glassdoor", items.length ? "list" : "none", items, items.length ? "Captured the companies hiring on this page." : "Open a Glassdoor job, company page, or job search results.");
  }

  // ---------------- Search engines and other platforms: nothing to capture ----------------
  if (/^google\./.test(host) || /(^|\.)(yahoo|tiktok|youtube|pinterest|upwork|fiverr)\.[a-z.]+$/.test(host)) {
    return out(host, "none", [], "This page isn't a business or a profile. Open an author or business website, Amazon, Goodreads, Kickstarter, a social profile, a job post, or Google Maps.");
  }

  // ---------------- A business's own website ----------------
  const found = new Set();
  for (const a of QA('a[href^="mailto:" i]')) {
    const v = decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]).trim().toLowerCase();
    if (v) found.add(v);
  }
  emailsIn(document.body?.innerText || "").forEach((e) => found.add(e));
  return out("Website", "one", [item({
    // "Maya Brooks | Children's Author" → "Maya Brooks"
    business: ((meta("og:site_name") || document.title || host).split(/\s+[|–—·•]\s+|\s+-\s+/)[0] || host).trim().slice(0, 80),
    website: location.origin, emails: [...found],
  })]);
}

// Used by automatic capture on Google Maps: scrolls the results list so more businesses load,
// at a human pace, then reads the list. Returns the same shape as extractPage().
export async function scrollMapsList(rounds = 8) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20 && !document.querySelector('div[role="feed"]'); i++) await sleep(500);
  const feed = document.querySelector('div[role="feed"]');
  if (!feed) return { ended: true };
  let last = 0;
  for (let i = 0; i < rounds; i++) {
    feed.scrollBy(0, 1200 + Math.random() * 600);
    await sleep(1500 + Math.random() * 1500);
    const n = feed.querySelectorAll('a[href*="/maps/place/"]').length;
    if (/end of the list|you've reached the end/i.test(feed.innerText.slice(-400))) return { ended: true, count: n };
    if (n === last && i > 2) break;
    last = n;
  }
  return { ended: false, count: last };
}
