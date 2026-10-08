// Estado de cuenta de la quincena: arma el detalle de las facturas a credito del
// periodo + el saldo (monto a pagar) y lo envia por correo al cliente. "Cerrar la
// quincena" = generar y mandar estos estados de cuenta; NO modifica el saldo.
import { query } from '../../config/db.js';
import { badRequest } from '../../core/httpError.js';
import { resolverSmtp, construirTransporter, enviarConFallback, smtpEnv } from '../../core/mailer.js';
import { cuentaService } from './cuenta.js';

function money(n) {
  return Number(n || 0).toLocaleString('es-UY', { style: 'currency', currency: 'UYU', minimumFractionDigits: 2 });
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Ventas a credito EMITIDAS del cliente en el periodo. */
async function ventasCreditoPeriodo(clienteId, desde, hasta) {
  const params = [clienteId];
  let where = `WHERE cliente_id = ? AND forma_pago = 'CREDITO' AND estado = 'EMITIDA'`;
  if (desde) { where += ' AND fecha_hora >= ?'; params.push(`${desde} 00:00:00`); }
  if (hasta) { where += ' AND fecha_hora <= ?'; params.push(`${hasta} 23:59:59`); }
  const rows = await query(
    `SELECT id, fecha_hora AS fechaHora, total, comentario FROM venta ${where} ORDER BY fecha_hora, id`,
    params
  );
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

/** Datos del estado de cuenta de un cliente para el periodo. */
export async function statement(clienteId, { desde, hasta } = {}) {
  const resumen = await cuentaService.resumen(clienteId);
  const ventas = await ventasCreditoPeriodo(clienteId, desde, hasta);
  const movimientosPeriodo = await cuentaService.movimientos(clienteId, { desde, hasta });
  const totalPeriodo = ventas.reduce((a, v) => a + v.total, 0);
  return { cliente: resumen.cliente, limite: resumen.limite, saldo: resumen.saldo, ventas, movimientosPeriodo, totalPeriodo };
}

/** HTML del estado de cuenta para el correo. */
export function htmlEstadoCuenta(st, { desde, hasta, sucursalNombre } = {}) {
  const nombre = st.cliente.razonSocial || st.cliente.nombreFantasia || 'Cliente';
  const periodo = desde && hasta ? `${desde} a ${hasta}` : 'período';
  const filasVentas = st.ventas.length
    ? st.ventas.map((v) => `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">#${v.id}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(String(v.fechaHora).replace('T', ' '))}${v.comentario ? `<br><span style="color:#888;font-size:12px">${esc(v.comentario)}</span>` : ''}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${money(v.total)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:8px;color:#777">Sin facturas a crédito en el período.</td></tr>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#222">
    <h2 style="color:#2563eb;margin-bottom:4px">Estado de cuenta</h2>
    <div style="color:#555;margin-bottom:12px">${esc(sucursalNombre || 'Facturafy')} · Quincena ${esc(periodo)}</div>
    <p>Estimado/a <b>${esc(nombre)}</b>${st.cliente.rut ? ` (${esc(st.cliente.tipoDocumento || 'RUT')}: ${esc(st.cliente.rut)})` : ''},</p>
    <p>Le enviamos el detalle de sus compras a crédito y el saldo a pagar.</p>
    <table style="border-collapse:collapse;width:100%;margin:8px 0">
      <thead><tr style="background:#f1f5f9">
        <th style="padding:6px 8px;text-align:left">Factura</th>
        <th style="padding:6px 8px;text-align:left">Fecha</th>
        <th style="padding:6px 8px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${filasVentas}</tbody>
    </table>
    <div style="text-align:right;margin:6px 0">Compras a crédito del período: <b>${money(st.totalPeriodo)}</b></div>
    <div style="background:#2563eb;color:#fff;padding:12px;border-radius:8px;text-align:right;font-size:18px;margin-top:10px">
      Saldo total a pagar: <b>${money(st.saldo)}</b>
    </div>
    <p style="color:#777;font-size:12px;margin-top:16px">Este es un mensaje automático de ${esc(sucursalNombre || 'Facturafy')}.</p>
  </div>`;
}

/**
 * Envia el estado de cuenta a uno, varios o todos los clientes de la sucursal.
 * clienteIds: array de ids; si viene vacio/omitido, se toma a TODOS los clientes
 * activos de la sucursal. Devuelve el detalle de enviados / sin email / omitidos / fallidos.
 */
export async function enviarQuincena({ sucursalId, desde, hasta, clienteIds, usuarioId }) {
  if (!sucursalId) throw badRequest('sucursalId es requerido');

  const sucRows = await query(
    `SELECT nombre, smtp_user AS smtpUser, smtp_pass AS smtpPass, smtp_host AS smtpHost,
            smtp_port AS smtpPort, smtp_secure AS smtpSecure, smtp_from AS smtpFrom
       FROM sucursal WHERE id = ?`,
    [sucursalId]
  );
  const sucursalNombre = sucRows[0]?.nombre || 'Facturafy';

  const smtp = resolverSmtp(sucRows[0]);
  if (!smtp) {
    throw badRequest('El envío de correo no está configurado para esta sucursal. Cargá el correo y la contraseña de aplicación en el formulario de la sucursal (superadmin), o configurá el SMTP global en el .env.');
  }
  const transporter = construirTransporter(smtp);
  // Si la sucursal usa su propia casilla y hay un SMTP global en el .env, se prepara
  // como respaldo: si falla el envio con el de la sucursal, se reintenta con el del .env.
  const usaPropia = !!(sucRows[0]?.smtpUser && sucRows[0]?.smtpPass);
  const respaldo = usaPropia ? smtpEnv() : null;
  const transporterRespaldo = respaldo ? construirTransporter(respaldo) : null;

  let candidatos;
  if (Array.isArray(clienteIds) && clienteIds.length) {
    const inClause = clienteIds.map(() => '?').join(',');
    candidatos = await query(
      `SELECT id, email FROM cliente WHERE sucursal_id = ? AND activo = 1 AND id IN (${inClause})`,
      [sucursalId, ...clienteIds]
    );
  } else {
    candidatos = await query(`SELECT id, email FROM cliente WHERE sucursal_id = ? AND activo = 1`, [sucursalId]);
  }

  const resultado = { enviados: [], sinEmail: [], omitidos: [], fallidos: [] };
  for (const c of candidatos) {
    const st = await statement(c.id, { desde, hasta });
    const nombre = st.cliente.razonSocial || st.cliente.nombreFantasia || `Cliente #${c.id}`;
    // Nada que cobrar ni mostrar: no se molesta al cliente.
    if (!st.ventas.length && st.saldo <= 0) { resultado.omitidos.push({ id: c.id, nombre }); continue; }
    if (!c.email) { resultado.sinEmail.push({ id: c.id, nombre }); continue; }
    const mensaje = {
      to: c.email,
      subject: `Estado de cuenta - ${sucursalNombre}`,
      html: htmlEstadoCuenta(st, { desde, hasta, sucursalNombre }),
    };
    try {
      // Reintenta con el SMTP global del .env si falla la casilla propia de la sucursal.
      const r = await enviarConFallback({
        transporter, from: smtp.from,
        transporterRespaldo, fromRespaldo: respaldo?.from,
      }, mensaje);
      resultado.enviados.push({ id: c.id, nombre, email: c.email, via: r.via });
    } catch (err) {
      resultado.fallidos.push({ id: c.id, nombre, error: err.message });
    }
  }
  return resultado;
}
