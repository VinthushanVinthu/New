// src/App.jsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import OwnerDashboard from './pages/OwnerDashboard.jsx';
import ManagerDashboard from './pages/ManagerDashboard.jsx';
import CashierDashboard from './pages/CashierDashboard.jsx';
import Customers from './pages/Customers.jsx';
import Staff from './pages/Staff.jsx';
import CreateShop from './pages/CreateShop.jsx';
import Billing from './pages/Billing.jsx';
import Inventory from './pages/Inventory.jsx';
import OwnerShopSettings from './pages/OwnerShopSettings.jsx';
import NotFound from './pages/NotFound.jsx';
import Bills from './pages/Bills.jsx';

import ProtectedRoute from './routes/ProtectedRoute.jsx';
import RoleRoute from './routes/RoleRoute.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';

import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

import { useAuth } from './context/AuthContext.jsx';

 import './styles/globals.css';
 import './styles/variables.css';
import './styles/page.css';

// 👇 PublicHome Component
function PublicHome() {
  const { user } = useAuth();

  if (user) {
    return (
      <div className="card">
        <h2>Welcome back, {user.name} 👋</h2>
        <p>Your role: <strong>{user.role}</strong></p>
        <p>Use the navigation above to manage your shop.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Welcome</h2>
      <p>This system supports: <strong>Owner</strong> • <strong>Manager</strong> • <strong>Cashier</strong></p>
      <p className="muted">Please login or register to continue.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* All “app” pages share the same layout */}
      <Route element={<DashboardLayout />}>
        {/* Public */}
        <Route index element={<PublicHome />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
             <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />

        {/* Authenticated area */}
        <Route element={<ProtectedRoute />}>
          <Route path="billing" element={<Billing />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="customers" element={<Customers />} />
          <Route path="staff" element={<Staff />} />
          <Route path="bills" element={<Bills />} />

          {/* Owner */}
          <Route element={<RoleRoute allow={['Owner']} />}>
            <Route path="owner" element={<OwnerDashboard />} />
            <Route path="create-shop" element={<CreateShop />} />
            <Route path="owner/settings" element={<OwnerShopSettings />} />

          </Route>

          {/* Manager */}
          <Route element={<RoleRoute allow={['Manager']} />}>
            <Route path="manager" element={<ManagerDashboard />} />
            <Route path="bills" element={<Bills />} />
          </Route>

          {/* Cashier */}
          <Route element={<RoleRoute allow={['Cashier']} />}>
            <Route path="cashier" element={<CashierDashboard />} />
            <Route path="bills" element={<Bills />} />
          </Route>
        </Route>
        {/* Fallback inside layout */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
