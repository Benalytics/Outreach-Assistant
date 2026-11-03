import { googleFetch } from "./auth.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);

// Sends a plain-text email from your Gmail. Plain text lands in the inbox more
// often than designed HTML emails.
// The addresses this Gmail account may send as: its own, plus any added in Gmail under
// Settings > Accounts and Import > Send mail as (only verified ones).
export async function listSendAs() {
  const r = await googleFetch(`${API}/settings/sendAs`);
  return (r.sendAs || [])
    .filter((a) => a.isPrimary || a.verificationStatus === "accepted")
    .map((a) => ({ email: a.sendAsEmail.toLowerCase(), name: a.displayName || "", primary: !!a.isPrimary, isDefault: !!a.isDefault }));
}

const fromHeader = (email, name) => {
  if (!name) return `From: <${email}>`;
  const clean = name.replace(/["\r\n]/g, "").trim();
  return `From: ${/^[\x20-\x7e]*$/.test(clean) ? `"${clean}"` : encodeHeader(clean)} <${email}>`;
};

// from: the address the email goes out as. fromName: the name shown with it.
export async function sendEmail({ to, subject, text, from, fromName, asAlias, threadId, inReplyTo }) {
  const headers = [
    ...(asAlias && from ? [fromHeader(from, fromName)] : []),
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (from) headers.push(`List-Unsubscribe: <mailto:${from}?subject=unsubscribe>`);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  const body = btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/(.{76})/g, "$1\r\n");
  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;
  let sent;
  try {
    sent = await googleFetch(`${API}/messages/send`, {
      method: "POST",
      body: JSON.stringify(threadId ? { raw: b64url(raw), threadId } : { raw: b64url(raw) }),
    });
  } catch (e) {
    // Gmail answers "Precondition check failed" when the signed-in Google account has no Gmail inbox.
    if (/400.*precondition/i.test(e.message)) {
      throw new Error("Gmail refused to send because the Google account the extension is signed in with has no Gmail inbox. Sign Chrome (and then the extension, in Step 1) in with your Gmail account. To send as another address you own, add it in Gmail under Settings > Accounts and Import > Send mail as, then pick it under Send emails from in Step 1.");
    }
    throw e;
  }
  return { id: sent.id, threadId: sent.threadId };
}

// Reads a conversation so a follow-up can reply inside it.
export async function getThread(threadId) {
  return googleFetch(`${API}/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`);
}
