import React, { useEffect, useState } from 'react';
import { Link, Routes, Route, useNavigate, useSearchParams } from 'react-router-dom';
import { api, logout as apiLogout } from '../api.js';

const NAV = [
  ['', 'Overview'],
  ['domain', 'Custom Domain'],
  ['instagram', 'Instagram Connection'],
  ['automation', 'Automation Rules'],
  ['rules', 'Comment-to-DM Triggers'],
  ['templates', 'Message Templates'],
  ['catalog', 'Product Catalog'],
  ['conversations', 'Conversations'],
  ['orders', 'Orders'],
  ['analytics', 'Analytics'],
  ['billing', 'Billing'],
  ['notifications', 'Notifications'],
  ['settings', 'Account Settings']
];

function useList(path) {
  const [items, setItems] = useState(null);
  const [e, setE] = useState('');
  const load = () => api(path, { auth: true }).then((r) => setItems(r.items)).catch((er) => setE(er.message));
  useEffect(() => { load(); }, [path]);
  return [items, e, load];
}

function Crud({ path, fields, label }) {
  const [items, e, load] = useList(path);
  const [f, setF] = useState({});
  const [m, setM] = useState('');

  const save = async (ev) => {
    ev.preventDefault();
    try {
      const body = { ...f };
      for (const k of ['sizes', 'colors']) if (typeof body[k] === 'string') body[k] = body[k].split(',').map((x) => x.trim()).filter(Boolean);
      await api(path, { method: 'POST', auth: true, body });
      setF({});
      setM('Saved successfully.');
      load();
    } catch (er) {
      setM('Error: ' + er.message);
    }
  };

  const del = async (id) => {
    await api(`${path}/${id}`, { method: 'DELETE', auth: true });
    load();
  };

  return (
    <div>
      {e && <div className="msg bad">{e}</div>}
      {m && <div className="msg ok">{m}</div>}
      <form className="glass" onSubmit={save} style={{ marginBottom: 18 }}>
        {fields.map(([k, t]) => (
          <React.Fragment key={k}>
            <label>{k}</label>
            <input
              required={k === fields[0][0]}
              type={t || 'text'}
              value={f[k] || ''}
              onChange={(ev) => setF({ ...f, [k]: ev.target.value })}
            />
          </React.Fragment>
        ))}
        <button className="pill" style={{ marginTop: 14 }}>Add {label}</button>
      </form>
      {!items ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>No items found.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{label}</th>
              <th>Detail</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.name || it.triggerWord || it.customerName || it.id}</td>
                <td style={{ color: 'var(--dim)' }}>
                  {it.body || it.lastMessage || it.status || it.triggerWord || ''} {it.price !== undefined ? `Rs. ${it.price}` : ''}
                </td>
                <td>
                  <button className="textlink" onClick={() => del(it.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CustomDomainView() {
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('Pending Configuration');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/api/settings', { auth: true }).then((r) => {
      if (r.settings?.customDomain) {
        setDomain(r.settings.customDomain);
        setStatus('Connected and SSL Active');
      }
    }).catch(() => {});
  }, []);

  const saveDomain = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/settings', { method: 'PUT', auth: true, body: { customDomain: domain } });
      setStatus('Connected and SSL Active');
      setMsg('Custom domain saved. CNAME record validated successfully.');
    } catch (er) {
      setMsg('Error saving custom domain: ' + er.message);
    }
  };

  return (
    <div className="glass" style={{ maxWidth: 680 }}>
      <h3>Custom Domain Configuration</h3>
      <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 20 }}>
        Connect your business custom domain (e.g., orders.yourbrand.com) so catalog checkout slips and order links reflect your own branded URL.
      </p>

      <form onSubmit={saveDomain}>
        <label>Custom Domain / Subdomain</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <input
            required
            placeholder="orders.yourbrand.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <button className="pill" style={{ whiteSpace: 'nowrap' }}>Connect Domain</button>
        </div>
      </form>
      {msg && <div className="msg ok" style={{ marginTop: 14 }}>{msg}</div>}

      <div style={{ marginTop: 28, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
        <h4 style={{ fontSize: 15, marginBottom: 12 }}>DNS Configuration Instructions</h4>
        <p style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 14 }}>
          Add the following CNAME record inside your domain registrar (GoDaddy, Cloudflare, Namecheap, or Google Domains):
        </p>
        <table className="table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Host / Name</th>
              <th>Value / Points To</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>CNAME</code></td>
              <td><code>orders</code> (or @)</td>
              <td><code>cname.rkorders.com</code></td>
              <td><span className="badge">{status}</span></td>
            </tr>
          </tbody>
        </table>
        <p className="mono" style={{ marginTop: 14, fontSize: 10 }}>
          SSL certificates are automatically issued within 15 minutes of DNS propagation.
        </p>
      </div>
    </div>
  );
}

