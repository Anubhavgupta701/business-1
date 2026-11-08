# DMOrder v2.1 — Final Delivery Report (27 Oct 2026, updated after "complete everything")

## v2.1 additions (on top of v2)
- Admin panel: first admin is the seller who registers with ADMIN_EMAIL.
  GET /api/admin/sellers, GET /api/admin/stats, POST /api/admin/sellers/:id/plan
  (admin-only plan change with correct prices/limits; non-admin gets 403).
  Dashboard shows an Admin link + page only when me.isAdmin.
- Login lockout: 5 failed logins for one email in 15 minutes -> 429 for
  15 minutes (correct password also locked during that window); success
  clears the failed attempts.
- httpOnly cookie auth: login/refresh set httpOnly dmorder_token (1h) and
  dmorder_refresh (30d, /api/auth path) cookies; CORS credentials enabled.
  The browser frontend no longer stores tokens in localStorage and its
  dashboard auth gate now uses /api/auth/me. Bearer tokens are still
  accepted for non-browser API clients and for the automated tests.
- Webhook page-id routing (code): if a webhook entry id matches a connected
  seller's igPageId, rules are restricted to that seller; otherwise the
  previous global + ambiguous-skip guard applies. Live test still needs a
  real connected page (Meta OAuth).
- Email delivery (code): SMTP via nodemailer when SMTP_HOST/USER/PASS are
  set. Forgot-password and register-verification emails are then sent with
  links to /reset-password and /verify-email (new frontend pages + a
  forgot-password control on the login page). Without SMTP, tokens are
  stored but not sent, and the API never returns a token.
- Tests now 69/69 PASS (v2 was 53/53). New tests: httpOnly cookie set,
  lockout 5x401 -> 429, admin 403/200 + plan change, forgot generic ok
  with no token leaked, verify/reset invalid token 400.
- Dependencies added: cookie-parser, nodemailer (lockfiles updated).
  npm audit is STILL blocked by the registry (403 policy_denied) — not clean.

# DMOrder v2 — Final Delivery Report (27 Oct 2026)

Input: the uploaded project (`dmorder-code_0_8hhu.zip`, 24 MB, mostly node_modules)
plus the backend PRD (advanced PRD, 26 pp, delivered 27 Oct 2026 as PDF).
This ZIP is the updated project source only — no node_modules, no dist/,
no .env, no real secrets.

## A. Project changes

### Files modified
- `backend/server.js` — Phase 0 security + all v2 routes listed below.
- `backend/models.js` — seller fields (freeConversationsUsed/Total,
  emailVerified, igConnected, igUserId, igPageId, igTokenEnc), order fields
  (orderNumber, stockDeducted, statusHistory), conversation fields (channel,
  automationPaused, followUpSentAt, lastBuyerMessageAt, aiState, slots),
  plus RefreshToken, AuditLog, UsageLedger, SendLog, PasswordReset models.
- `backend/store.js` — new collections + sanitizeSeller now also strips
  igTokenEnc (a token is never returned by any API).
- `backend/seed.js` — demo seller now carries the new free-counter fields.
- `backend/.env.example` — ENCRYPTION_KEY, BACKEND_URL, FRONTEND_URL,
  WA_TOKEN, WA_PHONE_NUMBER_ID, AI_API_KEY, PAYMENT_PROVIDER (all empty).
- `backend/package.json` — only added `"test": "node tests/api.test.js"`.
  No new runtime dependencies were added.
- `frontend/src/api.js` — refresh-token retry, setTokens/clearTokens/logout.
- `frontend/src/pages/Auth.jsx` — uses setTokens; signup copy now says
  "First 5 conversations free, then a paid plan"; password hint (min 8).
- `frontend/src/pages/Dashboard.jsx` — Overview free-conversation stat,
  Billing page, conversation takeover/release/seller-reply UI, catalog
  sizes/colours fields, Instagram "Connect via Meta OAuth" button,
  logout now revokes the refresh token.
- `README.md` — v2 changes, quick start, pending list.

### Files created
- `backend/engine.js` — rule-based, catalog-only reply engine + slip builder.
- `backend/tests/api.test.js` — 53 automated API assertions (see below).
- `REPORT.md` — this report.

