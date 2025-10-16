// src/pages/ManagerDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import '../styles/manager.css';

export default function ManagerDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
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
  const [editRequests, setEditRequests] = useState([]);
  const [loadingEditRequests, setLoadingEditRequests] = useState(false);
  const [editReqErr, setEditReqErr] = useState('');
  const [actingRequestId, setActingRequestId] = useState(null);
  const [actingRequestAction, setActingRequestAction] = useState('');
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);

  async function fetchEditRequests(shopIdParam) {
    const targetShopId = shopIdParam ?? shop?.shop_id;
    if (!targetShopId) {
      setEditRequests([]);
      return;
    }
    setEditReqErr('');
    setLoadingEditRequests(true);
    try {
      const { data } = await api.get('/billing/edit-requests', {
        params: { shop_id: targetShopId, status: 'PENDING' }
      });
      setEditRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      setEditRequests([]);
      setEditReqErr(e?.response?.data?.message || 'Failed to load edit requests.');
    } finally {
      setLoadingEditRequests(false);
    }
  }

  async function handleEditRequest(requestId, action) {
    if (!requestId) return;
    try {
      setActingRequestId(requestId);
      setActingRequestAction(action);
      await api.post(`/billing/edit-requests/${requestId}/${action}`);
      await fetchEditRequests();
    } catch (e) {
      const verb = action === 'approve' ? 'approve' : 'reject';
      alert(e?.response?.data?.message || `Failed to ${verb} the request.`);
    } finally {
      setActingRequestId(null);
      setActingRequestAction('');
    }
  }

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
    fetchEditRequests(shop.shop_id);
  }, [shop?.shop_id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpen = params.get('requests') === 'open';
    setRequestsModalOpen(shouldOpen);
  }, [location.search]);

  useEffect(() => {
    if (requestsModalOpen && shop?.shop_id) {
      fetchEditRequests(shop.shop_id);
    }
  }, [requestsModalOpen, shop?.shop_id]);

  const closeRequestsModal = () => {
    const params = new URLSearchParams(location.search);
    params.delete('requests');
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
    setRequestsModalOpen(false);
  };

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
      {requestsModalOpen && (
        <div className="manager-modal-backdrop" role="dialog" aria-modal="true" aria-label="Pending edit requests">
          <div className="manager-modal">
            <div className="manager-modal__header">
              <h3>Pending Edit Requests</h3>
              <button type="button" className="manager-modal__close" onClick={closeRequestsModal}>×</button>
            </div>
            <div className="manager-modal__body">
              {loadingEditRequests ? (
                <div className="manager-modal__empty">Loading…</div>
              ) : editReqErr ? (
                <div className="manager-modal__empty manager-modal__empty--error">{editReqErr}</div>
              ) : editRequests.length === 0 ? (
                <div className="manager-modal__empty">No pending requests.</div>
              ) : (
                <ul className="manager-request-list">
                  {editRequests.map(req => {
                    const approving = actingRequestId === req.request_id && actingRequestAction === 'approve';
                    const rejecting = actingRequestId === req.request_id && actingRequestAction === 'reject';
                    return (
                      <li key={req.request_id} className="manager-request-card">
                        <div className="manager-request-card__top">
                          <div>
                            <div className="manager-request-card__bill">{req.bill_number || `#${req.bill_id}`}</div>
                            <div className="manager-request-card__meta">
                              <span>{req.cashier_name || 'Cashier'}</span>
                              <span>•</span>
                              <span>{req.customer_name || 'Walk-in'}</span>
                              <span>•</span>
                              <span>₹ {Number(req.total_amount || 0).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="manager-request-card__time">
                            {req.requested_at ? new Date(req.requested_at).toLocaleString() : ''}
                          </div>
                        </div>
                        <div className="manager-request-card__reason">
                          {req.request_reason || 'No reason provided.'}
                        </div>
                        <div className="manager-request-card__summary">
                          <span>Subtotal: ₹ {Number(req.subtotal || 0).toLocaleString()}</span>
                          <span>Discount: ₹ {Number(req.discount || 0).toLocaleString()}</span>
                          <span>Tax: ₹ {Number(req.tax || 0).toLocaleString()}</span>
                        </div>
                        <div className="manager-request-card__actions">
                          <button
                            className="manager-btn manager-btn--approve"
                            onClick={() => handleEditRequest(req.request_id, 'approve')}
                            disabled={actingRequestId === req.request_id}
                          >
                            {approving ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            className="manager-btn manager-btn--reject"
                            onClick={() => handleEditRequest(req.request_id, 'reject')}
                            disabled={actingRequestId === req.request_id}
                          >
                            {rejecting ? 'Rejecting…' : 'Reject'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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

      <div className="card">
        <div className="section-header"><h3>Pending Edit Requests</h3></div>
        {loadingEditRequests ? (
          <p className="muted">Loading…</p>
        ) : editReqErr ? (
          <p className="muted">{editReqErr}</p>
        ) : editRequests.length === 0 ? (
          <p className="muted">No pending edit approvals.</p>
        ) : (
          <table className="table">
              <thead>
                <tr>
                  <th>#Bill</th>
                  <th>Cashier</th>
                  <th>Reason</th>
                  <th>Customer</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
            <tbody>
              {editRequests.map(req => {
                const approving = actingRequestId === req.request_id && actingRequestAction === 'approve';
                const rejecting = actingRequestId === req.request_id && actingRequestAction === 'reject';
                return (
                  <tr key={req.request_id}>
                    <td className="mono">{req.bill_number || `#${req.bill_id}`}</td>
                    <td>{req.cashier_name}</td>
                    <td className="muted">{req.request_reason || '—'}</td>
                    <td>{req.customer_name || 'Walk-in'}</td>
                    <td>{req.requested_at ? new Date(req.requested_at).toLocaleString() : '-'}</td>
                    <td>
                      <div className="manager-actions">
                        <button
                          className="manager-btn manager-btn--approve"
                          onClick={() => handleEditRequest(req.request_id, 'approve')}
                          disabled={actingRequestId === req.request_id}
                        >
                          {approving ? 'Approving…' : 'Approve'}
                        </button>
                        <button
                          className="manager-btn manager-btn--reject"
                          onClick={() => handleEditRequest(req.request_id, 'reject')}
                          disabled={actingRequestId === req.request_id}
                        >
                          {rejecting ? 'Rejecting…' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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
