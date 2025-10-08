// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const auth = useAuth();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      auth.login({ token: data.token, user: data.user });

      if (data.user.role === 'Owner') nav('/owner');
      else if (data.user.role === 'Manager') nav('/manager');
      else nav('/cashier');
    } catch (e) {
      setErr(e?.response?.data?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-title">Login</h2>

        <form onSubmit={submit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="auth-email" className="auth-label">Email</label>
            <input
              id="auth-email"
              className="auth-input"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password" className="auth-label">Password</label>
            <input
              id="auth-password"
              className="auth-input"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {err && <div className="auth-error">{err}</div>}

          <div className="auth-actions">
            <button className="auth-btn" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Login'}
            </button>

            <Link to="/forgot" className="auth-link auth-text--sm">
              Forgot Password?
            </Link>
          </div>
        </form>

        <p className="auth-footer">
          New here? <Link className="auth-link" to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
