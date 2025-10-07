// src/layouts/DashboardLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/layout.css';

export default function DashboardLayout() {
  const { user } = useAuth();

  return (
    <>
      <Header />

      {user ? (
        // AUTHENTICATED: use the dashboard shell
        <div className="app-shell">
          <aside className="app-shell__sidebar">
            <Sidebar />
          </aside>

          <main className="app-shell__main">
            <div className="app-container">
              <Outlet />
            </div>
          </main>
        </div>
      ) : (
        // PUBLIC: no shell — lets Login/Register own their layout (login.css)
        <main className="public-main">
          <Outlet />
        </main>
      )}
    </>
  );
}
