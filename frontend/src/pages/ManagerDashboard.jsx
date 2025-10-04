import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function ManagerDashboard() {
  const [shop, setShop] = useState(null);

  useEffect(() => {
    async function fetchShopDetails() {
      try {
        const { data } = await api.get('/shop/my-shop'); // 👈 make sure this endpoint returns the manager's shop info
        setShop(data);
      } catch (err) {
        console.error('Failed to fetch shop details:', err);
      }
    }
    fetchShopDetails();
  }, []);

  return (
    <>
      {shop && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>{shop.shop_name}</h2>
          {shop.address_line && (
            <p>
              <b>Address:</b> {shop.address_line}, {shop.city}, {shop.state} {shop.postal_code}, {shop.country}
            </p>
          )}
          <p><b>Tax %:</b> {shop.tax_percentage}</p>
          <p><b>Secret Code:</b> {shop.secret_code}</p>
        </div>
      )}

      <div className="kpi">
        <div className="card">
          <h3>Daily Sales</h3>
          <h2>₹ 0</h2>
        </div>
        <div className="card">
          <h3>Bills Today</h3>
          <h2>0</h2>
        </div>
        <div className="card">
          <h3>Stock Alerts</h3>
          <h2>0</h2>
        </div>
      </div>

      <div className="card">
        <h3>Actions</h3>
        <div className="flex">
          <Link className="button" to="/inventory">Manage Inventory</Link>
          <Link className="button" to="/billing">Create Bill</Link>
        </div>
      </div>
    </>
  );
}
