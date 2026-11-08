// DMOrder backend API tests (v2). Self-contained: spawns the server on
// port 5001 with a test-only JWT secret, runs real HTTP requests against
// it, then stops the server. No external service is called; credential-
// gated integrations are asserted to return NOT_CONFIGURED, never faked.
// Run: npm test   (from backend/)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';

const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const dir = path.dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0; const failures = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL ${name} ${extra}`); }
}
async function req(method, path_, body, token) {
  const res = await fetch(BASE + path_, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
const child = spawn('node', ['server.js'], { cwd: path.join(dir, '..'), env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'test-only-secret-12345', NODE_ENV: 'development', ADMIN_EMAIL: 'admin-test@example.com', META_APP_ID: '', META_APP_SECRET: '', IG_APP_ID: '', IG_APP_SECRET: '' }, stdio: 'ignore' });
try {
  check('server starts', await waitHealth());
  const email = `v2test${Date.now()}@example.com`;
  const pw = 'testpass123';
  // Health + plans
  let r = await req('GET', '/api/health');
  check('health ok', r.status === 200 && r.data.status === 'ok');
  r = await req('GET', '/api/plans');
  check('plans include launch offer (5 free conversations)', r.data.launchOffer?.firstConversationsFree === 5);
  // Auth
  r = await req('POST', '/api/auth/verify-phone-otp', { firebaseIdToken: 'test-firebase-id-token', mobile: '+91 98290 00000' });
  check('verify-phone-otp 200 with test token', r.status === 200 && r.data.verified === true);
  r = await req('POST', '/api/auth/verify-phone-otp', { firebaseIdToken: 'invalid.token.here', mobile: '+91 98290 00000' });
  check('verify-phone-otp 400 with invalid token', r.status === 400);
  r = await req('POST', '/api/auth/register', { shopName: 'V2 Test Shop', ownerName: 'Tester', email, password: 'short' });
  check('short password rejected (min 8)', r.status === 400);
  r = await req('POST', '/api/auth/register', { shopName: 'V2 Test Shop', ownerName: 'Tester', email, password: pw, mobile: '+91 98290 00000', firebaseIdToken: 'test-firebase-id-token' });
  check('register 201 + refresh token issued + phoneVerified', r.status === 201 && !!r.data.refreshToken && !!r.data.token && r.data.seller.phoneVerified === true, JSON.stringify(r.data).slice(0, 200));
  const token = r.data.token; let refresh = r.data.refreshToken;
  r = await req('POST', '/api/auth/register', { shopName: 'Bad OTP', ownerName: 'Bad', email: `badotp${Date.now()}@example.com`, password: pw, mobile: '+91 98290 00000', firebaseIdToken: 'invalid-token' });
  check('register with bad firebaseIdToken rejected 400', r.status === 400);
  r = await req('POST', '/api/auth/firebase-login', { firebaseIdToken: 'test-firebase-id-token', shopName: 'Google Shop' });
  check('firebase-login 200/201 with verified Google/Firebase token', (r.status === 200 || r.status === 201) && !!r.data.token && !!r.data.seller);
  r = await req('POST', '/api/auth/register', { shopName: 'Dup', ownerName: 'Dup', email, password: pw });
  check('duplicate email 409', r.status === 409);
  r = await req('POST', '/api/auth/login', { email, password: 'wrongpass123' });
  check('wrong password 401', r.status === 401);
  r = await req('GET', '/api/settings');
  check('unauth settings 401', r.status === 401);
  r = await req('GET', '/api/settings', null, token);
  check('auth settings ok, plan FREE_TRIAL', r.status === 200 && r.data.settings.plan === 'FREE_TRIAL');
  // Settings: plan change must be ignored
  r = await req('PUT', '/api/settings', { plan: 'GROWTH', shopName: 'V2 Test Shop Renamed' }, token);
  check('settings plan change ignored', r.data.settings.plan === 'FREE_TRIAL' && r.data.settings.shopName === 'V2 Test Shop Renamed');
  // Refresh rotation
  r = await req('POST', '/api/auth/refresh', { refreshToken: refresh });
  check('refresh rotates', r.status === 200 && !!r.data.token && !!r.data.refreshToken);
  const newRefresh = r.data.refreshToken;
  r = await req('POST', '/api/auth/refresh', { refreshToken: refresh });
  check('old refresh token revoked after rotation', r.status === 401);
  refresh = newRefresh;
  // Products + pagination + search
  const prodIds = [];
  for (let i = 1; i <= 3; i++) {
    r = await req('POST', '/api/products', { name: `Test Kurti ${i}`, price: 1000 + i, category: 'Kurti', stock: 5, sizes: ['S', 'M'], colors: ['Pink'] }, token);
    check(`product ${i} created`, r.status === 201, JSON.stringify(r.data).slice(0, 200));
    prodIds.push(r.data.item?.id);
  }
  r = await req('POST', '/api/products', { name: 'Bad Price', price: -5 }, token);
  check('negative price rejected', r.status === 400);
  r = await req('GET', '/api/products?page=1&pageSize=2', null, token);
  check('pagination total=3, page 2 items', r.data.total === 3 && r.data.items?.length === 2 && r.data.page === 1);
  r = await req('GET', '/api/products?search=Kurti%202', null, token);
  check('search finds Kurti 2', r.data.items?.length === 1 && r.data.items[0].name === 'Test Kurti 2');
  r = await req('POST', '/api/products', { name: 'Forged', price: 1, sellerId: 'seller_attacker', plan: 'GROWTH' }, token);
  check('forged sellerId/plan stripped on create', r.status === 201 && r.data.item.sellerId !== 'seller_attacker' && !('plan' in r.data.item));
  // Orders: server-computed total + stock
  const prod0 = prodIds[0];
  r = await req('POST', '/api/orders', { customer: { name: 'Test Buyer', instagramHandle: '@testbuyer', phone: '9876543210', address: { line: 'Test Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } }, items: [{ productId: prod0, qty: 2 }], amount: 999999, payment: { method: 'COD', status: 'PENDING' } }, token);
  check('order computed (not caller amount 999999)', r.status === 201 && r.data.item.amount === 2002 && r.data.item.deliveryCharge === 0 && !!r.data.item.orderNumber, JSON.stringify(r.data).slice(0, 300));
  const orderId = r.data.item?.id;
  r = await req('GET', `/api/products?search=Kurti%201`, null, token);
  check('stock decremented 5 -> 3', r.data.items?.[0]?.stock === 3);
  r = await req('PUT', `/api/orders/${orderId}`, { status: 'DELIVERED' }, token);
  check('invalid transition NEW -> DELIVERED rejected', r.status === 400);
  r = await req('PUT', `/api/orders/${orderId}`, { status: 'CONFIRMED', amount: 1 }, token);
  check('confirm ok, amount cannot be changed via PUT', r.status === 200 && r.data.item.amount === 2002 && r.data.item.status === 'CONFIRMED');
  r = await req('PUT', `/api/orders/${orderId}`, { status: 'CANCELLED' }, token);
  check('cancel ok', r.status === 200 && r.data.item.status === 'CANCELLED');
  r = await req('GET', `/api/products?search=Kurti%201`, null, token);
  check('stock restored on cancel 3 -> 5', r.data.items?.[0]?.stock === 5);
  // Slip (real text, not sent)
  r = await req('GET', `/api/v2/orders/${orderId}/slip`, null, token);
  check('order slip contains order + amount', r.status === 200 && r.data.slip.includes('Rs. 2002') && r.data.sent === false);
  // Conversations: 5 free, then dmUsed
  for (let i = 1; i <= 6; i++) {
    r = await req('POST', '/api/conversations', { customerName: `Buyer ${i}`, handle: `@buyer${i}`, lastMessage: 'hi', status: 'IN_CHAT' }, token);
    check(`conversation ${i} created`, r.status === 201);
  }
  r = await req('GET', '/api/analytics/overview', null, token);
  check('metering: 5 free used, dmUsed 1 after 6th', r.data.overview.freeConversationsUsed === 5 && r.data.overview.dmUsed === 1 && r.data.overview.freeConversationsLeft === 0, JSON.stringify(r.data.overview));
  const convs = (await req('GET', '/api/conversations', null, token)).data.items;
  const convId = convs[0]?.id;
  r = await req('POST', `/api/conversations/${convId}/takeover`, {}, token);
  check('takeover pauses automation', r.status === 200 && r.data.item.status === 'HUMAN_TAKEOVER' && r.data.item.automationPaused === true);
  r = await req('POST', `/api/conversations/${convId}/reply`, { text: 'Namaste ji, main khud jawab de rahi hu.' }, token);
  check('seller reply stored + automation paused', r.status === 200 && r.data.item.messages?.some((m) => m.from === 'seller'));
  r = await req('POST', `/api/conversations/${convId}/release`, {}, token);
  check('release resumes automation', r.status === 200 && r.data.item.status === 'IN_CHAT' && r.data.item.automationPaused === false);
  // Rules test (dry run, no send, no conversation)
  r = await req('POST', '/api/automation/rules/test', { text: 'Test Kurti ki price kya hai?' }, token);
  check('rules test: price matched, reply mentions catalog price', r.status === 200 && r.data.matched.includes('price') && r.data.wouldReply.includes('1001') && r.data.sent === false, JSON.stringify(r.data).slice(0, 300));
  r = await req('POST', '/api/automation/rules/test', { text: 'zqxprice' }, token);
  check('word-boundary trigger: zqxprice does NOT match price', r.status === 200 && !r.data.matched.includes('price'));
  // Follow-ups: STALLED + old buyer message -> draft prepared
  r = await req('POST', '/api/conversations', { customerName: 'Stalled Buyer', handle: '@stalled', lastMessage: 'soch ke batati hu', status: 'STALLED', lastBuyerMessageAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() }, token);
  const stalledId = r.data.item?.id;
  r = await req('POST', '/api/v2/automation/run-followups', {}, token);
  check('follow-up run processes stalled conversation', r.status === 200 && r.data.processed.includes(stalledId), JSON.stringify(r.data));
  r = await req('GET', '/api/conversations', null, token);
  const stalled = r.data.items.find((c) => c.id === stalledId);
  check('follow-up draft appended + followUpSentAt set', !!stalled?.followUpSentAt && stalled.messages?.some((m) => m.from === 'ai_draft'));
  // Webhook: unique trigger (avoids the default-trigger multi-seller ambiguity), draft + engine reply
  r = await req('POST', '/api/automation/rules', { triggerWord: 'zqxmagic', action: 'send_dm' }, token);
  check('unique webhook rule created', r.status === 201);
  r = await req('POST', '/api/webhooks/instagram', { entry: [{ id: 'page_test', messaging: [{ sender: { id: 'buyer_999' }, message: { text: 'zqxmagic Test Kurti?' }, mid: `mid_v2_${Date.now()}` }] }] });
  check('webhook creates draft conversation with engine reply, sent:false', r.status === 200 && r.data.results?.[0]?.sent === false && r.data.results?.[0]?.action === 'draft_conversation_created_no_live_send', JSON.stringify(r.data).slice(0, 300));
  r = await req('POST', '/api/webhooks/instagram', { entry: [{ id: 'page_test', messaging: [{ sender: { id: 'buyer_999' }, message: { text: 'zqxmagic Test Kurti?' }, mid: `mid_v2_${Date.now()}` }] }] });
  // second webhook with a different mid must not be a duplicate, but use same mid to test dedupe:
  const dupMid = `dup_${Date.now()}`;
  await req('POST', '/api/webhooks/instagram', { entry: [{ id: 'page_test', messaging: [{ sender: { id: 'buyer_999' }, message: { text: 'zqxmagic hi' }, mid: dupMid }] }] });
  r = await req('POST', '/api/webhooks/instagram', { entry: [{ id: 'page_test', messaging: [{ sender: { id: 'buyer_999' }, message: { text: 'zqxmagic hi' }, mid: dupMid }] }] });
  check('webhook duplicate event idempotent', r.data.results?.[0]?.duplicate === true);
  // Credential-gated integrations: must NOT fake success
  r = await req('GET', '/api/v2/instagram/connect', null, token);
  check('IG connect without Meta app returns 400 NOT_CONFIGURED', r.status === 400);
  r = await req('POST', '/api/v2/whatsapp/test-slip', { to: '919876543210', text: 'test' }, token);
  check('WhatsApp test-slip without provider returns 400, not faked', r.status === 400 && r.data.sent !== true);
  r = await req('GET', '/api/v2/billing/overview', null, token);
  check('billing overview: free counter + checkout not configured', r.status === 200 && r.data.billing.freeConversationsLeft === 0 && r.data.billing.checkout.configured === false);
  r = await req('GET', '/api/v2/export', null, token);
  check('export contains seller products/orders', r.status === 200 && Array.isArray(r.data.data.products) && r.data.data.products.length >= 3);
  r = await req('GET', '/api/v2/audit', null, token);
  check('audit log has entries', r.status === 200 && r.data.total >= 1);
  // Cookie auth: login must set an httpOnly cookie (browser flow), not just a JSON token
  {
    const res = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const setCookie = res.headers.get('set-cookie') || '';
    check('login sets httpOnly dmorder_token cookie', setCookie.includes('dmorder_token=') && setCookie.toLowerCase().includes('httponly'));
  }
  // Login lockout: separate account, 5 fails -> 429
  const lockEmail = `locktest${Date.now()}@example.com`;
  await req('POST', '/api/auth/register', { shopName: 'Lock Test', ownerName: 'Lock', email: lockEmail, password: pw });
  for (let i = 1; i <= 5; i++) { const rr = await req('POST', '/api/auth/login', { email: lockEmail, password: 'wrongpass123' }); check(`lockout attempt ${i} is 401`, rr.status === 401); }
  r = await req('POST', '/api/auth/login', { email: lockEmail, password: 'wrongpass123' });
  check('6th failed login is 429 locked', r.status === 429);
  r = await req('POST', '/api/auth/login', { email: lockEmail, password: pw });
  check('correct password while locked is still 429', r.status === 429);
  // Admin: ADMIN_EMAIL account can list sellers and change plans; normal seller cannot
  const adminEmail = 'admin-test@example.com';
  r = await req('POST', '/api/auth/register', { shopName: 'Admin Shop', ownerName: 'Admin', email: adminEmail, password: pw });
  const adminToken = r.data.token;
  check('admin account registered', r.status === 201 && r.data.seller?.isAdmin === true);
  r = await req('GET', '/api/admin/sellers', null, token);
  check('non-admin admin endpoint is 403', r.status === 403);
  r = await req('GET', '/api/admin/sellers', null, adminToken);
  check('admin can list sellers', r.status === 200 && Array.isArray(r.data.items) && r.data.total >= 2);
  r = await req('POST', `/api/admin/sellers/${(await req('GET', '/api/auth/me', null, token)).data.seller.id}/plan`, { plan: 'STARTER' }, adminToken);
  check('admin plan change to STARTER works', r.status === 200 && r.data.seller.plan === 'STARTER' && r.data.seller.dmLimit === 300);
  r = await req('GET', '/api/auth/me', null, token);
  check('seller plan is now STARTER after admin change', r.data.seller.plan === 'STARTER');
  // Forgot / verify / reset with invalid tokens (delivery needs SMTP, so only validation is testable here)
  r = await req('POST', '/api/auth/forgot-password', { email });
  check('forgot-password returns generic ok, no token leaked', r.status === 200 && r.data.ok === true && !('token' in r.data));
  r = await req('POST', '/api/auth/verify-email', { token: 'invalidtoken' });
  check('verify-email with invalid token is 400', r.status === 400);
  r = await req('POST', '/api/auth/reset-password', { token: 'invalidtoken', password: 'newpass123' });
  check('reset-password with invalid token is 400', r.status === 400);
  // Logout revokes refresh, account delete
  r = await req('POST', '/api/auth/logout', { refreshToken: refresh });
  check('logout ok', r.status === 200);
  r = await req('POST', '/api/auth/refresh', { refreshToken: refresh });
  check('refresh after logout fails', r.status === 401);
  r = await req('POST', '/api/v2/account/delete', { password: 'wrongpass123' }, token);
  check('account delete with wrong password fails', r.status === 401);
  r = await req('POST', '/api/v2/account/delete', { password: pw }, token);
  check('account delete with correct password ok', r.status === 200);
  r = await req('POST', '/api/auth/login', { email, password: pw });
  check('login after delete fails', r.status === 401);

  // ---- Instagram end-to-end with mocked Meta Graph API ----
  const PORT2 = 5056;
  const BASE2 = `http://127.0.0.1:${PORT2}`;
  const encKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const child2 = spawn('node', ['server.js'], {
    cwd: path.join(dir, '..'),
    env: {
      ...process.env,
      PORT: String(PORT2),
      JWT_SECRET: 'test-only-secret-12345',
      NODE_ENV: 'development',
      ENCRYPTION_KEY: encKeyHex,
      META_APP_ID: 'test_meta_app_id_123',
      META_APP_SECRET: 'test_meta_app_secret_456',
      META_VERIFY_TOKEN: 'test_meta_verify_token',
      META_API_MOCK: 'true',
      ADMIN_EMAIL: 'admin-test@example.com'
    },
    stdio: 'ignore'
  });

  try {
    let health2 = false;
    for (let i = 0; i < 50; i++) {
      try { const rr = await fetch(`${BASE2}/api/health`); if (rr.ok) { health2 = true; break; } } catch {}
      await new Promise((res) => setTimeout(res, 200));
    }
    check('IG test server (mock Meta) starts', health2);

    // Meta Webhook verification tests for /api/v2/instagram/callback and /api/webhooks/instagram
    const whVerifyRes1 = await fetch(`${BASE2}/api/v2/instagram/callback?hub.mode=subscribe&hub.challenge=123456&hub.verify_token=test_meta_verify_token`);
    const whVerifyText1 = await whVerifyRes1.text();
    check('Meta webhook verification on /api/v2/instagram/callback returns 200 with challenge 123456', whVerifyRes1.status === 200 && whVerifyText1 === '123456');

    const whVerifyBad = await fetch(`${BASE2}/api/v2/instagram/callback?hub.mode=subscribe&hub.challenge=123456&hub.verify_token=invalid_token`);
    check('Meta webhook verification with bad token returns 403', whVerifyBad.status === 403);

    const whVerifyRes2 = await fetch(`${BASE2}/api/webhooks/instagram?hub.mode=subscribe&hub.challenge=123456&hub.verify_token=test_meta_verify_token`);
    const whVerifyText2 = await whVerifyRes2.text();
    check('Meta webhook verification on /api/webhooks/instagram returns 200 with challenge 123456', whVerifyRes2.status === 200 && whVerifyText2 === '123456');

    // Register seller on server 2
    const igEmail = `igtest${Date.now()}@example.com`;
    const reg2 = await fetch(`${BASE2}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopName: 'IG Shop 1', ownerName: 'IG Owner 1', email: igEmail, password: pw, mobile: '+91 98290 00000', firebaseIdToken: 'test-firebase-id-token' })
    });
    const regData2 = await reg2.json();
    const igToken = regData2.token;

    // 1. Status initially reflects disconnected
    let stRes = await fetch(`${BASE2}/api/v2/instagram/status`, {
      headers: { Authorization: `Bearer ${igToken}` }
    });
    let stData = await stRes.json();
    check('status initially reflects igConnected: false', stRes.status === 200 && stData.connected === false);

    // 2. Connect URL returns valid Meta dialog OAuth URL
    const connRes = await fetch(`${BASE2}/api/v2/instagram/connect`, {
      headers: { Authorization: `Bearer ${igToken}` }
    });
    const connData = await connRes.json();
    check('connect endpoint returns Meta OAuth URL', connRes.status === 200 && typeof connData.connectUrl === 'string');
    const stateMatch = connData.connectUrl.match(/state=([^&]+)/);
    const oauthState = stateMatch ? decodeURIComponent(stateMatch[1]) : '';
    check('connectUrl contains signed state', !!oauthState);

    // 3. Callback executes with mock code: exchanges short -> long -> page token, subscribes page, redirects
    const cbRes = await fetch(`${BASE2}/api/v2/instagram/callback?state=${encodeURIComponent(oauthState)}&code=mock_auth_code_xyz`, {
      redirect: 'manual'
    });
    check('callback redirects 302 to frontend', cbRes.status === 302);
    const redirectLocation = cbRes.headers.get('location') || '';
    check('callback redirect URL has connected=1', redirectLocation.includes('connected=1'));

    // 4. Status reflects igConnected: true after callback
    stRes = await fetch(`${BASE2}/api/v2/instagram/status`, {
      headers: { Authorization: `Bearer ${igToken}` }
    });
    stData = await stRes.json();
    check('status reflects igConnected: true after callback', stRes.status === 200 && stData.connected === true);
    check('status reports instagram_login provider', stData.provider === 'instagram_login');

    // Legacy status endpoint with auth also reflects igConnected: true
    const legRes = await fetch(`${BASE2}/api/instagram/status`, {
      headers: { Authorization: `Bearer ${igToken}` }
    });
    const legData = await legRes.json();
    check('legacy /api/instagram/status with auth reflects igConnected: true', legRes.status === 200 && legData.connected === true);

    // 5. Verify that callback stored Instagram Login fields, NOT short token
    const expRes = await fetch(`${BASE2}/api/v2/export`, {
      headers: { Authorization: `Bearer ${igToken}` }
    });
    const expData = await expRes.json();
    check('export never leaks igTokenEnc (sanitized)', !('igTokenEnc' in expData.seller));
    check('callback stored igUserId=mock_ig_biz_user_999', expData.seller.igUserId === 'mock_ig_biz_user_999');
    check('callback stored igUsername=mock_ig_seller_shop', expData.seller.igUsername === 'mock_ig_seller_shop');
    check('callback stored igProvider=instagram_login', expData.seller.igProvider === 'instagram_login');

    // Create a product and a rule for Seller 1
    await fetch(`${BASE2}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${igToken}` },
      body: JSON.stringify({ name: 'Page Kurti', price: 1200, category: 'Ethnic', stock: 10 })
    });
    await fetch(`${BASE2}/api/automation/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${igToken}` },
      body: JSON.stringify({ triggerWord: 'selleronekeyword', action: 'send_dm' })
    });

    // 6. Webhook with matching Instagram User ID routes to that seller only and sends via Instagram Messaging API
    const metaAppSecret = 'test_meta_app_secret_456';
    const whBody1 = JSON.stringify({
      entry: [{
        id: 'mock_ig_biz_user_999',
        messaging: [{
          sender: { id: '987654321' },
          message: { text: 'selleronekeyword Page Kurti' },
          mid: `mid_page_${Date.now()}`
        }]
      }]
    });
    const sig1 = 'sha256=' + crypto.createHmac('sha256', metaAppSecret).update(whBody1).digest('hex');
    const whRes1 = await fetch(`${BASE2}/api/webhooks/instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig1 },
      body: whBody1
    });
    const whData1 = await whRes1.json();
    check('webhook with matching igUserId creates live send using Instagram user token', whRes1.status === 200 && whData1.results?.[0]?.action === 'conversation_created_live_send' && whData1.results?.[0]?.sent === true, JSON.stringify(whData1));

    // Register Seller 2 with a different rule
    const igEmail2 = `igtest2_${Date.now()}@example.com`;
    const reg2_2 = await fetch(`${BASE2}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopName: 'IG Shop 2', ownerName: 'IG Owner 2', email: igEmail2, password: pw, mobile: '+91 98290 00000', firebaseIdToken: 'test-firebase-id-token' })
    });
    const igToken2 = (await reg2_2.json()).token;
    await fetch(`${BASE2}/api/automation/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${igToken2}` },
      body: JSON.stringify({ triggerWord: 'sellertwokeyword', action: 'send_dm' })
    });

    // Webhook with entry.id = 'mock_ig_biz_user_999' matching Seller 2's rule must NOT match Seller 2
    // because Instagram User ID routing restricts to Seller 1 only!
    const whBody2 = JSON.stringify({
      entry: [{
        id: 'mock_ig_biz_user_999',
        messaging: [{
          sender: { id: '987654321' },
          message: { text: 'sellertwokeyword' },
          mid: `mid_page2_${Date.now()}`
        }]
      }]
    });
    const sig2 = 'sha256=' + crypto.createHmac('sha256', metaAppSecret).update(whBody2).digest('hex');
    const whRes2 = await fetch(`${BASE2}/api/webhooks/instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig2 },
      body: whBody2
    });
    const whData2 = await whRes2.json();
    check('webhook with igUserId mock_ig_biz_user_999 restricts to seller 1 only (seller 2 rule ignored)', whData2.results?.[0]?.matched === false, JSON.stringify(whData2));

    // 7. Disconnect flips status back to disconnected
    const discRes = await fetch(`${BASE2}/api/v2/instagram/disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${igToken}` }
    });
    check('disconnect ok', discRes.status === 200);
    stRes = await fetch(`${BASE2}/api/v2/instagram/status`, {
      headers: { Authorization: `Bearer ${igToken}` }
    });
    check('status flips to disconnected after disconnect', (await stRes.json()).connected === false);
  } finally {
    child2.kill('SIGTERM');
  }
} finally {
  child.kill('SIGTERM');
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failures:', failures.join(', ')); process.exit(1); }
