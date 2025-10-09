// src/pages/CreateShop.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/create-shop.css';

export default function CreateShop() {
  const [form, setForm] = useState({
    shop_name: '',
    address_line: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    tax_percentage: ''
  });
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();
  const auth = useAuth();
  const user = auth.user || getUser();

  useEffect(() => {
    // Only Owners can be here (and typically status === 'new')
    if (!user || user.role !== 'Owner') nav('/');
  }, [user, nav]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        tax_percentage: form.tax_percentage ? parseFloat(form.tax_percentage) : 0.0
      };
      const { data } = await api.post('/shop/create', payload);
      setResult(data);

      // After shop creation, flip status to 'joined' so sidebar appears
      const existingToken =
        auth.token || localStorage.getItem('token'); // use your token source
      const currentUser = auth.user || getUser();

      if (currentUser) {
        const updatedUser = { ...currentUser, status: 'joined' };
        auth.login({ token: existingToken, user: updatedUser });
      }

      // Go to owner dashboard
      nav('/owner');
    } catch (err) {
      setResult(null);
      setError(err?.response?.data?.message || 'Failed to create shop.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card create-shop-card">
      <h2>Create Shop</h2>

      <form onSubmit={submit} className="shop-form">
        <div className="grid-2">
          <div className="form-field">
            <label>Shop Name *</label>
            <input
              className="form-input"
              name="shop_name"
              placeholder="Shop name"
              value={form.shop_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label>Tax Percentage (%)</label>
            <input
              className="form-input"
              name="tax_percentage"
              type="number"
              step="0.01"
              placeholder="e.g., 8"
              value={form.tax_percentage}
              onChange={handleChange}
              min="0"
            />
          </div>

          <div className="form-field">
            <label>Address Line</label>
            <input
              className="form-input"
              name="address_line"
              placeholder="Address line"
              value={form.address_line}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>City</label>
            <input
              className="form-input"
              name="city"
              placeholder="City"
              value={form.city}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>State</label>
            <input
              className="form-input"
              name="state"
              placeholder="State"
              value={form.state}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Postal Code</label>
            <input
              className="form-input"
              name="postal_code"
              placeholder="Postal code"
              value={form.postal_code}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Country</label>
            <input
              className="form-input"
              name="country"
              placeholder="Country"
              value={form.country}
              onChange={handleChange}
            />
          </div>
        </div>

        {error && <div className="error-msg" style={{ marginTop: 6 }}>{error}</div>}

        <div className="actions">
          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>

      {result && (
        <div className="card result-card">
          <h3>Shop Created</h3>
          <div className="result-rows">
            <div className="row">
              <span className="label">Shop</span>
              <span className="value">{result.shop_name}</span>
            </div>
            <div className="row">
              <span className="label">Secret Code</span>
              <span className="value mono">{result.secret_code}</span>
            </div>
            {result.address_line && (
              <div className="row">
                <span className="label">Address</span>
                <span className="value">
                  {result.address_line}{result.city ? `, ${result.city}` : ''}{result.state ? `, ${result.state}` : ''}
                  {result.postal_code ? ` ${result.postal_code}` : ''}{result.country ? `, ${result.country}` : ''}
                </span>
              </div>
            )}
            {result.tax_percentage !== undefined && (
              <div className="row">
                <span className="label">Tax %</span>
                <span className="value">{result.tax_percentage}</span>
              </div>
            )}
          </div>

          <div className="actions">
            <button className="btn btn--secondary" onClick={() => nav('/owner')}>
              Go to Owner Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
