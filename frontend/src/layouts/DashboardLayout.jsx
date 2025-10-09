// src/layouts/DashboardLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/layout.css';

export default function DashboardLayout() {
  const { user } = useAuth();

  // Sidebar renders when:
  // - user exists, AND
  //   - role is NOT Owner, OR
  //   - role IS Owner AND status === 'joined'
  const showSidebar =
    !!user && (user.role !== 'Owner' || user?.status === 'joined');

  return (
    <>
      <Header />

      {user ? (
        <div className="app-shell">
          {showSidebar && (
            <aside className="app-shell__sidebar">
              <Sidebar />
            </aside>
          )}

          <main className="app-shell__main">
            <div className="app-container">
              <Outlet />
            </div>
          </main>
        </div>
      ) : (
        <main className="public-main">
          <Outlet />
        </main>
      )}
    </>
  );
}
