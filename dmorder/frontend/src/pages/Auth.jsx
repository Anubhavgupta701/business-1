import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setTokens } from '../api.js';
import {
  sendEmailOtp,
  signInWithGoogle,
  isFirebaseConfigured,
} from '../firebase.js';

export default function Auth({ mode }) {
  const nav = useNavigate();
  const [f, setF] = useState({ shopName: '', ownerName: '', city: '', email: '', mobile: '', password: '' });
  const [msg, setMsg] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Email OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);

  // Timer countdown for resending Email OTP link
  useEffect(() => {
    let timer = null;
    if (resendSeconds > 0) {
      timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [resendSeconds]);

  // Check if email was already verified (from localStorage after redirect)
  useEffect(() => {
    const verified = window.localStorage.getItem('emailOtpVerified');
    const verifiedEmail = window.localStorage.getItem('emailForSignInVerified');
    if (verified === 'true' && verifiedEmail) {
      setEmailVerified(true);
      setOtpSent(true);
      setF((prev) => ({ ...prev, email: verifiedEmail }));
      window.localStorage.removeItem('emailOtpVerified');
      window.localStorage.removeItem('emailForSignInVerified');
    }
  }, []);

  // Send Firebase Email OTP / Magic Link
  const handleSendEmailOtp = async (e) => {
    if (e) e.preventDefault();
    setOtpError('');
    if (!f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      setOtpError('Please enter a valid email address first.');
      return;
    }
    setOtpLoading(true);
    try {
      await sendEmailOtp(f.email);
      setOtpSent(true);
      setResendSeconds(60);
    } catch (err) {
      setOtpError(err.message || 'Failed to send Email OTP. Please check your email or use Google Sign In.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Google Authentication (Firebase Auth)
  const handleGoogleAuth = async () => {
    setMsg('');
    setGoogleLoading(true);
    try {
      const googleUser = await signInWithGoogle();
      const res = await api('/api/auth/firebase-login', {
        method: 'POST',
        body: {
          firebaseIdToken: googleUser.idToken,
          shopName: f.shopName || (googleUser.name ? `${googleUser.name}'s Boutique` : ''),
          city: f.city || '',
          mobile: f.mobile || googleUser.phone || ''
        }
      });
      setTokens(res);
      nav('/rk-seller-9x4mz');
    } catch (err) {
      setMsg(err.message || 'Google authentication failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Standard Form Submit (Register / Login)
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');

    if (mode === 'signup' && !emailVerified) {
      if (!otpSent) {
        setMsg('Please click "Send Email OTP" to verify your email first, or use Google Sign In.');
        return;
      }
      setMsg('Please click the verification link sent to your email inbox, then complete registration.');
      return;
    }

    try {
      const body = mode === 'signup'
        ? { ...f, emailVerifiedViaOtp: emailVerified }
        : { email: f.email, password: f.password };

      const r = mode === 'signup'
        ? await api('/api/auth/register', { method: 'POST', body })
        : await api('/api/auth/login',    { method: 'POST', body });

      setTokens(r);
      nav('/rk-seller-9x4mz');
    } catch (er) {
      setMsg(er.message);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 20px',
      background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(200,146,74,0.05) 0%, transparent 70%)',
    }}>

      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Back link */}
        <Link className="textlink" to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 32 }}>
          ← Back to Homepage
        </Link>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/rk-sticker.png" alt="RK Sticker Logo"
            style={{ height: 64, width: 'auto', margin: '0 auto', borderRadius: 8, boxShadow: '0 4px 18px rgba(0, 0, 0, 0.45)' }} />
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--cinzel)',
          fontWeight: 700,
          fontSize: 28,
          textAlign: 'center',
          letterSpacing: '0.04em',
          color: 'var(--white)',
          marginBottom: 8,
        }}>
          {mode === 'signup' ? 'Create Your Seller Account' : 'Welcome Back'}
        </h1>
        <p style={{ color: 'var(--dim)', textAlign: 'center', fontSize: 14, marginBottom: 24 }}>
          {mode === 'signup'
            ? 'First 5 conversations free — verify via Email OTP or Google.'
            : 'Log in to your seller dashboard.'}
        </p>

        {/* Form Card */}
        <div className="glass" style={{ padding: '32px' }}>

          {/* ── Google Sign In / Sign Up ── */}
          <button
            type="button"
            disabled={googleLoading}
            onClick={handleGoogleAuth}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.18)',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--white)',
              fontSize: 15,
              fontWeight: 600,
              cursor: googleLoading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'all 0.2s ease',
              marginBottom: 12,
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
          >
            {/* Google G logo */}
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>
              {googleLoading
                ? 'Connecting with Google...'
                : mode === 'signup'
                  ? 'Create Account with Google'
                  : 'Sign In with Google'}
            </span>
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--dim)', fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }}></div>
            <span style={{ padding: '0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              or {mode === 'signup' ? 'sign up with Email OTP' : 'continue with Email & Password'}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }}></div>
          </div>

          {!isFirebaseConfigured() && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(200, 146, 74, 0.1)',
              border: '1px solid rgba(200, 146, 74, 0.3)',
              color: 'var(--gold)',
              fontSize: 12,
              marginBottom: 16,
              lineHeight: 1.5
            }}>
              <b>Firebase Config Notice:</b> To enable live Email OTP or Google Sign In, add your Firebase keys to <code>frontend/.env</code>. Standard email &amp; password registration is fully active below.
            </div>
          )}

          <form onSubmit={submit}>
            {mode === 'signup' && (
              <>
                <label>Shop / Boutique Name</label>
                <input required value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value })} placeholder="e.g. Aisha Boutique" />

                <label>Your Full Name</label>
                <input required value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} placeholder="e.g. Aisha Khan" />

                <label>City</label>
                <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="e.g. Jaipur" />

                <label>
                  Mobile Number{' '}
                  <span style={{ color: 'var(--dim)', fontWeight: 400, fontSize: 12 }}>(optional — for WhatsApp order slips)</span>
                </label>
                <input
                  value={f.mobile}
                  onChange={(e) => setF({ ...f, mobile: e.target.value })}
                  placeholder="e.g. 9829000000"
                  type="tel"
                />
              </>
            )}

            {/* Email field — with OTP send button on signup */}
            <label>Email Address</label>
            {mode === 'signup' ? (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    required
                    type="email"
                    disabled={emailVerified}
                    value={f.email}
                    onChange={(e) => { setF({ ...f, email: e.target.value }); setOtpSent(false); setEmailVerified(false); }}
                    placeholder="seller@domain.com"
                    style={{ flex: 1 }}
                  />
                  {!emailVerified ? (
                    <button
                      type="button"
                      disabled={otpLoading || !f.email || resendSeconds > 0}
                      onClick={handleSendEmailOtp}
                      className="pill"
                      style={{ padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
                    >
                      {otpLoading
                        ? 'Sending...'
                        : otpSent
                          ? resendSeconds > 0 ? `Resend (${resendSeconds}s)` : 'Resend OTP'
                          : 'Send Email OTP'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEmailVerified(false); setOtpSent(false); }}
                      className="textlink"
                      style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                    >
                      Change
                    </button>
                  )}
                </div>

                {/* Verified badge */}
                {emailVerified && (
                  <div style={{
                    marginTop: 6,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#4ade80',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span>✓</span>
                    <span>Email verified via Firebase OTP ({f.email})</span>
                  </div>
                )}

                {/* Email OTP sent info */}
                {otpSent && !emailVerified && (
                  <div style={{
                    marginTop: 10,
                    marginBottom: 10,
                    padding: '14px',
                    background: 'rgba(200, 146, 74, 0.08)',
                    border: '1px solid rgba(200, 146, 74, 0.25)',
                    borderRadius: 8,
                    lineHeight: 1.6
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--gold)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                      📧 Verification link sent!
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--dim)' }}>
                      A verification link was sent to <strong style={{ color: 'var(--white)' }}>{f.email}</strong>.
                      Click that link — you'll be redirected here and your email will be verified automatically.
                    </span>
                  </div>
                )}

                {otpError && <div className="msg bad" style={{ marginTop: 6, fontSize: 12 }}>{otpError}</div>}
              </>
            ) : (
              <input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="seller@domain.com" />
            )}

            <label>Password <span style={{ color: 'var(--dim)', fontWeight: 400, fontSize: 12 }}>(at least 8 characters)</span></label>
            <input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" />

            <button
              className="btn-primary"
              type="submit"
              style={{ marginTop: 22, width: '100%', padding: '13px', fontSize: 14 }}
            >
              {mode === 'signup' ? 'Complete Registration — Start Free Trial' : 'Log In'}
            </button>

            {msg && <div className="msg bad" style={{ marginTop: 14 }}>{msg}</div>}
          </form>
        </div>

        {/* Switch mode link */}
        <p style={{ color: 'var(--dim)', marginTop: 18, textAlign: 'center', fontSize: 14 }}>
          {mode === 'signup'
            ? <> Already have an account? <Link to="/login" style={{ color: 'var(--gold)' }}>Log in</Link></>
            : <> New here? <Link to="/signup" style={{ color: 'var(--gold)' }}>Create a free account</Link></>
          }
        </p>

        {mode === 'login' && (
          <p style={{ color: 'var(--dim)', marginTop: 12, textAlign: 'center', fontSize: 14 }}>
            <button className="textlink" type="button" onClick={async () => {
              try {
                const r = await api('/api/auth/forgot-password', { method: 'POST', body: { email: f.email } });
                setForgotMsg(r.message || 'If an account exists, a reset link will be sent to your email.');
              } catch (er) { setForgotMsg(er.message); }
            }}>Forgot password?</button>
            {forgotMsg && <span style={{ display: 'block', marginTop: 8 }}>{forgotMsg}</span>}
          </p>
        )}

        <p className="mono" style={{ textAlign: 'center', marginTop: 14, fontSize: 10 }}>
          Demo seller login: aisha.boutique@gmail.com / demo1234
        </p>
      </div>
    </div>
  );
}
