// Suscripciones por empresa. Prueba de 7 dias desde `empresa.fecha_alta`; luego hay que
// activar con una clave que genera el superadmin (codigo_activacion, un solo uso, por
// empresa, con una duracion en dias). Al vencer se bloquea de nuevo (suscripcion recurrente).
// El superadmin nunca se bloquea. El guard `assertAccesoSuscripcion` (usado en app.js)
// rechaza las operaciones de una empresa vencida, salvo login y los endpoints de suscripcion.
import crypto from 'node:crypto';
import { Router } from '../../core/router.js';
import { query, transaction } from '../../config/db.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, forbidden, notFound, HttpError } from '../../core/httpError.js';

const DIAS_PRUEBA = 7;
const SUPERADMIN = 'SUPERADMINISTRADOR';
const ADMIN = 'ADMINISTRADOR';

function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}
function hoyISO() { return nowDateTime().slice(0, 10); }
function parseFechaLocal(s) { return s ? new Date(String(s).replace(' ', 'T')) : null; }
function sumarDias(fechaISO, dias) {
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setDate(d.getDate() + Number(dias));
  return d.toISOString().slice(0, 10);
}

/** Estado de suscripcion a partir de una fila de empresa. */
function calcularEstado(emp) {
  if (!emp) return null;
  const ilimitada = !!emp.suscripcionIlimitada;
  if (ilimitada) {
    return { empresaId: emp.id, ilimitada: true, enPrueba: false, activa: true, bloqueada: false,
      vigenteHasta: null, diasRestantes: null, horasRestantes: null };
  }
  const enPrueba = !emp.suscripcionHasta;
  // Fin exacto: fin del dia de suscripcion_hasta, o fecha_alta + 7 dias en la prueba.
  const fin = enPrueba
    ? new Date(parseFechaLocal(emp.fechaAlta).getTime() + DIAS_PRUEBA * 86400000)
    : parseFechaLocal(`${emp.suscripcionHasta} 23:59:59`);
  const ms = fin.getTime() - Date.now();
  const activa = ms > 0;
  return {
    empresaId: emp.id, ilimitada: false, enPrueba, activa, bloqueada: !activa,
    vigenteHasta: enPrueba ? fin.toISOString().slice(0, 10) : emp.suscripcionHasta,
    diasRestantes: activa ? Math.ceil(ms / 86400000) : 0,
    horasRestantes: activa ? Math.ceil(ms / 3600000) : 0,
  };
}

async function empresaById(id) {
  const rows = await query(
    `SELECT id, nombre, fecha_alta AS fechaAlta, suscripcion_hasta AS suscripcionHasta,
            suscripcion_ilimitada AS suscripcionIlimitada
       FROM empresa WHERE id = ?`, [id]
  );
  return rows[0] || null;
}

// ---- Caches para el guard (evita una consulta por request) ----
const empresaDeSucursalCache = new Map(); // sucursalId -> empresaId
const bloqueadaCache = new Map();          // empresaId -> { bloqueada, expira }
const TTL = 30000;

async function empresaDeSucursal(sucursalId) {
  if (!sucursalId) return null;
  if (empresaDeSucursalCache.has(sucursalId)) return empresaDeSucursalCache.get(sucursalId);
  const rows = await query(`SELECT empresa_id AS empresaId FROM sucursal WHERE id = ?`, [sucursalId]);
  const empresaId = rows[0]?.empresaId ?? null;
  if (empresaId) empresaDeSucursalCache.set(sucursalId, empresaId);
  return empresaId;
}

function invalidarCache(empresaId) { bloqueadaCache.delete(Number(empresaId)); }

async function empresaBloqueada(empresaId) {
  const cacheado = bloqueadaCache.get(Number(empresaId));
  if (cacheado && cacheado.expira > Date.now()) return cacheado.bloqueada;
  const estado = calcularEstado(await empresaById(empresaId));
  const bloqueada = !!estado?.bloqueada;
  bloqueadaCache.set(Number(empresaId), { bloqueada, expira: Date.now() + TTL });
  return bloqueada;
}

