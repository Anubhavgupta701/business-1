import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import IntroGate from '../components/IntroGate.jsx';
import FloatingPeacockFeather from '../components/FloatingPeacockFeather.jsx';
import globalRelaxingAudio from '../utils/ambientAudio.js';

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const CHAPTERS = [
  { id: 'chapter-a', letter: 'A', num: '01', label: 'Intro' },
  { id: 'chapter-b', letter: 'B', num: '02', label: 'Workflow' },
  { id: 'chapter-c', letter: 'C', num: '03', label: 'Problem' },
  { id: 'chapter-d', letter: 'D', num: '04', label: 'Engine' },
  { id: 'chapter-e', letter: 'E', num: '05', label: 'Architecture' },
  { id: 'chapter-f', letter: 'F', num: '06', label: 'Features' },
  { id: 'chapter-g', letter: 'G', num: '07', label: 'FAQ' },
  { id: 'chapter-h', letter: 'H', num: '08', label: 'Contact' },
];

const FAQS = [
  ['What is Instagram DM automation?', 'Software that monitors incoming comments or direct messages from customers, then replies inside that same Instagram conversation using your active product catalog and organizes the resulting order. It never initiates contact with users who have not messaged or commented first.'],
  ['How does comment-to-DM work?', 'You configure trigger keywords such as price, link, buy, rate, or size. When a comment matches a trigger keyword, the system creates a draft conversation and sends a private reply inside the official 24-hour Meta messaging window.'],
  ['Does it work with Instagram Business accounts?', 'Yes. It is built specifically for Instagram Business and Creator accounts connected via official Meta OAuth. Personal accounts lacking Meta Business permissions cannot use automation APIs.'],
  ['Is coding knowledge required?', 'No. You manage your product catalog, trigger keywords, message templates, and order statuses directly from the merchant dashboard.'],
  ['Can I manage multiple products?', 'Yes. The catalog holds inventory with price, sizes, colors, and stock levels. Free trial includes up to 50 products, Starter supports 200, and Growth has unlimited catalog capacity.'],
  ['Can I manage all orders from one dashboard?', 'Yes. Orders, conversation logs, products, trigger rules, templates, and analytics are consolidated in your seller dashboard with status tracking: New, Confirmed, Packed, Shipped, Delivered, or Cancelled.'],
  ['Is official Instagram API integration required?', 'Yes. RK connects exclusively through official Meta Instagram Graph APIs. Your account credentials stay on Meta OAuth servers; passwords are never requested or stored.'],
  ['How is account data protected?', 'Account access uses secure JWT authentication. Every merchant has strict tenant isolation, ensuring only authorized sellers can view their own catalog, orders, and conversation records.'],
  ['What happens if an automated message fails?', 'The webhook event is logged, the failure reason is recorded, and the thread remains open in your seller dashboard so your team can manually take over.'],
  ['How do I get started?', 'Create an account, upload your product catalog, configure your trigger words, and connect your Instagram Business account via Meta OAuth.'],
];

const FEATURES = [
  ['Comment-to-DM Automation',     'Trigger keywords instantly convert post comments into private DM order threads.',                                    'Trigger: price → DM opened → Catalog link'],
  ['Automated Instant Replies',    'Immediate first replies ensure customer inquiries never sit unanswered overnight.',                                   'Template: Hello! Price is Rs. 1,299 with free shipping'],
  ['Catalog-Grounded Answers',     'Replies are generated strictly from your uploaded catalog with accurate pricing.',                                    'Strict catalog facts: zero invented discounts'],
  ['Product Inventory Management', 'Manage price, sizing, color variants, stock counts, and Cash on Delivery support.',                                  'Full SKU management with inventory tracking'],
  ['Delivery Detail Collection',   'Collect customer name, phone number, and delivery address systematically in chat.',                                   'Name + Phone + Full Address → Order Slip'],
  ['Centralized Order Records',    'Unified order list with payment verification and fulfillment status controls.',                                       'Status: NEW → PACKED → SHIPPED'],
  ['WhatsApp Merchant Notifications','Receive real-time order slips and fulfillment alerts on your configured phone.',                                   'Structured order slip delivered to seller'],
  ['Merchant Analytics',           'Track confirmed orders, gross volume, message counts, and API quota usage.',                                         'Real-time order volume and usage metrics'],
  ['Operational Controls',         'Configure active working hours, follow-up intervals, and response templates.',                                       'Follow-up timing: 6h / Multi-lingual templates'],
];

