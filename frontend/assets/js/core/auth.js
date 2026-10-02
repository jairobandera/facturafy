// Gestion de autenticacion y token JWT en el cliente.
import { config } from './config.js';

const TOKEN_KEY = 'stockify_token';

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

export const auth = {
  async login(nombreUsuario, contrasenia) {
    const res = await fetch(`${config.apiBase}/seguridad/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombreUsuario, contrasenia }),
    });
    if (!res.ok) {
      let msg = 'Credenciales incorrectas';
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    return data.token;
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    window.location.hash = '#/login';
  },

  getToken() { return localStorage.getItem(TOKEN_KEY); },
  isAuthenticated() { return !!this.getToken(); },

  payload() {
    const token = this.getToken();
    return token ? decodeJwt(token) : null;
  },
  getRole() { return this.payload()?.rol || ''; },
  getSucursalId() { return this.payload()?.sucursalId ?? null; },
  getUsername() { return this.payload()?.sub || ''; },

  isExpired() {
    const p = this.payload();
    if (!p || !p.exp) return true;
    return Math.floor(Date.now() / 1000) >= p.exp;
  },

  /** Ruta de dashboard segun el rol. */
  homeRoute() {
    switch (this.getRole()) {
      case 'SUPERADMINISTRADOR': return '#/superadmin/dashboard';
      case 'ADMINISTRADOR': return '#/admin/dashboard';
      case 'EMPLEADO': return '#/empleado/dashboard';
      default: return '#/login';
    }
  },
};
