// Apollo.io API. The key is entered by you in the Setup tab and kept in this browser only.
const BASE = "https://api.apollo.io/api/v1";

async function apolloKey() {
  const { apolloKey } = await chrome.storage.local.get("apolloKey");
  if (!apolloKey) throw new Error("Add your Apollo API key in the Setup tab first.");
  return apolloKey;
}

async function apolloPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": await apolloKey() },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText;
    if (res.status === 401) throw new Error("Apollo rejected the API key. Check it in the Setup tab.");
    if (res.status === 403) throw new Error(`Apollo says your plan doesn't allow this (${msg}). API search and email reveals may need a paid Apollo plan.`);
    if (res.status === 422 && /credit/i.test(msg)) throw new Error("You're out of Apollo credits for this month.");
    if (res.status === 429) throw new Error("Apollo rate limit hit. Wait a minute and try again.");
    throw new Error(`Apollo error ${res.status}: ${msg}`);
  }
  return data;
}

const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

// Finds people. Does not reveal emails and does not use credits.
export async function searchPeople({ titles, keywords, locations, page = 1 }) {
  const body = { page, per_page: 25 };
  if (list(titles).length) body.person_titles = list(titles);
  if (list(locations).length) body.person_locations = list(locations);
  if ((keywords || "").trim()) body.q_keywords = keywords.trim();
  const data = await apolloPost("/mixed_people/api_search", body);
  return {
    total: data.total_entries ?? data.pagination?.total_entries ?? null,
    people: (data.people || []).map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name || p.last_name_obfuscated].filter(Boolean).join(" "),
      title: p.title || "",
      company: p.organization?.name || "",
      hasEmail: p.has_email !== false,
    })),
  };
}

// Reveals emails for up to 10 people per call. Uses Apollo credits.
export async function revealEmails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 10) {
    const data = await apolloPost("/people/bulk_match", {
      details: ids.slice(i, i + 10).map((id) => ({ id })),
      reveal_personal_emails: false,
    });
    for (const m of data.matches || []) {
      if (!m) continue;
      out.push({
        Name: m.name || [m.first_name, m.last_name].filter(Boolean).join(" "),
        Business: m.organization?.name || "",
        Email: m.email || "",
        Website: m.organization?.website_url || "",
        Phone: m.organization?.phone || m.organization?.primary_phone?.number || "",
        Location: [m.city, m.state, m.country].filter(Boolean).join(", "),
        Source: "Apollo",
        "Source URL": m.linkedin_url || "",
        Notes: m.title || "",
        apolloStatus: m.email_status || "",
      });
    }
  }
  return out;
}
