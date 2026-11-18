# Prodamus API endpoint HTTPS enforcement

**Date:** 2026-11-18 (UTC+03:00)  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Starting reconciled HEAD:** `e63c04129148716bd4cf64c3222d0d114d3651f6`  
**Final source/test/workflow HEAD:** `0db356d326fe2a1640291ff82f6596c7fe414b58`

## 1. Finding and root cause

The shared `backend/prodamus.js:baseUrl()` previously returned `PRODAMUS_URL` after only appending a trailing slash. `createPaymentLink()` signs the outgoing checkout payload with an HMAC derived from `PRODAMUS_SECRET`, then passes `baseUrl()` to `axios.post()`. A misconfigured value such as `http://payments.example/...` therefore allowed a signed payment request to be sent over cleartext HTTP. A configured URL containing embedded username/password credentials was also accepted.

This is separate from the previously fixed `urlNotification` guard: that guard secures the callback URL Prodamus uses to notify PinPosy, whereas this finding secures the outbound API endpoint to which PinPosy sends the signed checkout request.

## 2. Implementation

Updated `backend/prodamus.js:baseUrl()` to:
- parse the configured/default endpoint with the URL parser;
- reject malformed values;
- require `https:` and a hostname;
- reject embedded username/password credentials;
- preserve the existing default shop URL when `PRODAMUS_URL` is blank;
- normalize the endpoint path to end in exactly the expected slash position without appending a slash after query parameters.

Invalid configuration fails with an HTTP 500 configuration error before `axios.post()` can send the signed payload. No fallback to HTTP or insecure endpoint is attempted.

Source commit: `ff78fe371b83c4b2b7bfeb21462618461aa2337c`  
Source blob: `0643401d0d116a1117a8c15c7309e78708130d66`

## 3. Regression tests and workflow

Created `backend/test/prodamus-endpoint-security.test.js` with two tests:
1. HTTPS endpoint normalization succeeds; HTTP, FTP, credential-bearing and malformed configured URLs are rejected.
2. With an HTTP `PRODAMUS_URL`, `createPaymentLink()` rejects before the stubbed Axios transport is called, proving the signed request is not sent.

The first test draft incorrectly treated an empty `PRODAMUS_URL` as invalid. Review of the existing default behavior showed that blank means “use the configured shop ID's HTTPS payform URL”; that assertion was removed before finalizing the test. The correction is commit `210a8387770fc7c76e7ceba8b6631a387a662889`.

Test file final blob: `6f6a7c9b6584977e4da3ca00d0cda6e39a4abe62`.  
Initial test file commit: `002ba79f17ad5222faec4deca4ebeab4c122921f`.

Updated `.github/workflows/prodamus-checkout-tests.yml` to include the new test path in both `push` and `pull_request` filters and add it to the explicit Node test command. Workflow blob: `18f380c92619f923454defa85092798954ccd245`. Workflow commit: `0db356d326fe2a1640291ff82f6596c7fe414b58`.

## 4. Verification boundary

After publishing, re-fetched the source, test and workflow from `main` and inspected their final content and commit diffs. Confirmed the workflow contains the new test in both event path filters and in its `node --test` command.

No local Node/npm command was executed in this environment. Therefore the new regression tests are **NOT RUNTIME-VERIFIED**. The combined Vercel status for final HEAD `0db356d326fe2a1640291ff82f6596c7fe414b58` was `pending` at the last check; this is not deployment evidence. No successful GitHub Actions run for the new commit was observed before this report was written.

A prior attempt to update `backend/prodamus.js` using a stale file SHA was rejected by GitHub with HTTP 409 after `main` advanced to `e63c04129148716bd4cf64c3222d0d114d3651f6`. The rejected request made no repository change. The branch head and source were re-fetched, and the same change was then applied against the current file SHA.

No production database, `PIN_TRIAL`, real payment, Prodamus account, live webhook, Pinterest API, deployment or other external service was accessed. No credentials or environment secrets were read or changed.

## 5. Remaining gates

1. Obtain a successful Prodamus checkout Actions run that visibly executes all six Node test files, including `prodamus-endpoint-security.test.js`.
2. If Actions again fails before runner allocation or without logs, use owner UA-036 to inspect the run in GitHub UI and provide the failure details with secrets redacted; do not blindly rerun.
3. Complete the independent guarded PostgreSQL integration gate UA-035 (46/46 tests and disposable database cleanup).
4. Verify the actual webhook URL configured in the Prodamus dashboard through the owner account before accepting real payments.
5. Do not enable live payments or invite first users until runtime, database, webhook and deployment gates are green.

## 6. Assistant action chronology

