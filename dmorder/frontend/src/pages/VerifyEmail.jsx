import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [msg, setMsg] = useState('Verifying…');

  useEffect(() => {
    if (!token) { setMsg('No verification token in this link.'); return; }
    api('/api/auth/verify-email', { method: 'POST', body: { token } })
      .then((r) => setMsg(r.message || 'Email verified.'))
      .catch((er) => setMsg('Error: ' + er.message));
  }, [token]);

  return (
    <div style={{ padding: 48, maxWidth: 520, margin: '0 auto' }}>
      <h1>Email verification</h1>
      <p style={{ color: 'var(--dim)' }}>{msg}</p>
      <p><Link to="/login">Go to login</Link></p>
    </div>
  );
}
