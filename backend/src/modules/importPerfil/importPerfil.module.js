// Perfiles de mapeo de columnas para importar Excels (por empresa y tipo). El mapeo
// se guarda como JSON en `mapeo`; el front lo arma/lee en el asistente de columnas.
import { Router } from '../../core/router.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';

export const importPerfilRoutes = new Router();

// Perfiles de una empresa (opcional ?tipo= para filtrar por tipo de import).
importPerfilRoutes.get('/empresa/:empresaId', async (ctx, res) => {
  const params = [ctx.params.empresaId];
  let where = 'WHERE empresa_id = ? AND activo = 1';
  if (ctx.query.tipo) { where += ' AND tipo = ?'; params.push(ctx.query.tipo); }
  const rows = await query(`SELECT id, tipo, nombre, mapeo FROM import_perfil ${where} ORDER BY nombre`, params);
  sendJson(res, 200, rows.map((r) => ({ id: r.id, tipo: r.tipo, nombre: r.nombre, mapeo: safeJson(r.mapeo) })));
});

// Alta de un perfil (upsert por empresa+tipo+nombre: si existe, se reemplaza el mapeo).
importPerfilRoutes.post('/', async (ctx, res) => {
  const { empresaId, tipo, nombre, mapeo } = ctx.body || {};
  if (!empresaId || !tipo || !nombre) throw badRequest('empresaId, tipo y nombre son requeridos');
  const json = JSON.stringify(mapeo ?? {});
  const existe = await query(
    `SELECT id FROM import_perfil WHERE empresa_id = ? AND tipo = ? AND nombre = ? AND activo = 1`,
    [empresaId, tipo, nombre]
  );
  if (existe.length) {
    await query(`UPDATE import_perfil SET mapeo = ? WHERE id = ?`, [json, existe[0].id]);
    sendJson(res, 200, { id: existe[0].id });
  } else {
    const r = await query(
      `INSERT INTO import_perfil (empresa_id, tipo, nombre, mapeo, activo) VALUES (?,?,?,?,1)`,
      [empresaId, tipo, nombre, json]
    );
    sendJson(res, 201, { id: r.insertId });
  }
});

importPerfilRoutes.delete('/:id', async (ctx, res) => {
  await query(`UPDATE import_perfil SET activo = 0 WHERE id = ?`, [ctx.params.id]);
  sendJson(res, 200, { ok: true });
});

function safeJson(t) { try { return t ? JSON.parse(t) : {}; } catch { return {}; } }