/**
 * Guard de acceso (app.js). Deja pasar: superadmin, no autenticados, login y los
 * endpoints de suscripcion. Para el resto, si la empresa del usuario esta vencida,
 * lanza 402.
 */
export async function assertAccesoSuscripcion(ctx, apiPath) {
  const user = ctx.user;
  if (!user || user.rol === SUPERADMIN) return;
  if (apiPath.startsWith('/suscripcion') || apiPath.startsWith('/seguridad')) return;
  const empresaId = await empresaDeSucursal(user.sucursalId);
  if (!empresaId) return; // no se pudo determinar la empresa: no bloquear
  if (await empresaBloqueada(empresaId)) {
    throw new HttpError(402, 'La suscripción de la empresa venció. Ingresá la clave de activación.');
  }
}

export const suscripcionService = {
  /** Estado de la empresa del usuario logueado (para el gate + avisos del front). */
  async estadoDeUsuario(user) {
    if (!user) throw forbidden('No autenticado');
    if (user.rol === SUPERADMIN) return { superadmin: true, activa: true, bloqueada: false };
    const empresaId = await empresaDeSucursal(user.sucursalId);
    if (!empresaId) return { activa: true, bloqueada: false }; // sin empresa: no bloquear
    const estado = calcularEstado(await empresaById(empresaId));
    return { ...estado, rol: user.rol };
  },

  async estadoDeEmpresa(empresaId) {
    const emp = await empresaById(empresaId);
    if (!emp) throw notFound(`Empresa no encontrada con id: ${empresaId}`);
    return { ...calcularEstado(emp), nombre: emp.nombre };
  },

  /** El admin activa su empresa con una clave. */
  async activar(user, codigoRaw) {
    if (!user || (user.rol !== ADMIN && user.rol !== SUPERADMIN)) {
      throw forbidden('Solo el administrador puede ingresar la clave de activación');
    }
    const empresaId = await empresaDeSucursal(user.sucursalId);
    if (!empresaId) throw badRequest('No se pudo determinar la empresa del usuario');
    const codigo = String(codigoRaw ?? '').trim().toUpperCase();
    if (!codigo) throw badRequest('Ingresá la clave de activación');

    const estado = await transaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT id, empresa_id AS empresaId, dias, usado, activo
           FROM codigo_activacion WHERE codigo = ? FOR UPDATE`, [codigo]
      );
      const c = rows[0];
      if (!c || !c.activo) throw badRequest('La clave no existe o fue dada de baja');
      if (c.usado) throw badRequest('La clave ya fue usada');
      if (Number(c.empresaId) !== Number(empresaId)) throw badRequest('La clave no corresponde a esta empresa');

      const [empRows] = await conn.execute(
        `SELECT suscripcion_hasta AS suscripcionHasta FROM empresa WHERE id = ?`, [empresaId]
      );
      const hastaActual = empRows[0]?.suscripcionHasta;
      const hoy = hoyISO();
      // Si todavia esta vigente, extiende desde la fecha actual; si no, desde hoy.
      const base = (hastaActual && hastaActual >= hoy) ? hastaActual : hoy;
      const nuevaHasta = sumarDias(base, c.dias);

      await conn.execute(`UPDATE empresa SET suscripcion_hasta = ? WHERE id = ?`, [nuevaHasta, empresaId]);
      await conn.execute(`UPDATE codigo_activacion SET usado = 1, usado_fecha = ? WHERE id = ?`, [nowDateTime(), c.id]);
      return calcularEstado(await empresaById(empresaId));
    });
    invalidarCache(empresaId);
    return estado;
  },

  // ---- Superadmin ----
  async generarCodigo(empresaId, dias) {
    const emp = await empresaById(empresaId);
    if (!emp) throw notFound(`Empresa no encontrada con id: ${empresaId}`);
    const d = Math.trunc(Number(dias));
    if (!Number.isFinite(d) || d <= 0 || d > 3650) throw badRequest('Duración inválida (1 a 3650 días)');
    for (let intento = 0; intento < 5; intento++) {
      const codigo = generarClave();
      try {
        const r = await query(
          `INSERT INTO codigo_activacion (codigo, empresa_id, dias, activo) VALUES (?,?,?,1)`,
          [codigo, empresaId, d]
        );
        return { id: r.insertId, codigo, dias: d, empresaId: Number(empresaId) };
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') continue; // colision rarisima: reintentar
        throw err;
      }
    }
    throw new HttpError(500, 'No se pudo generar una clave única, reintentá');
  },

  async listarCodigos(empresaId) {
    const rows = await query(
      `SELECT id, codigo, dias, usado, usado_fecha AS usadoFecha, fecha_generacion AS fechaGeneracion, activo
         FROM codigo_activacion WHERE empresa_id = ? AND activo = 1
        ORDER BY usado ASC, fecha_generacion DESC`, [empresaId]
    );
    return rows.map((r) => ({
      ...r, usado: !!r.usado, activo: !!r.activo,
      estado: r.usado ? 'USADA' : 'VIGENTE',
    }));
  },

  async bajaCodigo(id) {
    await query(`UPDATE codigo_activacion SET activo = 0 WHERE id = ?`, [id]);
    return { ok: true };
  },

  /** Superadmin: marca/desmarca ilimitada o suma dias manualmente a una empresa. */
  async ajustarEmpresa(empresaId, { ilimitada, dias } = {}) {
    const emp = await empresaById(empresaId);
    if (!emp) throw notFound(`Empresa no encontrada con id: ${empresaId}`);
    if (ilimitada !== undefined) {
      await query(`UPDATE empresa SET suscripcion_ilimitada = ? WHERE id = ?`, [ilimitada ? 1 : 0, empresaId]);
    }
    if (dias !== undefined && dias !== null && Number(dias) > 0) {
      const hoy = hoyISO();
      const base = (emp.suscripcionHasta && emp.suscripcionHasta >= hoy) ? emp.suscripcionHasta : hoy;
      await query(`UPDATE empresa SET suscripcion_hasta = ? WHERE id = ?`, [sumarDias(base, Number(dias)), empresaId]);
    }
    invalidarCache(empresaId);
    return suscripcionService.estadoDeEmpresa(empresaId);
  },
};

function generarClave() {
  const raw = crypto.randomBytes(9).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12).padEnd(12, 'X');
  return `STK-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function assertSuperadmin(ctx) {
  if (ctx.user?.rol !== SUPERADMIN) throw forbidden('Solo el superadministrador');
}

export const suscripcionRoutes = new Router();

// Estado de la empresa del usuario (accesible aun bloqueado: lo usa el gate del front).
suscripcionRoutes.get('/estado', async (ctx, res) => {
  sendJson(res, 200, await suscripcionService.estadoDeUsuario(ctx.user));
});
// El admin ingresa la clave.
suscripcionRoutes.post('/activar', async (ctx, res) => {
  sendJson(res, 200, await suscripcionService.activar(ctx.user, ctx.body?.codigo));
});
// Superadmin: estado de una empresa, generar/listar/baja de claves, ajustes.
suscripcionRoutes.get('/empresa/:empresaId/estado', async (ctx, res) => {
  assertSuperadmin(ctx);
  sendJson(res, 200, await suscripcionService.estadoDeEmpresa(ctx.params.empresaId));
});
suscripcionRoutes.put('/empresa/:empresaId', async (ctx, res) => {
  assertSuperadmin(ctx);
  sendJson(res, 200, await suscripcionService.ajustarEmpresa(ctx.params.empresaId, ctx.body || {}));
});
suscripcionRoutes.get('/codigos/empresa/:empresaId', async (ctx, res) => {
  assertSuperadmin(ctx);
  sendJson(res, 200, await suscripcionService.listarCodigos(ctx.params.empresaId));
});
suscripcionRoutes.post('/codigos', async (ctx, res) => {
  assertSuperadmin(ctx);
  const { empresaId, dias } = ctx.body || {};
  sendJson(res, 201, await suscripcionService.generarCodigo(empresaId, dias));
});
suscripcionRoutes.delete('/codigos/:id', async (ctx, res) => {
  assertSuperadmin(ctx);
  await suscripcionService.bajaCodigo(ctx.params.id);
  sendNoContent(res);
});
