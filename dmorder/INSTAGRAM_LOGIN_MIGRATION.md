# Instagram Login Migration: Technical Architecture & Documentation

## 1. Executive Summary

DMOrder has been migrated from legacy **Facebook Login for Business (Page-based)** to the official **Instagram API with Instagram Login**.

### Key Changes
- **No Facebook Page required**: Sellers connect directly using their Instagram Professional account (Business or Creator).
- **Direct Instagram OAuth**: Authorization takes place at `https://www.instagram.com/oauth/authorize`.
- **User Token Flow**: Exchanges authorization code directly for a 60-day long-lived Instagram User Access Token (AES-256-GCM encrypted at rest).
- **Instagram Messaging API**: Sends messages via `https://graph.instagram.com/v21.0/{igUserId}/messages` using `Authorization: Bearer {token}` header.
- **Instagram User ID Webhook Routing**: Inbound webhook events are matched against the seller's `igUserId` (with backward compatibility for existing `igPageId` records).
- **Multi-Tenant SaaS Isolation**: Every Instagram profile is isolated to a specific seller ID; OAuth states are HMAC-SHA256 signed with seller ID and expiration timestamp.

---

## 2. Modified Files

| File | Changes Made |
|------|-------------|
| `backend/models.js` | Added `igUsername` and `igProvider` (`'instagram_login'`) fields to `User` schema. Retained `igPageId` for backward compatibility. |
| `backend/server.js` | 1. Implemented Instagram Login OAuth in `/api/v2/instagram/connect`.<br>2. Implemented code exchange, long-lived token exchange (`ig_exchange_token`), and profile lookup (`graph.instagram.com/v21.0/me`) in `/api/v2/instagram/callback`.<br>3. Rewrote `tryInstagramSend` to dispatch to `graph.instagram.com/v21.0/{igUserId}/messages` with Bearer auth.<br>4. Updated webhook routing to match `entry.id` against both `igUserId` and `igPageId`.<br>5. Updated `/api/v2/instagram/status` to report username, provider, and no-Facebook-Page instructions.<br>6. Added URL trimming to prevent trailing whitespace bugs in OAuth callbacks. |
| `backend/store.js` | Confirmed `sanitizeSeller` strips `passwordHash` and `igTokenEnc` while safely returning `igUsername` and `igProvider`. |
| `backend/tests/api.test.js` | Updated test suite to verify Instagram Login OAuth code exchange, profile persistence, `igUserId` webhook routing, and multi-tenant isolation. All 90 tests pass. |
| `backend/.env.example` | Documented `IG_APP_ID`, `IG_APP_SECRET`, `IG_REDIRECT_URI`, and `IG_GRAPH_VERSION`. |
| `frontend/src/pages/Dashboard.jsx` | Updated Instagram Connection component to show "Connect Instagram Account", display connected `@username`, provider badge (`Instagram Login`), and token validity date. |
| `frontend/vite.config.js` | Configured proxy to backend port (`5050`). |

---

## 3. OAuth Implementation Details

### Step 1: Authorization Initiation (`GET /api/v2/instagram/connect`)
- **Endpoint**: `https://www.instagram.com/oauth/authorize`
- **Query Parameters**:
  - `client_id`: `IG_APP_ID` (or `META_APP_ID`)
  - `redirect_uri`: `https://<your-tunnel-or-domain>/api/v2/instagram/callback`
  - `response_type`: `code`
  - `scope`: `instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments`
  - `enable_fb_login`: `0` (forces direct Instagram credentials login)
  - `force_authentication`: `1` (ensures account picker is presented)
  - `state`: HMAC-SHA256 signed JSON containing `{ sellerId, exp: Date.now() + 10m }`

### Step 2: Callback & Token Exchange (`GET /api/v2/instagram/callback`)
1. **CSRF & State Validation**: Verifies HMAC signature using `JWT_SECRET` and checks expiration.
2. **Short-Lived Token Exchange**:
   - `POST https://api.instagram.com/oauth/access_token`
   - Form parameters: `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`, `code`
   - Returns `{ access_token, user_id }`
3. **Long-Lived Token Exchange** (60-day validity):
   - `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={secret}&access_token={shortToken}`
   - Returns `{ access_token, token_type: 'bearer', expires_in: 5184000 }`
4. **Profile Lookup**:
   - `GET https://graph.instagram.com/v21.0/me?fields=id,username&access_token={longToken}`
   - Retrieves the official Instagram username and professional account ID.
5. **Storage**:
   - Token is encrypted with AES-256-GCM using `ENCRYPTION_KEY`.
   - Saved to seller record: `igTokenEnc`, `igUserId`, `igUsername`, `igProvider='instagram_login'`, `igConnected=true`, `igTokenExpiresAt`.
6. **Redirect**:
   - Redirects to `${FRONTEND_URL}/rk-seller-9x4mz/instagram?connected=1`.

---

## 4. Token Management & Encryption

- **Encryption at Rest**: AES-256-GCM with a random 12-byte IV and authentication tag (`iv:tag:ciphertext`).
- **Sanitization**: `sanitizeSeller()` guarantees that `igTokenEnc` and `passwordHash` are never sent in API responses or export dumps.
- **Scheduled Auto-Refresh**: Background interval in `server.js` checks connected tokens daily and invokes:
  `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={token}`
  Extending token validity for another 60 days before expiration.

