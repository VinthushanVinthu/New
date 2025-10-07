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
    <div className="login-page">
      <div className="login-card">
        <h2 className="login-title">Login</h2>

        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="login-email" className="login-label">Email</label>
            <input
              id="login-email"
              className="login-input"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-label">Password</label>
            <input
              id="login-password"
              className="login-input"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {err && <div className="login-error">{err}</div>}

          <div className="login-actions">
            <button className="login-btn" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Login'}
            </button>

            <Link to="/forgot" className="login-link small-text">
              Forgot Password?
            </Link>
          </div>
        </form>

        <p className="login-footer">
          New here? <Link className="login-link" to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
