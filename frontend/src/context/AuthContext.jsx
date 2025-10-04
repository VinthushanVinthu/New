// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // load persisted auth on first mount
  useEffect(() => {
    const raw = localStorage.getItem("auth");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setUser(parsed.user || null);
        setToken(parsed.token || null);
      } catch {
        // bad JSON -> clear
        localStorage.removeItem("auth");
      }
    }
  }, []);

  const login = ({ token, user }) => {
    const payload = { token, user };
    localStorage.setItem("auth", JSON.stringify(payload));
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem("auth");
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({ user, token, login, logout, setUser }), [user, token]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
