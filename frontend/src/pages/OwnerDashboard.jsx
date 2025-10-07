// src/pages/OwnerDashboard.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import "../styles/ownerdashboard.css"; // updated styles below

export default function OwnerDashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [summary, setSummary] = useState({
    today: { revenue: 0, bills: 0, taxes: 0 },
    month: { revenue: 0, bills: 0, taxes: 0 },
    year:  { revenue: 0, bills: 0, taxes: 0 },
    lowStockCount: 0
  });

  const [recentCustomers, setRecentCustomers] = useState([]);
  const [recentBills, setRecentBills] = useState([]);
  const [topSelling, setTopSelling] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  // If you want single-shop filtering, add a local state + query param: ?shop_id=1
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);

    api.get('/owner/dashboard') // or api.get('/owner/dashboard', { params: { shop_id: 1 } })
      .then(r => {
        if (!mounted) return;
        const d = r.data || {};
        setSummary(d.summary || {});
        setRecentCustomers(d.recentCustomers || []);
        setRecentBills(d.recentBills || []);
        setTopSelling(d.topSelling || []);
        setLowStock(d.lowStock || []);
      })
      .catch(e => {
        if (!mounted) return;
        setErr(e?.response?.data?.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  return (
    <div className="owner-dashboard">
      <h1 className="page-title">Owner Dashboard</h1>

      {err && <div className="card error-card">{err}</div>}

      {/* KPI GRID */}
      <section className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-card__header">
            <span className="kpi-label">Today</span>
          </div>
          <div className="kpi-card__row">
            <span>Revenue</span>
            <strong>₹ {Number(summary?.today?.revenue || 0).toLocaleString()}</strong>
          </div>
          <div className="kpi-card__row">
            <span>Bills</span>
            <strong>{summary?.today?.bills || 0}</strong>
          </div>
          <div className="kpi-card__row">
            <span>Taxes</span>
            <strong>₹ {Number(summary?.today?.taxes || 0).toLocaleString()}</strong>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-card__header">
            <span className="kpi-label">This Month</span>
          </div>
          <div className="kpi-card__row">
            <span>Revenue</span>
            <strong>₹ {Number(summary?.month?.revenue || 0).toLocaleString()}</strong>
          </div>
          <div className="kpi-card__row">
            <span>Bills</span>
            <strong>{summary?.month?.bills || 0}</strong>
          </div>
          <div className="kpi-card__row">
            <span>Taxes</span>
            <strong>₹ {Number(summary?.month?.taxes || 0).toLocaleString()}</strong>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-card__header">
            <span className="kpi-label">This Year</span>
          </div>
          <div className="kpi-card__row">
            <span>Revenue</span>
            <strong>₹ {Number(summary?.year?.revenue || 0).toLocaleString()}</strong>
          </div>
          <div className="kpi-card__row">
            <span>Bills</span>
            <strong>{summary?.year?.bills || 0}</strong>
          </div>
          <div className="kpi-card__row">
            <span>Taxes</span>
            <strong>₹ {Number(summary?.year?.taxes || 0).toLocaleString()}</strong>
          </div>
        </div>

        <div className="card kpi-card kpi-card--accent">
          <div className="kpi-card__header">
            <span className="kpi-label">Low Stock Alerts</span>
          </div>
          <div className="kpi-card__big">
            {summary?.lowStockCount || 0}
          </div>
        </div>
      </section>

      {/* ROW: RECENT CUSTOMERS + RECENT BILLS */}
      <section className="two-col">
        <div className="card">
          <div className="section-header">
            <h3>Recent Customers</h3>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentCustomers.length === 0 && (
                  <tr><td colSpan={4} className="muted">No customers found</td></tr>
                )}
                {recentCustomers.map(c => (
                  <tr key={c.customer_id}>
                    <td>{c.name || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{new Date(c.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="section-header">
            <h3>Recent Bills</h3>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#Bill</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentBills.length === 0 && (
                  <tr><td colSpan={5} className="muted">No bills found</td></tr>
                )}
                {recentBills.map(b => (
                  <tr key={b.bill_id}>
                    <td className="mono">#{b.bill_id}</td>
                    <td>{b.customer_name}</td>
                    <td><span className={`badge badge--${(b.status || 'UNPAID').toLowerCase()}`}>{b.status}</span></td>
                    <td>₹ {Number(b.total_amount).toLocaleString()}</td>
                    <td>{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ROW: TOP SELLING + LOW STOCK */}
      <section className="two-col">
        <div className="card">
          <div className="section-header">
            <h3>Top-Selling Sarees (30 days)</h3>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Saree</th>
                  <th>Sold Qty</th>
                  <th>Sales Amount</th>
                </tr>
              </thead>
              <tbody>
                {topSelling.length === 0 && (
                  <tr><td colSpan={3} className="muted">No sales yet</td></tr>
                )}
                {topSelling.map(s => (
                  <tr key={s.saree_id}>
                    <td>{s.name}</td>
                    <td>{s.total_qty}</td>
                    <td>₹ {Number(s.sales_amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="section-header">
            <h3>Low-Stock Sarees (≤ 5)</h3>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Saree</th>
                  <th>Stock</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.length === 0 && (
                  <tr><td colSpan={3} className="muted">No low-stock items 🎉</td></tr>
                )}
                {lowStock.map(i => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td className={i.stock_quantity <= 2 ? 'danger' : ''}>{i.stock_quantity}</td>
                    <td>₹ {Number(i.price).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
