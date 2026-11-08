import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import PublicSite from './pages/PublicSite.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Legal from './pages/Legal.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import VerifyEmailOtp from './pages/VerifyEmailOtp.jsx';
export default function App() {
  return <Routes>
    <Route path="/" element={<PublicSite />} />
    <Route path="/login" element={<Auth mode="login" />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/verify-email-otp" element={<VerifyEmailOtp />} />
    <Route path="/signup" element={<Auth mode="signup" />} />
    {/* Secret seller dashboard — not linked anywhere public */}
    <Route path="/rk-seller-9x4mz/*" element={<Dashboard />} />
    <Route path="/privacy" element={<Legal kind="privacy" />} />
    <Route path="/terms" element={<Legal kind="terms" />} />
    <Route path="/data-deletion" element={<Legal kind="deletion" />} />
    <Route path="*" element={<div style={{ padding: 80 }}><h1>Page not found</h1><p><Link to="/">Back to RK home</Link></p></div>} />
  </Routes>;
}
