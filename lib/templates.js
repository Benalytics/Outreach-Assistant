// Builds the emails. A first email is greeting + opener + proof + ask, in the lead's
// language. Bodies stay under 300 characters; the signature, the "where I found you"
// line (EU and UK) and the opt-out line are added below them.
import { PACKS, DISCLOSE } from "./i18n.js";
import { parseResearch } from "./research.js";

export const BODY_LIMIT = 300;

export const SEGMENTS = {
  author: "Children's author",
  formatting: "Author with art ready (formatting)",
  publisher: "Publisher or editor",
  educator: "Educator or learning brand",
  business: "Coach or business (ebooks, workbooks)",
};

export function guessSegment(lead) {
  const r = parseResearch(lead.Research);
  if (r.signs.includes("publisher")) return "publisher";
  if (r.signs.includes("educator")) return "educator";
  if (r.signs.includes("lead_magnet")) return "business";
  const t = `${lead.Notes || ""} ${lead.Business || ""}`.toLowerCase();
  if (/already credits an illustrator/.test(t) && r.signs.includes("formatting")) return "formatting";
  if (/\bpublisher\b|publishing house|publishing ltd|publishing llc|\bpress\b|imprint|editor|acquisition|verlag|éditions|editorial|editrice|uitgeverij/.test(t)) return "publisher";
  if (/school|teacher|curriculum|educat|learning|academy|tutor|montessori|preschool|kindergarten|nursery|schule|école|escuela|scuola|escola/.test(t)) return "educator";
  if (/coach|course|consult|agency|marketing|brand|business/.test(t)) return "business";
  return "author";
}

const firstName = (lead) => (lead.Name || "").trim().split(/\s+/)[0] || "";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pack = (lang) => PACKS[lang] || PACKS.en;

function fill(text, lead, lang, extra = {}) {
  const p = pack(lang);
  const business = (lead.Business || "").trim() || p.fallbackBusiness;
  return text
    .replace(/\{first\}/g, firstName(lead)).replace(/\{full\}/g, (lead.Name || "").trim())
    .replace(/\{business\}/g, business).replace(/\{title\}/g, extra.title || "").replace(/\{quote\}/g, extra.quote || "")
    .replace(/\{p\}/g, extra.noun || "");
}

function greeting(lead, lang) {
  const p = pack(lang);
  return firstName(lead) ? fill(p.greet, lead, lang) : p.greetNoName;
}

// Which observation the opener can use, best first.
function observation(research) {
  const r = research || {};
  if (r.signs?.includes("needs_art")) return { key: "needs_art" };
  if (r.signs?.includes("upcoming")) return { key: "upcoming" };
  if (r.titles?.[0]) return { key: "title", title: r.titles[0] };
  if (r.quote) return { key: "quote", quote: r.quote };
  return null;
}

// The styles that make sense for this lead: "About their book" needs a title,
// "Something from their website" needs something found there.
export function allowedStyles(lead) {
  const r = parseResearch(lead.Research);
  return {
    subject: ["question", "curiosity", "benefit", ...(r.titles[0] ? ["personal"] : [])],
    opener: [...(observation(r) ? ["observation"] : []), "problem", "question"],
  };
}

export function makeDraft(lead, { segment = guessSegment(lead), lang = "en", subjectStyle = "question", openerStyle = "problem" } = {}) {
  const p = pack(lang);
  const seg = p.problem[segment] ? segment : "author";
  const r = parseResearch(lead.Research);
  const obs = observation(r);
  if (openerStyle === "observation" && !obs) openerStyle = "problem";
  if (subjectStyle === "personal" && !r.titles[0]) subjectStyle = "curiosity";

  const build = (quote) => {
    const extra = { title: obs?.title || r.titles[0] || "", quote };
    const opener = openerStyle === "observation" ? p.obs[obs.key] : openerStyle === "question" ? p.question[seg] : p.problem[seg];
    const parts = [opener, p.proof[seg], p.ask[seg]].map((s) => cap(fill(s, lead, lang, extra)));
    return `${greeting(lead, lang)}\n\n${parts.join(" ")}`;
  };
  let body = build(obs?.quote || "");
  // A long quote is cut at a word boundary; if it still doesn't fit, a shorter opener is used.
  if (body.length > BODY_LIMIT && obs?.key === "quote" && openerStyle === "observation") {
    let q = obs.quote;
    while (body.length > BODY_LIMIT && q.split(" ").length > 4) { q = q.split(" ").slice(0, -1).join(" "); body = build(`${q}…`); }
  }
  if (body.length > BODY_LIMIT && openerStyle === "observation") { openerStyle = "problem"; body = build(""); }

  let subject = fill(p.subjects[subjectStyle], lead, lang, { title: r.titles[0] || "", noun: p.nouns[seg] });
  if (!firstName(lead)) subject = subject.replace(/,\s*$/, "").replace(/^,\s*/, "");
  subject = cap(subject.trim());
  return { segment: seg, lang, subject, body, subjectStyle, openerStyle };
}

// Where the lead was found, for the line that tells EU and UK leads.
function foundLine(lead, lang) {
  const p = pack(lang);
  const src = (lead.Source || "").replace(/\s*\+\s*Hunter$/, "").trim();
  if (!src || /^(Website|Manual)$/i.test(src)) return p.foundSite;
  return p.found.replace("{source}", src === "Apollo" ? "Apollo.io" : src);
}

export const needsDisclosure = (lead) => DISCLOSE.has(lead?.Country || "");

export function footer(profile, lead = {}, lang = "en") {
  const p = pack(lang);
  const lines = ["", profile.name || "", profile.portfolio || "", ""];
  if (needsDisclosure(lead)) lines.push(foundLine(lead, lang));
  lines.push(p.optout);
  if (profile.address) lines.push(profile.address);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Used by tests: the longest body any language, segment and style can produce.
export function longestBody() {
  const lead = { Name: "Alexandra Smith-Johnson", Business: "Bright Little Minds Publishing", Research: "Titles: The Very Brave Little Fox and the Moon; Signs: new book on the way" };
  let max = 0, which = "";
  for (const lang of Object.keys(PACKS)) for (const segment of Object.keys(SEGMENTS)) for (const openerStyle of ["observation", "problem", "question"]) {
    const d = makeDraft(lead, { segment, lang, openerStyle });
    if (d.body.length > max) { max = d.body.length; which = `${lang}/${segment}/${d.openerStyle}`; }
  }
  return { max, which };
}

// ---------- Follow-ups ----------
// At most two, each shorter than the first email and each adding something new.
// Links don't count toward the limit.
export const FOLLOWUP_LIMIT = 230;
export const FOLLOWUP_DAYS = [4, 7]; // days after the first email, then after follow-up 1

export function makeFollowUp(lead, segment, step, profile = {}, lang = "en") {
  const p = pack(lang);
  const seg = p.f1[segment] ? segment : "author";
  let body = step === 1 ? p.f1[seg] : p.f2;
  body = body
    .replace("{samples}", profile.samples || profile.portfolio || "")
    .replace("{reviews}", profile.reviews ? p.reviews.replace("{link}", profile.reviews) : "");
  body = fill(body, lead, lang, { noun: p.nouns[seg] }).replace(/ ?: \n/, "\n");
  return `${greeting(lead, lang)}\n\n${body}`;
}

export const textLength = (t) => t.replace(/https?:\/\/\S+/g, "").length;
