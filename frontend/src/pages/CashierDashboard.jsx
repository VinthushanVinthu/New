// src/pages/CashierDashboard.jsx
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/cashier.css';

export default function CashierDashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [summary, setSummary] = useState({
    today: { totalCollected: 0, bills: 0, customersServed: 0, avgBill: 0 },
    month: { totalCollected: 0, bills: 0, customersServed: 0, avgBill: 0 },
    year:  { totalCollected: 0, bills: 0, customersServed: 0, avgBill: 0 }
  });

  const [paymentMixToday, setPaymentMixToday] = useState([]);
  const [recentBills, setRecentBills] = useState([]);
  const [topItems30d, setTopItems30d] = useState([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);

    api.get('/cashier/dashboard') // add { params: { shop_id: X } } if you want filter
      .then(r => {
        if (!mounted) return;
        const d = r.data || {};
        setSummary(d.summary || {});
        setPaymentMixToday(d.paymentMixToday || []);
        setRecentBills(d.recentBills || []);
        setTopItems30d(d.topItems30d || []);
      })
      .catch(e => {
        if (!mounted) return;
        setErr(e?.response?.data?.message || 'Failed to load dashboard');
      })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, []);

  const fmtMoney = (n) => `₹ ${Number(n || 0).toLocaleString()}`;

  return (
    <>
      <h1 className="page-title">Cashier Dashboard</h1>
      {err && <div className="card error-card">{err}</div>}

      {/* KPI Row */}
      <div className="kpi">
        <div className="card kpi__card">
          <h3>Today — Collected</h3>
          <h2>{loading ? '—' : fmtMoney(summary?.today?.totalCollected)}</h2>
          <div className="mini">
            Bills: <b>{summary?.today?.bills || 0}</b> · Customers: <b>{summary?.today?.customersServed || 0}</b> · Avg Bill: <b>{fmtMoney(summary?.today?.avgBill || 0)}</b>
          </div>
        </div>
        <div className="card kpi__card">
          <h3>This Month — Collected</h3>
          <h2>{loading ? '—' : fmtMoney(summary?.month?.totalCollected)}</h2>
          <div className="mini">
            Bills: <b>{summary?.month?.bills || 0}</b> · Customers: <b>{summary?.month?.customersServed || 0}</b> · Avg Bill: <b>{fmtMoney(summary?.month?.avgBill || 0)}</b>
          </div>
        </div>
        <div className="card kpi__card">
          <h3>This Year — Collected</h3>
          <h2>{loading ? '—' : fmtMoney(summary?.year?.totalCollected)}</h2>
          <div className="mini">
            Bills: <b>{summary?.year?.bills || 0}</b> · Customers: <b>{summary?.year?.customersServed || 0}</b> · Avg Bill: <b>{fmtMoney(summary?.year?.avgBill || 0)}</b>
          </div>
        </div>
      </div>

      {/* Payment Mix + Recent Bills */}
      <div className="two-col">
        <div className="card">
          <div className="section-header">
            <h3>Payment Mix (Today)</h3>
          </div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentMixToday.length === 0 && (
                  <tr><td colSpan={2} className="muted">No payments yet</td></tr>
                )}
                {paymentMixToday.map((m) => (
                  <tr key={m.method}>
                    <td>{m.method}</td>
                    <td>{fmtMoney(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="section-header">
            <h3>Recent Bills (You)</h3>
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
                    <td>{fmtMoney(b.total_amount)}</td>
                    <td>{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top items you sold */}
      <div className="card">
        <div className="section-header">
          <h3>Your Top Items (Last 30 days)</h3>
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
              {topItems30d.length === 0 && (
                <tr><td colSpan={3} className="muted">No sales yet</td></tr>
              )}
              {topItems30d.map(i => (
                <tr key={i.saree_id}>
                  <td>{i.name}</td>
                  <td>{i.total_qty}</td>
                  <td>{fmtMoney(i.sales_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
