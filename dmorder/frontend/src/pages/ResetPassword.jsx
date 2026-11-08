import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  if (!token) {
    return (
      <div style={{ padding: 48, maxWidth: 520, margin: '0 auto' }}>
        <h1>Password reset</h1>
        <p style={{ color: 'var(--dim)' }}>No reset token in this link. Use the forgot-password link from your email, or ask for a new one.</p>
        <p><Link to="/login">Back to login</Link></p>
      </div>
    );
  }

  return (
    <div style={{ padding: 48, maxWidth: 520, margin: '0 auto' }}>
      <h1>Set a new password</h1>
      <form className="glass" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
          setMsg(r.message || 'Password changed.');
          setTimeout(() => nav('/login'), 1500);
        } catch (er) { setMsg('Error: ' + er.message); }
      }}>
        <label>New password (at least 8 characters)</label>
        <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="pill" style={{ marginTop: 14 }}>Change password</button>
        {msg && <div className="msg ok" style={{ marginTop: 14 }}>{msg}</div>}
      </form>
    </div>
  );
}
