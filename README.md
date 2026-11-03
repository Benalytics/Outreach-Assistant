# Outreach Assistant

A Chrome extension for cold email outreach for a children's book illustration and book formatting service.

It finds leads by hand or automatically on children's book sites (Amazon, Goodreads, Kickstarter, Reedsy Discovery, BookBub, Bookshop.org, Barnes & Noble, Lulu, Blurb), social media (Instagram, Facebook, Threads, LinkedIn, X), job posts (LinkedIn Jobs, Indeed, Glassdoor, Reddit hiring posts), Google Maps, any website, Apollo and Hunter. It then:

- looks up each lead's own website when it's missing, and any job posts they've put up for illustration, covers or formatting,
- checks each email,
- saves the good ones to a Google Sheet,
- reads each lead's website for their books, needs and own words,
- writes short personal emails in seven languages (with optional DeepL translation) and sends them from Gmail,
- learns which subject lines and openers get replies,
- scores every lead from 0 to 100 so the best ones are emailed first,
- sends up to two polite follow-ups that refer back to the first email,
- tracks replies and bounces, and notifies you when someone answers,
- exports to CSV and makes a full backup you can restore.

- **Install and setup:** see [SETUP.md](SETUP.md).
- **Using it:** a full walkthrough of every tab, status and sheet column is in the user guide.

API keys (Apollo, Hunter, DeepL) are entered in the extension and stored in the browser only. They are never part of this repository. Replace the placeholder Google Client ID in `manifest.json` with your own after cloning.
