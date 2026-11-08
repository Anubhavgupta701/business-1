import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { connectDB, isMongo, users, products, orders, conversations, rules, templates, contacts, events, memory, sanitizeSeller, refreshTokens, auditLogs, usageLedger, sendLogs, passwordResets, loginAttempts, verificationTokens } from './store.js';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import { generateReply, buildSlip } from './engine.js';
import { verifyFirebasePhoneOtp, verifyFirebaseToken } from './firebase.js';

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && !process.env.JWT_SECRET) { console.error('[dmorder] FATAL: JWT_SECRET must be set in production. Refusing to start.'); process.exit(1); }
const JWT_SECRET = process.env.JWT_SECRET || 'dmorder-dev-secret';
if (!process.env.JWT_SECRET) console.log('[dmorder] WARNING: JWT_SECRET not set — using dev fallback (DEV ONLY, never production). Set a real secret in production.');
const DEFAULT_TRIGGERS = ['price', 'link', 'buy', 'pp', 'rate'];
const FOLLOWUP_TEMPLATE = 'Namaste {name} ji, aapne {product} ke liye pucha tha — stock abhi hai, order karu kya? Reply karein, main yahi hu.';

app.disable('x-powered-by');
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => { if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true); return cb(new Error('Not allowed by CORS')); }, credentials: true }));
app.use(cookieParser());
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); next(); });
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use((req, res, next) => { const t = Date.now(); res.on('finish', () => console.log(`[api] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`)); next(); });
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login/register attempts. Try again later.' } });
app.use('/api/auth/', authLimiter);

const ok = (res, data, status = 200) => res.status(status).json(data);
const err = (res, status, message) => res.status(status).json({ error: message });
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const sellerIdOf = (req) => req.user.id;

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies?.dmorder_token || null);
  if (!token) return err(res, 401, 'Login required.');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return err(res, 401, 'Invalid or expired token.'); }
}
async function seedDefaults(sellerId) {
  for (const w of DEFAULT_TRIGGERS) await rules.create({ sellerId, triggerWord: w, action: 'send_dm', enabled: true });
  await templates.create({ sellerId, name: 'Follow-up', type: 'followup', body: FOLLOWUP_TEMPLATE, enabled: true });
  await templates.create({ sellerId, name: 'Price reply', type: 'price_reply', body: 'Namaste {name} ji! Ye {product} hai — price aur size/color ke liye catalog se confirm karke batati hu.', enabled: true });
}


function setAuthCookies(res, token, refreshToken) {
  const secure = IS_PROD;
  res.cookie('dmorder_token', token, { httpOnly: true, secure, sameSite: 'lax', maxAge: 60 * 60 * 1000, path: '/' });
  res.cookie('dmorder_refresh', refreshToken, { httpOnly: true, secure, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth' });
}
function clearAuthCookies(res) {
  res.clearCookie('dmorder_token', { path: '/' });
  res.clearCookie('dmorder_refresh', { path: '/api/auth' });
}
async function sendEmail({ to, subject, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[sendEmail] Skipped: SMTP_USER or SMTP_PASS not set in backend/.env');
    return { sent: false, reason: 'NOT_CONFIGURED' };
  }
  try {
    const isGmail = (process.env.SMTP_HOST || '').includes('gmail') || (process.env.SMTP_USER || '').includes('gmail');
    const cleanPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
    const transporter = isGmail
      ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: cleanPass } })
      : nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: String(process.env.SMTP_SECURE || '') === 'true', auth: { user: process.env.SMTP_USER, pass: cleanPass } });
    
    const info = await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    console.log(`[sendEmail] SUCCESS! Email sent to ${to}. MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (e) {
    console.error(`[sendEmail ERROR] Failed to send email to ${to}:`, e.message);
    return { sent: false, reason: e.message };
  }
}
async function adminAuth(req, res, next) {
  auth(req, res, async () => {
    const seller = await users.get(req.user.id);
    if (!seller?.isAdmin) return err(res, 403, 'Admin access required.');
    req.admin = seller; next();
  });
}

// ---- v2 helpers ----
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
async function issueTokens(seller) {
  const token = jwt.sign({ id: seller.id, email: seller.email }, JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await refreshTokens.create({ sellerId: seller.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), revoked: false });
  return { token, refreshToken };
}
async function logAudit(sellerId, action, details) {
  try { await auditLogs.create({ sellerId, action, details: details || {}, at: new Date().toISOString() }); } catch {}
}
function encryptionKey() {
  if (!process.env.ENCRYPTION_KEY) return null;
  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
}
function encryptToken(text) {
  const key = encryptionKey(); if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}
function decryptToken(enc) {
  const key = encryptionKey(); if (!key) return null;
  const [iv, tag, data] = String(enc).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}
// Launch offer (DECIDED 27 Oct 2026): first 5 FULL conversations free per seller, then paid.
async function chargeConversation(sellerId) {
  const seller = await users.get(sellerId);
  if (!seller) return { allowed: false, code: 'SELLER_NOT_FOUND', message: 'Seller not found.' };
  const freeUsed = seller.freeConversationsUsed || 0;
  const freeTotal = seller.freeConversationsTotal || 5;
  if (freeUsed < freeTotal) {
    await users.update(sellerId, null, { freeConversationsUsed: freeUsed + 1 });
    return { allowed: true, free: true, freeConversationsUsed: freeUsed + 1, freeConversationsTotal: freeTotal, dmUsed: seller.dmUsed || 0, dmLimit: seller.dmLimit || 0 };
  }
  const dmUsed = seller.dmUsed || 0;
  const dmLimit = seller.dmLimit || 0;
  if (dmUsed >= dmLimit) return { allowed: false, code: 'PLAN_LIMIT', message: 'Paid plan required: your 5 free conversations are used and the plan DM limit is reached.' };
  await users.update(sellerId, null, { dmUsed: dmUsed + 1 });
  return { allowed: true, free: false, freeConversationsUsed: freeUsed, freeConversationsTotal: freeTotal, dmUsed: dmUsed + 1, dmLimit };
}
async function nextOrderNumber(sellerId) {
  const ords = await orders.list({ sellerId });
  let max = 1000;
  for (const o of ords) {
    const m = String(o.orderNumber || o.id || '').match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `ORD-${max + 1}`;
}
const ORDER_TRANSITIONS = { NEW: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PACKED', 'CANCELLED'], PACKED: ['SHIPPED', 'CANCELLED'], SHIPPED: ['DELIVERED'], DELIVERED: [], CANCELLED: [] };
function triggerMatches(text, word) {
  const w = String(word || '').trim().toLowerCase();
  if (!w) return false;
  // Whole-word match: "price" must not fire inside "zqxprice".
  const tokens = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  return tokens.includes(w);
}
function paginate(req, items) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '50', 10) || 50));
  let list = [...items];
  if (req.query.status) list = list.filter((r) => String(r.status) === String(req.query.status));
  if (req.query.search) {
    const q = String(req.query.search).toLowerCase();
    list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }
  if (req.query.sort) {
    const field = String(req.query.sort).replace(/^-/, '');
    const desc = String(req.query.sort).startsWith('-');
    list.sort((a, b) => {
      const av = a[field]; const bv = b[field];
      if (av === undefined || bv === undefined) return 0;
      if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
      return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
  }
  const total = list.length;
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}
// Meta Graph API dispatcher (supports live HTTP or test-mocked mode via META_API_MOCK)
async function metaFetch(url, options = {}) {
  if (process.env.META_API_MOCK === 'true') {
    const urlStr = String(url);
    if (urlStr.includes('/oauth/access_token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock_short_user_token_123', user_id: 'mock_ig_biz_user_999' })
      };
    }
    if (urlStr.includes('/access_token') && (urlStr.includes('grant_type=ig_exchange_token') || urlStr.includes('grant_type=fb_exchange_token'))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock_long_user_token_456', token_type: 'bearer', expires_in: 5184000 })
      };
    }
    if (urlStr.includes('graph.instagram.com') && urlStr.includes('/me') && !urlStr.includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'mock_ig_biz_user_999', username: 'mock_ig_seller_shop' })
      };
    }
    if (urlStr.includes('/me/accounts')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'mock_page_123',
              name: 'Mock Facebook Page',
              access_token: 'mock_page_token_encrypted_789',
              instagram_business_account: { id: 'mock_ig_biz_user_999' }
            }
          ]
        })
      };
    }
    if (urlStr.includes('/subscribed_apps')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      };
    }
    if (urlStr.includes('/refresh_access_token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock_refreshed_page_token_999', token_type: 'bearer', expires_in: 5184000 })
      };
    }
    if (urlStr.includes('/messages')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ recipient_id: '123', message_id: 'mid_mock_send_123' })
      };
    }
  }
  return fetch(url, options);
}

// Respect Meta Developer Policies:
// 1. Messaging Window: 24-hour standard customer-service messaging window for RESPONSE messages.
// 2. Private Replies to Comments: At most 1 private reply per comment in 7 days.
// 3. Instagram API with Instagram Login: Uses https://graph.instagram.com/v21.0/{igUserId}/messages or /me/messages with user token.
// 4. Backward Compatibility: If legacy Facebook Page token exists, routes to graph.facebook.com/{igPageId}/messages.
// 5. Never fake a send: If no token is configured, the reply stays a draft with sent: false.
async function tryInstagramSend(seller, recipient, text, options = {}) {
  if (!seller?.igTokenEnc || (!seller?.igUserId && !seller?.igPageId)) return { sent: false, reason: 'NOT_CONFIGURED' };
  const token = decryptToken(seller.igTokenEnc);
  if (!token) return { sent: false, reason: 'ENCRYPTION_KEY_NOT_CONFIGURED' };
  try {
    const isCommentReply = !!options.commentId;
    const recipientPayload = isCommentReply ? { comment_id: String(options.commentId) } : { id: String(recipient) };

    let url;
    let payload;

    if (seller.igProvider === 'facebook_page' && seller.igPageId) {
      // Legacy Facebook Login / Page token mode
      url = `https://graph.facebook.com/v21.0/${encodeURIComponent(seller.igPageId)}/messages`;
      payload = { recipient: recipientPayload, message: { text }, messaging_type: 'RESPONSE', access_token: token };
    } else {
      // Official Instagram API with Instagram Login mode
      const accountId = seller.igUserId || 'me';
      url = `https://graph.instagram.com/v21.0/${encodeURIComponent(accountId)}/messages`;
      payload = { recipient: recipientPayload, message: { text } };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (!(seller.igProvider === 'facebook_page' && seller.igPageId)) {
      headers.Authorization = `Bearer ${token}`;
    }

    const r = await metaFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => ({}));
    await sendLogs.create({
      sellerId: seller.id,
      channel: 'instagram',
      to: String(recipient),
      text,
      sent: r.ok,
      reason: r.ok ? '' : (j.error?.message || `Graph API ${r.status}`)
    });
    return { sent: r.ok, provider: j };
  } catch (e) {
    await sendLogs.create({ sellerId: seller.id, channel: 'instagram', to: String(recipient), text, sent: false, reason: e.message });
    return { sent: false, reason: e.message };
  }
}

