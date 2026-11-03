# Outreach Assistant

A Chrome extension for cold email outreach for a children's book illustration and book formatting service.

It captures leads by hand or automatically from Google Maps, Yelp, Trustpilot, Amazon, Instagram, Threads, X, Facebook, Indeed, Glassdoor, business websites, Apollo and Hunter. It then:

- checks each email,
- saves the good ones to a Google Sheet,
- reads each lead's website for their books, needs and own words,
- writes short personal emails in seven languages (with optional DeepL translation) and sends them from Gmail,
- learns which subject lines and openers get replies,
- sends up to two polite follow-ups,
- tracks replies and bounces, and notifies you when someone answers.

- **Install and setup:** see [SETUP.md](SETUP.md).
- **Using it:** a full walkthrough of every tab, status and sheet column is in the user guide.

API keys (Apollo, Hunter, DeepL) are entered in the extension and stored in the browser only. They are never part of this repository. Replace the placeholder Google Client ID in `manifest.json` with your own after cloning.
