// Google sign-in using Chrome's identity API.
export function getToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "Not signed in"));
      } else {
        resolve(token);
      }
    });
  });
}

export async function signOut() {
  try {
    const token = await getToken(false);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: "POST" });
    await new Promise((r) => chrome.identity.removeCachedAuthToken({ token }, r));
  } catch (_) { /* already signed out */ }
  await chrome.storage.local.remove("userEmail");
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
    await new Promise((r) => chrome.identity.removeCachedAuthToken({ token }, r));
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