// Scheduled refresh for long-lived Instagram tokens before their 60-day expiry.
// Log failures, never crash the server if refresh fails.
async function refreshInstagramTokens() {
  try {
    const allSellers = await users.list({});
    const connectedSellers = allSellers.filter((s) => s.igConnected && s.igTokenEnc);
    for (const seller of connectedSellers) {
      try {
        const token = decryptToken(seller.igTokenEnc);
        if (!token) continue;
        const refreshUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
        const r = await metaFetch(refreshUrl);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.access_token) {
          const newEnc = encryptToken(j.access_token);
          const expiresIn = Number(j.expires_in) || 60 * 24 * 3600;
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
          await users.update(seller.id, null, {
            igTokenEnc: newEnc,
            igTokenExpiresAt: expiresAt
          });
          await logAudit(seller.id, 'instagram_token_refreshed', { expiresAt });
          console.log(`[Instagram Token Refresh] Successfully refreshed token for seller ${seller.id}`);
        } else {
          console.log(`[Instagram Token Refresh Warning] Could not refresh token for seller ${seller.id}: ${j.error?.message || r.status}`);
        }
      } catch (sellerErr) {
        console.error(`[Instagram Token Refresh Error] For seller ${seller.id}:`, sellerErr.message);
      }
    }
  } catch (err) {
    console.error('[Instagram Token Refresh Scheduler Error]', err.message);
  }
}
async function tryWhatsAppSend(seller, to, text) {
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_NUMBER_ID) return { sent: false, reason: 'NOT_CONFIGURED' };
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(process.env.WA_PHONE_NUMBER_ID)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_TOKEN}` }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }) });
    const j = await r.json().catch(() => ({}));
    await sendLogs.create({ sellerId: seller.id, channel: 'whatsapp', to: String(to), text, sent: r.ok, reason: r.ok ? '' : (j.error?.message || `Graph API ${r.status}`) });
    return { sent: r.ok, provider: j };
  } catch (e) {
    await sendLogs.create({ sellerId: seller.id, channel: 'whatsapp', to: String(to), text, sent: false, reason: e.message });
    return { sent: false, reason: e.message };
  }
}
async function runFollowUpsForSeller(seller) {
  const hours = Number(seller.followUpHours) || 6;
  const convs = await conversations.list({ sellerId: seller.id });
  const tmpl = (await templates.list({ sellerId: seller.id })).find((t) => t.type === 'followup') || null;
  const processed = [];
  for (const c of convs) {
    if (c.status !== 'STALLED' || c.automationPaused || c.followUpSentAt) continue;
    if (!c.lastBuyerMessageAt) continue;
    const ageMs = Date.now() - new Date(c.lastBuyerMessageAt).getTime();
    if (!(ageMs > hours * 60 * 60 * 1000)) continue;
    const body = (tmpl?.body || FOLLOWUP_TEMPLATE).replaceAll('{name}', c.customerName || '').replaceAll('{product}', c.productInterest || 'product');
    const messages = [...(c.messages || []), { from: 'ai_draft', text: body, at: new Date().toISOString() }];
    await conversations.update(c.id, seller.id, { messages, followUpSentAt: new Date().toISOString(), lastMessage: body });
    await logAudit(seller.id, 'followup_prepared', { conversationId: c.id });
    processed.push(c.id);
  }
  return processed;
}
async function runFollowUpsForAll() {
  try {
    const sellers = await users.list({});
    for (const seller of sellers) await runFollowUpsForSeller(seller);
  } catch (e) { console.log('[dmorder] follow-up scheduler error:', e.message); }
}
function signState(sellerId) {
  const payload = Buffer.from(JSON.stringify({ sellerId, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifyState(state) {
  try {
    const [payload, sig] = String(state).split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const j = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > j.exp) return null;
    return j.sellerId;
  } catch { return null; }
}

// ---- Public ----
app.get('/api/health', (req, res) => ok(res, { status: 'ok', store: isMongo() ? 'mongodb' : 'in-memory', mongoConnected: isMongo(), instagramConfigured: !!(process.env.META_APP_ID && process.env.META_ACCESS_TOKEN) }));
app.get('/api/plans', (req, res) => ok(res, { plans: [
  { id: 'FREE_TRIAL', name: 'Free Trial', price: 0, period: '14 days or first 20 orders', features: ['1 Instagram account', 'AI order-close', 'WhatsApp order-slip', 'Up to 50 products'] },
  { id: 'STARTER', name: 'Starter', price: 399, period: 'per month', badge: 'Most popular', features: ['Everything in Free Trial', '300 DM conversations/month', 'COD + UPI', 'Stalled-lead follow-up', 'Up to 200 products'] },
  { id: 'GROWTH', name: 'Growth', price: 799, period: 'per month', features: ['Everything in Starter', '1,000 DM conversations/month', 'WhatsApp follow-up', 'Priority support', 'Unlimited products'] },
  { id: 'PER_ORDER', name: 'Per-Order Plan', price: 20, period: 'per closed order', note: 'First 10 orders free. No subscription required.' },
], launchOffer: { firstConversationsFree: 5, note: 'First 5 full conversations free for every new seller, then a paid plan is required. A conversation is one complete buyer thread, not one reply.' } }));

app.post('/api/auth/verify-phone-otp', async (req, res) => {
  const { firebaseIdToken, mobile } = req.body || {};
  if (!firebaseIdToken) return err(res, 400, 'Firebase ID token is required.');
  const result = await verifyFirebasePhoneOtp(firebaseIdToken, mobile);
  if (!result.verified) return err(res, 400, result.error || 'Firebase phone verification failed.');
  return ok(res, { verified: true, phone: result.phone, uid: result.uid, provider: result.provider });
});

// Verify Firebase Email OTP (signInWithEmailLink token)
app.post('/api/auth/verify-email-otp', async (req, res) => {
  const { firebaseIdToken, email } = req.body || {};
  if (!firebaseIdToken) return err(res, 400, 'Firebase ID token is required.');
  const result = await verifyFirebaseToken(firebaseIdToken, { expectedEmail: email });
  if (!result.verified) return err(res, 400, result.error || 'Firebase email verification failed.');
  if (!result.email && !result.emailVerified) return err(res, 400, 'Firebase token does not contain a verified email.');
  return ok(res, { verified: true, email: result.email, uid: result.uid, provider: result.provider, emailVerified: result.emailVerified });
});

app.post('/api/auth/firebase-login', async (req, res) => {
  const { firebaseIdToken, shopName, city, mobile } = req.body || {};
  if (!firebaseIdToken) return err(res, 400, 'Firebase ID token is required.');
  const result = await verifyFirebaseToken(firebaseIdToken, { expectedPhone: mobile });
  if (!result.verified) return err(res, 400, result.error || 'Firebase authentication failed.');

  const email = (result.email || '').toLowerCase();
  const phone = result.phone || mobile || '';
  if (!email && !phone) return err(res, 400, 'Firebase token must contain a verified email or phone number.');

  let seller = null;
  if (email) seller = await users.findOne({ email });
  if (!seller && result.uid) seller = await users.findOne({ firebaseUid: result.uid });

  if (seller) {
    const patch = {};
    if (result.emailVerified && !seller.emailVerified) patch.emailVerified = true;
    if (result.phoneVerified && !seller.phoneVerified) patch.phoneVerified = true;
    if (!seller.firebaseUid) patch.firebaseUid = result.uid;
    if (phone && !seller.mobile) patch.mobile = phone;
    if (Object.keys(patch).length) seller = await users.update(seller.id, null, patch);

    const { token, refreshToken } = await issueTokens(seller);
    setAuthCookies(res, token, refreshToken);
    await logAudit(seller.id, 'firebase_login', { provider: result.provider });
    return ok(res, { token, refreshToken, seller: sanitizeSeller(seller) });
  }

  // New seller registering via Google / Email Auth
  const ownerName = result.name || (email ? email.split('@')[0] : 'Seller');
  const shop = shopName || `${ownerName}'s Boutique`;
  const sellerObj = {
    shopName: shop,
    ownerName,
    city: city || '',
    email: email || `user_${result.uid.slice(0, 8)}@firebase.auth`,
    mobile: phone || '',
    instagramHandle: '',
    whatsappNumber: phone || '',
    plan: 'FREE_TRIAL',
    planPrice: 0,
    planRenewalDate: '',
    dmUsed: 0,
    dmLimit: 20,
    freeConversationsUsed: 0,
    freeConversationsTotal: 5,
    emailVerified: result.emailVerified,
    phoneVerified: result.phoneVerified,
    firebaseUid: result.uid,
    isAdmin: !!(process.env.ADMIN_EMAIL && email && email.toLowerCase() === String(process.env.ADMIN_EMAIL).toLowerCase()),
    igConnected: false,
    codEnabled: true,
    upiEnabled: true,
    upiId: '',
    deliveryCharge: 49,
    freeDeliveryAbove: 999,
    aiLanguage: 'Hinglish',
    aiEnabled: true,
    followUpHours: 6,
    workingHours24x7: true,
    passwordHash: ''
  };

  const newSeller = await users.create(sellerObj);
  await seedDefaults(newSeller.id);
  const { token, refreshToken } = await issueTokens(newSeller);
  setAuthCookies(res, token, refreshToken);
  await logAudit(newSeller.id, 'firebase_signup', { provider: result.provider });
  return ok(res, { token, refreshToken, seller: sanitizeSeller(newSeller) }, 201);
});

