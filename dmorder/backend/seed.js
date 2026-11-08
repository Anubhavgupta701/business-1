import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { connectDB, isMongo, users, products, orders, conversations, rules, templates } from './store.js';

// Demo data ONLY, copied from dmorder-frontend-data-spec.md Section 6.
// Run explicitly: `npm run seed`. Never presented as real customers/results.
const seller = {
  id: 'seller_001', shopName: 'Aisha Boutique', ownerName: 'Aisha Khan', city: 'Jaipur',
  instagramHandle: '@aisha.boutique.jaipur', whatsappNumber: '+91 98290 00000', mobile: '+91 98290 00000',
  email: 'aisha.boutique@gmail.com', isDemo: true, plan: 'STARTER', planPrice: 399, planRenewalDate: '2026-11-14',
  dmUsed: 212, dmLimit: 300, freeConversationsUsed: 0, freeConversationsTotal: 5, emailVerified: false, igConnected: false, codEnabled: true, upiEnabled: true, upiId: 'aishaboutique@okhdfc',
  deliveryCharge: 49, freeDeliveryAbove: 999, aiLanguage: 'Hinglish', aiEnabled: true, followUpHours: 6, workingHours24x7: true,
};
const prods = [
  ['p001', 'Anarkali Kurti Set — Bandhej Print', 1299, 1799, 'Kurti', ['S', 'M', 'L', 'XL'], ['Pink', 'Green'], 14, 'Soft cotton, 3-piece set with dupatta. Daily wear + chhota function dono chalega.', 'LIVE'],
  ['p002', 'Banarasi Silk Saree', 2499, 3499, 'Saree', ['Free Size'], ['Maroon', 'Bottle Green'], 6, 'Banarasi silk, zari border. Blouse piece ke saath.', 'LIVE'],
  ['p003', 'Cotton Mulmul Dupatta', 499, 699, 'Dupatta', ['Free Size'], ['White', 'Yellow'], 32, 'Halki mulmul, garmi ke liye best.', 'LIVE'],
  ['p004', 'Handwork Potli Bag', 699, 999, 'Accessories', [], ['Golden', 'Silver'], 0, 'Haath ki kadhai, party look.', 'LIVE'],
  ['p005', 'Chikankari Short Kurti', 899, 1199, 'Kurti', ['S', 'M', 'L'], ['White', 'Peach'], 21, 'Lucknow chikankari, college/office wear.', 'LIVE'],
  ['p006', 'Bandhej Lehenga Set', 3199, 4499, 'Lehenga', ['M', 'L'], ['Rani Pink'], 4, 'Festive special, semi-stitched.', 'LIVE'],
  ['p007', 'Oxidised Jhumka Set', 349, 549, 'Jewellery', [], ['Silver'], 48, 'Daily + festive, halki weight.', 'LIVE'],
  ['p008', 'Ajrakh Handblock Stole', 599, 799, 'Stole', ['Free Size'], ['Indigo', 'Rust'], 17, 'Asli Ajrakh handblock print.', 'LIVE'],
  ['p009', 'Festive Gota Kurti', 1499, 1999, 'Kurti', ['S', 'M', 'L', 'XL'], ['Mustard'], 9, 'Gota patti work, Diwali collection.', 'LIVE'],
  ['p010', 'Plain Cotton Suit Piece', 1099, 1399, 'Suit', ['Unstitched'], ['Sky Blue', 'Mint'], 25, '2.5m kurta + salwar + dupatta set.', 'BAND'],
];
const ords = [
  ['ORD-1042', 'Priya Sharma', '@priya.sharma_', '98765 43210', '14, Malviya Nagar, Jaipur, Rajasthan 302017', 'Anarkali Kurti Set', 'M', 'Pink', 1, 1299, 0, 'COD', 'PENDING', 'NEW', 'COMMENT'],
  ['ORD-1041', 'Sneha Patil', '@sneha.p', '98220 11111', 'FC Road, Pune, Maharashtra 411005', 'Oxidised Jhumka Set', '', '', 2, 698, 49, 'UPI', 'PAID', 'CONFIRMED', 'DM'],
  ['ORD-1040', 'Kavita Yadav', '@kavita_y', '90000 22222', 'Sector 22, Noida, UP 201301', 'Chikankari Short Kurti', 'L', 'White', 1, 899, 49, 'COD', 'PENDING', 'PACKED', 'COMMENT'],
  ['ORD-1039', 'Ritu Verma', '@ritu.v', '98111 33333', 'Civil Lines, Delhi 110054', 'Banarasi Silk Saree', '', 'Maroon', 1, 2499, 0, 'UPI', 'PAID', 'SHIPPED', 'DM'],
  ['ORD-1038', 'Anjali Gupta', '@anjali_g', '98989 44444', 'Salt Lake, Kolkata, WB 700064', 'Cotton Mulmul Dupatta', '', '', 2, 998, 49, 'COD', 'PENDING', 'PACKED', 'DM'],
  ['ORD-1037', 'Meera Joshi', '@meera.j', '97777 55555', 'Kothrud, Pune, Maharashtra 411038', 'Ajrakh Handblock Stole', '', 'Indigo', 1, 599, 49, 'UPI', 'PAID', 'DELIVERED', 'COMMENT'],
  ['ORD-1036', 'Shalini Rao', '@shalini.r', '96666 66666', 'HSR Layout, Bengaluru, Karnataka 560102', 'Festive Gota Kurti', 'S', 'Mustard', 1, 1499, 0, 'COD', 'PENDING', 'CANCELLED', 'DM'],
  ['ORD-1035', 'Farah Sheikh', '@farah.s', '95555 77777', 'Andheri West, Mumbai, Maharashtra 400053', 'Bandhej Lehenga Set', 'L', '', 1, 3199, 0, 'UPI', 'PAID', 'CONFIRMED', 'COMMENT'],
];
const convs = [
  ['c1', 'Priya Sharma', '@priya.sharma_', 'Anarkali Kurti Set', 'Ho gaya… order ORD-1042', 'ORDER_CLOSED', '11:42 AM'],
  ['c2', 'Neha Singh', '@neha.s', 'Banarasi Saree', 'Thoda soch ke batati hu', 'STALLED', '9:15 AM'],
  ['c3', 'Pooja Meena', '@pooja.m', 'Jhumka Set', 'COD hai kya?', 'IN_CHAT', '10:05 AM'],
  ['c4', 'Divya Nair', '@divya.n', 'Gota Kurti', '(seller ne khud jawab diya)', 'HUMAN_TAKEOVER', 'Kal'],
];
const data = {
  users: [{ ...seller, passwordHash: await bcrypt.hash('demo1234', 10) }],
  products: prods.map(([id, name, price, comparePrice, category, sizes, colors, stock, description, status]) => ({ id, sellerId: 'seller_001', name, price, comparePrice, category, sizes, colors, stock, description, codAvailable: true, status })),
  orders: ords.map(([id, name, handle, phone, addr, item, size, color, qty, amount, dc, method, payStatus, status, source]) => ({ id, sellerId: 'seller_001', customer: { name, instagramHandle: handle, phone, address: { line: addr, city: '', state: '', pincode: '' } }, items: [{ productId: '', name: item, size, color, qty }], amount, deliveryCharge: dc, payment: { method, status: payStatus }, status, source })),
  conversations: convs.map(([id, customerName, handle, productInterest, lastMessage, status, time]) => ({ id, sellerId: 'seller_001', customerName, handle, productInterest, lastMessage, status, time })),
  rules: ['price', 'link', 'buy', 'pp', 'rate'].map((w, i) => ({ id: `rule_demo_${i}`, sellerId: 'seller_001', triggerWord: w, action: 'send_dm', enabled: true })),
  templates: [{ id: 'tpl_demo_1', sellerId: 'seller_001', name: 'Follow-up', type: 'followup', body: 'Namaste {name} ji, aapne {product} ke liye pucha tha — stock abhi hai, order karu kya? Reply karein, main yahi hu.', enabled: true }],
};
await connectDB(process.env.MONGO_URI);
if (isMongo()) {
  for (const [key, rows] of Object.entries(data)) {
    const coll = { users, products, orders, conversations, rules, templates }[key];
    for (const row of rows) { const ex = await coll.findOne({ id: row.id }); if (!ex) await coll.create(row); }
  }
  console.log('Demo seed inserted into MongoDB. Demo login: aisha.boutique@gmail.com / demo1234');
} else {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-seed.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`Demo seed written to ${p}. Restart the backend to load it. Demo login: aisha.boutique@gmail.com / demo1234`);
}
process.exit(0);
