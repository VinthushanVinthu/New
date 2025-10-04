import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import "../styles/ownerdashboard.css";   // Import the CSS file

export default function OwnerDashboard() {
  const [shops, setShops] = useState([]);

  useEffect(() => {
    api.get('/shop/my').then(r => setShops(r.data));
  }, []);

  return (
    <>
      {/* KPI Section */}
      <div className="kpi">
        <div className="card"><h3>Revenue</h3><h2>₹ 0</h2></div>
        <div className="card"><h3>Today Bills</h3><h2>0</h2></div>
        <div className="card"><h3>Low Stock Alerts</h3><h2>0</h2></div>
      </div>

      {/* My Shops Section */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3>My Shops</h3>

        {shops.length === 0 ? (
          <p style={{ textAlign: 'center', marginTop: 16 }}>No shops created yet.</p>
        ) : (
          <div className="shop-card-container">
            {shops.map(s => (
              <div key={s.shop_id} className="shop-card">
                <h2>{s.shop_name}</h2>
                <p><b>ID:</b> {s.shop_id}</p>
                <p><b>Secret Code:</b> {s.secret_code}</p>
                {s.address_line && (
                  <p>
                    <b>Address:</b> {s.address_line}, {s.city}, {s.state} {s.postal_code}, {s.country}
                  </p>
                )}
                <p><b>Tax %:</b> {s.tax_percentage}</p>
                <p><b>Created:</b> {new Date(s.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