app.post('/api/auth/register', async (req, res) => {
  const { shopName, ownerName, city, email, mobile, password, instagramHandle, whatsappNumber, firebaseIdToken } = req.body || {};
  if (!shopName || !ownerName || !email || !password) return err(res, 400, 'Shop name, owner name, email and password are required.');
  if (!isEmail(email)) return err(res, 400, 'Please enter a valid email.');
  if (String(password).length < 8) return err(res, 400, 'Password must be at least 8 characters.');
  if (await users.findOne({ email })) return err(res, 409, 'An account with this email already exists.');

  let phoneVerified = false;
  let emailVerified = false;
  let firebaseUid = null;

  if (firebaseIdToken) {
    const authResult = await verifyFirebaseToken(firebaseIdToken, { expectedPhone: mobile, expectedEmail: email });
    if (!authResult.verified) return err(res, 400, authResult.error || 'Firebase authentication verification failed.');
    phoneVerified = authResult.phoneVerified;
    emailVerified = authResult.emailVerified;
    firebaseUid = authResult.uid || null;
  } else if (process.env.REQUIRE_PHONE_OTP === 'true') {
    return err(res, 400, 'Firebase email OTP ya Google verification zaroori hai account banane ke liye.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const seller = await users.create({ shopName, ownerName, city: city || '', email, mobile: mobile || '', instagramHandle: instagramHandle || '', whatsappNumber: whatsappNumber || mobile || '', plan: 'FREE_TRIAL', planPrice: 0, planRenewalDate: '', dmUsed: 0, dmLimit: 20, freeConversationsUsed: 0, freeConversationsTotal: 5, emailVerified, phoneVerified, firebaseUid, isAdmin: !!(process.env.ADMIN_EMAIL && email.toLowerCase() === String(process.env.ADMIN_EMAIL).toLowerCase()), igConnected: false, codEnabled: true, upiEnabled: true, upiId: '', deliveryCharge: 49, freeDeliveryAbove: 999, aiLanguage: 'Hinglish', aiEnabled: true, followUpHours: 6, workingHours24x7: true, passwordHash });
  await seedDefaults(seller.id);
  const { token, refreshToken } = await issueTokens(seller);
  setAuthCookies(res, token, refreshToken);
  if (process.env.SMTP_HOST) {
    const vtoken = crypto.randomBytes(32).toString('hex');
    await verificationTokens.create({ sellerId: seller.id, email, tokenHash: hashToken(vtoken), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), used: false });
    await sendEmail({ to: email, subject: 'Verify your DMOrder account', text: `Namaste ${ownerName} ji, apna DMOrder account verify karne ke liye ye link kholein: ${(process.env.FRONTEND_URL || 'http://localhost:5173')}/verify-email?token=${vtoken} (24 ghante me expire hoga).` });
  }
  return ok(res, { token, refreshToken, seller: sanitizeSeller(seller) }, 201);
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 400, 'Email and password are required.');
  const cutoff = Date.now() - 15 * 60 * 1000;
  const recentFails = (await loginAttempts.list({ email })).filter((a) => new Date(a.at).getTime() > cutoff);
  if (recentFails.length >= 5) return err(res, 429, 'Too many failed login attempts. Try again in 15 minutes.');
  const seller = await users.findOne({ email });
  if (!seller || !(await bcrypt.compare(password, seller.passwordHash || ''))) {
    await loginAttempts.create({ email, at: new Date().toISOString() });
    return err(res, 401, 'Invalid email or password.');
  }
  const fails = await loginAttempts.list({ email });
  for (const f of fails) await loginAttempts.remove(f.id, null);
  const { token, refreshToken } = await issueTokens(seller);
  setAuthCookies(res, token, refreshToken);
  return ok(res, { token, refreshToken, seller: sanitizeSeller(seller) });
});
app.get('/api/auth/me', auth, async (req, res) => {
  const seller = await users.get(req.user.id);
  if (!seller) return err(res, 404, 'Seller not found.');
  return ok(res, { seller: sanitizeSeller(seller) });
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.body?.refreshToken || req.cookies?.dmorder_refresh;
  if (!refreshToken) return err(res, 400, 'Refresh token is required.');
  const row = await refreshTokens.findOne({ tokenHash: hashToken(refreshToken) });
  if (!row || row.revoked || new Date(row.expiresAt).getTime() < Date.now()) return err(res, 401, 'Invalid or expired refresh token.');
  await refreshTokens.update(row.id, null, { revoked: true });
  const seller = await users.get(row.sellerId);
  if (!seller) return err(res, 404, 'Seller not found.');
  const pair = await issueTokens(seller);
  setAuthCookies(res, pair.token, pair.refreshToken);
  return ok(res, { ...pair, seller: sanitizeSeller(seller) });
});
app.post('/api/auth/logout', async (req, res) => {
  const refreshToken = req.body?.refreshToken || req.cookies?.dmorder_refresh;
  if (refreshToken) {
    const row = await refreshTokens.findOne({ tokenHash: hashToken(refreshToken) });
    if (row) await refreshTokens.update(row.id, null, { revoked: true });
  }
  clearAuthCookies(res);
  return ok(res, { ok: true });
});
app.post('/api/auth/logout-all', auth, async (req, res) => {
  const rows = await refreshTokens.list({ sellerId: req.user.id });
  for (const r of rows) if (!r.revoked) await refreshTokens.update(r.id, null, { revoked: true });
  clearAuthCookies(res);
  return ok(res, { ok: true });
});
app.post('/api/auth/verify-email', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return err(res, 400, 'Verification token is required.');
  const row = await verificationTokens.findOne({ tokenHash: hashToken(token) });
  if (!row || row.used || new Date(row.expiresAt).getTime() < Date.now()) return err(res, 400, 'Verification token is invalid or expired.');
  await verificationTokens.update(row.id, null, { used: true });
  await users.update(row.sellerId, null, { emailVerified: true });
  return ok(res, { ok: true, message: 'Email verified.' });
});
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  // Always return the same message so account existence is not leaked.
  // NOTE: email delivery is pending (no email provider is configured in
  // this build). The hashed reset token is stored; a provider must deliver
  // it before this flow works end-to-end. It is NEVER returned in the API.
  if (email && isEmail(email)) {
    const seller = await users.findOne({ email });
    if (seller) {
      const token = crypto.randomBytes(32).toString('hex');
      await passwordResets.create({ sellerId: seller.id, email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000), used: false });
      if (process.env.SMTP_HOST) await sendEmail({ to: email, subject: 'DMOrder password reset', text: `Password reset karne ke liye ye link kholein: ${(process.env.FRONTEND_URL || 'http://localhost:5173')}/reset-password?token=${token} (1 ghante me expire hoga). Agar aapne ye request nahi ki thi, to is email ko ignore karein.` });
    }
  }
  return ok(res, { ok: true, message: 'If an account exists for this email, a password-reset link will be sent once an email provider is configured.' });
});
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 8) return err(res, 400, 'A valid reset token and a password of at least 8 characters are required.');
  const row = await passwordResets.findOne({ tokenHash: hashToken(token) });
  if (!row || row.used || new Date(row.expiresAt).getTime() < Date.now()) return err(res, 400, 'Reset token is invalid or expired.');
  await passwordResets.update(row.id, null, { used: true });
  const passwordHash = await bcrypt.hash(password, 10);
  await users.update(row.sellerId, null, { passwordHash });
  const rows = await refreshTokens.list({ sellerId: row.sellerId });
  for (const r of rows) if (!r.revoked) await refreshTokens.update(r.id, null, { revoked: true });
  return ok(res, { ok: true, message: 'Password changed. Please log in again.' });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, message, shopName } = req.body || {};
  if (!name || !isEmail(email) || !message) return err(res, 400, 'Name, a valid email and a message are required.');
  const row = await contacts.create({ kind: 'contact', name, email, shopName: shopName || '', message, createdAt: new Date().toISOString() });
  
  const notifyEmail = process.env.ADMIN_EMAIL || 'officialag701@gmail.com';
  const subject = `📩 New Website Inquiry from ${name} (${shopName || 'No Shop'})`;
  const text = `You received a new inquiry on RK!\n\nName: ${name}\nEmail: ${email}\nShop / Brand: ${shopName || 'Not specified'}\nMessage:\n${message}\n\nTime: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\nReply directly to: ${email}`;
  console.log(`[INQUIRY RECEIVED] From: ${name} (${email}), Shop: ${shopName || 'N/A'}, Message: ${message}`);
  sendEmail({ to: notifyEmail, subject, text }).catch((e) => console.log('[sendEmail] Failed to send email alert:', e.message));

  return ok(res, { ok: true, id: row.id, message: 'Thank you! Your inquiry has been sent to our team.' }, 201);
});
app.post('/api/demo-requests', async (req, res) => {
  const { name, email, shopName, message } = req.body || {};
  if (!name || !isEmail(email)) return err(res, 400, 'Name and a valid email are required.');
  const row = await contacts.create({ kind: 'demo_request', name, email, shopName: shopName || '', message: message || '', createdAt: new Date().toISOString() });

  const notifyEmail = process.env.ADMIN_EMAIL || 'officialag701@gmail.com';
  const subject = `🔥 New Demo Request from ${name} (${shopName || 'No Shop'})`;
  const text = `You received a new Technical Demo request on RK!\n\nName: ${name}\nEmail: ${email}\nShop / Brand: ${shopName || 'Not specified'}\nMessage: ${message || 'Schedule walkthrough'}\n\nTime: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\nReply directly to: ${email}`;
  console.log(`[DEMO REQUEST RECEIVED] From: ${name} (${email}), Shop: ${shopName || 'N/A'}`);
  sendEmail({ to: notifyEmail, subject, text }).catch((e) => console.log('[sendEmail] Failed to send email alert:', e.message));

  return ok(res, { ok: true, id: row.id, message: 'Demo request received! Our technical team will reach out.' }, 201);
});
// Authenticated Instagram status check (seller-scoped)
app.get('/api/v2/instagram/status', auth, async (req, res) => {
  const seller = await users.get(req.user.id);
  if (!seller) return err(res, 404, 'Seller not found.');
  const appId = process.env.IG_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.IG_APP_SECRET || process.env.META_APP_SECRET;
  const metaConfigured = !!(appId && appSecret);
  if (seller.igConnected && seller.igTokenEnc) {
    return ok(res, {
      connected: true,
      username: seller.igUsername || seller.instagramHandle || null,
      igUserId: seller.igUserId || null,
      hasPage: !!seller.igPageId,
      provider: seller.igProvider || 'instagram_login',
      expiresAt: seller.igTokenExpiresAt || null,
      metaConfigured
    });
  }
  return ok(res, {
    connected: false,
    metaConfigured,
    reason: metaConfigured ? 'Account is not connected via Instagram OAuth.' : 'Instagram / Meta credentials are not configured.',
    setupSteps: [
      'Ensure your Instagram profile is converted to an Instagram Business or Creator account.',
      'Click Connect Instagram Account below. No Facebook Page is required.',
      'Authorize permissions (Messages & Profile). Your password is never shared with DMOrder.'
    ]
  });
});
app.post('/api/v2/instagram/disconnect', auth, async (req, res) => {
  await users.update(req.user.id, null, {
    igConnected: false,
    igTokenEnc: null,
    igPageId: '',
    igUserId: '',
    igUsername: '',
    igTokenExpiresAt: ''
  });
  await logAudit(req.user.id, 'instagram_disconnected', {});
  return ok(res, { connected: false, message: 'Instagram account disconnected.' });
});
app.get('/api/instagram/status', async (req, res) => {
  // If caller is authenticated (via Bearer token or dmorder_token cookie), return the seller's status
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const cookieToken = req.cookies?.dmorder_token;
  const token = bearer || cookieToken;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded?.id) {
        const seller = await users.get(decoded.id);
        if (seller) {
          if (seller.igConnected && seller.igTokenEnc) {
            return ok(res, { connected: true, username: seller.igUsername || seller.instagramHandle || null, igUserId: seller.igUserId || null, hasPage: !!seller.igPageId, provider: seller.igProvider || 'instagram_login', expiresAt: seller.igTokenExpiresAt || null });
          }
          return ok(res, { connected: false, reason: 'Account is not connected via Instagram OAuth.', setupSteps: ['Ensure your Instagram profile is converted to an Instagram Business or Creator account.', 'Click Connect Instagram Account to authorize DMOrder.'] });
        }
      }
    } catch {}
  }
  const appId = process.env.IG_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.IG_APP_SECRET || process.env.META_APP_SECRET;
  const hasCreds = !!(appId && (appSecret || process.env.META_ACCESS_TOKEN));
  if (!hasCreds) return ok(res, { connected: false, reason: 'Instagram credentials are not configured.', setupSteps: ['Set IG_APP_ID and IG_APP_SECRET in backend/.env', 'Add https://your-domain/api/v2/instagram/callback in Meta App Dashboard under Instagram API with Instagram Login', 'Authorize an Instagram Business/Creator account via Connect Instagram Account'] });
  // Only ever report connected:true after a real token check succeeds.
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
    const r = await metaFetch(`https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN || '')}`, { signal: ctl.signal });
    if (r.ok) { const j = await r.json(); return ok(res, { connected: true, username: j.username || null, note: 'Token verified against the Instagram Graph API.' }); }
    return ok(res, { connected: false, reason: 'Stored token was rejected by the Instagram Graph API. Reconnect via Instagram OAuth.' });
  } catch { return ok(res, { connected: false, reason: 'Could not verify token (network/timeout). Not marked as connected.' }); }
});

