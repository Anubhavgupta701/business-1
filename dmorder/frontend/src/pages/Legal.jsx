import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Legal({ kind }) {
  const [f, setF] = useState({ name: '', email: '', shopName: '', message: '' });
  const [msg, setMsg] = useState('');

  const submitDeletion = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api('/api/contact', {
        method: 'POST',
        body: { ...f, message: 'Official Data Deletion Request: ' + f.message }
      });
      setMsg(r.message || 'Data deletion request filed. You will receive email verification within 24 hours.');
    } catch (er) {
      setMsg('Error submitting request: ' + er.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 0 80px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '80px 24px 0' }}>
      <div style={{ marginBottom: 28 }}>
        <Link className="textlink" to="/">← Back to Homepage</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 36, flexWrap: 'wrap' }}>
        <Link
          to="/privacy"
          className={kind === 'privacy' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '7px 18px', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
        >
          Privacy Policy
        </Link>
        <Link
          to="/terms"
          className={kind === 'terms' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '7px 18px', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
        >
          Terms and Conditions
        </Link>
        <Link
          to="/data-deletion"
          className={kind === 'deletion' ? 'btn-primary' : 'btn-ghost'}
          style={{ padding: '7px 18px', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
        >
          Data Deletion
        </Link>
      </div>

      {kind === 'privacy' && (
        <article className="legal-article">
          <h1 style={{ fontFamily: 'var(--cinzel)', fontWeight: 700, fontSize: 34, marginBottom: 8, color: 'var(--white)', letterSpacing: '0.04em' }}>Privacy Policy</h1>
          <p className="mono" style={{ marginBottom: 28 }}>Effective Date: October 27, 2026 | Last Updated: October 2026</p>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>1. Scope and Objective</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              RK (&quot;we&quot;, &quot;our&quot;, or &quot;the Platform&quot;) provides Instagram comment-to-DM automation and order management software for commercial sellers. This Privacy Policy outlines our procedures concerning the collection, storage, use, and disclosure of information when merchants and their prospective customers interact with our services.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>2. Information We Collect</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 10 }}>We collect the following categories of data strictly for fulfilling commerce automation:</p>
            <ul style={{ color: 'var(--dim)', paddingLeft: 20, marginBottom: 14 }}>
              <li><strong>Merchant Account Information:</strong> Business name, merchant contact email, phone number, operating city, and secure hashed login credentials.</li>
              <li><strong>Product Catalog Data:</strong> Product titles, SKU identifiers, variant options (sizes, colors), inventory counts, and price listings.</li>
              <li><strong>Instagram Platform Data via Meta API:</strong> When you connect an Instagram Business or Creator account through official Meta OAuth, we receive authorized account identifiers and webhook event notifications for post comments and direct messages. We never request, access, or store your Instagram password.</li>
              <li><strong>Customer Transaction Data:</strong> Customer Instagram usernames, contact numbers, and delivery addresses provided voluntarily within direct message checkout flows to generate order slips.</li>
            </ul>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>3. Compliance with Meta Platform Policies</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              RK strictly adheres to the official Meta Platform Terms and Instagram Graph API Developer Policies. We operate solely within the official 24-hour customer service messaging window. Our software never sends unsolicited outreach, cold direct messages, or automated marketing blasts to individuals who have not initiated interaction on your posts.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>4. How We Use and Protect Data</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              Data is utilized exclusively for generating automated catalog replies, compiling confirmed order slips, and presenting analytics inside the merchant dashboard. We enforce tenant isolation ensuring every seller only accesses their own catalog and customer records. All data transfers use TLS 1.3 encryption, and API keys are stored in encrypted vaults.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>5. Data Retention and Deletion Rights</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              We retain merchant data for the duration of an active account. In accordance with applicable data privacy regulations, merchants and consumers may request immediate and complete deletion of their stored data at any time via our Data Deletion page. All verified deletion requests are permanently scrubbed from our production databases within 30 days.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>6. Contact Information</h2>
            <p style={{ color: 'var(--dim)' }}>
              For inquiries regarding data protection, please contact our Privacy Officer at: <strong>officialag701@gmail.com</strong>.
            </p>
          </section>
        </article>
      )}

      {kind === 'terms' && (
        <article className="legal-article">
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Terms and Conditions</h1>
          <p className="mono" style={{ marginBottom: 28 }}>Effective Date: October 27, 2026 | Last Updated: October 2026</p>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>1. Acceptance of Terms</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              By creating an account, accessing the merchant dashboard, or integrating RK with your Instagram account, you agree to be bound by these Terms and Conditions. If you do not accept these terms in their entirety, you must discontinue platform use immediately.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>2. Permitted Commercial Use and Meta Policy Compliance</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              RK is designed for commercial sellers operating Instagram Business or Creator accounts. You agree and warrant that you will:
            </p>
            <ul style={{ color: 'var(--dim)', paddingLeft: 20, marginBottom: 14 }}>
              <li>Comply at all times with Meta Terms of Service and Instagram Community Guidelines.</li>
              <li>Configure auto-replies only in response to genuine customer inquiries within the 24-hour messaging window.</li>
              <li>Never use the platform to distribute unsolicited spam, bulk marketing, deceptive promotional material, or prohibited goods.</li>
            </ul>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>3. Merchant Responsibility for Catalog and Fulfillment</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              The merchant is solely responsible for maintaining catalog price accuracy, honoring quoted rates, managing physical inventory, shipping goods, and handling customer returns or refunds. RK provides automated conversational software and is not an agent, reseller, or fulfillment party in transactions between merchants and buyers.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>4. Payment Processing and Settlements</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              RK does not act as a payment custodian or hold merchant funds. Customer payments (whether Cash on Delivery or digital transfers via UPI/payment links) settle directly between the customer and the merchant&apos;s designated bank or payment provider.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>5. Subscription Plans, Billing, and Cancellation</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              New accounts receive a complimentary trial covering 14 days or your first 20 processed orders. Subsequent platform access is billed according to your selected plan (Starter, Growth, or Per-Order billing). Merchants may cancel subscriptions at any time without early termination penalties.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>6. Disclaimer of Warranties and Limitation of Liability</h2>
            <p style={{ color: 'var(--dim)', marginBottom: 14 }}>
              The platform is provided on an &quot;as is&quot; and &quot;as available&quot; basis. RK does not guarantee uninterrupted availability of third-party APIs provided by Meta Platforms, Inc. Under no circumstances shall RK be liable for indirect, punitive, or consequential damages resulting from platform downtime or third-party API changes.
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12, color: 'var(--white)' }}>7. Contact and Support</h2>
            <p style={{ color: 'var(--dim)' }}>
              For contractual inquiries or support, email: <strong>officialag701@gmail.com</strong>.
            </p>
          </section>
        </article>
      )}

      {kind === 'deletion' && (
        <article className="legal-article">
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>User Data Deletion Instructions</h1>
          <p className="mono" style={{ marginBottom: 28 }}>Meta Graph API Data Deletion Callback &amp; Merchant Requests</p>
          <p style={{ color: 'var(--dim)', marginBottom: 20 }}>
            In compliance with the Meta Platform Developer Policy, users may request the deletion of all data associated with their Instagram profile, catalog, and order history.
          </p>

          <form className="glass" onSubmit={submitDeletion} style={{ maxWidth: 540 }}>
            <label>Instagram Username / Handle</label>
            <input
              required
              placeholder="@your_handle"
              value={f.shopName}
              onChange={(e) => setF({ ...f, shopName: e.target.value })}
            />
            <label>Registered Account Email</label>
            <input
              required
              type="email"
              placeholder="name@business.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
            <label>Merchant / Contact Name</label>
            <input
              required
              placeholder="Your full name"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
            <label>Additional Notes (Optional)</label>
            <textarea
              rows={3}
              placeholder="Specify any particular records or account details"
              value={f.message}
              onChange={(e) => setF({ ...f, message: e.target.value })}
            />
            <button className="pill" style={{ marginTop: 16 }}>
              Submit Data Deletion Request
            </button>
            {msg && <div className="msg ok" style={{ marginTop: 16 }}>{msg}</div>}
          </form>

          <div style={{ marginTop: 32, color: 'var(--dim)', fontSize: 14 }}>
            <p><strong>Timeline:</strong> Once submitted, a confirmation email with a verification code will be sent to the registered email address. After confirmation, all personal identifiers, conversation records, and catalog files are permanently erased from our production databases within 30 days.</p>
          </div>
        </article>
      )}

      <div style={{ marginTop: 48, borderTop: '1px solid var(--line)', paddingTop: 20, display: 'flex', gap: 16, fontSize: 13, color: 'var(--dim)' }}>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms and Conditions</Link>
        <Link to="/data-deletion">Data Deletion</Link>
      </div>
      </div>
    </div>
  );
}
