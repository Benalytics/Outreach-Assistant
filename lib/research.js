// Reads a lead's own website and pulls out what helps write to them personally:
// their book titles, the kind of books they make and for which ages, signs that they
// need illustration or formatting right now, and a short line in their own words.
// Works on raw HTML because the background has no DOM to parse pages with.

const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'")
  .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

export function htmlToText(html) {
  return decode(html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br|section|article|blockquote|td)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

const SIGNS = {
  needs_art: /\b(looking for|seeking|searching for|in need of|need) an? (children'?s (book )?)?(illustrator|artist)|illustrators? wanted|\billustrat(or|ions?) (needed|wanted)|illustrator(in)? gesucht|suche (eine[n]? )?illustrator|busco ilustrador|buscamos ilustrador|cherche (un(e)? )?illustrat|recherche (un(e)? )?illustrat|cerco (un(a)? )?illustrat|cerchiamo illustrat|procuro (um(a)? )?ilustrador|à procura de (um(a)? )?ilustrador|illustrator gezocht|zoek(en)? (een )?illustrator/i,
  upcoming: /\b(coming soon|work in progress|currently writing|my (next|upcoming|first|debut) (picture |children'?s )?book|(new|next|upcoming|debut) book (is )?(coming|on the way|in progress)|manuscript|pre-?order|forthcoming)\b|demnächst|in kürze erscheint|bientôt disponible|próximamente|in arrivo|prossimamente|em breve|binnenkort/i,
  self_pub: /\b(self[- ]published|self[- ]publishing|independently published|indie author|independent author|amazon kdp|kindle direct publishing|ingramspark|createspace)\b|selbstverlag|selfpublish|autoédition|autoedición|autopubblicat|autopublica|zelf uitgegeven/i,
  formatting: /\b(formatting|typesetting|interior design|book layout|print[- ]ready files?)\b|buchsatz|mise en page|maquetación|impaginazione|diagramação|opmaak/i,
  publisher: /\b(manuscript submissions?|submission guidelines|we publish|our authors|our list|our imprint|acquisitions|we are a (small |independent )?(children'?s )?publisher|publishing house)\b|verlagsprogramm|unsere autor|maison d'édition|editorial infantil|casa editrice|uitgeverij/i,
  educator: /\b(curriculum|lesson plans?|classroom|our students|worksheets|homeschool(ing)?|early learning|learning resources|educational resources|montessori|preschool|kindergarten|nursery)\b|unterrichtsmaterial|lehrmaterial|matériel pédagogique|material didáctico|materiale didattico|material didático|lesmateriaal/i,
  lead_magnet: /\b(free (download|guide|ebook|e-book|workbook|checklist|pdf)|lead magnet|download (our|my|the) (free )?(guide|ebook|e-book|workbook)|opt-?in)\b|kostenlose[rn]? (leitfaden|e-book|download)|guide gratuit|guía gratuita|guida gratuita|guia gratuito|gratis (e-book|gids)/i,
};

export const SIGN_LABELS = {
  needs_art: "looking for an illustrator",
  upcoming: "new book on the way",
  self_pub: "self-published",
  formatting: "mentions formatting or layout",
  publisher: "publishes other authors",
  educator: "makes learning materials",
  lead_magnet: "offers free guides or ebooks",
};

const GENRES = [
  ["picture books", /\bpicture[- ]books?\b|bilderb(u|ü)ch|album(s)? jeunesse|álbum(es)? ilustrado|albi illustrat|prentenboek|livros? ilustrados?/i],
  ["board books", /\bboard books?\b|pappbilderbuch/i],
  ["early readers", /\b(early|beginning|first) readers?\b|erstlese/i],
  ["chapter books", /\bchapter books?\b/i],
  ["middle grade", /\bmiddle[- ]grade\b/i],
  ["young adult", /\byoung adult\b|\bYA (fiction|novel)/i],
  ["bedtime stories", /\bbedtime stor(y|ies)\b|gute-nacht-geschicht|histoires? du soir|cuentos? para dormir|storie della buonanotte/i],
  ["rhyming books", /\brhyming\b|in reimen|en rimes/i],
  ["activity books", /\bactivity books?\b|aktivitätsbuch|cahiers? d'activités|cuadernos? de actividades|quaderni? di attività|doeboek/i],
  ["coloring books", /\bcolou?ring books?\b|malbuch|livres? de coloriage|libros? para colorear|libri da colorare|kleurboek/i],
  ["workbooks", /\bworkbooks?\b|arbeitsheft|cahiers? d'exercices|cuadernos? de ejercicios|eserciziari|werkboek/i],
  ["faith-based books", /\b(christian|faith[- ]based|bible stories)\b/i],
  ["bilingual books", /\bbilingual\b|zweisprachig|bilingue|bilingüe|tweetalig/i],
  ["STEM books", /\bSTEM\b|\bscience books? for kids\b/],
];

const AGES = /\b(?:ages?|aged|für kinder (?:von|ab)|de|dai|van|dos)\s*(\d{1,2})\s*(?:-|–|to|bis|a|à|tot|aos?)\s*(\d{1,2})\s*(?:years?|jahre|ans|años|anni|jaar|anos)?\b/i;
const AGES2 = /\b(\d{1,2})\s*(?:-|–)\s*(\d{1,2})\s*(?:years?|jahre|ans|años|anni|jaar|anos|y\/o|yrs)\b/i;

const NOT_TITLE = /^(buy|order|shop|amazon|read more|learn more|home|about|contact|books?|my books|all books|view|see more|details|more|kindle|paperback|hardcover|audiobook|ebook|add to cart|\W*)$/i;
const cleanTitle = (t) => decode(t || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/[;|]/g, ",")
  .replace(/\s*[-–:|]\s*(paperback|hardcover|kindle( edition)?|ebook|book \d+).*$/i, "").trim();

function findTitles(pages) {
  const titles = [];
  const add = (t) => {
    t = cleanTitle(t);
    if (t.length < 3 || t.length > 60 || NOT_TITLE.test(t) || /https?:|@|©/.test(t)) return;
    if (t.split(" ").length > 10) return;
    if (!titles.some((x) => x.toLowerCase() === t.toLowerCase())) titles.push(t);
  };
  for (const { html, url } of pages) {
    // Structured data: "@type": "Book"
    for (const m of html.matchAll(/"@type"\s*:\s*"Book"[\s\S]{0,400}?"name"\s*:\s*"([^"]{3,80})"/g)) add(m[1]);
    for (const m of html.matchAll(/"name"\s*:\s*"([^"]{3,80})"[\s\S]{0,200}?"@type"\s*:\s*"Book"/g)) add(m[1]);
    // Links to book shops with the title as the link text or in the URL
    for (const m of html.matchAll(/<a[^>]+href=["'][^"']*(amazon\.[a-z.]+\/(?:[^"'\/]+\/)?dp\/|bookshop\.org|barnesandnoble\.com|goodreads\.com\/book|books2read|thalia\.|fnac\.com|casadellibro)[^"']*["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
      const text = m[2].replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/i, " $1 ");
      add(text);
      if (/amazon/.test(m[1])) { const slug = (m[0].match(/amazon\.[a-z.]+\/([^"'\/]+)\/dp\//) || [])[1]; if (slug && !/^gp$/.test(slug)) add(decodeURIComponent(slug).replace(/-/g, " ")); }
    }
    // Book cover images: alt="The Brave Little Fox book cover"
    for (const m of html.matchAll(/<img[^>]+alt=["']([^"']{3,90})["']/gi)) {
      const alt = m[1];
      if (/\b(book )?cover\b|buchcover|couverture|portada|copertina|capa\b|omslag/i.test(alt)) add(alt.replace(/\b(book cover|cover of|front cover|cover|buchcover|couverture|portada|copertina|capa|omslag)\b/gi, "").replace(/^[\s\-–:,]+|[\s\-–:,]+$/g, ""));
    }
    // Headings on a books page
    if (/book|buch|buecher|bücher|b%C3%BCcher|livre|libro|livro|boek|shop|titles|titel/i.test(new URL(url).pathname)) {
      for (const m of html.matchAll(/<h[23][^>]*>([\s\S]{3,120}?)<\/h[23]>/gi)) add(m[1]);
    }
    if (titles.length >= 3) break;
  }
  return titles.slice(0, 3);
}

const FIRST_PERSON = /\b(I|I'm|I've|my|we|our|ich|mein|meine|wir|unser|je|j'|mon|ma|mes|nous|notre|yo|mi|mis|nosotros|nuestro|io|il mio|la mia|noi|nostro|eu|meu|minha|nós|nosso|ik|mijn|wij|onze)\b/i;
const TOPIC = /stor(y|ies)|book|child|kid|read|writ|imagin|learn|teach|dream|adventure|illustrat|geschicht|buch|kinder|lesen|schreib|histoire|livre|enfant|lire|écri|cuento|libro|niñ|leer|escrib|storia|bambin|leggere|scriv|história|livro|criança|ler|escrev|verhal|boek|kinderen|lezen|schrijv/i;

function findQuote(texts) {
  let best = null;
  for (const text of texts) {
    for (let s of text.split(/(?<=[.!?])\s+|\n/)) {
      s = s.replace(/^["“„«'\s]+|["”“»'\s]+$/g, "").trim();
      if (s.length < 30 || s.length > 90) continue;
      if (!FIRST_PERSON.test(s) || !TOPIC.test(s)) continue;
      if (/cookie|privacy|copyright|newsletter|subscribe|cart|sign up|log ?in|password|©|https?:|@/i.test(s)) continue;
      let score = 0;
      if (/\b(I|ich|je|j'|yo|io|eu|ik)\b/i.test(s)) score += 2;
      if (/love|passion|believe|want|hope|dream|mission|liebe|glaube|aime|crois|amo|creo|credo|acredito|hou van|geloof/i.test(s)) score += 2;
      if (/child|kid|kinder|enfant|niñ|bambin|criança/i.test(s)) score += 1;
      score -= Math.abs(s.length - 60) / 30;
      if (!best || score > best.score) best = { s: s.replace(/[.!?]$/, ""), score };
    }
  }
  return best && best.score > 1 ? best.s : "";
}

// pages: [{url, html}] from scanWebsite. extra: { note } from the capture, e.g. "Book: X · Self-published".
export function researchPages(pages = [], extra = {}) {
  const lang = ((pages[0]?.html || "").match(/<html[^>]*\blang=["']?([a-zA-Z]{2})/i) || [])[1]?.toLowerCase() || "";
  const texts = pages.map((p) => htmlToText(p.html).slice(0, 60000));
  const meta = pages.map((p) => (p.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1] || "").join(" ");
  const all = `${meta}\n${texts.join("\n")}\n${extra.note || ""}\n${extra.bio || ""}`;

  const signs = Object.keys(SIGNS).filter((k) => SIGNS[k].test(all));
  if (/Hiring: .*(illustrat|designer|artist|layout|format)/i.test(extra.note || "") && !signs.includes("needs_art")) signs.unshift("needs_art");
  if (/Already credits an illustrator/.test(extra.note || "")) { const i = signs.indexOf("needs_art"); if (i >= 0) signs.splice(i, 1); }
  const genres = GENRES.filter(([, re]) => re.test(all)).map(([g]) => g).slice(0, 3);
  const am = all.match(AGES) || all.match(AGES2);
  const ages = am && Number(am[1]) < Number(am[2]) && Number(am[2]) <= 18 ? `ages ${am[1]}-${am[2]}` : "";

  const titles = findTitles(pages);
  const fromNote = (extra.note || "").match(/Book: ([^·]+)/);
  if (fromNote) { const t = cleanTitle(fromNote[1]); if (t && t.length <= 60 && !titles.includes(t)) titles.unshift(t); }

  const quote = findQuote(texts.map((t, i) => (/about|ueber|uber|a-propos|sobre|chi-siamo|over/i.test(pages[i].url) ? t : t.slice(0, 8000))).concat(extra.bio ? [extra.bio] : []));
  return { lang, titles: titles.slice(0, 3), genres, ages, signs, quote };
}

// One readable line for the sheet, which parseResearch can read back.
export function researchText(r) {
  if (!r) return "";
  const bits = [];
  if (r.titles?.length) bits.push(`Titles: ${r.titles.join(" | ")}`);
  const g = [...(r.genres || []), r.ages].filter(Boolean);
  if (g.length) bits.push(`Genres: ${g.join(", ")}`);
  if (r.signs?.length) bits.push(`Signs: ${r.signs.map((s) => SIGN_LABELS[s] || s).join(", ")}`);
  if (r.quote) bits.push(`Quote: "${r.quote.replace(/"/g, "'")}"`);
  return bits.join("; ");
}

export function parseResearch(text) {
  const t = text || "";
  const titles = ((t.match(/Titles: ([^;]+)/) || [])[1] || "").split(" | ").map((s) => s.trim()).filter(Boolean);
  const g = ((t.match(/Genres: ([^;]+)/) || [])[1] || "").split(", ").filter(Boolean);
  const labels = ((t.match(/Signs: ([^;]+)/) || [])[1] || "").split(", ");
  const signs = Object.keys(SIGN_LABELS).filter((k) => labels.includes(SIGN_LABELS[k]));
  const quote = (t.match(/Quote: "(.+)"\s*$/) || [])[1] || "";
  return { titles, genres: g.filter((x) => !/^ages /.test(x)), ages: g.find((x) => /^ages /.test(x)) || "", signs, quote };
}
