# PinPosy — Application Description (for Pinterest API access request)

> Paste into the application form field "Describe your app / How will you use the Pinterest API".
> Keep the wording consistent with the live Privacy Policy and Terms of Service on the site.

## App name
PinPosy

## Website
https://pinposy.com
*(update to the final custom domain before submitting, if the domain is already purchased)*

## What the app does
PinPosy is a web application that helps Pinterest creators, bloggers, and small business owners plan and produce Pinterest content with the help of AI.

The user:
1. Signs up with email and password.
2. Creates a **Project** describing their website URL, niche, goals, tone of voice, and content language.
3. PinPosy analyzes the website text and suggests **board ideas** tailored to the niche.
4. For each board, PinPosy generates **pin ideas**: title, SEO description, and an AI-generated pin image.
5. The user **reviews every pin manually** — approves, edits, or rejects it. Nothing is ever published automatically without the user's explicit approval.
6. The user connects their **own Pinterest account** via OAuth and selects which of their boards approved pins should be published to.
7. Approved pins are published to the user's own boards through the official Pinterest API.
8. The user can see analytics of their own pins and disconnect their account at any time.

## Why we need API access
To publish the pins the user has approved to the user's own boards, and to show the user analytics for their own account and pins. All access is read/write **only for the account that authorized the app**.

## What the app does NOT do (important compliance points)
- We do **not** scrape, collect, or store any data about Pinterest accounts that have not authorized our app.
- We do not auto-follow, auto-comment, mass-message, or perform any engagement automation.
- We do not publish pins without explicit user approval of each pin (or a schedule the user explicitly created).
- We do not sell Pinterest data or use it to train AI models.
- We request only the minimum scopes needed: `user_accounts:read`, `boards:read`, `boards:write`, `pins:read`, `pins:write`. No ads, catalog, or analytics scopes beyond the user's own pin performance.

## Data handling
- OAuth tokens are stored encrypted and deleted within 24 hours after the user disconnects their account.
- Users can delete their account and all associated data at any time (self-service and via email).
- Privacy Policy: https://pinposy.com/privacy
- Terms of Service: https://pinposy.com/terms

## Contact
support@pinposy.com
Operator: self-employed (самозанятый), Russian Federation.
