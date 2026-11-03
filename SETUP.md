# Outreach Assistant: setup (step 1)

This gets the extension running in Chrome and signed in to Google so it can save leads to a Google Sheet. It takes about 15 minutes, and you only do it once.

The extension's ID is fixed: **ncojamhemjkblgfaghholledjbhfgpjc**. You'll need it in part B.

## A. Load the extension in Chrome
1. Put the `cold-email-extension` folder somewhere permanent on your computer (for example Documents).
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `cold-email-extension` folder.
5. Check the ID shown under "Outreach Assistant" matches the one above.

## B. Create a Google sign-in key (free)
Google requires every app that touches your Sheets or Gmail to have its own sign-in key.

1. Go to https://console.cloud.google.com and create a new project called "Outreach Assistant".
2. Open **APIs & Services → Library** and enable **Google Sheets API** and **Gmail API**.
3. Open **APIs & Services → OAuth consent screen** (may be called "Google Auth Platform").
   - User type: **External**. App name: Outreach Assistant. Add your email as support and developer contact.
   - Under **Audience / Test users**, add your own Gmail address.
   - Leave it in **Testing** mode. That's fine for personal use.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Chrome extension**.
   - Item ID: `ncojamhemjkblgfaghholledjbhfgpjc`
   - Create it, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Open `manifest.json` in the extension folder with any text editor, and replace
   `REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com` with your Client ID. Save.
6. Back in `chrome://extensions`, click the reload arrow on Outreach Assistant.

## C. Try it
1. Click the extension's icon in the toolbar (pin it from the puzzle-piece menu first). The side panel opens.
2. **Sign in with Google.** Google will warn the app is unverified because it's your own private app. Click **Continue**.
3. Click **Create a new leads sheet** (or paste a link to a sheet you already have).
4. Go to the **Leads** tab, add a test lead, and check it appears in the sheet.

## What the sheet looks like
One row per lead, with these columns:
Added At, Name, Business, Email, Website, Phone, Location, Source, Source URL, Verification, Verified At, Email Status, Sent At, Opened, Replied, Reply Type, Notes.
Step 1 fills the contact columns. Later steps fill verification, sending and reply columns.
Duplicate emails are skipped automatically.

## Permissions it asks for, and why
- **Sheets**: to save and read your leads.
- **Gmail send / read**: used from step 3 onwards to send your emails and spot replies. Asked for now so you don't have to sign in again later.

---

# Step 2: finding and checking leads

After updating, go to `chrome://extensions` and click the reload arrow on Outreach Assistant. Chrome will ask you to allow the extension to read websites. That's needed so it can open a business's website and look for an email.

## Add your Apollo key
Setup tab → **Apollo API key** → paste it → **Save key**. It's stored in this browser only, never in the extension files.

