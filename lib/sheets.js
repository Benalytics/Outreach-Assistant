import { googleFetch } from "./auth.js";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
export const LEADS_TAB = "Leads";

// One row per lead. Later steps fill in the verification and email columns.
export const LEAD_COLUMNS = [
  "Added At", "Name", "Business", "Email", "Website", "Phone", "Location",
  "Source", "Source URL", "Verification", "Verified At",
  "Email Status", "Sent At", "Opened", "Replied", "Reply Type", "Notes",
  "Subject", "Gmail Thread ID", "Follow-ups Sent", "Last Follow-up At",
  "Country", "Rating", "Research", "Language", "Subject Style", "Opener Style", "Score", "Main Point",
];
// Column letter for a 0-based index: 0 → A, 25 → Z, 26 → AA.
export const colName = (i) => (i >= 26 ? colName(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
const LAST_COL = colName(LEAD_COLUMNS.length - 1);

export function parseSheetId(input) {
  const s = (input || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

export async function createLeadsSheet(title = "Outreach Leads") {
  const sheet = await googleFetch(API, {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: LEADS_TAB, gridProperties: { frozenRowCount: 1 } } }],
    }),
  });
  await writeHeader(sheet.spreadsheetId);
  return { id: sheet.spreadsheetId, title, url: sheet.spreadsheetUrl };
}

// Connects to an existing sheet, adding a Leads tab and header row if needed.
export async function connectSheet(spreadsheetId) {
  const meta = await googleFetch(`${API}/${spreadsheetId}?fields=properties.title,spreadsheetUrl,sheets.properties.title`);
  const hasTab = meta.sheets.some((s) => s.properties.title === LEADS_TAB);
  if (!hasTab) {
    await googleFetch(`${API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: LEADS_TAB, gridProperties: { frozenRowCount: 1 } } } }] }),
    });
  }
  const head = await googleFetch(`${API}/${spreadsheetId}/values/${LEADS_TAB}!1:1`);
  if (!head.values || !head.values[0] || head.values[0].join("|") !== LEAD_COLUMNS.join("|")) {
    await writeHeader(spreadsheetId);
  }
  return { id: spreadsheetId, title: meta.properties.title, url: meta.spreadsheetUrl };
}

async function writeHeader(spreadsheetId) {
  await googleFetch(`${API}/${spreadsheetId}/values/${LEADS_TAB}!A1?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [LEAD_COLUMNS] }),
  });
}

export async function getLeads(spreadsheetId) {
  const data = await googleFetch(`${API}/${spreadsheetId}/values/${LEADS_TAB}!A2:${LAST_COL}`);
  return (data.values || []).map((row, i) => {
    const lead = { row: i + 2 };
    LEAD_COLUMNS.forEach((col, j) => { lead[col] = row[j] || ""; });
    return lead;
  });
}

// Appends leads, skipping any email already in the sheet. Returns counts.
export async function appendLeads(spreadsheetId, leads) {
  const existing = await getLeads(spreadsheetId);
  const seen = new Set(existing.map((l) => l.Email.toLowerCase()).filter(Boolean));
  const fresh = [];
  for (const lead of leads) {
    const email = (lead.Email || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    fresh.push({ ...lead, Email: email, "Added At": lead["Added At"] || new Date().toISOString() });
  }
  if (fresh.length) {
    await googleFetch(`${API}/${spreadsheetId}/values/${LEADS_TAB}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: fresh.map((l) => LEAD_COLUMNS.map((c) => l[c] || "")) }),
    });
  }
  return { added: fresh.length, skipped: leads.length - fresh.length };
}

// Updates some columns of one lead's row, e.g. { "Email Status": "Sent" }.
export async function updateLead(spreadsheetId, row, fields) {
  const data = Object.entries(fields).map(([col, value]) => {
    const i = LEAD_COLUMNS.indexOf(col);
    if (i < 0) throw new Error(`Unknown column ${col}`);
    return { range: `${LEADS_TAB}!${colName(i)}${row}`, values: [[value ?? ""]] };
  });
  await googleFetch(`${API}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}