const ARCH_SCENES = [
  {
    title: 'Instagram Webhook Event Ingestion',
    big:   'Official Meta Graph API Event: comment_mention',
    sub:   'JSON payload received when a customer comments on any connected merchant post.',
    code:  `{\n  "entry": [{\n    "id": "17841405309211928",\n    "time": 1714528920,\n    "changes": [{\n      "field": "comments",\n      "value": {\n        "id": "18029148920182",\n        "text": "price please? interested in pink",\n        "from": { "id": "491029182", "username": "customer.inquiry" }\n      }\n    }]\n  }]\n}`,
  },
  {
    title: 'Automated Catalog Match & Private DM Dispatch',
    big:   'Strict Catalog Query: SKU Match & Pricing Verification',
    sub:   'System matches keyword "price" and dispatches reply inside the 24-hour messaging window.',
    code:  `// DM Response Payload\n{\n  "recipient": { "comment_id": "18029148920182" },\n  "message": {\n    "text": "Hello! The Anarkali Kurti Set is Rs. 1,299 (Sizes: S, M, L available in Pink). Reply with your size and address to place your order with Cash on Delivery."\n  }\n}`,
  },
  {
    title: 'Order Normalization & Database Record',
    big:   'Structured Checkout Slip: Order Status Confirmed',
    sub:   'Standardized order slip filed into the merchant dashboard with customer delivery details.',
    code:  `Order ID: ORD-1042\nCustomer: Priya Sharma (@customer.inquiry)\nContact: +91 98765 43210\nItem: Anarkali Kurti Set (Size: M, Color: Pink)\nAmount: Rs. 1,299 (Payment: COD)\nAddress: Flat 302, Green Valley Apartments, Jaipur - 302015\nStatus: CONFIRMED`,
  },
];

/* ------------------------------------------------------------------ */
/* Ambient Audio Hook                                                  */
/* ------------------------------------------------------------------ */

function useAmbient() {
  return {
    start: () => globalRelaxingAudio.start(),
    stop:  () => globalRelaxingAudio.stop(),
  };
}

/* ------------------------------------------------------------------ */
/* Scroll Reveal Hook                                                  */
/* ------------------------------------------------------------------ */

function useScrollReveal(phase) {
  const reduced = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduced || phase !== 'done') return;
    let cancelled = false;

    (async () => {
      try {
        const gsapMod = await import('gsap');
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');
        const gsap = gsapMod.default;
        gsap.registerPlugin(ScrollTrigger);
        if (cancelled) return;

        // Chapter heads
        gsap.utils.toArray('.chapter-head').forEach((h) => {
          gsap.fromTo(h,
            { opacity: 0, y: 20 },
            { scrollTrigger: { trigger: h, start: 'top 86%', toggleActions: 'play none none none' },
              opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }
          );
        });

        // Lede paragraphs
        gsap.utils.toArray('.lede').forEach((p) => {
          gsap.fromTo(p,
            { opacity: 0, y: 14 },
            { scrollTrigger: { trigger: p, start: 'top 90%', toggleActions: 'play none none none' },
              opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', delay: 0.1 }
          );
        });

        // Cards — stagger
        gsap.utils.toArray('.cards').forEach((grid) => {
          const items = grid.querySelectorAll('.card');
          gsap.fromTo(items,
            { opacity: 0, y: 18 },
            { scrollTrigger: { trigger: grid, start: 'top 88%', toggleActions: 'play none none none' },
              opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06 }
          );
        });

        // Flow steps
        gsap.utils.toArray('.step').forEach((s, i) => {
          gsap.fromTo(s,
            { opacity: 0, x: -12 },
            { scrollTrigger: { trigger: s, start: 'top 92%', toggleActions: 'play none none none' },
              opacity: 1, x: 0, duration: 0.45, ease: 'power2.out', delay: i * 0.07 }
          );
        });

        // Glass panels
        gsap.utils.toArray('.glass').forEach((g) => {
          gsap.fromTo(g,
            { opacity: 0, y: 16 },
            { scrollTrigger: { trigger: g, start: 'top 88%', toggleActions: 'play none none none' },
              opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
          );
        });

        // Overlines
        gsap.utils.toArray('.overline').forEach((o) => {
          gsap.fromTo(o,
            { opacity: 0 },
            { scrollTrigger: { trigger: o, start: 'top 90%', toggleActions: 'play none none none' },
              opacity: 1, duration: 0.4 }
          );
        });

        setTimeout(() => ScrollTrigger.refresh(), 200);
      } catch (_) {}
    })();

    return () => { cancelled = true; };
  }, [reduced, phase]);
}

