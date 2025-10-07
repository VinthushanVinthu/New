// src/routes/RoleRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function RoleRoute({ allow = [] }) {
  const { user, initializing } = useAuth();

  if (initializing) return null;               // wait for localStorage read
  if (!user) return <Navigate to="/login" replace />;
  if (allow.length && !allow.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