// ---- Authenticated CRUD (seller-scoped) ----
function crudRoutes(path, coll, validate) {
  app.get(path, auth, async (req, res) => ok(res, paginate(req, await coll.list({ sellerId: sellerIdOf(req) }))));
  const stripPrivileged = (body) => { const b = { ...(body || {}) }; for (const k of ['sellerId', 'id', '_id', 'passwordHash', 'plan', 'planPrice', 'dmUsed', 'dmLimit', 'freeConversationsUsed', 'freeConversationsTotal', 'isDemo', 'igTokenEnc']) delete b[k]; return b; };
  app.post(path, auth, async (req, res) => {
    const v = validate ? validate(req.body || {}) : null; if (v) return err(res, 400, v);
    const body = stripPrivileged(req.body);
    if ((path === '/api/automation/rules' || path === '/api/automation/templates') && body.enabled === undefined) body.enabled = true;
    // Conversation metering (launch offer + plan limit), before creation.
    let metering = null;
    if (path === '/api/conversations') {
      metering = await chargeConversation(sellerIdOf(req));
      if (!metering.allowed) return err(res, 403, metering.message);
    }
    // Orders: server-computed totals + stock. Caller amounts are ignored.
    if (path === '/api/orders') {
      const seller = await users.get(sellerIdOf(req));
      const items = Array.isArray(body.items) ? body.items : [];
      let subtotal = 0; let stockDeducted = false;
      for (const item of items) {
        const qty = Math.max(1, Number(item.qty) || 1);
        item.qty = qty;
        if (item.productId) {
          const prod = await products.get(item.productId, sellerIdOf(req));
          if (!prod) return err(res, 400, 'An ordered product was not found in your catalog.');
          if ((prod.stock ?? 0) < qty) return err(res, 409, `Out of stock: ${prod.name} (only ${prod.stock} left).`);
          item.price = Number(prod.price) || 0;
          if (!item.name) item.name = prod.name;
          subtotal += item.price * qty;
          await products.update(prod.id, sellerIdOf(req), { stock: (prod.stock || 0) - qty });
          stockDeducted = true;
        } else if (item.price !== undefined) {
          subtotal += (Number(item.price) || 0) * qty;
        }
      }
      const deliveryCharge = subtotal >= (seller?.freeDeliveryAbove ?? 999) ? 0 : (seller?.deliveryCharge ?? 49);
      const orderNumber = await nextOrderNumber(sellerIdOf(req));
      const row = await coll.create({ ...body, sellerId: sellerIdOf(req), amount: subtotal, deliveryCharge, orderNumber, status: 'NEW', statusHistory: [{ status: 'NEW', at: new Date().toISOString(), by: 'system' }], stockDeducted });
      await logAudit(sellerIdOf(req), 'order_created', { orderId: row.id, orderNumber, amount: subtotal });
      return ok(res, { item: row }, 201);
    }
    const row = await coll.create({ ...body, sellerId: sellerIdOf(req) });
    return ok(res, { item: row, metering }, 201);
  });
  app.put(`${path}/:id`, auth, async (req, res) => {
    const patch = stripPrivileged(req.body);
    if (path === '/api/orders') {
      delete patch.amount; delete patch.deliveryCharge; delete patch.orderNumber; delete patch.statusHistory;
      if (patch.status) {
        const existing = await coll.get(req.params.id, sellerIdOf(req));
        if (!existing) return err(res, 404, 'Not found.');
        const from = existing.status || 'NEW';
        if (!(ORDER_TRANSITIONS[from] || []).includes(patch.status)) return err(res, 400, `Invalid status change: ${from} -> ${patch.status}.`);
        patch.statusHistory = [...(existing.statusHistory || []), { status: patch.status, at: new Date().toISOString(), by: sellerIdOf(req) }];
        if (patch.status === 'CANCELLED' && existing.stockDeducted) {
          for (const item of existing.items || []) {
            if (item.productId) {
              const prod = await products.get(item.productId, sellerIdOf(req));
              if (prod) await products.update(prod.id, sellerIdOf(req), { stock: (prod.stock || 0) + (Number(item.qty) || 1) });
            }
          }
          patch.stockDeducted = false;
        }
        if (patch.status === 'CONFIRMED') {
          const seller = await users.get(sellerIdOf(req));
          if (seller?.plan === 'PER_ORDER') await usageLedger.create({ sellerId: sellerIdOf(req), type: 'per_order_closed', refId: existing.id, amount: 20 });
        }
        await logAudit(sellerIdOf(req), 'order_status_changed', { orderId: existing.id, from, to: patch.status });
      }
    }
    const row = await coll.update(req.params.id, sellerIdOf(req), patch);
    if (!row) return err(res, 404, 'Not found.');
    return ok(res, { item: row });
  });
  app.delete(`${path}/:id`, auth, async (req, res) => {
    if (!(await coll.remove(req.params.id, sellerIdOf(req)))) return err(res, 404, 'Not found.');
    return ok(res, { ok: true });
  });
}
crudRoutes('/api/products', products, (b) => (!b.name ? 'Product name is required.' : (b.price === undefined || b.price === '' || Number.isNaN(Number(b.price)) || Number(b.price) < 0 ? 'A valid, non-negative price is required.' : ((b.stock !== undefined && (Number.isNaN(Number(b.stock)) || Number(b.stock) < 0)) ? 'Stock must be zero or more.' : null))));
crudRoutes('/api/orders', orders, (b) => (!b.customer?.name && !b.items?.length ? 'Order needs a customer or items.' : null));
crudRoutes('/api/conversations', conversations, null);
crudRoutes('/api/automation/rules', rules, (b) => (!b.triggerWord ? 'Trigger word is required.' : null));
crudRoutes('/api/automation/templates', templates, (b) => (!b.body ? 'Template text is required.' : null));

