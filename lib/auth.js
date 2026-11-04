// Google sign-in.
//
// Two ways to sign in:
// 1. Chrome's account (the default): chrome.identity.getAuthToken. Chrome only hands out a
//    token for the Google account Chrome itself is signed in with.
// 2. Another Google account you pick (webAuth): chrome.identity.launchWebAuthFlow with a
//    "Web application" OAuth client. This works for any account you're signed in to on the web,
//    such as a Gmail account that isn't the one Chrome uses.

const SCOPES = chrome.runtime.getManifest().oauth2?.scopes || [];
const SESSION_KEY = "webToken"; // { token, expires, email } kept in memory only

const webAuth = async () => (await chrome.storage.local.get("webAuth")).webAuth || null;
export const redirectUrl = () => chrome.identity.getRedirectURL();

function chromeToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "Not signed in"));
      } else {
        resolve(typeof token === "string" ? token : token.token);
      }
    });
  });
}

function authUrl(clientId, { prompt, hint }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("response_type", "token");
  u.searchParams.set("redirect_uri", redirectUrl());
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("include_granted_scopes", "true");
  if (prompt) u.searchParams.set("prompt", prompt);
  if (hint) u.searchParams.set("login_hint", hint);
  return u.href;
}

const AUTH_ERRORS = {
  access_denied: "You closed the Google window or didn't allow access.",
  redirect_uri_mismatch: "Google says the redirect address doesn't match. Copy the address shown in Step 1 into your Web client's Authorized redirect URIs and try again.",
  invalid_client: "Google doesn't recognise that client ID. Check you copied the Web application client ID.",
};

// Opens Google's sign-in (or does it silently) and returns { token, expires }.
async function webFlow(clientId, { interactive, prompt, hint }) {
  let redirect;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({
      url: authUrl(clientId, { prompt, hint }),
      interactive,
      ...(interactive ? {} : { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 15000 }),
    });
  } catch (e) {
    const m = e?.message || String(e);
    if (/did not approve|canceled|cancelled|closed/i.test(m)) throw new Error(AUTH_ERRORS.access_denied);
    if (!interactive) throw new Error("Not signed in");
    if (/could not be loaded|Authorization page/i.test(m)) throw new Error(`Google's sign-in page didn't open (${m}). Check the client ID is a Web application client and the redirect address is added to it.`);
    throw new Error(m);
  }
  const p = new URLSearchParams(new URL(redirect).hash.slice(1) || new URL(redirect).search.slice(1));
  const err = p.get("error");
  if (err) throw new Error(interactive ? AUTH_ERRORS[err] || `Google sign-in failed: ${err}` : "Not signed in");
  const token = p.get("access_token");
  if (!token) throw new Error("Google didn't send back an access token.");
  return { token, expires: Date.now() + (Number(p.get("expires_in")) || 3600) * 1000 };
}

async function webToken(wa, interactive) {
  const cached = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY];
  if (cached?.token && cached.email === wa.email && cached.expires > Date.now() + 60_000) return cached.token;
  let got;
  try {
    got = await webFlow(wa.clientId, { interactive: false, prompt: "none", hint: wa.email });
  } catch (e) {
    if (!interactive) throw e;
    got = await webFlow(wa.clientId, { interactive: true, hint: wa.email });
  }
  await chrome.storage.session.set({ [SESSION_KEY]: { ...got, email: wa.email } });
  return got.token;
}

export async function getToken(interactive = false) {
  const wa = await webAuth();
  if (wa?.clientId && wa?.email) return webToken(wa, interactive);
  return chromeToken(interactive);
}

async function dropCachedToken(token) {
  const wa = await webAuth();
  if (wa?.email) await chrome.storage.session.remove(SESSION_KEY);
  else await new Promise((r) => chrome.identity.removeCachedAuthToken({ token }, r));
}

// Shows Google's account chooser so you can pick any account you're signed in to.
export async function chooseAccount(clientId) {
  const id = (clientId || "").trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new Error("That doesn't look like a client ID. It ends in .apps.googleusercontent.com.");
  }
  const got = await webFlow(id, { interactive: true, prompt: "select_account consent" });
  const email = await getUserEmail(got.token);
  await chrome.storage.local.set({ webAuth: { clientId: id, email } });
  await chrome.storage.session.set({ [SESSION_KEY]: { ...got, email } });
  return email;
}

// Goes back to the account Chrome is signed in with (keeps the client ID for next time).
export async function useChromeAccount() {
  const wa = await webAuth();
  if (wa) await chrome.storage.local.set({ webAuth: { clientId: wa.clientId } });
  await chrome.storage.session.remove(SESSION_KEY);
}

export async function signOut() {
  try {
    const token = await getToken(false);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: "POST" });
    await dropCachedToken(token);
  } catch (_) { /* already signed out */ }
  const wa = await webAuth();
  if (wa) await chrome.storage.local.set({ webAuth: { clientId: wa.clientId } });
  await chrome.storage.session.remove(SESSION_KEY);
  await chrome.storage.local.remove("userEmail");
}

export async function authInfo() {
  const wa = await webAuth();
  return { picked: !!wa?.email, webClientId: wa?.clientId || "", redirectUrl: redirectUrl() };
}

export async function getUserEmail(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not read your Google profile (${res.status})`);
  const data = await res.json();
  return data.email;
}

// Wraps fetch with the auth header and one retry if the token has expired.
export async function googleFetch(url, options = {}) {
  let token = await getToken(false);
  const doFetch = (t) => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
  });
  let res = await doFetch(token);
  if (res.status === 401) {
    await dropCachedToken(token);
    token = await getToken(true);
    res = await doFetch(token);
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error?.message || ""; } catch (_) {}
    throw new Error(`Google API error ${res.status}${detail ? ": " + detail : ""}`);
  }
  return res.json();
}

// True when Google says the account has no Gmail mailbox (a Google account made with a
// non-Gmail address, such as a business email, that never had Gmail turned on).
export const isNoGmail = (msg) => /precondition check failed|mail service not enabled|failedPrecondition|no Gmail inbox/i.test(msg || "");
