// A 0-100 guess at how good a lead is, so you email the best ones first.
// It adds up: how sure we are the email works, whether it reaches a person,
// how clearly they need illustration or formatting now, and how much we know
// about them to make the email personal. The reasons are kept so you can see why.
import { parseResearch } from "./research.js";
import { STRICT } from "./country.js";

const GENERIC = /^(info|hello|hi|contact|office|admin|mail|team|support|enquiries|inquiries|sales|kontakt|bonjour|hola|ciao|ola|post|general)@/i;

export function scoreLead(lead) {
  const reasons = [];
  let s = 0;
  const add = (n, why) => { s += n; if (why) reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`); };

  const v = lead.Verification;
  if (v === "Verified") add(30, "mailbox confirmed");
  else if (v === "Valid") add(22, "email looks valid");
  else if (v === "Unknown") add(5, "email not confirmed");
  if (lead.Email && !GENERIC.test(lead.Email)) add(10, "reaches a person");
  else if (lead.Email) add(3, "shared inbox");

  const r = parseResearch(lead.Research);
  if (r.signs.includes("needs_art")) add(25, "looking for an illustrator");
  if (r.signs.includes("upcoming")) add(12, "new book on the way");
  if (r.signs.includes("self_pub")) add(8, "self-published");
  if (r.signs.includes("publisher")) add(10, "publishes other authors");
  if (r.signs.includes("educator")) add(6, "makes learning materials");
  if (r.signs.includes("lead_magnet")) add(6, "offers free guides");
  if (r.signs.includes("formatting")) add(4, "mentions formatting");
  if (r.titles.length) add(6, "book titles found");
  if (r.quote) add(3, "their own words found");
  if (r.genres.some((g) => /picture|board|early|activity|colou?ring|bedtime|rhyming/.test(g))) add(5, "picture or activity books");

  if (lead.Name) add(4, "has a name");
  if (lead.Website) add(3, "has a website");
  const stars = parseFloat(lead.Rating);
  if (stars >= 4) add(2, "well reviewed");
  if (/Already credits an illustrator/i.test(lead.Notes || "")) add(-12, "already has an illustrator");
  if (STRICT.has(lead.Country)) add(-15, "strict cold email rules");
  if (lead.offDomain) add(-10, "email on another domain");

  return { score: Math.max(0, Math.min(100, Math.round(s))), reasons };
}
