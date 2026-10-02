import { query, transaction } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, notFound } from '../../core/httpError.js';
import { publish } from '../../core/ws.js';
import { assertAccesoASucursal } from '../usuario/acceso.js';
import { assertUsaStock } from '../sucursal/paquetes.js';

const SELECT = `
  SELECT id, fecha_hora AS fechaHora, conteo_finalizado AS conteoFinalizado,
         usuario_id AS usuarioId, sucursal_id AS sucursalId, activo, tipo_conteo AS tipoConteo
  FROM conteo`;

function normalize(row) {
  if (!row) return row;
  return { ...row, activo: !!row.activo, conteoFinalizado: !!row.conteoFinalizado };
}

/**
 * Agrega a cada conteo de tipo CATEGORIAS la lista de nombres de categorias
 * efectivamente incluidas (derivadas de sus productos). Deja LIBRE sin cambios.
 */
async function attachCategorias(conteos) {
  const categorizados = conteos.filter((c) => c.tipoConteo === 'CATEGORIAS');
  if (categorizados.length === 0) return conteos;
  const ids = categorizados.map((c) => c.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT DISTINCT cp.conteo_id AS conteoId, cat.nombre AS categoria
       FROM conteo_producto cp
       JOIN producto p  ON p.id  = cp.producto_id
       JOIN categoria cat ON cat.id = p.categoria_id
      WHERE cp.conteo_id IN (${placeholders})
      ORDER BY cat.nombre`,
    ids
  );
  const porConteo = new Map();
  for (const r of rows) {
    if (!porConteo.has(r.conteoId)) porConteo.set(r.conteoId, []);
    porConteo.get(r.conteoId).push(r.categoria);
  }
  for (const c of conteos) {
    if (c.tipoConteo === 'CATEGORIAS') c.categorias = porConteo.get(c.id) || [];
  }
  return conteos;
}

// El WS es un broadcast global: sin sucursalId en el payload el cliente no puede
// descartar los eventos de sucursales que no esta mirando.
function mensaje(row) {
  return {
    id: row.id,
    fechaHora: row.fechaHora ? String(row.fechaHora) : null,
    tipoConteo: row.tipoConteo,
    sucursalId: row.sucursalId ?? null,
  };
}

/**
 * Fecha y hora LOCAL del servidor en formato MySQL.
 * toISOString() devuelve UTC: de noche (UTC-3) adelantaba el conteo al dia
 * siguiente y desaparecia de las busquedas por fecha.
 */
function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Sucursal donde se cuenta. La elige quien crea el conteo; si no manda ninguna se
 * usa la suya. Debe existir, estar activa y el usuario tener acceso a ella
 * (ver puedeAccederASucursal: el admin llega a toda su empresa).
 */
async function resolverSucursal(dto) {
  if (!dto.usuarioId) throw badRequest('UsuarioId es requerido para crear un conteo');
  const users = await query(
    `SELECT sucursal_id AS sucursalId FROM usuario WHERE id = ? AND activo = 1`, [dto.usuarioId]
  );
  if (!users.length) throw notFound(`Usuario no encontrado con id: ${dto.usuarioId}`);

  const sucursalId = dto.sucursalId ?? users[0].sucursalId;
  if (!sucursalId) throw badRequest('Debe indicar la sucursal del conteo');

  const suc = await query(`SELECT id FROM sucursal WHERE id = ? AND activo = 1`, [sucursalId]);
  if (!suc.length) throw badRequest(`Sucursal no encontrada o inactiva: ${sucursalId}`);

  // Los conteos pertenecen al paquete de control de stock.
  await assertUsaStock(sucursalId);
  await assertAccesoASucursal(dto.usuarioId, sucursalId);
  return Number(sucursalId);
}

// Filtro opcional por sucursal: sin el parametro los listados se comportan como antes.
function filtroSucursal(sucursalId, prefijo = 'WHERE') {
  if (!sucursalId) return { clause: '', params: [] };
  return { clause: ` ${prefijo} sucursal_id = ?`, params: [sucursalId] };
}

export const conteoService = {
  async getAllActive(sucursalId) {
    const { clause, params } = filtroSucursal(sucursalId, 'AND');
    return attachCategorias((await query(`${SELECT} WHERE activo = 1${clause}`, params)).map(normalize));
  },
  async getAllIncludingInactive(sucursalId) {
    const { clause, params } = filtroSucursal(sucursalId);
    return attachCategorias((await query(`${SELECT}${clause}`, params)).map(normalize));
  },
  async getById(id) {
    const r = await query(`${SELECT} WHERE id = ?`, [id]);
    const conteo = normalize(r[0] || null);
    if (!conteo) return null;
    const [enriquecido] = await attachCategorias([conteo]);
    return enriquecido;
  },
  // Conteos finalizados dentro de un rango de fechas (inclusive). Formato: YYYY-MM-DD.
  async getFinalizadosEntre(desde, hasta, sucursalId) {
    const params = [];
    let where = 'WHERE conteo_finalizado = 1';
    if (desde) { where += ' AND fecha_hora >= ?'; params.push(`${desde} 00:00:00`); }
    if (hasta) { where += ' AND fecha_hora <= ?'; params.push(`${hasta} 23:59:59`); }
    if (sucursalId) { where += ' AND sucursal_id = ?'; params.push(sucursalId); }
    return attachCategorias((await query(`${SELECT} ${where} ORDER BY fecha_hora DESC`, params)).map(normalize));
  },

  async create(dto) {
    const tipo = dto.tipoConteo || 'LIBRE';
    if (!['LIBRE', 'CATEGORIAS'].includes(tipo)) throw badRequest(`Tipo de conteo invalido: ${tipo}`);
    const finalizado = !!dto.conteoFinalizado;
    const fechaHora = dto.fechaHora || nowDateTime();
    const sucursalId = await resolverSucursal(dto);

    const id = await transaction(async (conn) => {
      const [res] = await conn.execute(
        `INSERT INTO conteo (fecha_hora, conteo_finalizado, usuario_id, sucursal_id, activo, tipo_conteo)
         VALUES (?,?,?,?,?,?)`,
        [fechaHora, finalizado ? 1 : 0, dto.usuarioId ?? null, sucursalId, finalizado ? 0 : 1, tipo]
      );
      const conteoId = res.insertId;

      if (tipo === 'CATEGORIAS') {
        if (!dto.categoriaIds || dto.categoriaIds.length === 0) {
          throw badRequest('Debe seleccionar al menos una categoria para conteos de tipo CATEGORIAS');
        }
        const inClause = dto.categoriaIds.map(() => '?').join(',');
        const [categorias] = await conn.execute(
          `SELECT id FROM categoria WHERE id IN (${inClause}) AND activo = 1 AND sucursal_id = ?`,
          [...dto.categoriaIds, sucursalId]
        );
        // Todas tienen que ser de la sucursal elegida: antes alcanzaba con que una
        // lo fuera y el resto se descartaba en silencio.
        if (categorias.length !== dto.categoriaIds.length) {
          throw badRequest('Hay categorias que no pertenecen a la sucursal del conteo');
        }

        for (const cat of categorias) {
          const [productos] = await conn.execute(
            `SELECT id, precio, cantidad_stock FROM producto
              WHERE categoria_id = ? AND activo = 1 AND sucursal_id = ?`,
            [cat.id, sucursalId]
          );
          for (const p of productos) {
            await conn.execute(
              `INSERT INTO conteo_producto (precio_actual, cantidad_esperada, cantidad_contada, conteo_id, producto_id, activo)
               VALUES (?,?,?,?,?,1)`,
              [p.precio, Number(p.cantidad_stock), null, conteoId, p.id]
            );
          }
        }
      }
      return conteoId;
    });

    const saved = await this.getById(id);
    publish('conteo-activo', mensaje(saved));
    return saved;
  },

  async update(id, dto) {
    const existing = (await query(`${SELECT} WHERE id = ?`, [id]))[0];
    if (!existing) return null;
    const sets = [];
    const params = [];
    if (dto.fechaHora !== undefined) { sets.push('fecha_hora = ?'); params.push(dto.fechaHora); }
    if (dto.usuarioId !== undefined) { sets.push('usuario_id = ?'); params.push(dto.usuarioId); }
    if (dto.tipoConteo !== undefined) {
      if (!['LIBRE', 'CATEGORIAS'].includes(dto.tipoConteo)) throw badRequest(`Tipo de conteo invalido: ${dto.tipoConteo}`);
      sets.push('tipo_conteo = ?'); params.push(dto.tipoConteo);
    }
    if (dto.conteoFinalizado !== undefined && dto.conteoFinalizado !== null) {
      const fin = !!dto.conteoFinalizado;
      sets.push('conteo_finalizado = ?'); params.push(fin ? 1 : 0);
      sets.push('activo = ?'); params.push(fin ? 0 : 1);
    }
    if (sets.length) await query(`UPDATE conteo SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);

    const updated = await this.getById(id);
    if (updated.conteoFinalizado) publish('conteo-finalizado', mensaje(updated));
    else publish('conteo-activo', mensaje(updated));
    return updated;
  },

  async deactivate(id) {
    const existing = (await query(`${SELECT} WHERE id = ?`, [id]))[0];
    if (!existing) throw notFound(`Conteo no encontrado con id: ${id}`);
    await query(`UPDATE conteo SET activo = 0 WHERE id = ?`, [id]);
    publish('conteo-finalizado', { id: Number(id), fechaHora: nowDateTime() });
  },
};

