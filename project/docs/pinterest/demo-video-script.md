# PinSprig — Demo Video Script (for Pinterest API access request)

> Length: 60–90 seconds. Screen recording at 1920×1080, mouse visible.
> Record ONLY after the fake "Connect Pinterest" placeholder is removed from Settings
> (done:Settings now shows an honest "in development" notice) — the reviewer must see real behavior only.

| # | Scene | On-screen action | Voiceover / caption |
|---|---|---|---|
| 1 | Intro (0:00–0:10) | Show the landing page / dashboard of PinSprig. | "PinSprig helps Pinterest creators plan and generate content with AI." |
| 2 | Project (0:10–0:20) | Open a project: show website URL, niche, goals. | "The user describes their site and niche." |
| 3 | Board ideas (0:20–0:30) | Click "Generate boards" — list of 5 boards appears. | "AI suggests board ideas for the niche." |
| 4 | Pin generation (0:30–0:45) | Open a board, generate pins — images + titles + descriptions appear. | "For each board PinSprig generates pin images and SEO descriptions." |
| 5 | Manual review (0:45–0:55) | Open the review desk, approve one pin, edit another, reject one. | "Every pin is reviewed and approved manually by the user." |
| 6 | OAuth connect (0:55–1:10) | Settings → "Connect Pinterest" → real Pinterest OAuth consent screen → return to app, account shown. | "The user connects their own Pinterest account through the official OAuth flow." |
| 7 | Publish (1:10–1:25) | Click "Publish" on the approved pin; show it appear on their real Pinterest board. | "Approved pins are published to the user's own boards via the Pinterest API." |
| 8 | Analytics + disconnect (1:25–1:35) | Show analytics of own pins; open Settings → Disconnect; confirm. | "The user sees their own pin analytics and can disconnect at any time — all tokens are deleted." |

## Recording checklist
- [ ] Use a clean test account with realistic data (no fake "42,5K views" numbers anywhere).
- [ ] The Pinterest OAuth screen shown must be the REAL one with the app name and requested scopes.
- [ ] Show the disconnect step — reviewers specifically check that users can revoke access.
- [ ] Narration or captions in English; captions if the voiceover is not clear.
- [ ] No other tabs/browser windows visible; hide bookmarks bar.
