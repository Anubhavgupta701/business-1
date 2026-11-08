import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { verifyEmailOtp, isEmailSignInLink } from '../firebase.js';

/**
 * VerifyEmailOtp page
 * Firebase redirects the user here after they click the sign-in link in their email.
 * This page completes the email verification and stores the result in localStorage
 * so the signup form can detect it and mark the email as verified.
 */
export default function VerifyEmailOtp() {
  const nav = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error' | 'needs-email'
  const [email, setEmail] = useState('');
  const [inputEmail, setInputEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const currentUrl = window.location.href;

    // Check if this is a valid Firebase email sign-in link
    if (!isEmailSignInLink(currentUrl)) {
      setStatus('error');
      setErrorMsg('This URL is not a valid Firebase email verification link. Please request a new one from the signup page.');
      return;
    }

    // Try to get email from localStorage (saved when OTP was sent)
    const savedEmail = window.localStorage.getItem('emailForSignIn');
    if (savedEmail) {
      setEmail(savedEmail);
      completeVerification(savedEmail, currentUrl);
    } else {
      // Email not found in localStorage — ask user to enter it manually
      setStatus('needs-email');
    }
  }, []);

  const completeVerification = async (emailToUse, url) => {
    setStatus('verifying');
    try {
      await verifyEmailOtp(emailToUse, url || window.location.href);
      // Mark as verified in localStorage so the signup form can detect it
      window.localStorage.setItem('emailOtpVerified', 'true');
      window.localStorage.setItem('emailForSignInVerified', emailToUse);
      setStatus('success');
      // Redirect back to signup after 2 seconds
      setTimeout(() => nav('/signup'), 2000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Email verification failed. Please try again from the signup page.');
    }
  };

  const handleManualVerify = async (e) => {
    e.preventDefault();
    if (!inputEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    window.localStorage.setItem('emailForSignIn', inputEmail);
    setEmail(inputEmail);
    await completeVerification(inputEmail, window.location.href);
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
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="glass" style={{ padding: '40px 32px', textAlign: 'center' }}>

          {status === 'verifying' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
              <h1 style={{ fontFamily: 'var(--cinzel)', fontSize: 22, color: 'var(--white)', marginBottom: 12 }}>
                Verifying Your Email...
              </h1>
              <p style={{ color: 'var(--dim)', fontSize: 14 }}>
                Please wait while we verify your email address.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h1 style={{ fontFamily: 'var(--cinzel)', fontSize: 22, color: '#4ade80', marginBottom: 12 }}>
                Email Verified!
              </h1>
              <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 8 }}>
                <strong style={{ color: 'var(--white)' }}>{email}</strong> has been successfully verified.
              </p>
              <p style={{ color: 'var(--dim)', fontSize: 13 }}>
                Redirecting you back to the registration page...
              </p>
            </>
          )}

          {status === 'needs-email' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
              <h1 style={{ fontFamily: 'var(--cinzel)', fontSize: 22, color: 'var(--white)', marginBottom: 12 }}>
                Confirm Your Email
              </h1>
              <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 20 }}>
                For security, please enter the same email address the OTP link was sent to.
              </p>
              {errorMsg && (
                <div className="msg bad" style={{ marginBottom: 16, fontSize: 13 }}>{errorMsg}</div>
              )}
              <form onSubmit={handleManualVerify}>
                <input
                  type="email"
                  required
                  value={inputEmail}
                  onChange={(e) => { setInputEmail(e.target.value); setErrorMsg(''); }}
                  placeholder="Enter your email address"
                  style={{ marginBottom: 12 }}
                />
                <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }}>
                  Verify Email
                </button>
              </form>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
              <h1 style={{ fontFamily: 'var(--cinzel)', fontSize: 22, color: '#f87171', marginBottom: 12 }}>
                Verification Failed
              </h1>
              <p style={{ color: 'var(--dim)', fontSize: 14, marginBottom: 20 }}>
                {errorMsg}
              </p>
              <Link to="/signup" className="btn-primary" style={{ display: 'inline-block', padding: '12px 24px', textDecoration: 'none' }}>
                Back to Sign Up
              </Link>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