export const conteoRoutes = new Router();
// ?sucursalId= filtra por sucursal; sin el parametro devuelve todas (compatibilidad).
conteoRoutes.get('/', async (ctx, res) =>
  sendJson(res, 200, await conteoService.getAllActive(ctx.query.sucursalId)));
conteoRoutes.get('/all', async (ctx, res) =>
  sendJson(res, 200, await conteoService.getAllIncludingInactive(ctx.query.sucursalId)));

conteoRoutes.post('/categorias', async (ctx, res) => {
  if (ctx.body.tipoConteo !== 'CATEGORIAS') throw badRequest('Este endpoint solo acepta conteos de tipo CATEGORIAS');
  sendJson(res, 201, await conteoService.create(ctx.body));
});

// Debe ir ANTES de /:id (misma cantidad de segmentos).
conteoRoutes.get('/finalizados', async (ctx, res) =>
  sendJson(res, 200, await conteoService.getFinalizadosEntre(
    ctx.query.desde, ctx.query.hasta, ctx.query.sucursalId
  )));

conteoRoutes.get('/:id', async (ctx, res) => {
  const c = await conteoService.getById(ctx.params.id);
  c ? sendJson(res, 200, c) : sendJson(res, 404, null);
});

conteoRoutes.post('/', async (ctx, res) => {
  const tipo = ctx.body.tipoConteo;
  if (!tipo || tipo !== 'LIBRE') throw badRequest('Este endpoint solo acepta conteos de tipo LIBRE');
  sendJson(res, 201, await conteoService.create(ctx.body));
});

conteoRoutes.put('/:id', async (ctx, res) => {
  const updated = await conteoService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});

conteoRoutes.delete('/:id', async (ctx, res) => {
  await conteoService.deactivate(ctx.params.id);
  sendNoContent(res);
});
