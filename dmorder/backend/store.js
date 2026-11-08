import mongoose from 'mongoose';
import { User, Product, Order, Conversation, Rule, Template, Contact, WebhookEvent, RefreshToken, AuditLog, UsageLedger, SendLog, PasswordReset, LoginAttempt, VerificationToken } from './models.js';

let mongoConnected = false;
export function isMongo() { return mongoConnected && mongoose.connection.readyState === 1; }
export async function connectDB(uri) {
  if (!uri) { console.log('[dmorder] MONGO_URI not set — running on in-memory store (NOT MongoDB).'); return false; }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    mongoConnected = true;
    console.log('[dmorder] Connected to MongoDB.');
    return true;
  } catch (e) {
    console.log('[dmorder] MongoDB connection failed, falling back to in-memory store:', e.message);
    return false;
  }
}

export function toPlain(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (!o.id && o._id) o.id = String(o._id);
  delete o._id; delete o.__v;
  return o;
}
const matches = (row, filter) => Object.entries(filter || {}).every(([k, v]) => v === undefined || row[k] === v);
const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function collection(model, mem, prefix) {
  return {
    async list(filter = {}) {
      if (isMongo()) return (await model.find(filter).lean()).map(toPlain);
      return mem.filter((r) => matches(r, filter)).map((r) => ({ ...r }));
    },
    async findOne(filter = {}) {
      if (isMongo()) return toPlain(await model.findOne(filter).lean());
      const row = mem.find((r) => matches(r, filter)); return row ? { ...row } : null;
    },
    async get(id, sellerId) {
      if (isMongo()) { const d = await model.findOne(sellerId ? { id, sellerId } : { id }).lean(); return toPlain(d); }
      const row = mem.find((r) => r.id === id && (!sellerId || r.sellerId === sellerId)); return row ? { ...row } : null;
    },
    async create(data) {
      const row = { id: data.id || newId(prefix), ...data };
      if (isMongo()) { const d = await model.create(row); return toPlain(d); }
      mem.push(row); return { ...row };
    },
    async update(id, sellerId, patch) {
      if (isMongo()) { const d = await model.findOneAndUpdate(sellerId ? { id, sellerId } : { id }, patch, { new: true }).lean(); return toPlain(d); }
      const row = mem.find((r) => r.id === id && (!sellerId || r.sellerId === sellerId));
      if (!row) return null; Object.assign(row, patch); return { ...row };
    },
    async remove(id, sellerId) {
      if (isMongo()) { const d = await model.findOneAndDelete(sellerId ? { id, sellerId } : { id }); return !!d; }
      const i = mem.findIndex((r) => r.id === id && (!sellerId || r.sellerId === sellerId));
      if (i < 0) return false; mem.splice(i, 1); return true;
    },
  };
}

export const memory = { users: [], products: [], orders: [], conversations: [], rules: [], templates: [], contacts: [], events: [], refreshTokens: [], auditLogs: [], usageLedger: [], sendLogs: [], passwordResets: [], loginAttempts: [], verificationTokens: [] };
export const users = collection(User, memory.users, 'seller');
export const products = collection(Product, memory.products, 'prod');
export const orders = collection(Order, memory.orders, 'ord');
export const conversations = collection(Conversation, memory.conversations, 'conv');
export const rules = collection(Rule, memory.rules, 'rule');
export const templates = collection(Template, memory.templates, 'tpl');
export const contacts = collection(Contact, memory.contacts, 'contact');
export const events = collection(WebhookEvent, memory.events, 'evt');
export const refreshTokens = collection(RefreshToken, memory.refreshTokens, 'rt');
export const auditLogs = collection(AuditLog, memory.auditLogs, 'audit');
export const usageLedger = collection(UsageLedger, memory.usageLedger, 'use');
export const sendLogs = collection(SendLog, memory.sendLogs, 'send');
export const passwordResets = collection(PasswordReset, memory.passwordResets, 'pr');
export const loginAttempts = collection(LoginAttempt, memory.loginAttempts, 'la');
export const verificationTokens = collection(VerificationToken, memory.verificationTokens, 'vt');

export function sanitizeSeller(u) {
  if (!u) return null; const { passwordHash, igTokenEnc, ...rest } = u; return rest;
}
