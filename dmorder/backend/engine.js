// DMOrder rule-based conversation engine (v2).
// This is NOT a large-language-model call and it is NOT a fake send.
// It generates replies ONLY from the seller's own catalog (price, sizes,
// colours, stock, COD flag) plus facts extracted from the buyer's message.
// If a fact is unknown, it asks instead of inventing it. An LLM provider
// (AI_API_KEY) is a separate, pending owner decision; when it exists it
// must obey the same catalog-only contract and low-confidence hold rule
// in the PRD. Until then this engine is the real, testable reply engine.
const STOP = new Set(['set', 'the', 'and', 'with', 'for', 'pack', 'combo']);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w));

export function matchProduct(text, products) {
  const t = norm(text);
  let best = null; let bestScore = 0;
  for (const p of products || []) {
    const pw = words(p.name);
    let score = 0;
    for (const w of pw) if (w.length >= 3 && t.includes(w)) score += 1;
    // Category match is a weak signal only.
    if (p.category && t.includes(norm(p.category)) && norm(p.category).length >= 3) score += 0.5;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? { product: best, score: bestScore } : { product: null, score: 0 };
}

export function extractSlots(text, product) {
  const t = String(text || '');
  const lower = t.toLowerCase();
  const slots = {};
  if (product) {
    for (const size of product.sizes || []) {
      const re = new RegExp(`\\b${String(size).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(lower)) { slots.size = size; break; }
    }
    for (const color of product.colors || []) {
      if (lower.includes(String(color).toLowerCase())) { slots.color = color; break; }
    }
  }
  const qty = lower.match(/(\d+)\s*(?:piece|pieces|pc|pcs)?\b/);
  if (qty) slots.qty = Math.max(1, parseInt(qty[1], 10));
  const phone = t.match(/\b\d{10}\b/);
  if (phone) slots.phone = phone[0];
  const pin = t.match(/\b\d{6}\b/);
  if (pin) slots.pincode = pin[0];
  if (/\b(haan|ha|yes|confirm|order karo|pakka)\b/i.test(lower)) slots.confirmed = true;
  return slots;
}

export function generateReply({ text, products, templates, conversation }) {
  const { product, score } = matchProduct(text, products);
  const slots = extractSlots(text, product);
  const prev = conversation?.slots || {};
  const merged = { ...prev, ...slots };
  if (!product) {
    const names = (products || []).filter((p) => p.status !== 'BAND').slice(0, 3).map((p) => p.name).join(', ');
    return { reply: names ? `Namaste ji! Aap kis product ki price pooch rahe hain? Humare paas ye hain: ${names}. Product ka naam batayein, main price aur stock confirm karke batati hu.` : 'Namaste ji! Aap kis product ki price pooch rahe hain? Product ka naam batayein.', product: null, productId: null, slots: merged, confidence: 0.3, matched: false };
  }
  const price = Number(product.price) || 0;
  const inStock = (product.stock ?? 0) > 0;
  if (!inStock) {
    return { reply: `Ye ${product.name} abhi stock me nahi hai, isliye main galat promise nahi karungi. Aap chahein to similar product dekh lein, ya stock aate hi main bata dungi.`, product, productId: product.id, slots: merged, confidence: 0.8, matched: true };
  }
  const missing = [];
  if ((product.sizes || []).length && !merged.size) missing.push('size');
  if ((product.colors || []).length && !merged.color) missing.push('colour');
  if (missing.length) {
    const sizePart = (product.sizes || []).length ? `Sizes: ${(product.sizes || []).join(', ')}. ` : '';
    const colorPart = (product.colors || []).length ? `Colours: ${(product.colors || []).join(', ')}. ` : '';
    return { reply: `Namaste ji! Ye ${product.name} Rs. ${price} ka hai. ${sizePart}${colorPart}Aapko kaunsa ${missing.join(' aur ')} chahiye?`, product, productId: product.id, slots: merged, confidence: 0.8, matched: true };
  }
  if (merged.phone && merged.pincode && merged.confirmed) {
    const qty = merged.qty || 1;
    return { reply: `Order confirm karne se pehle ek baar check kar lein: ${product.name}${merged.size ? ` (${merged.size}` : ''}${merged.color ? `, ${merged.color}` : ''}${merged.size || merged.color ? ')' : ''} x${qty} = Rs. ${price * qty}. Payment: ${product.codAvailable ? 'COD available hai' : 'UPI se payment hoga'}. Agar sab sahi hai to main order pakka kar dungi.`, product, productId: product.id, slots: merged, confidence: 0.85, matched: true };
  }
  const cod = product.codAvailable ? 'Cash on Delivery available hai. ' : '';
  return { reply: `Great! ${product.name}${merged.size ? ` (${merged.size}` : ''}${merged.color ? `, ${merged.color}` : ''} stock me hai, Rs. ${price} ka hai. ${cod}Apna naam, delivery address (pincode ke saath) aur phone number bhej dein, main order pakka kar dungi.`, product, productId: product.id, slots: merged, confidence: 0.8, matched: true };
}

export function buildSlip(order, seller) {
  const items = (order.items || []).map((i) => `${i.name}${i.size ? ` (${i.size}` : ''}${i.color ? `, ${i.color}` : ''}${i.size || i.color ? ')' : ''} x${i.qty || 1}`).join(', ');
  const c = order.customer || {};
  const addr = c.address ? [c.address.line, c.address.city, c.address.state, c.address.pincode].filter(Boolean).join(', ') : '';
  return [
    `ORDER: ${order.orderNumber || order.id}`,
    `Seller: ${seller?.shopName || ''}`,
    `Customer: ${c.name || ''} (${c.instagramHandle || ''})`,
    `Phone: ${c.phone || ''}`,
    `Items: ${items}`,
    `Amount: Rs. ${order.amount || 0} + Delivery Rs. ${order.deliveryCharge || 0} = Rs. ${(Number(order.amount) || 0) + (Number(order.deliveryCharge) || 0)}`,
    `Payment: ${order.payment?.method || ''} / ${order.payment?.status || ''}`,
    `Address: ${addr}`,
    `Source: ${order.source || ''}`,
  ].join('\n');
}
