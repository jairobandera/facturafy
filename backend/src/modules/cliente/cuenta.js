// Cuenta corriente del cliente (mayor cliente_movimiento). El saldo (lo que debe) es
// SUMA(cargos) - SUMA(pagos). Lo usan: la venta a credito (cargo), la anulacion
// (revierte el cargo), y las pantallas del administrador (pagos, mora, estado de cuenta).
import { query } from '../../config/db.js';
import { badRequest, notFound } from '../../core/httpError.js';

const TIPOS = ['CARGO_VENTA', 'CARGO_MORA', 'PAGO'];

/** Fecha y hora LOCAL del servidor en formato MySQL. */
function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Saldo del cliente usando una conexion dada (dentro de una transaccion). */
export async function saldoConConn(conn, clienteId) {
  const [rows] = await conn.execute(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'PAGO' THEN -monto ELSE monto END), 0) AS saldo
       FROM cliente_movimiento WHERE cliente_id = ?`,
    [clienteId]
  );
  return round2(rows[0]?.saldo || 0);
}

/** Inserta un CARGO_VENTA dentro de la transaccion de la venta. */
export async function cargarVenta(conn, { clienteId, ventaId, monto, descripcion, usuarioId }) {
  await conn.execute(
    `INSERT INTO cliente_movimiento (cliente_id, tipo, monto, fecha, venta_id, descripcion, usuario_id)
     VALUES (?, 'CARGO_VENTA', ?, ?, ?, ?, ?)`,
    [clienteId, round2(monto), nowDateTime(), ventaId, descripcion || null, usuarioId ?? null]
  );
}

/** Revierte el cargo de una venta anulada (borra el CARGO_VENTA de esa venta). */
export async function revertirVenta(conn, ventaId) {
  await conn.execute(
    `DELETE FROM cliente_movimiento WHERE tipo = 'CARGO_VENTA' AND venta_id = ?`,
    [ventaId]
  );
}

export const cuentaService = {
  async saldo(clienteId) {
    const rows = await query(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'PAGO' THEN -monto ELSE monto END), 0) AS saldo
         FROM cliente_movimiento WHERE cliente_id = ?`,
      [clienteId]
    );
    return round2(rows[0]?.saldo || 0);
  },

  async movimientos(clienteId, { desde, hasta } = {}) {
    const params = [clienteId];
    let where = 'WHERE m.cliente_id = ?';
    if (desde) { where += ' AND m.fecha >= ?'; params.push(`${desde} 00:00:00`); }
    if (hasta) { where += ' AND m.fecha <= ?'; params.push(`${hasta} 23:59:59`); }
    const rows = await query(
      `SELECT m.id, m.tipo, m.monto, m.fecha, m.venta_id AS ventaId, m.descripcion,
              m.usuario_id AS usuarioId
         FROM cliente_movimiento m ${where}
        ORDER BY m.fecha, m.id`,
      params
    );
    return rows.map((r) => ({ ...r, monto: Number(r.monto) }));
  },

  /** Resumen de la cuenta: limite, saldo, totales y lista de movimientos. */
  async resumen(clienteId) {
    const cli = await query(
      `SELECT id, razon_social AS razonSocial, nombre_fantasia AS nombreFantasia, rut,
              tipo_documento AS tipoDocumento, email, telefono, direccion,
              limite_credito AS limiteCredito, sucursal_id AS sucursalId
         FROM cliente WHERE id = ?`,
      [clienteId]
    );
    if (!cli.length) throw notFound(`Cliente no encontrado con id: ${clienteId}`);
    const cliente = { ...cli[0], limiteCredito: Number(cli[0].limiteCredito || 0) };

    const movimientos = await this.movimientos(clienteId);
    let cargosVenta = 0, cargosMora = 0, pagos = 0;
    for (const m of movimientos) {
      if (m.tipo === 'PAGO') pagos += m.monto;
      else if (m.tipo === 'CARGO_MORA') cargosMora += m.monto;
      else cargosVenta += m.monto;
    }
    const saldo = round2(cargosVenta + cargosMora - pagos);
    const limite = cliente.limiteCredito;
    const disponible = limite > 0 ? round2(limite - saldo) : null;
    return {
      cliente,
      limite,
      saldo,
      disponible,
      totales: {
        cargosVenta: round2(cargosVenta),
        cargosMora: round2(cargosMora),
        pagos: round2(pagos),
      },
      movimientos,
    };
  },

  /** Registra un pago/abono del cliente (baja el saldo). */
  async registrarPago(clienteId, { monto, nota, usuarioId } = {}) {
    const m = round2(monto);
    if (!Number.isFinite(m) || m <= 0) throw badRequest('El monto del pago debe ser mayor a 0');
    await query(
      `INSERT INTO cliente_movimiento (cliente_id, tipo, monto, fecha, descripcion, usuario_id)
       VALUES (?, 'PAGO', ?, ?, ?, ?)`,
      [clienteId, m, nowDateTime(), nota || 'Pago', usuarioId ?? null]
    );
    return this.resumen(clienteId);
  },

  /**
   * Aplica un cargo por mora. modo 'FIJO' usa `valor` como importe; modo 'PORCENTAJE'
   * calcula `valor`% sobre el saldo impago actual.
   */
  async aplicarMora(clienteId, { modo, valor, nota, usuarioId } = {}) {
    const v = Number(valor);
    if (!Number.isFinite(v) || v <= 0) throw badRequest('El valor de la mora debe ser mayor a 0');
    let monto;
    let desc;
    if (modo === 'PORCENTAJE') {
      const saldo = await this.saldo(clienteId);
      if (saldo <= 0) throw badRequest('El cliente no tiene saldo impago sobre el cual aplicar un porcentaje');
      monto = round2(saldo * v / 100);
      desc = nota || `Mora ${v}% sobre saldo`;
    } else if (modo === 'FIJO') {
      monto = round2(v);
      desc = nota || 'Mora (monto fijo)';
    } else {
      throw badRequest("El modo de mora debe ser 'FIJO' o 'PORCENTAJE'");
    }
    await query(
      `INSERT INTO cliente_movimiento (cliente_id, tipo, monto, fecha, descripcion, usuario_id)
       VALUES (?, 'CARGO_MORA', ?, ?, ?, ?)`,
      [clienteId, monto, nowDateTime(), desc, usuarioId ?? null]
    );
    return this.resumen(clienteId);
  },

  /**
   * Cancela (elimina) un movimiento manual de la cuenta: solo CARGO_MORA o PAGO
   * (por un error al cargarlo). Las ventas a credito se revierten anulando la venta.
   */
  async cancelarMovimiento(clienteId, movId) {
    const rows = await query(
      `SELECT tipo FROM cliente_movimiento WHERE id = ? AND cliente_id = ?`,
      [movId, clienteId]
    );
    if (!rows.length) throw notFound(`Movimiento no encontrado con id: ${movId}`);
    if (!['CARGO_MORA', 'PAGO'].includes(rows[0].tipo)) {
      throw badRequest('Solo se pueden cancelar cargos de mora o pagos. Para revertir una venta a crédito, anulá la venta.');
    }
    await query(`DELETE FROM cliente_movimiento WHERE id = ? AND cliente_id = ?`, [movId, clienteId]);
    return this.resumen(clienteId);
  },

  /** Fija el limite de credito del cliente (0 = sin limite). */
  async setLimite(clienteId, limite) {
    const l = Number(limite);
    if (!Number.isFinite(l) || l < 0) throw badRequest('El límite debe ser 0 o un número positivo');
    const res = await query(`UPDATE cliente SET limite_credito = ? WHERE id = ?`, [round2(l), clienteId]);
    if (res.affectedRows === 0) throw notFound(`Cliente no encontrado con id: ${clienteId}`);
    return this.resumen(clienteId);
  },
};

export { TIPOS as TIPOS_MOVIMIENTO };
