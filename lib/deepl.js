// DeepL translation (optional). Your DeepL API key stays in this browser only.
// Free keys end in ":fx" and use DeepL's free server; paid keys use the main one.

const host = (key) => (key.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com");

export async function deeplKey() {
  return (await chrome.storage.local.get("deeplKey")).deeplKey || "";
}

async function call(path, body) {
  const key = await deeplKey();
  if (!key) throw new Error("Add your DeepL API key in the Setup tab first.");
  const res = await fetch(`${host(key)}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `DeepL-Auth-Key ${key.trim()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403) throw new Error("DeepL didn't accept the key. Check it in the Setup tab.");
  if (res.status === 456) throw new Error("Your DeepL character allowance for this month is used up.");
  if (res.status === 429) throw new Error("DeepL is busy. Wait a few seconds and try again.");
  if (!res.ok) throw new Error(`DeepL error ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

export async function deeplUsage() {
  const u = await call("/v2/usage");
  return { used: u.character_count, limit: u.character_limit };
}

// Languages where DeepL can choose formal or informal wording.
const FORMALITY = new Set(["de", "fr", "es", "it", "nl", "pt"]);

// texts: array of strings. lang: en/es/fr/de/pt/it/nl. Returns translated strings.
export async function translate(texts, lang, { formal = true, country = "" } = {}) {
  const target = lang === "pt" ? (country === "Brazil" ? "PT-BR" : "PT-PT") : lang === "en" ? "EN-US" : lang.toUpperCase();
  const body = { text: texts, target_lang: target, preserve_formatting: true };
  if (FORMALITY.has(lang)) body.formality = formal ? "prefer_more" : "prefer_less";
  const r = await call("/v2/translate", body);
  return r.translations.map((t) => t.text);
}
