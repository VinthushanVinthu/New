// src/lib/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const KEY = 'auth';

export const api = axios.create({
  baseURL: API_URL + '/api',
});

// ---- Auth change event emitter (tiny, no deps) ----
const authEmitter = new EventTarget();
function emitAuth() {
  authEmitter.dispatchEvent(new Event('auth'));
}
// Subscribe API: returns an unsubscribe fn (perfect for React)
export function onAuthChange(subscriber) {
  // wrap to deliver current user on each emit
  const handler = () => subscriber(getUser());
  authEmitter.addEventListener('auth', handler);
  return () => authEmitter.removeEventListener('auth', handler);
}

// Attach token on every request
api.interceptors.request.use(config => {
  const tok = getToken();
  if (tok) {
    config.headers.Authorization = `Bearer ${tok}`;
  }
  return config;
});

// Save token + user
export function setToken(token, user) {
  if (token) {
    localStorage.setItem(KEY, JSON.stringify({ token, user }));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(KEY);
    delete api.defaults.headers.common['Authorization'];
  }
  emitAuth(); // 🔔 tell the app auth changed
}

// Get token
export function getToken() {
  try {
    return JSON.parse(localStorage.getItem(KEY))?.token || null;
  } catch {
    return null;
  }
}

// Get user
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY))?.user || null;
  } catch {
    return null;
  }
}

// Logout
export function logout() {
  localStorage.removeItem(KEY);
  delete api.defaults.headers.common['Authorization'];
  emitAuth(); // 🔔 tell the app auth changed
}

// 🧰 ensure axios has the token immediately on first load (hard refresh / deep link)
const existingTok = getToken();
if (existingTok) {
  api.defaults.headers.common['Authorization'] = `Bearer ${existingTok}`;
}
