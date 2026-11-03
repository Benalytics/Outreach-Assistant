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
export async function sendEmail({ to, subject, text, from, threadId, inReplyTo }) {
  const headers = [
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
      throw new Error(`Gmail refused to send because the Google account the extension is signed in with${from ? ` (${from})` : ""} has no Gmail inbox. Chrome signs the extension in with the account Chrome itself is signed in to. Sign Chrome in with your Gmail address (or use a Chrome profile that is), then sign in again in Step 1.`);
    }
    throw e;
  }
  return { id: sent.id, threadId: sent.threadId };
}

// Reads a conversation so a follow-up can reply inside it.
export async function getThread(threadId) {
  return googleFetch(`${API}/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`);
}
