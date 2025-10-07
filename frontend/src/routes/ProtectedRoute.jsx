// src/routes/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { user, initializing } = useAuth();

  if (initializing) return null;               // or a tiny loader
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
