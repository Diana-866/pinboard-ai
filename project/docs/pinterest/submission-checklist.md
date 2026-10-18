# PinSprig — Pinterest API Submission Checklist

> Go through this BEFORE clicking "Submit" on the developer application.

## Before submitting

### Product
- [ ] Live site loads at the URL in the form (not under construction, no broken images).
- [ ] Landing page clearly explains what the product does **without login**.
- [ ] Registration works end-to-end (create account → login → see the app).
- [ ] Privacy Policy page live, no placeholders, links from footer and registration form.
- [ ] Terms of Service page live, no placeholders.
- [ ] **No fake Pinterest data anywhere** (no invented views/counts, no fake OAuth — removed 2026-10-17).
- [ ] Delete-account instructions reachable (page or in settings).

### Application form fields
- [ ] App name matches the product name everywhere (site title, policy, OAuth consent).
- [ ] Website URL = live site.
- [ ] Redirect URI registered in the dev app matches the backend callback exactly (scheme, host, path).
- [ ] Description: copy from `application-description.md` (edited to the field's character limit).
- [ ] Scopes: only the 5 justified in `scopes-justification.md`.
- [ ] Contact email is monitored (check it at least every few days).
- [ ] Demo video: uploaded, ≤ 2 min, follows `demo-video-script.md`.

### After submitting
- [ ] Record submission date here: `____`
- [ ] Expected review time: days–weeks (Trial access first, Standard after a working demo).
- [ ] While waiting: continue work on Stage 2 (email confirmation, password reset), Stage 1Б (RU hosting migration).

## Common rejection reasons (check against your app)
1. Scraping or storing data of **other** users' accounts — our old policy mentioned competitor scraping; it has been REMOVED (2026-10-17). Double-check the live policy does not mention it.
2. Fake/stub functionality visible in the demo video (fake OAuth, invented analytics).
3. Placeholder text in legal documents ([YOUR DOMAIN], [UPDATE DATE]).
4. Requesting excessive scopes (ads, catalogs) without justification.
5. No visible way to disconnect the account / delete data.
6. Broken links (privacy policy, terms) or "under construction" pages.
7. App name containing "Pinterest" or trademarks.
8. Auto-posting without user control — make sure the review/approval step is visible in the video.