app.get('/api/settings', auth, async (req, res) => {
  const s = await users.get(req.user.id); if (!s) return err(res, 404, 'Seller not found.');
  return ok(res, { settings: sanitizeSeller(s) });
});
app.put('/api/settings', auth, async (req, res) => {
  const allowed = ['shopName', 'ownerName', 'city', 'instagramHandle', 'whatsappNumber', 'mobile', 'customDomain', 'upiId', 'deliveryCharge', 'freeDeliveryAbove', 'codEnabled', 'upiEnabled', 'aiLanguage', 'aiEnabled', 'followUpHours', 'workingHours24x7'];
  const patch = {}; for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  const s = await users.update(req.user.id, null, patch);
  await logAudit(req.user.id, 'settings_updated', { fields: Object.keys(patch) });
  return ok(res, { settings: sanitizeSeller(s), message: 'Settings saved successfully.' });
});
app.get('/api/analytics/overview', auth, async (req, res) => {
  const seller = await users.get(req.user.id);
  const ords = await orders.list({ sellerId: req.user.id });
  const convs = await conversations.list({ sellerId: req.user.id });
  const revenue = ords.reduce((a, o) => a + (Number(o.amount) || 0) + (Number(o.deliveryCharge) || 0), 0);
  const byStatus = {}; for (const o of ords) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  const freeUsed = seller?.freeConversationsUsed || 0; const freeTotal = seller?.freeConversationsTotal || 5;
  return ok(res, { overview: { totalOrders: ords.length, revenue, conversations: convs.length, dmUsed: seller?.dmUsed || 0, dmLimit: seller?.dmLimit || 0, freeConversationsUsed: freeUsed, freeConversationsTotal: freeTotal, freeConversationsLeft: Math.max(0, freeTotal - freeUsed), byStatus, demoHero: seller?.isDemo ? { label: 'Is mahine DMOrder se band hue order', value: 47850, orders: 63, change: '+38%', note: 'Demo data' } : null } });
});