### Backend improvements / features implemented from the PRD
- Auth: 1-hour access tokens + rotating 30-day refresh tokens
  (POST /api/auth/refresh, /logout, /logout-all). Old refresh tokens are
  revoked on rotation and on logout.
- Password reset: hashed tokens, 1h expiry, password min 8, all refresh
  tokens revoked on reset. Email delivery is pending (see D) — the token
  is NEVER returned by the API.
- Launch offer (decided 27 Oct 2026): first 5 FULL conversations free per
  new seller, then paid. Metering is enforced on API and webhook
  conversation creation (403 PLAN_LIMIT / plan_limit_reached at the limit).
  Plans endpoint now carries `launchOffer`.
- Orders: server-computed totals (caller amounts ignored), catalog price
  lookup by productId, stock decrement on create, stock restore on cancel,
  per-seller order numbers, delivery charge / free-delivery threshold from
  the seller's settings, validated status transitions, status history,
  PER_ORDER usage-ledger entry on CONFIRMED.
- Lists: pagination (page/pageSize), search, status filter, sort.
- Webhook: whole-word trigger matching (so "price" does not fire inside
  "zqxprice"), duplicate-event idempotency, engine draft replies
  (sent:false) unless a real encrypted Instagram token + numeric recipient
  id exists, multi-seller matches skipped (ambiguous_seller_skipped),
  production webhook rejection without META_APP_SECRET.
- Conversation takeover / release / seller reply (pauses automation),
  rules dry-run (POST /api/automation/rules/test), follow-up scheduler
  (10-minute interval + POST /api/v2/automation/run-followups; follow-ups
  are drafts, live send pending a token).
- Billing overview, data export, password-confirmed account delete,
  audit log, integrations status, WhatsApp slip text, Instagram OAuth
  connect/callback (token stored AES-256-GCM encrypted, only if
  ENCRYPTION_KEY is set).

### Frontend improvements
- Refresh-token flow (a 401 retries once after a silent refresh).
- Free-conversation counter on Overview and Billing.
- Billing page, conversation takeover/reply controls, catalog sizes/colours.
- No frontend code ever receives a password, a token secret, or an
  Instagram token.

## B. Testing report
- Backend API tests (`backend/tests/api.test.js`, run with `npm test`):
  **53 passed, 0 failed.** Covers health, plans/launch offer, register
  (short password, duplicate, wrong password, unauth 401), settings
  plan-change ignored, refresh rotation + revocation, product CRUD +
  forged-field stripping + pagination + search + negative-price rejection,
  server-computed orders + stock decrement/restore + invalid transition +
  amount immutability, order slip, 5-free metering (5 free, 6th counts to
  dmUsed), takeover/release/seller reply, rules dry-run + word-boundary
  trigger check, follow-up draft, webhook draft + duplicate idempotency,
  IG connect NOT_CONFIGURED, WhatsApp test-slip NOT_CONFIGURED, billing,
  export, audit, logout revocation, account delete (wrong/correct password)
  and login-after-delete failure.
- Two real bugs found by these tests and fixed in this delivery:
  (1) a newly created rule/template had no `enabled` flag in the in-memory
  store (Mongo defaults did not apply there), so webhooks never matched it
  — now defaulted to true on create; (2) substring trigger matching fired
  "price" inside "zqxprice" — now whole-word matching.
- Frontend build: **PASS** (Vite 5.4.21, 50 modules transformed, built in
  2.44s). Frontend dev server (5173) and backend (5000) both responded
  locally (health ok, HTML served) before browser testing.
- Login/logout: verified via API tests (register/login/refresh/logout/
  logout-all) and by the frontend refresh flow in code. A visual login
  click-through was NOT possible — see browser section below.
- Database: tests run on the in-memory store (no MongoDB in this
  environment). MongoDB models are present and the production guard
  refuses to run on in-memory in production, but live Mongo persistence
  was NOT tested here (no MONGO_URI was available).
- Responsive/mobile: NOT tested in a browser (see below). No responsive
  layout code was changed in this delivery, so v1 layout behaviour is
  unchanged.

