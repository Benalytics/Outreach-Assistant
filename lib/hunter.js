// Hunter.io API. The key is entered by you in the Setup tab and kept in this browser only.
const BASE = "https://api.hunter.io/v2";

export async function hunterKey() {
  const { hunterKey } = await chrome.storage.local.get("hunterKey");
  return hunterKey || null;
}

async function hunterGet(path, params) {
  const key = await hunterKey();
  if (!key) throw new Error("Add your Hunter API key in the Setup tab first.");
  const qs = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`${BASE}${path}?${qs}`);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (res.status === 202) return { pending: true };
  if (!res.ok) {
    const msg = data.errors?.[0]?.details || res.statusText;
    if (res.status === 401) throw new Error("Hunter rejected the API key. Check it in the Setup tab.");
    if (res.status === 429 || res.status === 403) throw new Error(`Hunter limit reached: ${msg}`);
    throw new Error(`Hunter error ${res.status}: ${msg}`);
  }
  return data.data || {};
}

// Remaining credits this month.
export async function hunterAccount() {
  const d = await hunterGet("/account", {});
  const r = d.requests || {};
  return {
    plan: d.plan_name || "",
    searchesLeft: r.searches ? r.searches.available - r.searches.used : null,
    verificationsLeft: r.verifications ? r.verifications.available - r.verifications.used : null,
  };
}

// Checks one mailbox. Uses 1 verification credit.
// Returns { status, reason } in the extension's terms, or null if Hunter couldn't decide.
export async function hunterVerify(email) {
  const d = await hunterGet("/email-verifier", { email });
  if (d.pending) return null;
  const score = typeof d.score === "number" ? ` (score ${d.score})` : "";
  switch (d.status) {
    case "valid": return { status: "Verified", reason: `Verified by Hunter${score}` };
    case "webmail": return { status: "Valid", reason: `Hunter: personal webmail address${score}` };
    case "accept_all": return { status: "Valid", reason: `Hunter: server accepts all addresses, can't confirm this one${score}` };
    case "invalid": return { status: "Invalid", reason: "Hunter: mailbox doesn't exist" };
    case "disposable": return { status: "Invalid", reason: "Hunter: throwaway address" };
    default: return null;
  }
}

// Finds emails at a company's domain. Uses 1 search credit.
export async function hunterDomainSearch(website) {
  let domain;
  try { domain = new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, ""); } catch (_) { return []; }
  const d = await hunterGet("/domain-search", { domain, limit: 10 });
  return (d.emails || []).map((e) => ({
    Email: e.value,
    Name: [e.first_name, e.last_name].filter(Boolean).join(" "),
    Notes: e.position || "",
    hunterStatus: e.verification?.status || "",
  }));
}