1. Reconciled the latest `main` commit history, project passport, owner action log, documentation register, Prodamus source, checkout handlers, existing Prodamus tests and CI workflow.
2. Identified that the outbound signed API request endpoint itself had no HTTPS or embedded-credential validation, distinct from the callback URL hardening already present.
3. Attempted a guarded source update using a file SHA that became stale while `main` advanced; GitHub rejected the write with 409. No overwrite or force update was attempted.
4. Re-fetched current source and applied the HTTPS/credential guard against the current blob SHA.
5. Added endpoint validation and transport-not-called regression coverage. Corrected the initial test to preserve the intentional blank-value default endpoint behavior.
6. Added the test to the existing workflow's push/PR filters and explicit Node command.
7. Re-fetched all final files, inspected diffs, checked the final branch head and Vercel status, and recorded that runtime verification remains outstanding.


## Follow-up: source-contract alignment and final CI observation

After the initial endpoint-security report was committed, the Prodamus workflow was expanded to execute the new endpoint-security test as a sixth Node test file. Static review then found that `backend/test/billing-security-contract.test.js` still expected the previous five-file command and did not assert that the new endpoint test appeared in both path filters. That mismatch would make the contract test fail once the workflow reached the Node runner.

Corrected the source-contract test to expect the exact six-file command and assert that `backend/test/prodamus-endpoint-security.test.js` appears in both push and pull_request path filters. Commit: `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8`; final contract-test blob: `0823cb96a2c1ec4ee00c55e8524432dbfa2316e3`. The endpoint-security test itself remains at blob `6f6a7c9b6584977e4da3ca00d0cda6e39a4abe62`; workflow remains blob `18f380c92619f923454defa85092798954ccd245`.

The source-contract test and workflow were re-fetched after the correction. The workflow command now lists all six files and both path filters contain the endpoint-security test path. This is static verification only; no local Node run was executed.

Latest observed Prodamus Actions run for commit `05bd81bbbb9775e2f671e8d730c9d5442fa8b9a8`: run `44307390644`, job `134812379544`. The job completed FAILURE after approximately two seconds, with `runner_id: 0`, empty `runner_name`, and `steps: []`. GitHub reports two check-run annotations, but their content was not accessible through the available connector. Thus the six Node files are not proven to have executed; exact failure cause remains UNKNOWN. Do not treat this as a test failure or a pass, and do not blindly rerun.

The docs/owner handoff is UA-040, updated to require visible execution of all six tests and to use UA-036 for inspectable failure logs. UA-035 PostgreSQL integration remains independent. No production system or external payment service was touched.


## 8. Follow-up: disable HTTP redirects for signed checkout requests

A further review of the outbound Axios request found a separate transport-boundary issue: even after requiring an HTTPS `PRODAMUS_URL`, Axios follows redirects by default. A provider endpoint returning a 307/308 to another host could cause the signed POST body to be forwarded, despite the application later rejecting the redirect response as an unsuccessful invoice creation.

Set `maxRedirects: 0` on the Prodamus POST request. The existing non-2xx response handling now receives the 3xx response directly and treats it as an ambiguous provider outcome; the signed request is not automatically forwarded to the redirect target.

Source commit: `f89803b544a78ef15fc4d75220225d4f89edb53a`; source blob: `e9290bc314ae1c20b15d8d9a6b91877a1ed73535`.

Added a regression to `backend/test/prodamus-endpoint-security.test.js` that stubs Axios to return 307, verifies the checkout is rejected as ambiguous, and asserts `maxRedirects === 0` on the actual Axios options. Test commit: `facc0c992b122106f72d7adc80e70a0f28b82fff`; final test blob: `1face096b814532e10a608fb4de8a53ec9b4b096`. The existing workflow already includes this test path and executes the file; no workflow edit was required.

Both files were re-fetched from main and the exact diffs inspected. The new regression is **NOT RUNTIME-VERIFIED**; no local Node test was run. Vercel status for test commit `facc0c992b122106f72d7adc80e70a0f28b82fff` was PENDING at last check. No Actions result for this latest commit was available at report time. No production or external service was accessed.


## 9. Final status refresh (2026-11-18)

Re-queried the combined commit status for latest code/test commit `facc0c992b122106f72d7adc80e70a0f28b82fff`: Vercel now reports SUCCESS. This supersedes the earlier PENDING observation for the redirect-guard test commit, but it is not proof of a production deployment and does not execute the backend Node suite.

The latest Prodamus test source is still not runtime-verified. The most recent inspectable Actions evidence remains run `44307390644` on the preceding contract-test commit, which failed before exposing any runner step/log; no successful Actions run for `facc0c992b122106f72d7adc80e70a0f28b82fff` was available at this check. Do not infer that tests passed or failed from Vercel status.

Latest repository `main` HEAD after documentation updates is `7944cf5152e98d1000ee556dd09e41c39829437d`; latest code/test commit remains `facc0c992b122106f72d7adc80e70a0f28b82fff`. Production, live payments, external provider accounts and databases remain untouched.