/* ------------------------------------------------------------------ */
/* PublicSite Component                                                */
/* ------------------------------------------------------------------ */

export default function PublicSite() {
  const [phase,    setPhase]    = useState('done');
  const [soundOn,  setSoundOn]  = useState(false);
  const [active,   setActive]   = useState(CHAPTERS[0]);
  const [progress, setProgress] = useState(0);
  const [faqOpen,  setFaqOpen]  = useState(0);
  const [exp,      setExp]      = useState(0);
  const [contact,  setContact]  = useState({ name: '', email: '', shopName: '', message: '' });
  const [demo,     setDemo]     = useState({ name: '', email: '', shopName: '', message: '' });
  const [msg,      setMsg]      = useState({});
  const [news,     setNews]     = useState('');
  const ambient = useAmbient();

  useScrollReveal(phase);

  /* Scroll progress + intersection observer */
  useEffect(() => {
    const targetHash = window.location.hash || '#chapter-a';
    const el = document.querySelector(targetHash);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 300);

    const obs = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) {
          const c = CHAPTERS.find((x) => x.id === e.target.id);
          if (c) setActive(c);
        }
      }
    }, { rootMargin: '-40% 0px -55% 0px' });

    CHAPTERS.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) obs.observe(el);
    });

    /* Dynamic Scroll Fade In / Fade Out Observer */
    const fadeObs = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          e.target.classList.remove('fade-out');
        } else {
          if (e.boundingClientRect.top < 80) {
            e.target.classList.add('fade-out');
            e.target.classList.remove('in-view');
          } else {
            e.target.classList.remove('in-view');
            e.target.classList.remove('fade-out');
          }
        }
      });
    }, { threshold: [0, 0.12, 0.85], rootMargin: '-30px 0px -30px 0px' });

    document.querySelectorAll('.scroll-fade-item').forEach((el) => fadeObs.observe(el));

    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      obs.disconnect();
      fadeObs.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const enter = (withSound) => {
    if (withSound) { ambient.start(); setSoundOn(true); }
    setPhase('done');
  };

  const toggleSound = () => {
    if (soundOn) { ambient.stop(); setSoundOn(false); }
    else         { ambient.start(); setSoundOn(true); }
  };

  const go = (id) => (e) => {
    e.preventDefault();
    history.replaceState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const submit = (kind, data, key) => async (e) => {
    e.preventDefault();
    setMsg((m) => ({ ...m, [key]: null }));
    try {
      const r = await api(kind === 'contact' ? '/api/contact' : '/api/demo-requests', { method: 'POST', body: data });
      
      const phone = '917011344824';
      const isDemo = kind === 'demo';
      const text = isDemo
        ? `Hello RK Team, I requested a Technical Demo on your website.\n\n• Name: ${data.name || ''}\n• Email: ${data.email || ''}\n• Shop: ${data.shopName || 'N/A'}`
        : `Hello RK Team, I submitted an inquiry on your website.\n\n• Name: ${data.name || ''}\n• Email: ${data.email || ''}\n• Shop: ${data.shopName || 'N/A'}\n• Message: ${data.message || ''}`;
      
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      
      setMsg((m) => ({ ...m, [key]: { text: r.message, waUrl } }));

      // Automatically launch WhatsApp in a new tab
      try {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } catch (_) {}

      // Reset form
      if (key === 'contact') setContact({ name: '', email: '', shopName: '', message: '' });
      if (key === 'demo') setDemo({ name: '', email: '', shopName: '', message: '' });
      if (key === 'news') setNews('');
    } catch (er) {
      setMsg((m) => ({ ...m, [key]: { error: 'Error: ' + er.message } }));
    }
  };

  return (
    <div>
      {phase !== 'done' && <IntroGate phase={phase} onEnter={enter} />}

      {/* Floating Cinematic Peacock Feather */}
      <FloatingPeacockFeather active={phase === 'done'} />

      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <header className="site-head">
        <Link className="brand" to="/">
          <img src="/rk-mark.png" alt="RK Logo" className="brand-logo" style={{ height: 52, width: 'auto' }} />
        </Link>

        <nav className="chain">
          {CHAPTERS.map((c) => (
            <a key={c.id} href={`#${c.id}`} onClick={go(c.id)} className={active.id === c.id ? 'active' : ''}>
              <span className="circle">{c.letter}</span>
              <span className="tag">{c.label}</span>
            </a>
          ))}
        </nav>

        <div className="head-links">
          <Link to="/login">Login</Link>
          <Link to="/signup" className="btn-primary">
            Start Free
          </Link>

        </div>
      </header>

      {/* Scroll progress rail */}
      <div className="progress-edge">
        <i style={{ height: `${progress}%` }} />
      </div>

      {/* Cinematic Viewport Edge Scroll Fade Overlays */}
      <div className="scroll-edge-fade scroll-edge-top" aria-hidden="true" />
      <div className="scroll-edge-fade scroll-edge-bottom" aria-hidden="true" />

      {/* Corner labels */}
      <div className="corner bl">[ {active.letter}: {active.label} ]</div>
      <div className="corner br">Section {CHAPTERS.indexOf(active) + 1} of 8</div>

      {/* ─── CHAPTER A: HERO ─────────────────────────────────────── */}
      <section id="chapter-a" className="chapter center" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
        {/* Dynamic Background Animations: floating ambient amber orbs, moving clouds, grain texture, horizontal light sweep, and smooth vignette */}
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="hero-orb hero-orb-4" />
          <div className="hero-orb hero-orb-5" />
          <div className="hero-orb hero-orb-6" />

          {/* Atmospheric Moving Clouds Layer */}
          <div className="clouds-container" aria-hidden="true">
            <div className="cloud-plane cloud-layer-1" />
            <div className="cloud-plane cloud-layer-2" />
            <div className="cloud-plane cloud-layer-3" />
            <div className="cloud-billow cloud-billow-a" />
            <div className="cloud-billow cloud-billow-b" />
            <div className="cloud-billow cloud-billow-c" />
          </div>

          <div className="hero-grain" />
          <div className="hero-sweep" />
          <div className="hero-vignette" />
        </div>

        <div className="chapter-inner hero-content scroll-fade-item in-view">
          <div className="overline" style={{ marginBottom: 18 }}>Section 01 — Instagram Commerce Automation</div>
          <h1 className="chapter-head settle">
            Automate Orders<br />from Instagram Comments
          </h1>
          <p className="lede" style={{ marginBottom: 36, fontSize: 20 }}>
            When buyers comment asking for pricing or product links, RK automatically delivers product details and captures delivery addresses inside Instagram Direct Messages using the official Meta API.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
            <Link className="btn-primary" to="/signup">Start Free Trial</Link>
            <a className="btn-ghost" href="#chapter-e" onClick={go('chapter-e')}>View Architecture</a>
          </div>

          {/* Hero Split Demo */}
          <div className="split" style={{ marginTop: 0, textAlign: 'left', alignItems: 'start' }}>
            <div className="phone">
              <p className="mono" style={{ textAlign: 'center', marginBottom: 12 }}>Order Thread: Demo Flow</p>
              <div className="bubble">Comment: price please?</div>
              <div className="bubble alt">
                Automated DM: Anarkali Kurti Set Rs. 1,299.<br />Sizes M and L available in Pink.
              </div>
              <div className="bubble">Order ORD-1042 registered: COD confirmed.</div>
              <p className="mono" style={{ textAlign: 'center', marginTop: 12 }}>Demonstration of data pipeline</p>
            </div>
            <div>
              <p className="overline" style={{ marginBottom: 10 }}>Automated Order Management</p>
              <h3 style={{ fontFamily: 'var(--cormorant)', fontStyle: 'italic', fontWeight: 700, fontSize: 'clamp(28px,3vw,44px)', margin: '10px 0 18px', lineHeight: 1.15 }}>
                Never miss an interested buyer in your comments
              </h3>
              <p className="lede" style={{ fontSize: 16, marginBottom: 14 }}>
                Social media comments represent high-intent buyers. RK monitors post comments 24/7, responds with catalog items immediately, and compiles customer name, mobile number, and address into an order slip.
              </p>
              <p className="lede" style={{ fontSize: 16 }}>
                Designed for clothing, jewelry, cosmetics, and D2C brands processing order inquiries on Instagram.
              </p>
              {/* Real platform spec row */}
              <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'API Integration', value: 'Official Meta Graph API' },
                  { label: 'Messaging Window', value: 'Meta 24-Hour DM Window' },
                  { label: 'Account Type',  value: 'Instagram Business / Creator' },
                  { label: 'Order Record',  value: 'Normalized Checkout Slip' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ borderLeft: '2px solid var(--gold)', paddingLeft: 12 }}>
                    <p className="mono" style={{ marginBottom: 2 }}>{label}</p>
                    <p style={{ fontSize: 13, color: 'var(--white)', margin: 0, fontWeight: 600 }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHAPTER B: WORKFLOW ────────────────────────────────── */}
      <section id="chapter-b" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="overline" style={{ marginBottom: 12 }}>Section 02</div>
          <h2 className="chapter-head">How Comment-to-Order Automation Works</h2>
          <p className="lede" style={{ marginBottom: 36 }}>
            The customer comments on your post. The webhook receives the event. An automated direct message is sent with product details, customer shipping details are collected, and an order record is created in your dashboard.
          </p>

          <div className="flow">
            {[
              { n: '01', title: 'Post Comment',       desc: 'Customer comments a trigger keyword on your post.' },
              { n: '02', title: 'Automated DM',        desc: 'System sends immediate reply inside Instagram DM.' },
              { n: '03', title: 'Product Specs',       desc: 'Catalog price, size, and color provided from your inventory.' },
              { n: '04', title: 'Customer Address',    desc: 'Name, phone number, and delivery address collected.' },
              { n: '05', title: 'Order Created',       desc: 'Normalized slip filed in your merchant dashboard.' },
            ].map((s, i, arr) => (
              <React.Fragment key={s.n}>
                <div className="step" style={{ maxWidth: 200 }}>
                  <p className="mono" style={{ marginBottom: 6 }}>Step {s.n}</p>
                  <strong style={{ display: 'block', marginBottom: 6 }}>{s.title}</strong>
                  <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
                </div>
                {i < arr.length - 1 && <span className="arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CHAPTER C: THE PROBLEM ──────────────────────────────── */}
      <section id="chapter-c" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="overline" style={{ marginBottom: 12 }}>Section 03</div>
          <h2 className="chapter-head">Manual Message Handling Slows Order Conversion</h2>
          <div className="split">
            <div>
              <p className="lede" style={{ marginBottom: 24 }}>
                Customer inquiries arrive constantly while sellers are busy packing parcels, photographing inventory, or away from their phones. Unanswered inquiries lead to abandoned purchase intent.
              </p>
              <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  'Delayed comment replies',
                  'Repetitive pricing inquiries',
                  'Manual copy-pasting of product details',
                  'Disorganized customer addresses in chat',
                  'Lost sales from overnight inquiries',
                  'Order status confusion',
                ].map((t) => (
                  <div className="card" key={t}>
                    <div style={{ width: 28, height: 2, background: 'var(--gold)', borderRadius: 1, marginBottom: 10 }} />
                    <strong style={{ fontSize: 13, lineHeight: 1.4 }}>{t}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="phone">
              <p className="mono" style={{ textAlign: 'center', marginBottom: 12 }}>Incoming Inquiries</p>
              <div className="notif">Inquiry: price? <span style={{ float: 'right', color: 'var(--gold)', fontSize: 11 }}>2 min ago</span></div>
              <div className="notif">Inquiry: Is COD available? <span style={{ float: 'right', color: 'var(--gold)', fontSize: 11 }}>9 min ago</span></div>
              <div className="notif">Inquiry: Do you have size M? <span style={{ float: 'right', color: 'var(--gold)', fontSize: 11 }}>21 min ago</span></div>
              <p className="mono" style={{ textAlign: 'center', marginTop: 14 }}>Inquiries awaiting automated reply</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHAPTER D: THE ENGINE ───────────────────────────────── */}
      <section id="chapter-d" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="overline" style={{ marginBottom: 12 }}>Section 04</div>
          <h2 className="chapter-head">Core Platform Capabilities</h2>
          <div className="split" style={{ alignItems: 'start' }}>
            <p className="lede">
              The engine operates strictly on verified parameters: receive comment event, match keyword trigger, fetch real-time catalog data, prompt for shipping information, and persist order records.
            </p>
            <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {[
                'Instagram comment monitoring',
                'Rule-based keyword triggers',
                'Private direct message replies',
                'Catalog inventory matching',
                'Automated shipping address collection',
                'Normalized order record database',
                'Configurable seller working hours',
                'Merchant management dashboard',
              ].map((t) => (
                <div className="card" key={t}>
                  <div style={{ width: 20, height: 2, background: 'var(--gold)', borderRadius: 1, marginBottom: 8 }} />
                  <strong style={{ fontSize: 13, lineHeight: 1.5 }}>{t}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHAPTER E: ARCHITECTURE ─────────────────────────────── */}
      <section id="chapter-e" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="overline" style={{ marginBottom: 12 }}>Section 05</div>
          <h2 className="chapter-head">End-to-End Technical Architecture</h2>
          <p className="lede" style={{ marginBottom: 32 }}>
            Inspect the exact data schemas and execution stages powering the automation pipeline.
          </p>

          <div className="exp">
            <div className="glass">
              {/* Stage selector */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 14, flexWrap: 'wrap' }}>
                {ARCH_SCENES.map((s, idx) => (
                  <button
                    key={s.title}
                    onClick={() => setExp(idx)}
                    className={exp === idx ? 'btn-primary' : 'btn-ghost'}
                    style={{ padding: '7px 16px', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                  >
                    Stage {idx + 1}: {s.title.split(' ')[0]}
                  </button>
                ))}
              </div>
              <p className="overline" style={{ marginBottom: 8 }}>{ARCH_SCENES[exp].title}</p>
              <h3 style={{ fontSize: 22, margin: '8px 0', fontFamily: 'var(--cinzel)', fontWeight: 700, color: 'var(--white)' }}>
                {ARCH_SCENES[exp].big}
              </h3>
              <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 16 }}>{ARCH_SCENES[exp].sub}</p>
              <pre style={{ background: '#f7fbf9', border: '1px solid var(--line)', padding: 18, borderRadius: 4, fontSize: 13, overflowX: 'auto', color: '#8f5c22', lineHeight: 1.65, margin: 0, fontWeight: 500 }}>
                {ARCH_SCENES[exp].code}
              </pre>
            </div>
            <div className="exp-nav">
              <button onClick={() => setExp((exp - 1 + ARCH_SCENES.length) % ARCH_SCENES.length)} aria-label="Previous stage">&lt;</button>
              <span className="mono">{exp + 1}&nbsp;/&nbsp;{ARCH_SCENES.length}</span>
              <button onClick={() => setExp((exp + 1) % ARCH_SCENES.length)} aria-label="Next stage">&gt;</button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHAPTER F: FEATURES ─────────────────────────────────── */}
      <section id="chapter-f" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="overline" style={{ marginBottom: 12 }}>Section 06</div>
          <h2 className="chapter-head">Complete Platform Features</h2>

          <div className="cards">
            {FEATURES.map(([t, d, v]) => (
              <div className="card" key={t}>
                <div style={{ width: 24, height: 2, background: 'var(--gold)', borderRadius: 1, marginBottom: 12 }} />
                <h3>{t}</h3>
                <p style={{ color: 'var(--dim)', fontSize: 14, margin: '0 0 12px', lineHeight: 1.6 }}>{d}</p>
                <div className="mini">{v}</div>
              </div>
            ))}
          </div>

          {/* CTA Block */}
          <div style={{ marginTop: 72, padding: '52px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
              <p className="overline" style={{ marginBottom: 14 }}>Get Started</p>
              <h3 style={{ fontFamily: 'var(--cinzel)', fontWeight: 700, fontSize: 'clamp(28px,3.5vw,48px)', margin: '0 0 16px', color: 'var(--white)', letterSpacing: '0.04em' }}>
                First 5 Orders Free on Every New Account
              </h3>
              <p style={{ color: 'var(--dim)', fontSize: 15, marginBottom: 28, lineHeight: 1.7 }}>
                No credit card required for trial. Connect your catalog and configure rules within minutes.
              </p>
              <Link className="btn-primary" to="/signup" style={{ fontSize: 15, padding: '14px 36px' }}>
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHAPTER G: FAQ ──────────────────────────────────────── */}
      <section id="chapter-g" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="faq">
            <div className="faq-left">
              <span className="circle lg filled" style={{ marginBottom: 16 }}>G</span>
              <h2 className="chapter-head" style={{ fontSize: 'clamp(32px,4vw,54px)', margin: '0 0 16px' }}>
                Frequently Asked Questions
              </h2>
              <p style={{ color: 'var(--dim)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                Direct, transparent answers regarding Meta policies, account requirements, and integration specifications.
              </p>
            </div>
            <div>
              {FAQS.map(([q, a], i) => (
                <div className="faq-item" key={q}>
                  <button
                    className={`faq-q ${faqOpen === i ? 'open' : ''}`}
                    onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}
                  >
                    <span>{q}</span>
                    <span className="plus">{faqOpen === i ? '−' : '+'}</span>
                  </button>
                  {faqOpen === i && <p className="faq-a">{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHAPTER H: CONTACT ──────────────────────────────────── */}
      <section id="chapter-h" className="chapter">
        <div className="chapter-inner scroll-fade-item">
          <div className="overline" style={{ marginBottom: 12 }}>Section 08</div>
          <h2 className="chapter-head">Connect with our Technical Team</h2>
          <div className="split" style={{ marginTop: 36, alignItems: 'start' }}>
            {/* Contact form */}
            <div className="glass">
              <h3 style={{ fontFamily: 'var(--cinzel)', fontWeight: 700, fontSize: 20, margin: '0 0 6px', color: 'var(--white)' }}>
                Send an Inquiry
              </h3>
              <p style={{ color: 'var(--dim)', fontSize: 14, margin: '0 0 4px' }}>Our team responds within one business day.</p>
              <form onSubmit={submit('contact', contact, 'contact')}>
                <label>Name</label>
                <input required value={contact.name}     onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                <label>Email</label>
                <input required type="email" value={contact.email}  onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                <label>Shop / Brand Name</label>
                <input value={contact.shopName} onChange={(e) => setContact({ ...contact, shopName: e.target.value })} />
                <label>Message</label>
                <textarea required rows={4} value={contact.message}  onChange={(e) => setContact({ ...contact, message: e.target.value })} />
                <button className="btn-primary" style={{ marginTop: 18, width: '100%' }}>Submit Message</button>
                {msg.contact && (
                  <div style={{ marginTop: 16 }}>
                    {msg.contact.error ? (
                      <div className="msg bad">{msg.contact.error}</div>
                    ) : (
                      <div className="msg ok" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <span>✅ {msg.contact.text}</span>
                        {msg.contact.waUrl && (
                          <a
                            href={msg.contact.waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              background: '#25D366',
                              color: '#fff',
                              padding: '10px 16px',
                              borderRadius: 6,
                              fontWeight: 600,
                              fontSize: 13,
                              textDecoration: 'none',
                              marginTop: 4,
                              boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)'
                            }}
                          >
                            💬 Send on WhatsApp (+91 7011344824) →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* Demo request */}
            <div className="glass">
              <h3 style={{ fontFamily: 'var(--cinzel)', fontWeight: 700, fontSize: 20, margin: '0 0 6px', color: 'var(--white)' }}>
                Request Technical Demo
              </h3>
              <p style={{ color: 'var(--dim)', fontSize: 14, margin: '0 0 4px' }}>Schedule a walkthrough of the catalog and order dashboard.</p>
              <form onSubmit={submit('demo', demo, 'demo')}>
                <label>Name</label>
                <input required value={demo.name}     onChange={(e) => setDemo({ ...demo, name: e.target.value })} />
                <label>Email</label>
                <input required type="email" value={demo.email}  onChange={(e) => setDemo({ ...demo, email: e.target.value })} />
                <label>Shop Name</label>
                <input value={demo.shopName} onChange={(e) => setDemo({ ...demo, shopName: e.target.value })} />
                <button className="btn-primary" style={{ marginTop: 18, width: '100%' }}>Request Demo</button>
                {msg.demo && (
                  <div style={{ marginTop: 16 }}>
                    {msg.demo.error ? (
                      <div className="msg bad">{msg.demo.error}</div>
                    ) : (
                      <div className="msg ok" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <span>✅ {msg.demo.text}</span>
                        {msg.demo.waUrl && (
                          <a
                            href={msg.demo.waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              background: '#25D366',
                              color: '#fff',
                              padding: '10px 16px',
                              borderRadius: 6,
                              fontWeight: 600,
                              fontSize: 13,
                              textDecoration: 'none',
                              marginTop: 4,
                              boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)'
                            }}
                          >
                            💬 Connect on WhatsApp for Demo (+91 7011344824) →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </form>

              <div style={{ marginTop: 28, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
                <p className="overline" style={{ marginBottom: 8 }}>Official Meta Instagram Graph API Compliant</p>
                <p style={{ fontSize: 13, color: 'var(--dim)', marginTop: 8, lineHeight: 1.6 }}>
                  Direct inquiries: <a href="mailto:officialag701@gmail.com" style={{ color: 'var(--gold)' }}>officialag701@gmail.com</a>
                  {' · '}
                  WhatsApp: <a href="https://wa.me/917011344824" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>+91 7011344824</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────── */}
      <footer>
        <div className="foot-row" style={{ marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid var(--line)' }}>
          {/* Newsletter */}
          <div>
            <p style={{ marginBottom: 12 }}>Product Updates</p>
            <form onSubmit={submit('contact', { name: 'Newsletter subscriber', email: news, message: 'Newsletter signup' }, 'news')}
              style={{ display: 'flex', gap: 8 }}>
              <input required type="email" placeholder="Enter business email"
                value={news} onChange={(e) => setNews(e.target.value)}
                style={{ width: 220, fontSize: 13 }} />
              <button className="btn-ghost" style={{ padding: '9px 18px', fontSize: 11, whiteSpace: 'nowrap' }}>Subscribe</button>
            </form>
            {msg.news && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gold)' }}>{msg.news}</div>}
          </div>
          {/* Legal links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to="/terms">Terms and Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/data-deletion">Data Deletion</Link>
          </div>
          {/* Contact */}
          <div>
            <p style={{ marginBottom: 8 }}>Contact</p>
            <a href="mailto:officialag701@gmail.com" style={{ color: 'var(--gold)', textTransform: 'none', letterSpacing: 0, display: 'block', marginBottom: 4 }}>
              officialag701@gmail.com
            </a>
            <a href="https://wa.me/917011344824" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textTransform: 'none', letterSpacing: 0, display: 'block' }}>
              WhatsApp: +91 7011344824
            </a>
          </div>

        </div>

        <div className="foot-row">
          <span>RK: Instagram Commerce Automation</span>
          <span>Official Meta Graph APIs</span>
          <span style={{ color: 'var(--gold)' }}>© 2026 RK</span>
        </div>

        <p className="credit" style={{ marginTop: 24 }}>
          RK is an independent software application utilizing the official Meta Instagram Graph API.
          Instagram is a registered trademark of Meta Platforms, Inc.
        </p>
      </footer>
    </div>
  );
}
