// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/Sidebar.css";

export default function Sidebar() {
  const { user } = useAuth();

  if (!user) return null;

  const menus = {
    Owner: [
      { path: "/owner", label: "Dashboard" },
      { path: "/create-shop", label: "Create Shop" },
      { path: "/inventory", label: "Inventory" },
      { path: "/billing", label: "Billing" },
    ],
    Manager: [
      { path: "/manager", label: "Dashboard" },
      { path: "/inventory", label: "Inventory" },
      { path: "/billing", label: "Billing" },
    ],
    Cashier: [
      { path: "/cashier", label: "Dashboard" },
      { path: "/billing", label: "Billing" },
    ],
  };

  return (
    <div className="sidebar">
      <h3>{user.role} Menu</h3>
      <ul>
        {menus[user.role]?.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                isActive ? "sidebar-link active" : "sidebar-link"
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
