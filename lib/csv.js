// CSV files for Excel, Google Sheets or any CRM. Cells that start with = + - @ get a
// leading apostrophe, so a spreadsheet never runs them as a formula.
const cell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows, columns) {
  return "﻿" + [columns.map(cell).join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n");
}
