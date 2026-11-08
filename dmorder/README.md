# DMOrder — AI Instagram DM Order Salesman (v2, 27 Oct 2026)

Public site + seller dashboard (React + Vite) + Express backend (MongoDB or in-memory fallback in dev only).

## Quick start (local, test data only)
Backend:
```
cd backend
npm install
npm start        # http://localhost:5000
npm test         # automated API tests (spawns its own server on port 5001)
npm run seed     # writes demo-seed.json (demo seller Aisha Boutique, Jaipur)
```
Frontend:
```
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxies /api to localhost:5000)
npm run build    # production build
```
Demo login (demo data only, not a real seller): aisha.boutique@gmail.com / demo1234
Seller dashboard route after login: /rk-seller-9x4mz

## What changed in v2.1 (27 Oct 2026, on top of v2)
- Admin panel (ADMIN_EMAIL at register), login lockout (5 fails / 15 min -> 429), httpOnly cookie auth (browser no longer stores tokens in localStorage; Bearer still works for API clients), webhook page-id routing (code, live test needs a connected page), SMTP email verification + password reset with /verify-email and /reset-password pages (delivery needs SMTP credentials).

## What changed in v2 (27 Oct 2026)
- Security (Phase 0, already in this build): production refuses to start without JWT_SECRET and without MongoDB; production webhooks are rejected without META_APP_SECRET; CORS allowlist (CORS_ORIGIN, default localhost:5173/5174); security headers; auth rate limit 50/15 min; password minimum 8 chars; settings can no longer change plan; CRUD create/update strips sellerId/id/passwordHash/plan/dmUsed/dmLimit/free counters/igTokenEnc; multi-seller webhook matches are skipped (ambiguous_seller_skipped) instead of being filed under the first seller.
- Auth: 1-hour access tokens + rotating 30-day refresh tokens (POST /api/auth/refresh, /logout, /logout-all). Password reset endpoints exist (hashed tokens, 1h expiry); email delivery is pending a provider, so the reset token is never returned by the API.
- Launch offer (decided 27 Oct 2026): first 5 FULL conversations free per new seller, then paid. Dashboard Overview + Billing show "Free Conversations Left". After the 5 free, DM usage counts against the plan limit; webhook/API conversation creation returns 403 PLAN_LIMIT (or plan_limit_reached) when the limit is reached.
- Orders are server-computed: caller amounts are ignored. Items with a catalog productId use that product's price, decrement stock, and use the seller's delivery charge / free-delivery threshold. Invalid status transitions are rejected; cancelling restores stock; confirming a PER_ORDER order writes a usage-ledger entry.
- Lists: pagination (page/pageSize), search, status filter, sort on all CRUD lists.
- Rule-based AI engine (backend/engine.js): replies come ONLY from the seller's catalog (price, sizes, colours, stock, COD). Unknown facts are asked about, not invented. No LLM is called in this build; an LLM provider is an owner decision (AI_API_KEY, pending).
- Webhook: whole-word trigger matching (so "price" does not fire inside "zqxprice"), duplicate-event idempotency, engine draft replies (sent:false) unless the seller has a real encrypted Instagram token and a numeric recipient id. Live send code exists but is untested without Meta credentials.
- Conversation takeover/release/seller reply (pauses automation), rules dry-run (POST /api/automation/rules/test), follow-up scheduler (10-min interval + manual POST /api/v2/automation/run-followups; follow-ups are drafts, live send pending a token).
- Billing overview, data export (GET /api/v2/export), account delete (POST /api/v2/account/delete, password-confirmed), audit log (GET /api/v2/audit), integrations status (GET /api/v2/integrations), WhatsApp slip text (GET /api/v2/orders/:id/slip; sending is credential-gated).
- Frontend: refresh-token retry in api.js, free-conversation counter, Billing page, conversation takeover/release/reply UI, catalog sizes/colours fields, Instagram "Connect via Meta OAuth" button (returns NOT_CONFIGURED until a Meta app exists), launch-offer copy on signup.

## Pending (NOT done, NOT faked — see REPORT.md)
Meta OAuth live verification, live Instagram sending, WhatsApp sending, LLM provider, payment checkout, email delivery for password reset/verification, per-account login lockout, httpOnly-cookie token storage (token is still in localStorage), full page-id routing for multi-seller webhooks, admin panel. These need the Section 17 owner decisions + real credentials, and are listed in REPORT.md with exact status.