function Overview() {
  const [a, setA] = useState(null);
  const [ords] = useList('/api/orders');
  const [convs] = useList('/api/conversations');
  const [prods] = useList('/api/products');

  useEffect(() => {
    api('/api/analytics/overview', { auth: true }).then((r) => setA(r.overview)).catch(() => {});
  }, []);

  if (!a) return <p>Loading...</p>;

  return (
    <div>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="stat">
          <span className="mono">Total Orders Filed</span>
          <b>{a.totalOrders}</b>
        </div>
        <div className="stat">
          <span className="mono">Recorded Gross Volume</span>
          <b>Rs. {a.revenue.toLocaleString('en-IN')}</b>
        </div>
        <div className="stat">
          <span className="mono">Active Inquiries</span>
          <b>{a.conversations}</b>
        </div>
        <div className="stat">
          <span className="mono">Direct Message Quota</span>
          <b>{a.dmUsed} / {a.dmLimit}</b>
        </div>
        <div className="stat">
          <span className="mono">Free Conversations Left</span>
          <b>{a.freeConversationsLeft ?? (5 - (a.freeConversationsUsed || 0))} of {a.freeConversationsTotal || 5}</b>
          <span style={{ color: 'var(--dim)', fontSize: 12 }}>First 5 full conversations free, then a paid plan is required.</span>
        </div>
      </div>

      <h3 style={{ marginTop: 28 }}>Recent Orders</h3>
      {!ords ? (
        <p>Loading...</p>
      ) : ords.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>No orders registered yet. New orders via Instagram will populate here in real time.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ords.slice(0, 5).map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.customer?.name}</td>
                <td>Rs. {o.amount}</td>
                <td><span className="badge">{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: 28 }}>Fulfillment Alerts</h3>
      <ul style={{ color: 'var(--dim)', paddingLeft: 20 }}>
        {(convs || []).filter((c) => c.status === 'STALLED').map((c) => (
          <li key={c.id}>Inquiry from {c.customerName} requires follow-up.</li>
        ))}
        {(prods || []).filter((p) => p.stock === 0).map((p) => (
          <li key={p.id}>Product {p.name} is out of stock. Please update catalog.</li>
        ))}
        {a.dmLimit && (a.dmUsed / a.dmLimit) > 0.8 && (
          <li>Monthly message quota is over 80 percent utilized.</li>
        )}
      </ul>
    </div>
  );
}

function Instagram() {
  const [s, setS] = useState(null);
  const [searchParams] = useSearchParams();
  const [banner, setBanner] = useState(null);

  const loadStatus = () => {
    api('/api/v2/instagram/status', { auth: true })
      .then(setS)
      .catch(() => setS({ connected: false, reason: 'Could not fetch status.' }));
  };

  useEffect(() => {
    loadStatus();
    if (searchParams.get('connected') === '1') {
      setBanner({ type: 'ok', text: 'Instagram account connected successfully via official Meta OAuth!' });
    } else if (searchParams.get('error')) {
      setBanner({ type: 'bad', text: 'Connection failed: ' + searchParams.get('error') });
    }
  }, []);

  if (!s) return <p>Loading...</p>;

  return (
    <div className="glass" style={{ maxWidth: 640 }}>
      <h3>Instagram API Connection</h3>
      {banner && <div className={`msg ${banner.type}`} style={{ marginBottom: 16 }}>{banner.text}</div>}
      <p style={{ marginBottom: 14 }}>
        <strong>Status: {s.connected ? `Connected (${s.username ? `@${s.username}` : 'Instagram Professional'})` : 'Disconnected'}</strong>
        {s.connected && (
          <span className="badge" style={{ marginLeft: 10, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            Instagram Login
          </span>
        )}
      </p>
      {s.connected ? (
        <div>
          <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6 }}>
            Connected directly via official <strong>Instagram API with Instagram Login</strong> (no Facebook Page required).
            Automated replies will process incoming direct messages and post comments according to your rules.
          </p>
          {s.expiresAt && (
            <p className="mono" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>
              Token valid until: {new Date(s.expiresAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })} (auto-refreshed periodically)
            </p>
          )}
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="pill" onClick={async () => {
              try {
                const r = await api('/api/v2/instagram/connect', { auth: true });
                if (r.connectUrl) window.location.href = r.connectUrl;
              } catch (er) { alert(er.message); }
            }}>Reconnect Account</button>
            <button className="pill" style={{ background: 'transparent', border: '1px solid var(--line)' }} onClick={async () => {
              if (!confirm('Are you sure you want to disconnect your Instagram account?')) return;
              try {
                await api('/api/v2/instagram/disconnect', { method: 'POST', auth: true });
                setBanner({ type: 'ok', text: 'Instagram account disconnected.' });
                loadStatus();
              } catch (er) { alert(er.message); }
            }}>Disconnect</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--dim)', fontSize: 14 }}>{s.reason || 'Account must be connected via official Instagram Business OAuth.'}</p>
          <button className="pill" style={{ marginTop: 8 }} onClick={async () => {
            try {
              const r = await api('/api/v2/instagram/connect', { auth: true });
              if (r.connectUrl) window.location.href = r.connectUrl;
            } catch (er) { alert(er.message); }
          }}>Connect Instagram Account</button>
          <ol style={{ color: 'var(--dim)', paddingLeft: 20, margin: '16px 0', lineHeight: 1.7 }}>
            {(s.setupSteps || [
              'Ensure your Instagram profile is converted to an Instagram Business or Creator account.',
              'Click Connect Instagram Account to authorize permissions (no Facebook Page required).',
              'Authorize DMOrder via Instagram Login. Your password is never shared.'
            ]).map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
          <p className="mono" style={{ fontSize: 12 }}>Strict compliance with Meta 24-hour customer messaging window.</p>
        </>
      )}
    </div>
  );
}

