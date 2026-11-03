// Learns from replies which subject and opener styles work best for you.
// Each sent email records its styles in the sheet. A style's score is a guess at its
// reply rate, and Thompson sampling picks the next style: mostly the one doing best,
// sometimes another, so a style that started unlucky still gets a fair chance.

export const SUBJECT_STYLES = { question: "Question", curiosity: "Curiosity", benefit: "Benefit", personal: "About their book" };
export const OPENER_STYLES = { observation: "Something from their website", problem: "A common problem", question: "A direct question" };

const daysSince = (iso) => (Date.now() - Date.parse(iso)) / 864e5;

// Counts an email once it has had 3 days to get an answer, or has one already.
export function styleStats(leads) {
  const stats = { subject: {}, opener: {} };
  for (const k of Object.keys(SUBJECT_STYLES)) stats.subject[k] = { sent: 0, replies: 0 };
  for (const k of Object.keys(OPENER_STYLES)) stats.opener[k] = { sent: 0, replies: 0 };
  for (const l of leads) {
    if (!l["Sent At"] || l["Email Status"] === "Bounced") continue;
    const replied = l["Email Status"] === "Replied";
    if (!replied && l["Email Status"] !== "Declined" && daysSince(l["Sent At"]) < 3) continue;
    for (const [kind, col] of [["subject", "Subject Style"], ["opener", "Opener Style"]]) {
      const s = stats[kind][l[col]];
      if (!s) continue;
      s.sent++;
      if (replied) s.replies++;
    }
  }
  return stats;
}

// Random draws for Beta(a, b), from two Gamma draws (Marsaglia and Tsang).
function gamma(k) {
  if (k < 1) return gamma(k + 1) * Math.random() ** (1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = Math.random(), u2 = Math.random(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v ** 3;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaSample(a, b) { const x = gamma(a), y = gamma(b); return x / (x + y); }

// Picks one of `allowed` styles. stats: { style: { sent, replies } }.
export function pickStyle(stats, allowed) {
  let best = allowed[0], top = -1;
  for (const s of allowed) {
    const { sent = 0, replies = 0 } = stats?.[s] || {};
    const draw = betaSample(1 + replies, 1 + sent - replies);
    if (draw > top) { top = draw; best = s; }
  }
  return best;
}
