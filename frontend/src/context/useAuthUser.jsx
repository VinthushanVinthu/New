import { useSyncExternalStore } from "react";

// Key used to store user in localStorage
const USER_KEY = "rb_user";

// Read the current user from localStorage
function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Subscribe to "auth-changed" and "storage" events so components re-render
function subscribe(callback) {
  const handler = () => callback();

  // Fires when localStorage changes in other tabs
  window.addEventListener("storage", handler);
  // Fires when we dispatch manually (setToken/logout)
  window.addEventListener("auth-changed", handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("auth-changed", handler);
  };
}

// Hook: React components can call useAuthUser() to get live user info
export function useAuthUser() {
  return useSyncExternalStore(subscribe, readUser, readUser);
}

// Export key for use in api.js
export { USER_KEY };