// ---- Instagram webhook verification & event processing ----
function verifyWebhookSubscription(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedTokens = [
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    process.env.META_VERIFY_TOKEN
  ].filter(Boolean);

  if (mode === 'subscribe' && expectedTokens.length > 0 && expectedTokens.includes(token)) {
    return res.status(200).type('text/plain').send(String(challenge || ''));
  }
  return res.status(403).type('text/plain').send('Verification failed.');
}

async function handleWebhookPost(req, res) {
  const webhookSecret = process.env.IG_APP_SECRET || process.env.META_APP_SECRET;
  if (IS_PROD && !webhookSecret) return err(res, 401, 'Webhook signature is not configured in production.');
  if (webhookSecret && req.rawBody) {
    const sig = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex');
    const legacyExpected = process.env.META_APP_SECRET ? 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(req.rawBody).digest('hex') : null;
    const matchesPrimary = sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    const matchesLegacy = legacyExpected && sig && sig.length === legacyExpected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(legacyExpected));
    if (!matchesPrimary && !matchesLegacy) return err(res, 401, 'Invalid webhook signature.');
  }
  const body = req.body || {};
  const results = [];
  const entries = Array.isArray(body.entry) ? body.entry : [{ id: 'unknown', messaging: body.messaging || [], changes: body.changes || [] }];
  for (const entry of entries) {
    const msgs = [...(entry.messaging || []), ...(entry.changes || []).map((c) => ({ sender: c.value?.from, message: { text: c.value?.text }, comment: c.value }))];
    for (const m of msgs) {
      const text = String(m.message?.text || m.comment?.text || m.text || '');
      const sender = String(m.sender?.id || m.sender || m.comment?.from?.username || 'unknown');
      const eventId = `${entry.id}:${m.mid || m.id || text.slice(0, 40) || Date.now()}`;
      if (await events.findOne({ eventId })) { results.push({ eventId, duplicate: true }); continue; }
      const lower = text.toLowerCase();
      const allSellers = await users.list({});
      // Match seller either by Instagram User ID (Instagram Login) or Page ID (legacy Facebook Login)
      const targetSeller = entry.id && entry.id !== 'unknown'
        ? allSellers.find((u) => u.igConnected && (
            (u.igUserId && String(u.igUserId) === String(entry.id)) ||
            (u.igPageId && String(u.igPageId) === String(entry.id))
          ))
        : null;
      const allRules = targetSeller ? await rules.list({ sellerId: targetSeller.id }) : await rules.list({});
      const matched = allRules.filter((r) => r.enabled && triggerMatches(text, r.triggerWord));
      let action = 'stored_no_match'; let sent = false;
      const distinctSellerIds = [...new Set(matched.map((r) => r.sellerId))];
      if (matched.length && distinctSellerIds.length > 1) {
        await events.create({ eventId, eventType: m.comment ? 'comment' : 'message', sender, text, matched: true, action: 'ambiguous_seller_skipped', sent: false });
        results.push({ eventId, matched: true, action: 'ambiguous_seller_skipped', sent: false, note: 'Matched rules from more than one seller; no conversation created to avoid a cross-seller leak. Route by page id (Meta OAuth) to fix this for multi-seller use.' });
        continue;
      }
      if (matched.length) {
        const sellerId = matched[0].sellerId;
        const metering = await chargeConversation(sellerId);
        if (!metering.allowed) {
          await events.create({ eventId, eventType: m.comment ? 'comment' : 'message', sender, text, matched: true, action: 'plan_limit_reached', sent: false });
          results.push({ eventId, matched: true, action: 'plan_limit_reached', sent: false, note: metering.message });
          continue;
        }
        const seller = await users.get(sellerId);
        const prods = await products.list({ sellerId });
        const tmpls = await templates.list({ sellerId });
        const engine = generateReply({ text, products: prods, templates: tmpls, conversation: null });
        const messages = [{ from: 'customer', text, at: new Date().toISOString() }];
        if (engine.reply) messages.push({ from: 'ai_draft', text: engine.reply, at: new Date().toISOString() });
        const conv = await conversations.create({ sellerId, customerName: sender, handle: sender.startsWith('@') ? sender : `@${sender}`, productInterest: engine.product?.name || '', lastMessage: engine.reply || text, status: 'IN_CHAT', channel: m.comment ? 'COMMENT' : 'DM', automationPaused: false, lastBuyerMessageAt: new Date().toISOString(), slots: engine.slots, time: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }), messages });
        // Live send is attempted ONLY when this seller has a real, encrypted
        // Instagram token and the recipient is a numeric recipient id or comment id.
        // Otherwise the reply stays a draft (sent:false) — never faked.
        let sendResult = { sent: false, reason: 'NOT_CONFIGURED' };
        const commentId = m.comment?.id || (m.comment ? m.id : null);
        const canSend = seller?.igConnected && seller?.igTokenEnc && engine.reply && (/^\d+$/.test(sender) || commentId);
        if (canSend) {
          sendResult = await tryInstagramSend(seller, sender, engine.reply, { commentId });
          if (sendResult.sent) {
            const msgs2 = messages.map((mm) => (mm.from === 'ai_draft' ? { ...mm, from: 'ai' } : mm));
            await conversations.update(conv.id, sellerId, { messages: msgs2 });
            sent = true; action = 'conversation_created_live_send';
          }
        }
        if (!sent) action = 'draft_conversation_created_no_live_send';
        await events.create({ eventId, eventType: m.comment ? 'comment' : 'message', sender, text, matched: true, action, sent });
        results.push({ eventId, matched: true, action, sent, metering, note: sent ? 'Live Instagram message sent.' : 'Webhook processed. Reply is a draft — live send requires an active Instagram token + messaging permission.' });
        continue;
      }
      await events.create({ eventId, eventType: m.comment ? 'comment' : 'message', sender, text, matched: false, action, sent: false });
      results.push({ eventId, matched: false, action, sent: false });
    }
  }
  return ok(res, { received: true, results });
}