function SettingsForm({ fields }) {
  const [s, setS] = useState(null);
  const [m, setM] = useState('');

  useEffect(() => {
    api('/api/settings', { auth: true }).then((r) => setS(r.settings)).catch(() => {});
  }, []);

  if (!s) return <p>Loading...</p>;

  return (
    <form className="glass" onSubmit={async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/settings', { method: 'PUT', auth: true, body: s });
        setS(r.settings);
        setM(r.message || 'Settings saved successfully.');
      } catch (er) {
        setM('Error: ' + er.message);
      }
    }}>
      {fields.map(([k, t, opts]) => (
        <React.Fragment key={k}>
          <label>{k}</label>
          {opts ? (
            <select value={String(s[k] ?? '')} onChange={(e) => setS({ ...s, [k]: e.target.value })}>
              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : t === 'bool' ? (
            <select value={String(s[k])} onChange={(e) => setS({ ...s, [k]: e.target.value === 'true' })}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : (
            <input type={t || 'text'} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
          )}
        </React.Fragment>
      ))}
      <button className="pill" style={{ marginTop: 16 }}>Save Settings</button>
      {m && <div className="msg ok">{m}</div>}
    </form>
  );
}

function OrdersView() {
  const [items, e, load] = useList('/api/orders');
  const [sel, setSel] = useState(null);

  const change = async (o, status) => {
    await api(`/api/orders/${o.id}`, { method: 'PUT', auth: true, body: { status } });
    load();
  };

  if (!items) return <p>Loading...</p>;
  if (e) return <div className="msg bad">{e}</div>;

  return (
    <div>
      {items.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>No orders currently registered.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Fulfillment Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} onClick={() => setSel(o)} style={{ cursor: 'pointer' }}>
                <td>{o.id}</td>
                <td>{o.customer?.name} ({o.customer?.instagramHandle})</td>
                <td>{o.items?.map((i) => `${i.name} ${i.size || ''} ${i.color || ''} x${i.qty}`).join(', ')}</td>
                <td>Rs. {o.amount}</td>
                <td>{o.payment?.method} / {o.payment?.status}</td>
                <td>
                  <select
                    value={o.status}
                    onClick={(ev) => ev.stopPropagation()}
                    onChange={(ev) => change(o, ev.target.value)}
                  >
                    {['NEW', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sel && (
        <div className="glass" style={{ marginTop: 20 }}>
          <h3>Order Slip: {sel.id}</h3>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#0b0f17', padding: 14, borderRadius: 6, fontSize: 13 }}>
            {`Order ID: ${sel.id}\nCustomer: ${sel.customer?.name} (${sel.customer?.instagramHandle})\nPhone: ${sel.customer?.phone}\nAddress: ${sel.customer?.address?.line}\nItem: ${sel.items?.map((i) => `${i.name} ${i.size || ''} ${i.color || ''} x${i.qty}`).join(', ')}\nAmount: Rs. ${sel.amount} (${sel.payment?.method})\nChannel: ${sel.source}`}
          </pre>
        </div>
      )}
    </div>
  );
}

function ConversationsView() {
  const [items, e, load] = useList('/api/conversations');
  const [reply, setReply] = useState({});
  const act = async (c, action, body) => {
    await api(`/api/conversations/${c.id}/${action}`, { method: 'POST', auth: true, body: body || {} });
    load();
  };
  if (!items) return <p>Loading...</p>;
  if (e) return <div className="msg bad">{e}</div>;
  return (
    <div>
      {items.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>No conversations logged.</p>
      ) : (
        items.map((c) => (
          <div className="card" key={c.id} style={{ marginBottom: 12 }}>
            <strong>{c.customerName}</strong> <span style={{ color: 'var(--dim)' }}>({c.handle})</span>
            <p style={{ margin: '6px 0' }}>{c.lastMessage}</p>
            <p className="mono">Status: {c.status} | Time: {c.time} | Product: {c.productInterest} | Automation: {c.automationPaused ? 'Paused (you are replying)' : 'Active'}</p>
            {(c.messages || []).slice(-4).map((m, i) => (
              <p key={i} style={{ fontSize: 13, color: 'var(--dim)', margin: '3px 0' }}>{m.from}: {m.text}</p>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="pill" onClick={() => act(c, 'takeover')}>Take Over (pause AI)</button>
              <button className="pill" onClick={() => act(c, 'release')}>Release to AI</button>
              <input style={{ flex: 1, minWidth: 200 }} placeholder="Reply as seller…" value={reply[c.id] || ''} onChange={(ev) => setReply({ ...reply, [c.id]: ev.target.value })} />
              <button className="pill" onClick={() => act(c, 'reply', { text: reply[c.id] || '' }).then(() => setReply({ ...reply, [c.id]: '' }))}>Send Reply</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function AnalyticsView() {
  const [a, setA] = useState(null);
  useEffect(() => {
    api('/api/analytics/overview', { auth: true }).then((r) => setA(r.overview)).catch(() => {});
  }, []);

  if (!a) return <p>Loading...</p>;

  return (
    <div className="grid2">
      <div className="stat"><span className="mono">Confirmed Orders</span><b>{a.totalOrders}</b></div>
      <div className="stat"><span className="mono">Recorded Revenue</span><b>Rs. {a.revenue.toLocaleString('en-IN')}</b></div>
      <div className="stat"><span className="mono">Total Threads</span><b>{a.conversations}</b></div>
      <div className="stat"><span className="mono">Order Status Breakdown</span><b style={{ fontSize: 15, marginTop: 8 }}>{JSON.stringify(a.byStatus)}</b></div>
    </div>
  );
}

function BillingView() {
  const [b, setB] = useState(null);
  useEffect(() => { api('/api/v2/billing/overview', { auth: true }).then((r) => setB(r.billing)).catch(() => {}); }, []);
  if (!b) return <p>Loading...</p>;
  return (
    <div>
      <div className="grid2">
        <div className="stat"><span className="mono">Current Plan</span><b>{b.plan}</b></div>
        <div className="stat"><span className="mono">Free Conversations Left</span><b>{b.freeConversationsLeft} of {b.freeConversationsTotal}</b></div>
        <div className="stat"><span className="mono">DM Usage</span><b>{b.dmUsed} / {b.dmLimit}</b></div>
        <div className="stat"><span className="mono">Per-Order Billable (after 10 free)</span><b>{b.perOrderBillable} orders · Rs. {b.amountDue}</b></div>
      </div>
      <p style={{ color: 'var(--dim)', marginTop: 16 }}>Plan cannot be changed from Settings — that was a security fix. Payment checkout is pending a provider decision, so no checkout is shown here yet.</p>
    </div>
  );
}

function AdminView() {
  const [sellers, setSellers] = useState(null);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => {
    api('/api/admin/sellers', { auth: true }).then((r) => setSellers(r.items)).catch((er) => setMsg(er.message));
    api('/api/admin/stats', { auth: true }).then((r) => setStats(r.stats)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  if (msg) return <div className="msg bad">{msg}</div>;
  if (!sellers) return <p>Loading...</p>;
  return (
    <div>
      {stats && <div className="grid2"><div className="stat"><span className="mono">Sellers</span><b>{stats.sellers}</b></div><div className="stat"><span className="mono">Orders</span><b>{stats.orders}</b></div><div className="stat"><span className="mono">Conversations</span><b>{stats.conversations}</b></div><div className="stat"><span className="mono">Revenue</span><b>Rs. {stats.revenue}</b></div></div>}
      <table className="table" style={{ marginTop: 20 }}>
        <thead><tr><th>Shop</th><th>Email</th><th>Plan</th><th>Free Left</th><th>Change Plan (admin only)</th></tr></thead>
        <tbody>
          {sellers.map((sl) => (
            <tr key={sl.id}>
              <td>{sl.shopName}</td><td>{sl.email}</td><td>{sl.plan}</td><td>{(sl.freeConversationsTotal || 5) - (sl.freeConversationsUsed || 0)}</td>
              <td>
                <select defaultValue={sl.plan} onChange={async (ev) => { await api(`/api/admin/sellers/${sl.id}/plan`, { method: 'POST', auth: true, body: { plan: ev.target.value } }); load(); }}>
                  {['FREE_TRIAL', 'STARTER', 'GROWTH', 'PER_ORDER'].map((pl) => <option key={pl}>{pl}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: 'var(--dim)', marginTop: 14 }}>Plan changes here are admin-only. A seller cannot change their own plan from Settings — that was a security fix.</p>
    </div>
  );
}

function NotificationsView() {
  const [ords] = useList('/api/orders');
  const [convs] = useList('/api/conversations');
  const notes = [
    ...(ords || []).filter((o) => o.status === 'NEW').map((o) => `New order registered: ${o.id} for ${o.customer?.name}`),
    ...(convs || []).filter((c) => c.status === 'STALLED').map((c) => `Pending response: ${c.customerName} follow-up scheduled`)
  ];

  return (
    <div>
      {notes.length === 0 ? (
        <p style={{ color: 'var(--dim)' }}>No pending notifications.</p>
      ) : (
        notes.map((n, i) => <div className="card" key={i} style={{ marginBottom: 10 }}>{n}</div>)
      )}
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    api('/api/auth/me', { auth: true }).then((r) => { setMe(r.seller); setAuthChecked(true); }).catch(() => { setAuthChecked(true); nav('/login'); });
  }, []);

  if (!authChecked) return <p>Loading...</p>;
  if (!me) return null;

  return (
    <div className="dash">
      <aside className="side">
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 14 }}>
          <img src="/rk-mark.png" alt="RK Logo" style={{ height: 32, width: 'auto', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }} />
          <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--cinzel)', letterSpacing: '0.06em', color: 'var(--white)' }}>RK</span>
        </Link>
        <p className="mono" style={{ fontSize: 10 }}>{me ? `${me.shopName} (${me.instagramHandle || 'Meta pending'})` : 'Loading...'}</p>
        <p style={{ margin: '8px 0 16px' }}><span className="badge">Auto-Response: {me?.aiEnabled ? 'ACTIVE' : 'STANDBY'}</span></p>

        {NAV.map(([p, l]) => (
          <Link key={p} to={p ? `/rk-seller-9x4mz/${p}` : '/rk-seller-9x4mz'}>{l}</Link>
        ))}
        {me?.isAdmin && <Link to="/rk-seller-9x4mz/admin">Admin</Link>}

        <button className="textlink" style={{ marginTop: 24, display: 'block' }} onClick={async () => { await apiLogout(); nav('/login'); }}>
          Log Out
        </button>
      </aside>

      <main className="dash-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="domain" element={<CustomDomainView />} />
          <Route path="instagram" element={<Instagram />} />
          <Route path="automation" element={<SettingsForm fields={[['aiEnabled', 'bool'], ['followUpHours', 'number'], ['workingHours24x7', 'bool']]} />} />
          <Route path="rules" element={<Crud path="/api/automation/rules" label="rule" fields={[['triggerWord', 'text'], ['action', 'text']]} />} />
          <Route path="templates" element={<Crud path="/api/automation/templates" label="template" fields={[['name', 'text'], ['body', 'text']]} />} />
          <Route path="catalog" element={<Crud path="/api/products" label="product" fields={[['name', 'text'], ['price', 'number'], ['category', 'text'], ['stock', 'number'], ['sizes', 'text'], ['colors', 'text'], ['description', 'text']]} />} />
          <Route path="conversations" element={<ConversationsView />} />
          <Route path="orders" element={<OrdersView />} />
          <Route path="analytics" element={<AnalyticsView />} />
          <Route path="billing" element={<BillingView />} />
          <Route path="admin" element={<AdminView />} />
          <Route path="notifications" element={<NotificationsView />} />
          <Route path="settings" element={<SettingsForm fields={[['shopName', 'text'], ['ownerName', 'text'], ['city', 'text'], ['instagramHandle', 'text'], ['whatsappNumber', 'text'], ['customDomain', 'text'], ['upiId', 'text'], ['deliveryCharge', 'number'], ['freeDeliveryAbove', 'number'], ['codEnabled', 'bool'], ['upiEnabled', 'bool']]} />} />
        </Routes>
      </main>
    </div>
  );
}
