// src/pages/Register.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/register.css';

export default function Register() {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Owner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopCode, setShopCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const auth = useAuth();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = {
        name,
        email,
        password,
        role,
        shop_code: role === 'Owner' ? undefined : shopCode
      };
      const { data } = await api.post('/auth/register', body);

      // Save to auth so DashboardLayout reacts
      auth.login({ token: data.token, user: data.user });

      const { role: r, status } = data.user;

      if (r === 'Owner') {
        // New owner goes to create-shop (no sidebar)
        nav('/create-shop');
      } else if (r === 'Manager') {
        nav('/manager');
      } else {
        nav('/cashier');
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card register-card">
      <h2>Register</h2>

      <form onSubmit={submit} className="register-form">
        <div className="grid-2">
          <div className="form-field">
            <label>Full name</label>
            <input
              className="form-input"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Role</label>
            <select
              className="form-input"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option>Owner</option>
              <option>Manager</option>
              <option>Cashier</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <label>Email</label>
          <input
            className="form-input"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="form-field">
          <label>Password</label>
          <input
            className="form-input"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {role !== 'Owner' && (
          <div className="form-field">
            <label>Shop Secret Code (6-digits)</label>
            <input
              className="form-input"
              placeholder="Enter shop code provided by Owner"
              value={shopCode}
              onChange={e => setShopCode(e.target.value)}
              required
            />
          </div>
        )}

        {err && <div className="error-msg">{err}</div>}

        <div className="actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </form>

      <p className="register-footer muted">
        Have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