---

## 5. Messaging API Implementation

Messages are sent using Meta's official Instagram Graph API:

```http
POST https://graph.instagram.com/v21.0/{igUserId}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "recipient": { "id": "<customer_instagram_scoped_id>" },
  "message": { "text": "Namaste! Your order is being prepared." }
}
```

### Private Reply to Comments
For comment-to-DM triggers within the 7-day window:
```http
POST https://graph.instagram.com/v21.0/{igUserId}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "recipient": { "comment_id": "<comment_id>" },
  "message": { "text": "Catalog price details sent!" }
}
```

### Policy Compliance
- Adheres to Meta's **24-hour standard customer messaging window**.
- Never fakes message delivery: if credentials are missing or token has expired, messages remain recorded as drafts with `sent: false`.

---

## 6. Webhooks & Multi-Seller Routing

### Webhook Verification (`GET /api/webhooks/instagram`)
Responds to Meta's subscription challenge with `hub.challenge` when `hub.verify_token === META_VERIFY_TOKEN`.

### Inbound Events (`POST /api/webhooks/instagram`)
1. **Signature Validation**: Checks `x-hub-signature-256` HMAC using `META_APP_SECRET`. Unsigned or tampered requests are rejected with 401.
2. **Deduplication**: In-memory and DB tracking of `eventId = entry.id:mid` prevents duplicate AI processing.
3. **Multi-Tenant Seller Lookup**:
   - Looks up seller where `u.igConnected === true` and `u.igUserId === entry.id`.
   - Fallback checks `u.igPageId === entry.id` for legacy Facebook-connected accounts.
   - If no matching seller is found, the event is safely ignored without leaking cross-seller data.
4. **AI Reply Engine**: Generates catalog-based responses and sends automated replies if active token is present.

---

## 7. Meta Developer Dashboard Setup Steps

To enable Instagram Login in your Meta App:

1. **Open Meta App Dashboard**: Go to [developers.facebook.com/apps](https://developers.facebook.com/apps).
2. **Select or Create App**:
   - App Type: **Business**
3. **Add Use Case**:
   - Click **Use Cases** in the left sidebar.
   - Click **Add Use Case** → Select **Instagram API with Instagram Login**.
4. **Configure Instagram Login Settings**:
   - Under **Instagram** → **API setup with Instagram login**:
   - Add your Redirect URI:
     `https://<your-public-domain-or-tunnel>/api/v2/instagram/callback`
5. **Add Permissions**:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
   - `instagram_business_manage_comments`
6. **Configure Webhooks**:
   - Under **Webhooks** → Select **Instagram**:
   - Callback URL: `https://<your-public-domain-or-tunnel>/api/webhooks/instagram`
   - Verify Token: value from your `META_VERIFY_TOKEN` (e.g. `rk_webhook_verify_2026_secure`)
   - Subscribe to field: `messages`, `comments`

---

## 8. Why LocalTunnel Showed "503 - Tunnel Unavailable"

When testing with LocalTunnel URLs (`tender-olives-smash.loca.lt`, `soft-boxes-love.loca.lt`):
1. **Port Collision on Windows**: Port 5001 was reserved by Windows Hyper-V / NAT (`EACCES`), causing the backend process to terminate on startup. With no server listening, LocalTunnel returned `503 Service Unavailable`.
2. **LocalTunnel Interstitial/Captcha**: LocalTunnel injects a browser verification interstitial screen for incoming HTTP requests. When Meta redirects back via OAuth, this page blocks automated headers and query param forwarding.
3. **Trailing Whitespace**: `BACKEND_URL` in `.env` had a trailing space, corrupting the generated redirect URI.

### Solution Applied:
- Moved backend to dedicated, conflict-free port: **`5050`**.
- Updated `frontend/vite.config.js` to proxy to port `5050`.
- Added strict `.trim()` to all redirect URI generation logic.
- Automated tests run against dedicated mock servers (ports 5050 and 5052).

---

## 9. Commands to Run

### Backend
```powershell
cd dmorder\backend
npm run dev
# Listens on http://localhost:5050
```

### Frontend
```powershell
cd dmorder\frontend
npm run dev
# Listens on http://localhost:5173
```

### Run Automated Tests
```powershell
cd dmorder\backend
npm test
# Result: 90 passed, 0 failed
```

---

## 10. Test Results Summary

```
Total Tests: 90
Passed: 90
Failed: 0
Status: 100% PASS

Highlights:
- PASS IG test server (mock Meta) starts
- PASS connect endpoint returns Meta OAuth URL
- PASS callback redirects 302 to frontend with connected=1
- PASS status reflects igConnected: true after callback
- PASS status reports instagram_login provider
- PASS export never leaks igTokenEnc (sanitized)
- PASS callback stored igUserId=mock_ig_biz_user_999
- PASS callback stored igUsername=mock_ig_seller_shop
- PASS callback stored igProvider=instagram_login
- PASS webhook with matching igUserId creates live send using Instagram user token
- PASS webhook with igUserId restricts to seller 1 only (multi-tenant isolation verified)
- PASS disconnect ok and status flips back to disconnected
```

