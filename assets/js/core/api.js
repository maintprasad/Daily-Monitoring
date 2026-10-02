'use strict';

// ═══════════════════════════════════════════════════════
// API CLIENT — komunikasi dengan backend PHP (api/index.php)
// XAMPP  : database SQLite lokal
// Vercel : database Turso
// ═══════════════════════════════════════════════════════
const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || 'api/index.php';
const AUTH_STORAGE_KEY = 'ps2_auth';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status; // 0 = tidak bisa terhubung ke server
  }
}

function loadSavedAuth() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    return saved && saved.token && saved.user ? saved : null;
  } catch (e) { return null; }
}

function saveAuth(token, user) {
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user, savedAt: Date.now() })); } catch (e) {}
}

function clearAuth() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
}

function getAuthToken() {
  return loadSavedAuth()?.token || null;
}

/**
 * apiRequest('sync', { query: { since: 5 } })
 * apiRequest('push', { method: 'POST', body: {...} })
 */
async function apiRequest(route, { method = 'GET', query = {}, body, timeout = 30000 } = {}) {
  const params = new URLSearchParams({ r: route });
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAuthToken();
  if (token) headers['X-Auth-Token'] = token;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API_BASE}?${params}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'Timeout koneksi ke server' : 'Tidak bisa terhubung ke server', 0);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ApiError(`Respons server tidak valid (HTTP ${res.status}). Pastikan PHP berjalan.`, res.status);
  }

  if (!res.ok || data.ok === false) {
    const err = new ApiError(data.error || `HTTP ${res.status}`, res.status);
    if (res.status === 401 && route !== 'auth/login' && typeof handleAuthExpired === 'function') {
      handleAuthExpired(err.message);
    }
    throw err;
  }
  return data;
}
