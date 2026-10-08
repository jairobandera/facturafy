// Paquete "Solo envio de correos": automatiza el envio del estado de cuenta de la
// quincena por email, con datos cargados desde Excel. Dos insumos:
//   1) contacto_correo: lista de contactos (clave/nombre/email), reutilizable.
//   2) estado de cuenta por quincena: el front lo manda agrupado por clave.
// Se cruza por `clave` (normalizada). Guarda historial (envio_correo + detalle).
// No usa la tabla `cliente` ni la facturacion de la app (son negocios externos).
import { Router } from '../../core/router.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { assertUsaEnvioCorreos } from '../sucursal/paquetes.js';
import { resolverSmtp, smtpEnv, construirTransporter, enviarConFallback } from '../../core/mailer.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

/** Clave de cruce normalizada (igual criterio que el claveCodigo del front). */
function claveNorm(v) {
  return String(v ?? '').trim().toUpperCase().replace(/^0+(?=.)/, '');
}

function money(n) {
  return Number(n || 0).toLocaleString('es-UY', { style: 'currency', currency: 'UYU', minimumFractionDigits: 2 });
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** HTML del estado de cuenta (tabla de lineas + total + intro con placeholders). */
function htmlEstado({ nombre, lineas, total, asunto, mensaje, sucursalNombre }) {
  const intro = String(mensaje || 'Le enviamos el detalle de su estado de cuenta y el saldo a pagar.')
    .replace(/\{nombre\}/gi, nombre || '')
    .replace(/\{total\}/gi, money(total));
  const filas = lineas.length
    ? lineas.map((l) => `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(l.concepto || '')}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(l.fecha || '')}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${money(l.monto)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:8px;color:#777">Sin detalle.</td></tr>`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#222">
    <h2 style="color:#2563eb;margin-bottom:4px">${esc(asunto || 'Estado de cuenta')}</h2>
    <div style="color:#555;margin-bottom:12px">${esc(sucursalNombre || 'Facturafy')}</div>
    <p>Estimado/a <b>${esc(nombre || 'cliente')}</b>,</p>
    <p>${esc(intro)}</p>
    <table style="border-collapse:collapse;width:100%;margin:8px 0">
      <thead><tr style="background:#f1f5f9">
        <th style="padding:6px 8px;text-align:left">Concepto</th>
        <th style="padding:6px 8px;text-align:left">Fecha</th>
        <th style="padding:6px 8px;text-align:right">Monto</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div style="background:#2563eb;color:#fff;padding:12px;border-radius:8px;text-align:right;font-size:18px;margin-top:10px">
      Total a pagar: <b>${money(total)}</b>
    </div>
    <p style="color:#777;font-size:12px;margin-top:16px">Este es un mensaje automático de ${esc(sucursalNombre || 'Facturafy')}.</p>
  </div>`;
}

export const envioCorreoService = {
  async listarContactos(sucursalId) {
    return query(
      `SELECT id, clave, nombre, email FROM contacto_correo
        WHERE sucursal_id = ? AND activo = 1 ORDER BY nombre, clave`,
      [sucursalId]
    );
  },

  /** Merge (upsert por clave) de contactos cargados desde Excel. */
  async guardarContactos(sucursalId, items) {
    await assertUsaEnvioCorreos(sucursalId);
    if (!Array.isArray(items)) throw badRequest('items debe ser una lista');
    const existentes = new Set(
      (await query(`SELECT clave FROM contacto_correo WHERE sucursal_id = ?`, [sucursalId])).map((r) => r.clave)
    );
    const res = { agregados: 0, actualizados: 0, invalidos: 0 };
    for (const it of items) {
      const clave = claveNorm(it.clave);
      const email = String(it.email ?? '').trim();
      const nombre = it.nombre ? String(it.nombre).trim() : null;
      if (!clave || !EMAIL_RE.test(email)) { res.invalidos++; continue; }
      await query(
        `INSERT INTO contacto_correo (sucursal_id, clave, nombre, email, activo) VALUES (?,?,?,?,1)
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), email = VALUES(email), activo = 1`,
        [sucursalId, clave, nombre, email]
      );
      if (existentes.has(clave)) res.actualizados++; else { res.agregados++; existentes.add(clave); }
    }
    return res;
  },

  async borrarContacto(id) {
    await query(`UPDATE contacto_correo SET activo = 0 WHERE id = ?`, [id]);
    return { ok: true };
  },

  /**
   * Envia el estado de cuenta a cada clave del Excel, cruzando con contacto_correo.
   * estados: [{ clave, lineas:[{concepto,fecha,monto}], total }].
   */
  async enviar(sucursalId, { asunto, mensaje, desde, hasta, usuarioId, estados } = {}) {
    await assertUsaEnvioCorreos(sucursalId);
    const lista = Array.isArray(estados) ? estados : [];
    if (!lista.length) throw badRequest('No hay estados de cuenta para enviar');

    const sucRows = await query(
      `SELECT nombre, smtp_user AS smtpUser, smtp_pass AS smtpPass, smtp_host AS smtpHost,
              smtp_port AS smtpPort, smtp_secure AS smtpSecure, smtp_from AS smtpFrom
         FROM sucursal WHERE id = ?`,
      [sucursalId]
    );
    const sucursalNombre = sucRows[0]?.nombre || 'Facturafy';
    const smtp = resolverSmtp(sucRows[0]);
    if (!smtp) throw badRequest('El envío de correo no está configurado para esta sucursal (SMTP propio o global en el .env)');
    const transporter = construirTransporter(smtp);
    const usaPropia = !!(sucRows[0]?.smtpUser && sucRows[0]?.smtpPass);
    const respaldo = usaPropia ? smtpEnv() : null;
    const transporterRespaldo = respaldo ? construirTransporter(respaldo) : null;

    // Mapa de contactos por clave normalizada.
    const contactos = new Map();
    for (const c of await query(
      `SELECT clave, nombre, email FROM contacto_correo WHERE sucursal_id = ? AND activo = 1`, [sucursalId]
    )) contactos.set(c.clave, c);

    const detalle = [];
    let enviados = 0, fallidos = 0, sinContacto = 0;
    for (const e of lista) {
      const clave = claveNorm(e.clave);
      const lineas = Array.isArray(e.lineas) ? e.lineas.map((l) => ({ ...l, monto: Number(l.monto) || 0 })) : [];
      const total = e.total != null ? Number(e.total) : lineas.reduce((a, l) => a + l.monto, 0);
      const c = contactos.get(clave);
      if (!c || !c.email) {
        sinContacto++;
        detalle.push({ clave, nombre: c?.nombre || null, email: c?.email || null, monto: total, estado: 'SIN_CONTACTO', error: 'Sin contacto/email para esa clave' });
        continue;
      }
      try {
        const r = await enviarConFallback(
          { transporter, from: smtp.from, transporterRespaldo, fromRespaldo: respaldo?.from },
          { to: c.email, subject: asunto || `Estado de cuenta - ${sucursalNombre}`, html: htmlEstado({ nombre: c.nombre, lineas, total, asunto, mensaje, sucursalNombre }) }
        );
        enviados++;
        detalle.push({ clave, nombre: c.nombre, email: c.email, monto: total, estado: 'ENVIADO', error: r.via === 'respaldo' ? 'enviado por respaldo (.env)' : null });
      } catch (err) {
        fallidos++;
        detalle.push({ clave, nombre: c.nombre, email: c.email, monto: total, estado: 'FALLIDO', error: err.message });
      }
    }

    // Historial del lote.
    const ins = await query(
      `INSERT INTO envio_correo (sucursal_id, fecha, usuario_id, asunto, periodo_desde, periodo_hasta, total, enviados, fallidos, sin_contacto)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [sucursalId, nowDateTime(), usuarioId ?? null, asunto || null, desde || null, hasta || null, lista.length, enviados, fallidos, sinContacto]
    );
    const envioId = ins.insertId;
    for (const d of detalle) {
      await query(
        `INSERT INTO envio_correo_detalle (envio_id, clave, nombre, email, monto, estado, error) VALUES (?,?,?,?,?,?,?)`,
        [envioId, d.clave, d.nombre, d.email, d.monto, d.estado, d.error]
      );
    }
    return { envioId, enviados, fallidos, sinContacto, total: lista.length };
  },

  async historial(sucursalId) {
    return query(
      `SELECT ec.id, ec.fecha, ec.asunto, ec.periodo_desde AS periodoDesde, ec.periodo_hasta AS periodoHasta,
              ec.total, ec.enviados, ec.fallidos, ec.sin_contacto AS sinContacto,
              u.nombre AS usuarioNombre, u.apellido AS usuarioApellido
         FROM envio_correo ec
         LEFT JOIN usuario u ON u.id = ec.usuario_id
        WHERE ec.sucursal_id = ? ORDER BY ec.fecha DESC, ec.id DESC`,
      [sucursalId]
    );
  },

  async detalleLote(envioId) {
    const cab = await query(`SELECT id, asunto, fecha FROM envio_correo WHERE id = ?`, [envioId]);
    const detalle = await query(
      `SELECT clave, nombre, email, monto, estado, error FROM envio_correo_detalle WHERE envio_id = ? ORDER BY id`,
      [envioId]
    );
    return { envio: cab[0] || null, detalle };
  },
};