## Three ways to find leads (Leads tab)
1. **From the page you have open.** Open a business on Google Maps (click it so its details panel shows) or a Yelp business page, or any business website. Press **Find emails on this page**. It reads the name, phone, address and website from the listing, then checks the website's homepage and up to 3 contact/about pages for emails.
2. **Search Apollo.** Pick a starting point (self-published children's authors, small publishers, educators, coaches), adjust the titles, keywords and locations, and press **Search**. This doesn't use credits. Tick the people you want and press **Get emails for selected**. That uses one Apollo credit per person.
3. **By hand.** The email is checked before it's saved.

## How emails are checked
- **Verified**: Apollo has confirmed the mailbox.
- **Valid**: the format is right, it isn't a throwaway address, and the domain is set up to receive email. "Shared inbox" means an address like info@ or hello@.
- **Invalid**: bad format, throwaway service, placeholder, or a domain that can't receive email. Apollo emails it marks as unavailable land here too.
- **Unknown**: the check couldn't run (usually a network hiccup). Try again.

Verified and Valid are ticked automatically; Invalid and Unknown are left out unless you tick them yourself. Press **Save ticked to sheet**. Emails already in the sheet are skipped.

A browser extension can't log in to someone's mail server to test one specific mailbox, so "Valid" means the domain works, not that the exact person's inbox exists. Bounces will be recorded in step 4, so bad addresses still get caught.

---

# Step 3: writing and sending emails (Compose tab)

1. Open **Your details** and fill in your name and title, portfolio link, and mailing address. US law (CAN-SPAM) needs a postal address on sales emails; a city and country is the minimum. Set a daily limit. 30 a day is a safe start for a normal Gmail address. Going much higher quickly gets you flagged as spam.
2. Press **Reload**. Every Verified or Valid lead that hasn't been emailed yet is queued up.
3. For each lead you get a ready draft:
   - **Who they are** picks the angle: children's author, author needing formatting, publisher, educator, or coach/business. It's guessed from the lead's notes and business name; change it if it's wrong.
   - The subject and message are filled in with their name and business. Edit freely. The counter turns red over 300 characters.
   - **New version** swaps in a different subject and message.
   - Your signature, portfolio and an opt-out line ("reply no and I won't email again") are added underneath.
4. **Send from Gmail** sends it as a plain-text email from your own Gmail, and marks the lead as Sent in the sheet. **Skip lead** marks it Skipped so it won't come up again.

# Step 4: results and notifications (Analytics tab)

- Every 10 minutes (while Chrome is open) the extension checks your Gmail for replies and bounces to emails it sent, and updates the sheet.
  - **Replied**: they wrote back.
  - **Declined**: the reply reads like a no ("not interested", "no thanks", "unsubscribe"...). Don't email them again.
  - **Bounced**: the address didn't exist. The lead is marked Invalid.
  - Out-of-office replies are noted but don't count as a reply.
- You get a Chrome notification for each reply, decline or bounce. Click it to open the conversation in Gmail. The extension icon shows a green count of new replies.
- The Analytics tab shows sent, bounced, replied, declined and no-reply-yet, reply and bounce rates, emails sent per day, and the latest responses. **Check inbox now** checks right away.
- **Opens aren't tracked.** That needs a tracking image hosted on a server, and Apple Mail and Gmail block or fake opens so often that the number misleads. Replies are the number to watch.


---

# Hunter.io (added after step 4)

Setup tab → **Hunter API key** → paste it → **Save key**. The card then shows your Hunter plan and how many credits you have left this month. The key stays in this browser only.

What Hunter adds:
- **Real mailbox checks.** With "Check every email with Hunter" ticked, every email is checked against the actual mail server. Results: *Verified by Hunter* (mailbox exists), *accepts all* (the server says yes to everything, so it can't confirm; kept as Valid), *webmail* (a Gmail/Yahoo-type address; kept as Valid), *mailbox doesn't exist* or *throwaway* (Invalid). Each check uses 1 verification credit. Untick the box to save credits; the tool then falls back to the free domain check.
- **Finding emails when a website lists none.** If "Find emails on this page" finds nothing on a business's website, Hunter is asked for known emails at that domain, with names and job titles. That uses 1 search credit, only when the website had no emails.
- If you run out of Hunter credits, the tool says so and carries on with the free checks.


---

# Follow-ups and a fix for Google Maps (version 0.6)

**Fix:** "Find emails on this page" now reads only the business's own details panel on Google Maps (or business page on Yelp). It unwraps Google's and Yelp's redirect links to get the real website, and it ignores addresses that belong to Google, Yelp, website builders and the like. If the business's website has emails on its own domain, those are preferred. Emails on some other company's domain are shown unticked, with a note to check them.

**Follow-ups (Compose tab → Follow-ups due):**
- Under **Your details**, add a **Samples link** (your Google Drive folder) and a **Reviews link** (your Upwork profile).
- 4 days after your first email with no reply, the lead shows up for **follow-up 1**, which shares your samples and asks one easy question.
- 7 days after that with still no reply, **follow-up 2** is a polite last email with your reviews link. After that the tool never emails them again.
- Each one is sent as a reply in the same Gmail conversation and stays under 200 characters (links not counted). Right before sending, the tool checks Gmail again and refuses if they've answered.
- Follow-ups go out on weekdays only and count toward your daily limit.
- **Later** moves to the next one; **No more follow-ups** stops them for that lead.


---

# Phase 1: capture from more places, by hand or automatically (version 0.7)

**Full-page dashboard.** Click **Open full page ↗** at the top of the side panel to open the same tool in its own browser tab, with more room. Both stay in sync.

## Capture by hand (Leads tab)
Open a page and press **Capture this page**. It works on:
- **Google Maps**: a business's details, or every business in the results list
- **Yelp**: a business page, or every business on a results page (the website is looked up for you)
- **Trustpilot**: a company page, or every company on a search page
- **Amazon**: a book page (the author, the book, and whether it's self-published or already has an illustrator), an author page, or book search results. Works on amazon.com, .co.uk, .de, .fr, .es, .it, .nl and others.
- **Instagram, Threads, X and Facebook** profiles and pages: name, handle, bio, the website link in the bio, and any email shown
- **Indeed and Glassdoor**: the company that's hiring (a job ad for an illustrator or book designer is a great lead), plus company pages and job search results
- **Any business website**

On a results page, tick **Keep capturing while I scroll** and it captures new results every few seconds as you scroll.

## Automatic capture
Type what to look for and where, tick Google Maps, Yelp, Trustpilot and/or Amazon books, and press **Start automatic capture**. A small separate window opens and goes through the result pages by itself at a human pace (a few seconds per page). It stops when it has the number of ready leads you asked for, when the pages run out, when it hits your daily page limit, or when you press Stop. If a site asks it to prove it's human, that site is skipped for the rest of the run. Social sites, Indeed and Glassdoor are manual only, to keep your accounts safe.

## Captured list
Everything you capture (and every Apollo email you reveal) lands in **Captured**. In the background the tool looks for an email on each website (and asks Hunter if the site shows none), then checks it. Each capture shows its status:
- **Ready**: emails found and checked. Verified and Valid ones are ticked. Press **Save ticked to sheet**.
- **Needs website**: no website or email found yet (common for Amazon authors and social profiles). Type their website or email into the box and press **Check**, or use **Search Google for them**.
- **No email found** / **Error**: press **Try again**, or remove it.
- Leads in **Germany or Austria** are marked "held back from sending" (stricter cold email law there). You can still save them.

New columns in the sheet: **Country** and **Rating**.
