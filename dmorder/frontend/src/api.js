const base = '';
export function token() { return localStorage.getItem('dmorder_token'); }
export function setToken(t) { if (t) localStorage.setItem('dmorder_token', t); else localStorage.removeItem('dmorder_token'); }
export function refreshToken() { return localStorage.getItem('dmorder_refresh_token'); }
export function setRefreshToken(t) { if (t) localStorage.setItem('dmorder_refresh_token', t); else localStorage.removeItem('dmorder_refresh_token'); }
export function setTokens(r) { /* Browser auth now uses httpOnly cookies set by the server. Tokens in the API response are for non-browser API clients only and are intentionally NOT stored in localStorage here. */ }
export function clearTokens() { setToken(null); setRefreshToken(null); }
async function tryRefresh() {
  try {
    const res = await fetch(base + '/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) return true;
  } catch {}
  const rt = refreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(base + '/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) return false;
    setTokens(data);
    return true;
  } catch { return false; }
}
export async function api(path, { method = 'GET', body, auth = false, _retried = false } = {}) {
  const res = await fetch(base + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(auth && token() ? { Authorization: `Bearer ${token()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth && !_retried && refreshToken()) {
    if (await tryRefresh()) return api(path, { method, body, auth, _retried: true });
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export async function logout() {
  const rt = refreshToken();
  try { await api('/api/auth/logout', { method: 'POST', body: { refreshToken: rt } }); } catch {}
  clearTokens();
}
export const demoData = {
  seller: { shopName: 'Demo Boutique', ownerName: 'Seller Admin', city: 'Jaipur', instagramHandle: '@demo.boutique' },
  conversation: [
    { from: 'buyer', text: 'price??' },
    { from: 'ai', text: 'Hello! This Anarkali Kurti Set is Rs. 1,299 (Sizes: S, M, L, XL - Colors: Pink, Green). Which size do you prefer?' },
    { from: 'buyer', text: 'M size, pink' },
    { from: 'ai', text: 'Size M in Pink is in stock. Cash on Delivery available. Please send delivery address and contact number.' },
    { from: 'buyer', text: 'Priya Sharma, 14 Malviya Nagar, Jaipur 302017, Phone 98765 43210' },
    { from: 'ai', text: 'Order confirmed: ORD-1042 filed for Anarkali Kurti Set, Size M, Pink, Rs. 1,299 (COD).' },
  ],
  slip: 'ORDER CONFIRMATION: RK\nOrder: ORD-1042\nCustomer: Priya Sharma (@customer.inquiry)\nPhone: 98765 43210\nItem: Anarkali Kurti Set (Size: M, Color: Pink x1)\nAmount: Rs. 1,299 (Payment: COD)\nAddress: 14 Malviya Nagar, Jaipur, Rajasthan 302017\nSource: Instagram Post Comment',
};
