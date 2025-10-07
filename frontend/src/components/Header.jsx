// src/components/Header.jsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/header.css';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="app-header__left">
        <Link to="/" className="brand">
          <span className="brand__emoji">🏬</span>
          <span className="brand__name">Retail Billing</span>
        </Link>
      </div>

      <div className="app-header__spacer" />

      <nav className="app-header__right">
        {user ? (
          <>
            <span className="user-chip">
              <span className="user-chip__name">{user.name}</span>
              <span className="user-chip__role">{user.role}</span>
            </span>
            <button
              className="btn btn--ghost"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              aria-label="Logout"
            >
              Logout
            </button>
          </>
        ) : (
          <Link className="btn btn--primary" to="/login">
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
