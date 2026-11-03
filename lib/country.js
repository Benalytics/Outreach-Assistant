// Works out a lead's country from its address, website or Amazon store.

const NAMES = {
  "united states": "United States", usa: "United States", "u.s.a": "United States", "united kingdom": "United Kingdom", uk: "United Kingdom",
  england: "United Kingdom", scotland: "United Kingdom", wales: "United Kingdom", ireland: "Ireland", canada: "Canada", australia: "Australia",
  "new zealand": "New Zealand", germany: "Germany", deutschland: "Germany", austria: "Austria", österreich: "Austria", switzerland: "Switzerland",
  schweiz: "Switzerland", suisse: "Switzerland", france: "France", spain: "Spain", españa: "Spain", italy: "Italy", italia: "Italy",
  portugal: "Portugal", netherlands: "Netherlands", nederland: "Netherlands", belgium: "Belgium", belgique: "Belgium", belgië: "Belgium",
  luxembourg: "Luxembourg", denmark: "Denmark", sweden: "Sweden", norway: "Norway", finland: "Finland", poland: "Poland", polska: "Poland",
  greece: "Greece", "south africa": "South Africa", nigeria: "Nigeria", kenya: "Kenya", ghana: "Ghana", india: "India", singapore: "Singapore",
  "united arab emirates": "United Arab Emirates", uae: "United Arab Emirates", mexico: "Mexico", méxico: "Mexico", brazil: "Brazil", brasil: "Brazil",
};
const US_STATES = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}\b/;
const TLD = {
  uk: "United Kingdom", "co.uk": "United Kingdom", ie: "Ireland", ca: "Canada", au: "Australia", "com.au": "Australia", nz: "New Zealand",
  de: "Germany", at: "Austria", ch: "Switzerland", fr: "France", es: "Spain", it: "Italy", pt: "Portugal", nl: "Netherlands", be: "Belgium",
  lu: "Luxembourg", dk: "Denmark", se: "Sweden", no: "Norway", fi: "Finland", pl: "Poland", gr: "Greece", za: "South Africa", "co.za": "South Africa",
  ng: "Nigeria", "com.ng": "Nigeria", in: "India", "co.in": "India", sg: "Singapore", ae: "United Arab Emirates", mx: "Mexico", "com.mx": "Mexico",
  br: "Brazil", "com.br": "Brazil",
};

export const EU = new Set(["Germany", "Austria", "France", "Spain", "Italy", "Portugal", "Netherlands", "Belgium", "Luxembourg", "Ireland",
  "Denmark", "Sweden", "Finland", "Poland", "Greece"]);
// Cold email to businesses without prior consent is generally not allowed here.
export const STRICT = new Set(["Germany", "Austria"]);

function fromTld(host) {
  const h = (host || "").toLowerCase();
  const two = h.split(".").slice(-2).join(".");
  const one = h.split(".").pop();
  return TLD[two] || TLD[one] || "";
}

export function guessCountry({ address = "", website = "", amazonTld = "", profileUrl = "" } = {}) {
  const a = address.toLowerCase();
  for (const [k, v] of Object.entries(NAMES)) {
    if (new RegExp(`(^|[\\s,])${k.replace(/\./g, "\\.")}($|[\\s,.])`).test(a)) return v;
  }
  if (US_STATES.test(address)) return "United States";
  if (amazonTld) return amazonTld === "com" ? "United States" : (TLD[amazonTld] || "");
  try { const c = fromTld(new URL(website).hostname); if (c) return c; } catch (_) {}
  try { const h = new URL(profileUrl).hostname; if (/indeed|glassdoor/.test(h)) return fromTld(h); } catch (_) {}
  return "";
}