app.get('/api/webhooks/instagram', verifyWebhookSubscription);
app.post('/api/webhooks/instagram', handleWebhookPost);

// ---- admin routes (admin-only; first admin = ADMIN_EMAIL at register time) ----
app.get('/api/admin/sellers', adminAuth, async (req, res) => {
  const sellers = await users.list({});
  return ok(res, paginate(req, sellers.map(sanitizeSeller)));
});
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const sellers = await users.list({});
  const ords = await orders.list({});
  const convs = await conversations.list({});
  const revenue = ords.reduce((a, o) => a + (Number(o.amount) || 0) + (Number(o.deliveryCharge) || 0), 0);
  return ok(res, { stats: { sellers: sellers.length, orders: ords.length, conversations: convs.length, revenue } });
});
app.get('/api/admin/contacts', adminAuth, async (req, res) => {
  const items = await contacts.list({});
  return ok(res, paginate(req, items.reverse()));
});
app.post('/api/admin/sellers/:id/plan', adminAuth, async (req, res) => {
  const plan = String(req.body?.plan || '');
  const prices = { FREE_TRIAL: 0, STARTER: 399, GROWTH: 799, PER_ORDER: 20 };
  const limits = { FREE_TRIAL: 20, STARTER: 300, GROWTH: 1000 };
  if (!(plan in prices)) return err(res, 400, 'Plan must be FREE_TRIAL, STARTER, GROWTH or PER_ORDER.');
  const patch = { plan, planPrice: req.body?.planPrice !== undefined ? Number(req.body.planPrice) : prices[plan] };
  if (plan in limits) patch.dmLimit = limits[plan];
  const seller = await users.update(req.params.id, null, patch);
  if (!seller) return err(res, 404, 'Seller not found.');
  await logAudit(req.user.id, 'admin_plan_changed', { sellerId: req.params.id, plan });
  return ok(res, { seller: sanitizeSeller(seller) });
});

// ---- v2 routes ----
app.get('/api/v2/instagram/connect', auth, async (req, res) => {
  const appId = process.env.IG_APP_ID || process.env.META_APP_ID;
  if (!appId) {
    return err(res, 400, 'Instagram credentials are not configured. Set IG_APP_ID / META_APP_ID in backend/.env, then connect again.');
  }

  const rawBase = (process.env.IG_REDIRECT_URI || process.env.BACKEND_URL || `http://localhost:${PORT}`).trim();
  const redirectUri = `${rawBase.replace(/\/+$/, '')}/api/v2/instagram/callback`;
  const state = signState(req.user.id);

  // Modern Official Instagram API with Instagram Login:
  // Authorization URL: https://www.instagram.com/oauth/authorize
  // Scopes: instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments
  const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments';
  const url = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

  return ok(res, { connectUrl: url, note: 'This URL goes directly to Instagram. DMOrder never asks for your Instagram password.' });
});

