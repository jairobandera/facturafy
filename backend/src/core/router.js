// Router minimalista basado en patrones tipo "/recurso/:id".
// Soporta parametros de ruta (:param) y query string.
export class Router {
  constructor() {
    this.routes = []; // { method, segments, handler }
  }

  add(method, pattern, handler) {
    const segments = pattern.split('/').filter(Boolean).map((seg) => {
      if (seg.startsWith(':')) return { param: seg.slice(1) };
      return { literal: seg };
    });
    this.routes.push({ method: method.toUpperCase(), segments, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  /** Monta las rutas de otro router bajo un prefijo. */
  use(prefix, subRouter) {
    const prefixSegments = prefix.split('/').filter(Boolean).map((s) => ({ literal: s }));
    for (const r of subRouter.routes) {
      this.routes.push({ method: r.method, segments: [...prefixSegments, ...r.segments], handler: r.handler });
    }
    return this;
  }

  /**
   * Busca una ruta que coincida con el metodo y path dados.
   * @returns {{handler: Function, params: object}|null}
   */
  match(method, pathname) {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        const part = decodeURIComponent(parts[i]);
        if (seg.literal !== undefined) {
          if (seg.literal !== part) { ok = false; break; }
        } else {
          params[seg.param] = part;
        }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}
