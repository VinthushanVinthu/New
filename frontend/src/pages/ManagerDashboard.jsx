// src/pages/ManagerDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/manager.css';

export default function ManagerDashboard() {
  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [err, setErr] = useState('');

  const [kpis, setKpis] = useState({ todaySales: 0, billsToday: 0, taxesToday: 0, avgBill: 0, purchaseToday: 0, purchase30d: 0, salesToday: 0 });
  const [paymentMix, setPaymentMix] = useState({ Cash: 0, Card: 0, UPI: 0, total: 0 });
  const [recentBills, setRecentBills] = useState([]);
  const [pendingBills, setPendingBills] = useState([]);
  const [topSelling, setTopSelling] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [zeroSales, setZeroSales] = useState([]);
  const [series, setSeries] = useState([]);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);

  useEffect(() => {
    async function fetchShopDetails() {
      setErr('');
      setLoadingShop(true);
      try {
        const { data } = await api.get('/shop/my-shop');
        setShop(data || null);
      } catch (e1) {
        try {
          const r = await api.get('/shop/my');
          const s = Array.isArray(r.data) ? r.data[0] : null;
          setShop(s || null);
        } catch (e2) {
          setErr(e2?.response?.data?.message || 'Failed to fetch shop details.');
        }
      } finally {
        setLoadingShop(false);
      }
    }
    fetchShopDetails();
  }, []);

  useEffect(() => {
    if (!shop?.shop_id) return;

    async function fetchOverview() {
      setLoadingOverview(true);
      try {
        const { data } = await api.get('/manager/overview', { params: { shop_id: shop.shop_id } });
        setKpis(data?.kpis || { todaySales: 0, billsToday: 0, taxesToday: 0, avgBill: 0, purchaseToday: 0, purchase30d: 0, salesToday: 0 });
        setPaymentMix(data?.paymentMixToday || { Cash: 0, Card: 0, UPI: 0, total: 0 });
        setRecentBills(data?.recentBills || []);
        setPendingBills(data?.pendingBills || []);
        setTopSelling(data?.topSelling14d || []);
        setLowStock(data?.lowStock || []);
        setZeroSales(data?.zeroSales30d || []);
      } catch (e) {
        setErr(e?.response?.data?.message || 'Failed to load overview.');
      } finally {
        setLoadingOverview(false);
      }
    }

    async function fetchSeries() {
      setLoadingSeries(true);
      try {
        const { data } = await api.get('/manager/daily-series', { params: { shop_id: shop.shop_id, days: 14 } });
        setSeries(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      } finally {
        setLoadingSeries(false);
      }
    }

    fetchOverview();
    fetchSeries();
  }, [shop?.shop_id]);

  const payPct = useMemo(() => {
    const total = Number(paymentMix?.total || 0) || 1;
    return {
      Cash: Math.round(((paymentMix.Cash || 0) / total) * 100),
      Card: Math.round(((paymentMix.Card || 0) / total) * 100),
      UPI: Math.round(((paymentMix.UPI || 0) / total) * 100),
    };
  }, [paymentMix]);

  return (
    <>
      {/* KPI row */}
      <div className="kpi">
        <div className="card kpi__card">
          <h3>Today Sales</h3>
          <h2>{loadingOverview ? '—' : `₹ ${Number(kpis.todaySales || 0).toLocaleString()}`}</h2>
        </div>
        <div className="card kpi__card">
          <h3>Purchases Today</h3>
          <h2>{loadingOverview ? '—' : `₹ ${Number(kpis.purchaseToday || 0).toLocaleString()}`}</h2>
          <p className="muted">30d: ₹ {Number(kpis.purchase30d || 0).toLocaleString()}</p>
        </div>
        <div className="card kpi__card">
          <h3>Bills Today</h3>
          <h2>{loadingOverview ? '—' : Number(kpis.billsToday || 0)}</h2>
        </div>
        <div className="card kpi__card">
          <h3>Taxes Today</h3>
          <h2>{loadingOverview ? '—' : `₹ ${Number(kpis.taxesToday || 0).toLocaleString()}`}</h2>
        </div>
        <div className="card kpi__card">
          <h3>Avg Bill Value</h3>
          <h2>{loadingOverview ? '—' : `₹ ${Number(kpis.avgBill || 0).toLocaleString()}`}</h2>
        </div>
      </div>

      {/* Payment mix + Trend */}
      <div className="two-col">
        <div className="card">
          <div className="section-header">
            <h3>Payment Mix (Today)</h3>
            <div className="muted">Total: ₹ {Number(paymentMix.total || 0).toLocaleString()}</div>
          </div>
          {loadingOverview ? <p className="muted">Loading…</p> : (
            <div className="payment-bars">
              <div className="payment-row">
                <span>Cash</span>
                <div className="bar"><div className="bar__fill" style={{ width: `${payPct.Cash}%` }} /></div>
                <span className="mono">₹ {Number(paymentMix.Cash || 0).toLocaleString()}</span>
              </div>
              <div className="payment-row">
                <span>Card</span>
                <div className="bar"><div className="bar__fill" style={{ width: `${payPct.Card}%` }} /></div>
                <span className="mono">₹ {Number(paymentMix.Card || 0).toLocaleString()}</span>
              </div>
              <div className="payment-row">
                <span>UPI</span>
                <div className="bar"><div className="bar__fill" style={{ width: `${payPct.UPI}%` }} /></div>
                <span className="mono">₹ {Number(paymentMix.UPI || 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-header">
            <h3>14-Day Trend</h3>
          </div>
          {loadingSeries ? <p className="muted">Loading…</p> : (
            <div className="trend">
              {series.map((d) => {
                const rev = Number(d.revenue || 0);
                const bills = Number(d.bills || 0);
                const height = Math.min(100, Math.round((rev / (series.reduce((m, s) => Math.max(m, s.revenue), 1) || 1)) * 100));
                return (
                  <div key={d.day} className="trend__col" title={`${d.day}\n₹ ${rev.toLocaleString()} • ${bills} bills`}>
                    <div className="trend__bar" style={{ height: `${height}%` }} />
                    <div className="trend__label">{d.day.slice(5).replace('-', '/')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent & Pending */}
      <div className="two-col">
        <div className="card">
          <div className="section-header"><h3>Recent Bills</h3></div>
          {loadingOverview ? <p className="muted">Loading…</p> : (
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
                {recentBills.length === 0 && <tr><td colSpan={5} className="muted">No bills</td></tr>}
                {recentBills.map(b => (
                  <tr key={b.bill_id}>
                    <td className="mono">{b.bill_number || `#${b.bill_id}`}</td>
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

        <div className="card">
          <div className="section-header"><h3>Needs Attention (Unpaid/Partial)</h3></div>
          {loadingOverview ? <p className="muted">Loading…</p> : (
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
                {pendingBills.length === 0 && <tr><td colSpan={5} className="muted">All clear 🎉</td></tr>}
                {pendingBills.map(b => (
                  <tr key={b.bill_id}>
                    <td className="mono">{b.bill_number || `#${b.bill_id}`}</td>
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
      </div>

      {/* Top-selling & Low stock */}
      <div className="two-col">
        <div className="card">
          <div className="section-header"><h3>Top-Selling Sarees (14d)</h3></div>
          {loadingOverview ? <p className="muted">Loading…</p> : (
            <table className="table">
              <thead>
                <tr>
                  <th>Saree</th>
                  <th>Qty</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {topSelling.length === 0 && <tr><td colSpan={3} className="muted">No sales yet</td></tr>}
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
          <div className="section-header"><h3>Low Stock (≤ 5) + Suggestion</h3></div>
          {loadingOverview ? <p className="muted">Loading…</p> : (
            <table className="table">
              <thead>
                <tr>
                  <th>Saree</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Suggested Re-Order</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.length === 0 && <tr><td colSpan={4} className="muted">No low stock items 🎉</td></tr>}
                {lowStock.map(i => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td className={i.stock_quantity <= 2 ? 'danger' : ''}>{i.stock_quantity}</td>
                    <td>₹ {Number(i.price).toLocaleString()}</td>
                    <td className="mono">{i.suggested_reorder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Zero-sales */}
      <div className="card">
        <div className="section-header"><h3>Zero-Sales (30d) — Consider Promotions</h3></div>
        {loadingOverview ? <p className="muted">Loading…</p> : (
          <table className="table">
            <thead>
              <tr>
                <th>Saree</th>
                <th>Stock</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {zeroSales.length === 0 && <tr><td colSpan={3} className="muted">Great—everything moved at least once.</td></tr>}
              {zeroSales.map(z => (
                <tr key={z.id}>
                  <td>{z.name}</td>
                  <td>{z.stock_quantity}</td>
                  <td>₹ {Number(z.price).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
