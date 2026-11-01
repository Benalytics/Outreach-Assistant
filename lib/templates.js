// Email drafts for each kind of buyer. Bodies are kept under 300 characters after
// the name and business are filled in; the signature and opt-out line are added below them.

export const BODY_LIMIT = 300;

export const SEGMENTS = {
  author: "Children's author",
  formatting: "Author with art ready (formatting)",
  publisher: "Publisher or editor",
  educator: "Educator or learning brand",
  business: "Coach or business (ebooks, workbooks)",
};

const T = {
  author: {
    subjects: [
      "{first}, who's illustrating your next book?",
      "Quick question about your story, {first}",
      "Your characters, page by page",
    ],
    bodies: [
      "Hi {first}, kids decide on page one whether a book is worth finishing, and the art makes that call. I've illustrated 50+ children's books (35+ published) with characters that stay consistent on every page and KDP-ready files. Can I send you a few samples in your book's style?",
      "Hi {first}, a great manuscript with flat illustrations rarely gets a second read. I've brought 50+ children's books to life, 35+ of them published, from first character sketch to print-ready files. Do you have a story waiting for its pictures?",
    ],
  },
  formatting: {
    subjects: [
      "{first}, will your book pass KDP the first time?",
      "Bleed, trim and gutters for your book",
      "Quick one about your picture book files",
    ],
    bodies: [
      "Hi {first}, picture books get bounced by KDP over bleed, trim and text too close to the edge more than anything else. I've formatted 50+ books that passed KDP and IngramSpark checks the first time, usually in 3 to 5 days. Want a sample page within 24 hours?",
      "Hi {first}, text fighting the artwork is the fastest way to make a picture book look self-published. I lay out children's books so words and pictures work together on every spread, print-ready for KDP and IngramSpark. Got a manuscript I can quote on?",
    ],
  },
  publisher: {
    subjects: [
      "Illustrator for {business}'s next list?",
      "{first}, a dependable picture book illustrator",
      "Character consistency across a series",
    ],
    bodies: [
      "Hi {first}, when an illustrator stalls or files bounce at the printer, the whole list slips. I've delivered 50+ children's books with consistent characters, on time, as print-ready files for KDP, IngramSpark and offset. Worth keeping me in mind for {business}'s next title?",
      "Hi {first}, series live or die on characters looking the same in book four as in book one. I've illustrated 50+ children's books, 35+ published, and handle layout too, so you deal with one person, not two. Can I send a short portfolio?",
    ],
  },
  educator: {
    subjects: [
      "Learning materials kids actually want to open",
      "{first}, illustrations for {business}",
      "Workbooks that hold a child's attention",
    ],
    bodies: [
      "Hi {first}, children learn more from pages they want to look at. I illustrate and lay out children's books, activity books and workbooks, 50+ so far, delivered print-ready. If {business} has learning materials planned, can I send a few samples?",
      "Hi {first}, a workbook kids enjoy gets finished; a dull one gets left in the bag. I create illustrated activity books, coloring books and early learning materials, print-ready for KDP or your printer. Is anything like that on {business}'s plans this year?",
    ],
  },
  business: {
    subjects: [
      "{first}, does your lead magnet look homemade?",
      "Quick idea for {business}'s ebook",
      "Workbooks and guides that get downloaded",
    ],
    bodies: [
      "Hi {first}, a lead magnet that looks homemade quietly costs you sign-ups. I design ebooks, workbooks and guides with the same layout standards I use on 50+ published books, usually in 3 to 5 days. Want me to send a couple of examples?",
      "Hi {first}, people judge your expertise by how your guide looks before they read a word. I design ebooks, workbooks and brochures that look as professional as you are, delivered fast. Is there a piece {business} has been meaning to polish?",
    ],
  },
};

export function guessSegment(lead) {
  const t = `${lead.Notes || ""} ${lead.Business || ""}`.toLowerCase();
  if (/publish|press|imprint|editor|acquisition/.test(t)) return "publisher";
  if (/school|teacher|curriculum|educat|learning|academy|tutor|montessori|preschool|kindergarten/.test(t)) return "educator";
  if (/coach|course|consult|agency|marketing|brand|business/.test(t)) return "business";
  return "author";
}

function fill(text, lead) {
  const first = (lead.Name || "").trim().split(/\s+/)[0] || "there";
  const business = (lead.Business || "").trim() || "your team";
  return text.replace(/\{first\}/g, first).replace(/\{business\}/g, business);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Returns a draft. `version` cycles through the subject and body options.
export function makeDraft(lead, segment = guessSegment(lead), version = 0) {
  const t = T[segment] || T.author;
  return {
    segment,
    subject: cap(fill(t.subjects[version % t.subjects.length], lead).replace(/^there, /i, "").replace(/, there\b/i, "")),
    body: fill(t.bodies[version % t.bodies.length], lead),
  };
}

export function footer(profile) {
  const lines = ["", profile.name || "", profile.portfolio || "", "", "Not interested? Just reply \"no\" and I won't email again."];
  if (profile.address) lines.push(profile.address);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Used by tests: every template must fit the limit with a long-ish name and business.
export function longestBody() {
  const lead = { Name: "Alexandra Smith", Business: "Bright Little Minds Publishing" };
  let max = 0;
  for (const seg of Object.keys(T)) for (const b of T[seg].bodies) max = Math.max(max, fill(b, lead).length);
  return max;
}

// ---------- Follow-ups ----------
// At most two, each shorter than the first email and each adding something new.
// Links don't count toward the limit.
export const FOLLOWUP_LIMIT = 200;
export const FOLLOWUP_DAYS = [4, 7]; // days after the first email, then after follow-up 1

const F1 = {
  author: "Hi {first}, here are a few picture book spreads I've illustrated, in case they spark ideas for your story: {samples}\n\nWhat stage is your manuscript at?",
  formatting: "Hi {first}, here are some book interiors I've formatted for KDP and IngramSpark: {samples}\n\nIs your book still in the works?",
  publisher: "Hi {first}, a few recent children's book spreads and character sheets: {samples}\n\nIs {business} lining up illustrators for upcoming titles?",
  educator: "Hi {first}, here are some activity book and workbook pages I've made: {samples}\n\nIs anything like this on {business}'s plans?",
  business: "Hi {first}, here are a few ebooks and workbooks I've designed: {samples}\n\nIs there a guide you've been meaning to polish?",
};
const PROJECT = {
  author: "book project", formatting: "book that needs formatting", publisher: "new title",
  educator: "learning project", business: "ebook or workbook",
};
const F2 = "Hi {first}, I'll take it the timing isn't right, so this is my last email. If a {project} comes up, I'd love to help.{reviews}";

export function makeFollowUp(lead, segment, step, profile = {}) {
  const seg = F1[segment] ? segment : "author";
  let body = step === 1 ? F1[seg] : F2;
  body = body
    .replace("{samples}", profile.samples || profile.portfolio || "")
    .replace("{project}", PROJECT[seg])
    .replace("{reviews}", profile.reviews ? ` What past clients say: ${profile.reviews}` : "");
  return fill(body, lead).replace(/: \n/, "\n");
}

export const textLength = (t) => t.replace(/https?:\/\/\S+/g, "").length;