app.get('/api/v2/instagram/callback', async (req, res) => {
  // If Meta sends Webhook verification to this callback endpoint
  if (req.query['hub.mode'] || req.query['hub.verify_token'] || req.query['hub.challenge']) {
    return verifyWebhookSubscription(req, res);
  }

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const sellerId = verifyState(req.query.state || '');
  if (!sellerId) {
    return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent('Invalid or expired OAuth state.')}`);
  }
  if (req.query.error) {
    return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent(`Instagram OAuth was not approved: ${req.query.error_description || req.query.error}`)}`);
  }
  const appId = process.env.IG_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.IG_APP_SECRET || process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent('Instagram credentials (IG_APP_ID / IG_APP_SECRET) are not configured in backend/.env.')}`);
  }
  if (!encryptionKey()) {
    return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent('ENCRYPTION_KEY must be set in backend/.env before a token can be stored.')}`);
  }

  const rawBase = (process.env.IG_REDIRECT_URI || process.env.BACKEND_URL || `http://localhost:${PORT}`).trim();
  const redirectUri = `${rawBase.replace(/\/+$/, '')}/api/v2/instagram/callback`;

  try {
    let code = String(req.query.code || '');
    if (!code) {
      return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent('Missing authorization code from Instagram.')}`);
    }
    // Meta sometimes appends #_ at the end of the code in browser redirect
    code = code.replace(/#_$/, '');

    // Step 1: Exchange short-lived authorization code for Instagram access token
    // POST https://api.instagram.com/oauth/access_token
    const form = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code
    });

    let rShort = await metaFetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
    let jShort = await rShort.json().catch(() => ({}));

    // Fallback: If caller used Unified Login configuration instead
    if (!rShort.ok || !jShort.access_token) {
      const rFbShort = await metaFetch('https://graph.facebook.com/v21.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form
      });
      const jFbShort = await rFbShort.json().catch(() => ({}));
      if (rFbShort.ok && jFbShort.access_token) {
        rShort = rFbShort;
        jShort = jFbShort;
      }
    }

    if (!rShort.ok || !jShort.access_token) {
      const msg = jShort.error?.message || jShort.error_message || `HTTP ${rShort.status}`;
      return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent(`Instagram short token exchange failed: ${msg}`)}`);
    }

    const shortToken = jShort.access_token;
    const shortUserId = String(jShort.user_id || '');

    // Step 2: Exchange short-lived token for long-lived user token (valid 60 days)
    // GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={secret}&access_token={short-token}
    const igLongUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortToken)}`;
    const rLongIg = await metaFetch(igLongUrl);
    const jLongIg = await rLongIg.json().catch(() => ({}));
    let longUserToken = (rLongIg.ok && jLongIg.access_token) ? jLongIg.access_token : shortToken;
    let expiresIn = Number(jLongIg.expires_in) || 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Step 3: Fetch Instagram User Profile (ID, username) via graph.instagram.com/v21.0/me
    let igUserId = shortUserId;
    let igUsername = '';

    const meUrl = `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(longUserToken)}`;
    const rMe = await metaFetch(meUrl);
    const jMe = await rMe.json().catch(() => ({}));
    if (rMe.ok && jMe.id) {
      igUserId = String(jMe.id);
      igUsername = String(jMe.username || '');
    }

    // Step 4: Encrypt and store the Instagram token directly against this seller
    const encToken = encryptToken(longUserToken);
    await users.update(sellerId, null, {
      igTokenEnc: encToken,
      igUserId,
      igUsername: igUsername || null,
      instagramHandle: igUsername ? `@${igUsername}` : undefined,
      igProvider: 'instagram_login',
      igConnected: true,
      igTokenExpiresAt: expiresAt
    });

    await logAudit(sellerId, 'instagram_connected', { igUserId, igUsername, provider: 'instagram_login' });

    // Step 5: Callback redirect to frontend with success
    return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?connected=1`);
  } catch (e) {
    return res.redirect(`${frontendUrl}/rk-seller-9x4mz/instagram?error=${encodeURIComponent(`Instagram connection failed: ${e.message}`)}`);
  }
});
app.post('/api/v2/instagram/callback', handleWebhookPost);
app.post('/api/automation/rules/test', auth, async (req, res) => {
  const text = String(req.body?.text || '');
  if (!text) return err(res, 400, 'Text is required.');
  const lower = text.toLowerCase();
  const sellerRules = await rules.list({ sellerId: req.user.id });
  const matched = sellerRules.filter((r) => r.enabled && triggerMatches(text, r.triggerWord));
  const prods = await products.list({ sellerId: req.user.id });
  const tmpls = await templates.list({ sellerId: req.user.id });
  const engine = generateReply({ text, products: prods, templates: tmpls, conversation: null });
  return ok(res, { matched: matched.map((r) => r.triggerWord), wouldReply: engine.reply, product: engine.product?.name || null, slots: engine.slots, confidence: engine.confidence, sent: false, note: 'Dry run only — no conversation was created and nothing was sent.' });
});
app.post('/api/conversations/:id/takeover', auth, async (req, res) => {
  const conv = await conversations.get(req.params.id, req.user.id);
  if (!conv) return err(res, 404, 'Not found.');
  const row = await conversations.update(req.params.id, req.user.id, { status: 'HUMAN_TAKEOVER', automationPaused: true });
  await logAudit(req.user.id, 'conversation_takeover', { conversationId: req.params.id });
  return ok(res, { item: row });
});
app.post('/api/conversations/:id/release', auth, async (req, res) => {
  const conv = await conversations.get(req.params.id, req.user.id);
  if (!conv) return err(res, 404, 'Not found.');
  const row = await conversations.update(req.params.id, req.user.id, { status: 'IN_CHAT', automationPaused: false });
  await logAudit(req.user.id, 'conversation_released', { conversationId: req.params.id });
  return ok(res, { item: row });
});
app.post('/api/conversations/:id/reply', auth, async (req, res) => {
  const text = String(req.body?.text || '');
  if (!text) return err(res, 400, 'Reply text is required.');
  const conv = await conversations.get(req.params.id, req.user.id);
  if (!conv) return err(res, 404, 'Not found.');
  const messages = [...(conv.messages || []), { from: 'seller', text, at: new Date().toISOString() }];
  const row = await conversations.update(req.params.id, req.user.id, { messages, lastMessage: text, status: 'HUMAN_TAKEOVER', automationPaused: true });
  await logAudit(req.user.id, 'conversation_seller_reply', { conversationId: req.params.id });
  return ok(res, { item: row, sent: false, note: 'Reply is stored and automation is paused. Live Instagram sending requires a connected page token.' });
});
app.post('/api/v2/automation/run-followups', auth, async (req, res) => {
  const seller = await users.get(req.user.id);
  if (!seller) return err(res, 404, 'Seller not found.');
  const processed = await runFollowUpsForSeller(seller);
  return ok(res, { processed, count: processed.length, note: 'Follow-ups are prepared as drafts. Live sending requires a connected page token.' });
});
app.get('/api/v2/billing/overview', auth, async (req, res) => {
  const seller = await users.get(req.user.id);
  if (!seller) return err(res, 404, 'Seller not found.');
  const ledger = await usageLedger.list({ sellerId: req.user.id });
  const perOrderCount = ledger.filter((l) => l.type === 'per_order_closed').length;
  const perOrderBillable = Math.max(0, perOrderCount - 10);
  const amountDue = seller.plan === 'PER_ORDER' ? perOrderBillable * 20 : (seller.planPrice || 0);
  return ok(res, { billing: { plan: seller.plan, planPrice: seller.planPrice || 0, freeConversationsUsed: seller.freeConversationsUsed || 0, freeConversationsTotal: seller.freeConversationsTotal || 5, freeConversationsLeft: Math.max(0, (seller.freeConversationsTotal || 5) - (seller.freeConversationsUsed || 0)), dmUsed: seller.dmUsed || 0, dmLimit: seller.dmLimit || 0, perOrderCount, perOrderBillable, amountDue, usage: ledger.slice(-20), checkout: { configured: false, note: 'Payment checkout is pending a payment-provider decision (Razorpay was only a candidate, not decided). No checkout is faked.' } } });
});
app.get('/api/v2/export', auth, async (req, res) => {
  const seller = await users.get(req.user.id);
  if (!seller) return err(res, 404, 'Seller not found.');
  const data = {};
  for (const [key, coll] of [['products', products], ['orders', orders], ['conversations', conversations], ['rules', rules], ['templates', templates], ['usage', usageLedger], ['audit', auditLogs]]) data[key] = await coll.list({ sellerId: req.user.id });
  return ok(res, { exportedAt: new Date().toISOString(), seller: sanitizeSeller(seller), data });
});
app.post('/api/v2/account/delete', auth, async (req, res) => {
  const { password } = req.body || {};
  const seller = await users.get(req.user.id);
  if (!seller || !password || !(await bcrypt.compare(password, seller.passwordHash || ''))) return err(res, 401, 'Password is incorrect.');
  for (const coll of [products, orders, conversations, rules, templates, usageLedger, auditLogs, sendLogs]) {
    const rows = await coll.list({ sellerId: req.user.id });
    for (const r of rows) await coll.remove(r.id, req.user.id);
  }
  const rts = await refreshTokens.list({ sellerId: req.user.id });
  for (const r of rts) await refreshTokens.update(r.id, null, { revoked: true });
  const prs = await passwordResets.list({ sellerId: req.user.id });
  for (const r of prs) await passwordResets.update(r.id, null, { used: true });
  await users.remove(req.user.id, null);
  return ok(res, { ok: true, message: 'Account and its data have been deleted.' });
});
app.get('/api/v2/orders/:id/slip', auth, async (req, res) => {
  const order = await orders.get(req.params.id, req.user.id);
  if (!order) return err(res, 404, 'Not found.');
  const seller = await users.get(req.user.id);
  const slip = buildSlip(order, seller);
  return ok(res, { orderId: order.id, orderNumber: order.orderNumber || order.id, slip, sent: false, note: 'Slip text is real. WhatsApp sending requires a configured WhatsApp provider (Cloud API direct or a BSP — owner decision pending).' });
});
app.post('/api/v2/whatsapp/test-slip', auth, async (req, res) => {
  const { to, text } = req.body || {};
  if (!to || !text) return err(res, 400, 'Recipient and text are required.');
  const seller = await users.get(req.user.id);
  const result = await tryWhatsAppSend(seller, to, text);
  if (!result.sent) return err(res, 400, `WhatsApp is not configured or the send failed: ${result.reason}. Nothing was faked as sent.`);
  return ok(res, { sent: true, provider: result.provider });
});
app.get('/api/v2/audit', auth, async (req, res) => ok(res, paginate(req, await auditLogs.list({ sellerId: req.user.id }))));
app.get('/api/v2/integrations', auth, async (req, res) => ok(res, { integrations: { database: isMongo() ? 'mongodb' : 'in-memory', instagram: { configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET), perSellerConnected: !!(await users.get(req.user.id))?.igConnected }, whatsapp: { configured: !!(process.env.WA_TOKEN && process.env.WA_PHONE_NUMBER_ID) }, ai: { engine: 'rule-based-catalog-only', llmConfigured: !!process.env.AI_API_KEY }, payments: { configured: false, note: 'Provider decision pending.' } } }));

app.use((req, res) => err(res, 404, 'Route not found.'));
app.use((e, _req, res, _next) => { console.error('[api] error', e); err(res, 500, 'Internal server error.'); });

// Demo seed file (written by `npm run seed` when Mongo is not used) loads into memory only.
function loadDemoSeedFile() {
  try {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-seed.json');
    if (!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const [key, rows] of Object.entries(data)) if (Array.isArray(rows) && memory[key]) memory[key].push(...rows);
    console.log('[dmorder] Demo seed file loaded into in-memory store. Demo data only.');
  } catch (e) { console.log('[dmorder] Demo seed file not loaded:', e.message); }
}

await connectDB(process.env.MONGO_URI);
if (IS_PROD && !isMongo()) { console.error('[dmorder] FATAL: MongoDB is required in production. Refusing to run on in-memory store.'); process.exit(1); }
if (!isMongo()) loadDemoSeedFile();
setInterval(runFollowUpsForAll, 10 * 60 * 1000);
setInterval(refreshInstagramTokens, 24 * 60 * 60 * 1000);
app.listen(PORT, () => console.log(`[dmorder] API listening on http://localhost:${PORT} (store: ${isMongo() ? 'mongodb' : 'in-memory'})`));
