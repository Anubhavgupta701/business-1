import mongoose from 'mongoose';

// Field names follow dmorder-frontend-data-spec.md Section 5 exactly.
// `id` is kept as a stable public identifier; Mongo's _id is stripped on output.
const base = { id: { type: String, index: true } };

const sellerFields = {
  ...base,
  shopName: String, ownerName: String, city: String, instagramHandle: String,
  whatsappNumber: String, mobile: String, email: { type: String, index: true },
  passwordHash: String, isDemo: { type: Boolean, default: false },
  plan: { type: String, default: 'FREE_TRIAL' }, planPrice: { type: Number, default: 0 },
  freeConversationsUsed: { type: Number, default: 0 }, freeConversationsTotal: { type: Number, default: 5 },
  emailVerified: { type: Boolean, default: false }, phoneVerified: { type: Boolean, default: false }, firebaseUid: String,
  isAdmin: { type: Boolean, default: false }, igConnected: { type: Boolean, default: false },
  igUserId: String, igPageId: String, igUsername: String, igProvider: { type: String, default: 'instagram_login' },
  igTokenEnc: String, igTokenExpiresAt: String,
  planRenewalDate: String, dmUsed: { type: Number, default: 0 }, dmLimit: { type: Number, default: 20 },
  codEnabled: { type: Boolean, default: true }, upiEnabled: { type: Boolean, default: true },
  upiId: String, deliveryCharge: { type: Number, default: 49 }, freeDeliveryAbove: { type: Number, default: 999 },
  aiLanguage: { type: String, default: 'Hinglish' }, aiEnabled: { type: Boolean, default: true },
  followUpHours: { type: Number, default: 6 }, workingHours24x7: { type: Boolean, default: true },
};

const productSchema = new mongoose.Schema({
  ...base, sellerId: String, name: { type: String, required: true },
  price: { type: Number, required: true }, comparePrice: Number, category: String,
  sizes: [String], colors: [String], stock: { type: Number, default: 0 },
  description: String, codAvailable: { type: Boolean, default: true },
  status: { type: String, enum: ['LIVE', 'BAND'], default: 'LIVE' },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  ...base, sellerId: String, createdAt: { type: Date, default: Date.now },
  customer: {
    name: String, instagramHandle: String, phone: String,
    address: { line: String, city: String, state: String, pincode: String },
  },
  items: [{ productId: String, name: String, size: String, color: String, qty: Number }],
  orderNumber: String, amount: Number, deliveryCharge: Number, stockDeducted: { type: Boolean, default: false },
  statusHistory: [{ status: String, at: String, by: String }],
  payment: { method: { type: String, enum: ['COD', 'UPI'] }, status: { type: String, enum: ['PAID', 'PENDING'] } },
  status: { type: String, enum: ['NEW', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'NEW' },
  source: { type: String, enum: ['COMMENT', 'DM'], default: 'DM' },
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  ...base, sellerId: String, customerName: String, handle: String, productInterest: String,
  lastMessage: String, status: { type: String, enum: ['ORDER_CLOSED', 'IN_CHAT', 'STALLED', 'HUMAN_TAKEOVER'], default: 'IN_CHAT' },
  time: String, messages: [{ from: String, text: String, at: String }],
  channel: { type: String, default: 'DM' }, automationPaused: { type: Boolean, default: false },
  followUpSentAt: String, lastBuyerMessageAt: String, aiState: String, slots: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const ruleSchema = new mongoose.Schema({
  ...base, sellerId: String, triggerWord: String, action: { type: String, default: 'send_dm' },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

const templateSchema = new mongoose.Schema({
  ...base, sellerId: String, name: String, type: String, body: String, enabled: { type: Boolean, default: true },
}, { timestamps: true });

const contactSchema = new mongoose.Schema({
  ...base, kind: String, name: String, email: String, shopName: String, message: String, createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

const eventSchema = new mongoose.Schema({
  ...base, sellerId: String, eventId: String, eventType: String, sender: String, text: String,
  matched: Boolean, action: String, sent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const User = mongoose.model('Seller', new mongoose.Schema(sellerFields, { timestamps: true }));
export const Product = mongoose.model('Product', productSchema);
export const Order = mongoose.model('Order', orderSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Rule = mongoose.model('Rule', ruleSchema);
export const Template = mongoose.model('Template', templateSchema);
export const Contact = mongoose.model('Contact', contactSchema);
export const WebhookEvent = mongoose.model('WebhookEvent', eventSchema);

const refreshTokenSchema = new mongoose.Schema({
  ...base, sellerId: String, tokenHash: String, expiresAt: Date, revoked: { type: Boolean, default: false },
}, { timestamps: true });
const auditLogSchema = new mongoose.Schema({
  ...base, sellerId: String, action: String, details: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });
const usageLedgerSchema = new mongoose.Schema({
  ...base, sellerId: String, type: String, refId: String, amount: Number,
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });
const sendLogSchema = new mongoose.Schema({
  ...base, sellerId: String, channel: String, to: String, text: String, sent: Boolean, reason: String,
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });
const passwordResetSchema = new mongoose.Schema({
  ...base, sellerId: String, email: String, tokenHash: String, expiresAt: Date, used: { type: Boolean, default: false },
}, { timestamps: true });
export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const UsageLedger = mongoose.model('UsageLedger', usageLedgerSchema);
export const SendLog = mongoose.model('SendLog', sendLogSchema);
export const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

const loginAttemptSchema = new mongoose.Schema({
  ...base, email: String, at: { type: Date, default: Date.now },
}, { timestamps: true });
const verificationTokenSchema = new mongoose.Schema({
  ...base, sellerId: String, email: String, tokenHash: String, expiresAt: Date, used: { type: Boolean, default: false },
}, { timestamps: true });
export const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);
export const VerificationToken = mongoose.model('VerificationToken', verificationTokenSchema);
