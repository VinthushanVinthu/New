import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import '../styles/sidebar.css';

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(false);
  const [shopErr, setShopErr] = useState('');

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoadingShop(true);
    setShopErr('');

    async function fetchShop() {
      try {
        if (user.role === 'Owner') {
          const r = await api.get('/shop/owner/current');
          if (!mounted) return;
          if (r.data) { setShop(r.data); return; }
        }

        // Managers/Cashiers (or owner fallback)
        try {
          const m = await api.get('/shop/my-shop');
          if (!mounted) return;
          if (m.data) { setShop(m.data); return; }
        } catch { /* ignore, try /shop/my */ }

        const s = await api.get('/shop/my');
        if (!mounted) return;
        const shopRow = Array.isArray(s.data) ? s.data[0] : s.data || null;
        setShop(shopRow || null);
      } catch (e) {
        if (mounted) setShopErr(e?.response?.data?.message || 'Failed to load shop.');
      } finally {
        if (mounted) setLoadingShop(false);
      }
    }

    fetchShop();
    return () => { mounted = false; };
  }, [user, location.pathname]);

  if (!user) return null;

  const menus = {
    Owner: [
      { path: '/owner', label: 'Dashboard', icon: '📊' },
      { path: '/staff', label: 'Staff', icon: '🧑‍🤝‍🧑' },
      { path: '/suppliers', label: 'Suppliers', icon: '🚚' },
      { path: '/purchase-orders', label: 'Purchase Orders', icon: '🧾' },
      { path: '/inventory', label: 'Inventory', icon: '📦' },
      { path: '/billing', label: 'Billing', icon: '💳' },
      { path: '/bills', label: 'Bills', icon: '📋' },
      { path: '/customers', label: 'Customers', icon: '👥' },
      { path: '/owner/settings', label: 'Settings', icon: '⚙️' },
    ],
    Manager: [
      { path: '/manager', label: 'Dashboard', icon: '📊' },
      { path: '/staff', label: 'Staff', icon: '🧑‍🤝‍🧑' },
      { path: '/inventory', label: 'Inventory', icon: '📦' },
      { path: '/billing', label: 'Billing', icon: '💳' },
      { path: '/bills', label: 'Bills', icon: '📋' },
      { path: '/customers', label: 'Customers', icon: '👥' },
    ],
    Cashier: [
      { path: '/cashier', label: 'Dashboard', icon: '📊' },
      { path: '/billing', label: 'Billing', icon: '💳' },
      { path: '/bills', label: 'Bills', icon: '📋' },
      { path: '/customers', label: 'Customers', icon: '👥' },
    ],
  };

  return (
    <div className="sidebar">
      <div className="sidebar__title">{user.role} Menu</div>

      <ul className="sidebar__nav">
        {menus[user.role]?.map(item => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end
              className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
            >
              {item.icon && <span className="sidebar-link__icon" aria-hidden="true">{item.icon}</span>}
              <span className="sidebar-link__label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Shop details for ALL roles (no Edit button) */}
      <div className="sidebar-shop card">
        <div className="sidebar-shop__header">
          {loadingShop ? 'Loading…' : 'My Shop'}
        </div>

        {shopErr && (
          <div className="sidebar-shop__empty">{shopErr}</div>
        )}

        {!shopErr && (shop ? (
          <>
            <div className="sidebar-shop__row">
              <span className="label">Name</span>
              <span className="value">{shop.shop_name}</span>
            </div>

            {/* Removed Code row */}

            {shop.city && (
              <div className="sidebar-shop__row">
                <span className="label">City</span>
                <span className="value">{shop.city}</span>
              </div>
            )}
            <div className="sidebar-shop__row">
              <span className="label">Tax %</span>
              <span className="value">{Number(shop.tax_percentage || 0)}%</span>
            </div>
          </>
        ) : (
          !loadingShop && (
            <div className="sidebar-shop__empty">
              No shop found.
            </div>
          )
        ))}
      </div>
    </div>
  );
}
