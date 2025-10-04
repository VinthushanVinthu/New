import React from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import OwnerDashboard from './pages/OwnerDashboard.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import CashierDashboard from './pages/CashierDashboard.jsx';
import CreateShop from './pages/CreateShop.jsx';
import Billing from './pages/Billing.jsx';
import Inventory from './pages/Inventory.jsx';
import { getUser } from './lib/api.js';
import Sidebar from './components/Sidebar.jsx';
import './styles/App.css';
import { useAuth } from './context/AuthContext.jsx';

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="header">
      <Link to="/">🏬 Retail Billing</Link>
      <div style={{ flex: 1 }} />
      {user ? (
        <>
          <span>{user.name} • {user.role}</span>
          <button
            className="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Logout
          </button>
        </>
      ) : (
        <Link className="button" to="/login">Login</Link>
      )}
    </div>
  );
}

function Home() {
  const user = getUser();
  return (
    <div className="card">
      <h2>Welcome</h2>
      <p>This system supports: Owner • Manager • Cashier</p>
      {user ? (
        <p>Go to your dashboard from the sidebar.</p>
      ) : (
        <p><Link className="button" to="/register">Get Started</Link></p>
      )}
    </div>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <div className="app-layout">
        <Sidebar />
        <div className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/create-shop" element={<CreateShop />} />
            <Route path="/owner" element={<OwnerDashboard />} />
            <Route path="/manager" element={<ManagerDashboard />} />
            <Route path="/cashier" element={<CashierDashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/billing" element={<Billing />} />
          </Routes>
        </div>
      </div>
    </>
  );
}