### Browser verification — FAILED / BLOCKED (honest status)
The delegated browser could NOT reach the local app. It tried
http://localhost:5173/, http://127.0.0.1:5173/ and http://[::1]:5173/ —
all were refused with "invalid_request" before any page loaded, while
https://example.com/ opened normally in the same window. The browser
runs remotely, not on the machine hosting the local dev servers, so
"localhost" there is not this machine. Consequence: homepage, /signup,
dashboard (/rk-seller-9x4mz), Product Catalog, Billing, /login and
Conversations were NEVER reached in the browser; no test account, product
or session was created by the browser, and there are no console errors to
report. This is an environment limit, not a DMOrder bug, and it has been
seen before with this same setup. Do NOT read this as "browser testing
passed". To get a real browser click-through, run this ZIP on a host the
browser can reach (a public test URL / tunnel) and re-run the browser
check, or test it locally yourself with `npm run dev` + `npm start`.

## C. Security report
- Vulnerabilities identified (from the v1 audit + this pass):
  JWT dev-fallback secret; open CORS; no security headers; webhook
  signature skipped when the secret was unset; cross-seller webhook rule
  matching; caller-changeable plan + unenforced limits; caller-supplied
  order totals; 7-day non-revocable tokens; password min 6; in-memory
  fallback hiding data loss; substring trigger false positives; new
  rules with no `enabled` flag in memory.
- Fixed in this delivery: production refuses to start without JWT_SECRET
  and without MongoDB; production webhooks rejected without
  META_APP_SECRET; CORS allowlist (CORS_ORIGIN); security headers
  (nosniff, DENY frame, no-referrer, no x-powered-by); auth rate limit
  50/15 min (global 500/15 min kept); password min 8; settings cannot
  change plan; CRUD strips sellerId/id/passwordHash/plan/dmUsed/dmLimit/
  free counters/igTokenEnc; multi-seller matches skipped; server-computed
  order totals + stock; validated status transitions; rotating refresh
  tokens with revocation; hashed password-reset tokens; Instagram tokens
  encrypted at rest (AES-256-GCM) and never returned; whole-word triggers;
  `enabled` defaulted on rule/template create.
- No new runtime dependencies were added, so no new dependency surface.
  `npm audit` could NOT be completed: the registry returned
  403 policy_denied for the audit endpoint in this environment, for both
  backend and frontend. This is NOT a clean audit — it is a blocked audit,
  and it must be re-run where the registry allows it.
- Remaining risks: token still in localStorage (not httpOnly cookies);
  no per-account login lockout; no email verification delivery; no admin
  role / privileged-endpoint separation beyond seller scoping; webhook
  multi-seller routing still needs page-id routing (Meta OAuth); live
  Instagram/WhatsApp send code is untested without real credentials.
  This is NOT a security certification.

## D. Pending items (external / owner decisions)
1. Meta app + app review + per-seller OAuth: live Instagram connect,
   live sending, and page-id webhook routing. Code paths exist; live
   verification needs META_APP_ID / META_APP_SECRET / META_VERIFY_TOKEN
   and an approved messaging permission.
2. WhatsApp route: Cloud API direct vs BSP (owner decision pending).
   Slip text is real; sending returns NOT_CONFIGURED without WA_TOKEN
   + WA_PHONE_NUMBER_ID.
3. LLM provider + per-seller AI budget (owner decision pending). The
   rule-based catalog engine is the real fallback; no LLM is called.
4. Payment provider + checkout (Razorpay was only a candidate, not
   decided). Billing overview shows amount due; no checkout is faked.
5. Email provider for password reset / verification delivery.
6. Hosting/DB for production: keep Render + Mongo Atlas or move;
   production must use MongoDB (the code enforces this). Live Mongo test
   still needs a real MONGO_URI.
7. Grace period + refund policy, buyer WhatsApp follow-up in v2 or
   deferred, pilot seller count — PRD Section 17 decisions still open.
8. Browser click-through (see B), live Mongo test, npm audit re-run,
   mobile/responsive check — all blocked by environment, not by code.

## E. Final ZIP
`dmorder-updated-v2.zip` — contains `dmorder/` with `frontend/`,
`backend/` (including `engine.js` and `tests/api.test.js`), `README.md`
and this `REPORT.md`. Excludes node_modules, dist/, .env and any real
secret. To run: backend `npm install && npm start`; frontend
`npm install && npm run dev`; backend tests `npm test`.
