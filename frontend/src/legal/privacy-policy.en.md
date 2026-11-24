# PinPosy Privacy Policy

Last updated: November 5, 2026
Effective date: October 17, 2026

PinPosy ("the Service", "we") is a web application for AI-assisted planning and creation of Pinterest content: website analysis, board and pin idea generation, image generation, manual review, and publishing to a connected Pinterest account through the official Pinterest API.

This policy explains what data we collect, why, how we protect it, and what rights you have. Service URL: https://pinposy.com.

## 1. Data Controller

- Operator: Diana Aleksandrovna Bannova, a self-employed individual registered under the Russian professional income tax (NPD) regime in the Russian Federation. Tax ID (INN): **231294708907**.
- Privacy contact: **support@pinposy.com**

## 2. Data We Collect

### 2.1 Account data

- email address and password (stored only as a cryptographic hash);
- name (if you provide it);
- profile preferences: avatar, interface language, timezone.

### 2.2 Project and content data

- your website URL, niche, content language, goals, and tone of voice — as you entered them in a project;
- boards and pins created for you: titles, descriptions, generated images;
- generation and credit history.

**Image visibility:** Images attached to pins (including images you upload) are stored in a public object-storage bucket so that Pinterest and other external services can retrieve them. Anyone who obtains an image's public URL may view that image without signing in to PinPosy. Do not upload confidential documents, private photographs, personal data, or other content that you do not want to be publicly accessible. Removing an image from PinPosy does not recall copies already downloaded, cached by browsers/CDNs, or saved by Pinterest or other third parties.

### 2.3 Pinterest data (only after you connect an account)

When you connect your Pinterest account via the official OAuth flow, we access **only your** account:

- your account ID, name, and username;
- the list of your boards (titles, descriptions, pin counts);
- your pins and their statistics (impressions, saves, clicks) — for the Analytics screen;
- OAuth access tokens (stored encrypted).

**We do not collect or analyze data from Pinterest accounts belonging to other users. We do not scrape and we do not receive data about anyone who has not connected our Service.**

### 2.4 Technical data

- IP address, browser type, request times — in server logs, for security purposes;
- payment records: amount, date, status. We never receive or store card numbers — they are processed by the payment provider.

## 3. How We Use Data

1. providing the Service: website analysis, board and pin idea generation, planning;
2. publishing pins you approved to your own Pinterest account through the official API;
3. security: prevention of abuse, spam, and unauthorized access;
4. user support;
5. payment records and fulfillment.

We do not sell your data and do not share it for advertising.

## 4. Data Sharing (Subprocessors)

Only the following providers, in the scope necessary to operate the Service:

- **GPTunnel (gptunnel.ru)** — AI provider: text prompts (niche, topics, titles) and image descriptions are sent for text and image generation. Country: Russia.
- **Hosting and database** — storage of accounts, projects, and content. Data lives on a dedicated server in the Russian Federation (hosting provider AdminVPS); the database runs on that same server, and no separate cloud service receives your data. We will update this section if the server or its country changes.
- **Pinterest** — publishing and reading data of your connected account only, within the permissions you granted during OAuth.
- **Prodamus** — payment provider: payment processing; card data is handled by the provider and never reaches us.
- **Email provider** — sending emails (registration confirmation, password reset, notifications).

Each provider processes data under its own privacy policy.

## 5. Pinterest Permissions and Revocation

- We request only: `user_accounts:read`, `boards:read`, `boards:write`, `pins:read`, `pins:write`.
- You can revoke access at any time — in Pinterest settings ("Security and apps") or via the "Disconnect Pinterest" button in the Service.
- When you disconnect an account, its Pinterest OAuth tokens are erased immediately: the service deletes them at the moment of disconnection, not on a schedule.

## 6. Data Retention and Deletion

- Data is stored while your account is active.
- When you delete your account, personal data and OAuth tokens are deleted as soon as your request is processed: the deletion queue is handled by a worker automatically. The one exception is database backups: copies are kept for 14 days, so data disappears from them no later than 14 days after the account is deleted. Payment records are retained as required by accounting law.
- You can download the available account-data export yourself in **Settings → Data & Account**. If the export is unavailable or you need help, contact us using the address in Section 12.

## 7. Your Rights

You have the right to:

- receive a copy of the data we hold about you;
- request correction of inaccurate data;
- request deletion of your account and data;
- withdraw consent (including disconnecting your Pinterest account);
- object to processing.

We respond to requests within 30 days.

## 8. Cookies and Local Storage

- Authentication uses a token in browser localStorage; theme, language, and UI preferences are also stored in localStorage.
- No advertising or tracking cookies; no third-party analytics services.

## 9. Minors

The Service is intended for users aged 18 and older. We do not knowingly collect data from minors; if this happens, contact us and the data will be deleted.

## 10. International Data Transfers

The server, the database and the AI provider are located in the Russian Federation. Outside it operate only Pinterest (US) — when you publish a pin, its data is sent to Pinterest through the official API — and the payment provider's infrastructure to the extent needed to process a payment. By using the Service you consent to such transfers. For EEA users, the grounds are listed in Appendix A.

## 11. Changes to This Policy

We may update this policy — for example, when adding features or changing providers. The current date is always shown at the top. Material changes will be announced in the interface or by email.

## 12. Contact

Questions about this policy and data processing: **support@pinposy.com**

## Appendix A. EEA Users (GDPR)

- Legal bases: performance of a contract (providing Service features); consent (connecting a Pinterest account); legitimate interest (security and abuse prevention).
- Additional rights: data portability, restriction of processing, objection, and the right to lodge a complaint with your national supervisory authority.

## Appendix B. California Residents (CCPA/CPRA)

- We collect the categories listed in Section 2 solely for the purposes in Section 3.
- We do not sell or share personal information for monetary or other consideration.
- You have the right to know, delete, and correct your personal information; exercising these rights will not result in discrimination.
