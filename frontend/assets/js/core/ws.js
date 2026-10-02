// Cliente WebSocket con suscripcion por "topic".
// Reemplaza al cliente STOMP del frontend Angular original.
import { config } from './config.js';

class WsClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map(); // topic -> Set<callback>
    this.reconnectTimer = null;
    this.shouldConnect = false;
  }

  connect() {
    this.shouldConnect = true;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      this.socket = new WebSocket(config.wsUrl);
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      const cbs = this.listeners.get(msg.topic);
      if (cbs) for (const cb of cbs) { try { cb(msg.payload); } catch (e) { console.error(e); } }
    };
    this.socket.onclose = () => { if (this.shouldConnect) this._scheduleReconnect(); };
    this.socket.onerror = () => { try { this.socket.close(); } catch { /* ignore */ } };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldConnect) this.connect();
    }, 3000);
  }

  /** Suscribe a un topic. Devuelve una funcion para desuscribirse. */
  subscribe(topic, callback) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic).add(callback);
    this.connect();
    return () => {
      const set = this.listeners.get(topic);
      if (set) set.delete(callback);
    };
  }

  disconnect() {
    this.shouldConnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.socket) { try { this.socket.close(); } catch { /* ignore */ } this.socket = null; }
  }

  isConnected() { return this.socket && this.socket.readyState === WebSocket.OPEN; }
}

export const ws = new WsClient();
