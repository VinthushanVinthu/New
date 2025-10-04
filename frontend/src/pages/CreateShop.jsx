import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api.js';

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
  const nav = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!user || user.role !== 'Owner') nav('/');
  }, [user, nav]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      tax_percentage: form.tax_percentage ? parseFloat(form.tax_percentage) : 0.0
    };
    const { data } = await api.post('/shop/create', payload);
    setResult(data);
  }

  return (
    <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2>Create Shop</h2>
      <form onSubmit={submit}>
        <input
          className="input"
          name="shop_name"
          placeholder="Shop name"
          value={form.shop_name}
          onChange={handleChange}
          required
        />
        <input
          className="input"
          name="address_line"
          placeholder="Address line"
          value={form.address_line}
          onChange={handleChange}
        />
        <input
          className="input"
          name="city"
          placeholder="City"
          value={form.city}
          onChange={handleChange}
        />
        <input
          className="input"
          name="state"
          placeholder="State"
          value={form.state}
          onChange={handleChange}
        />
        <input
          className="input"
          name="postal_code"
          placeholder="Postal code"
          value={form.postal_code}
          onChange={handleChange}
        />
        <input
          className="input"
          name="country"
          placeholder="Country"
          value={form.country}
          onChange={handleChange}
        />
        <input
          className="input"
          name="tax_percentage"
          type="number"
          step="0.01"
          placeholder="Tax Percentage (%)"
          value={form.tax_percentage}
          onChange={handleChange}
        />
        <br />
        <button className="button" type="submit">Create</button>
      </form>

      {result && (
        <div className="card" style={{ marginTop: 16 }}>
          <p><b>Shop:</b> {result.shop_name}</p>
          <p><b>Secret Code:</b> {result.secret_code}</p>
          {result.address_line && <p><b>Address:</b> {result.address_line}, {result.city}, {result.state}</p>}
          {result.tax_percentage !== undefined && <p><b>Tax %:</b> {result.tax_percentage}</p>}
          <button className="button" onClick={() => nav('/owner')}>Go to Owner Dashboard</button>
        </div>
      )}
    </div>
  );
}