export const envioCorreoRoutes = new Router();

// Contactos (lista reutilizable).
envioCorreoRoutes.get('/contactos/sucursal/:sucursalId', async (ctx, res) => {
  await assertUsaEnvioCorreos(ctx.params.sucursalId);
  sendJson(res, 200, await envioCorreoService.listarContactos(ctx.params.sucursalId));
});
envioCorreoRoutes.post('/contactos/sucursal/:sucursalId', async (ctx, res) => {
  const items = ctx.body?.items || ctx.body;
  sendJson(res, 200, await envioCorreoService.guardarContactos(ctx.params.sucursalId, items));
});
envioCorreoRoutes.delete('/contactos/:id', async (ctx, res) => {
  sendJson(res, 200, await envioCorreoService.borrarContacto(ctx.params.id));
});

// Envio del estado de cuenta de la quincena.
envioCorreoRoutes.post('/enviar/sucursal/:sucursalId', async (ctx, res) => {
  const { asunto, mensaje, desde, hasta, usuarioId, estados } = ctx.body || {};
  sendJson(res, 200, await envioCorreoService.enviar(ctx.params.sucursalId, { asunto, mensaje, desde, hasta, usuarioId, estados }));
});

// Historial de envios y detalle de un lote.
envioCorreoRoutes.get('/sucursal/:sucursalId', async (ctx, res) => {
  await assertUsaEnvioCorreos(ctx.params.sucursalId);
  sendJson(res, 200, await envioCorreoService.historial(ctx.params.sucursalId));
});
envioCorreoRoutes.get('/:id', async (ctx, res) => {
  sendJson(res, 200, await envioCorreoService.detalleLote(ctx.params.id));
});
