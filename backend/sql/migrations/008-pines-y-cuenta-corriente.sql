-- ============================================================
--  Migracion 008 - PINes multiples y cuenta corriente de clientes
-- ============================================================
--  Agrega:
--    * sucursal_pin: hasta 3 PINes de anulacion por sucursal (reemplaza la
--      columna unica sucursal.pin_autorizacion de la migracion 007).
--    * sucursal.limite_credito_default: limite de credito por defecto para
--      cuentas nuevas.
--    * cliente.limite_credito: limite de credito por cliente.
--    * cliente_movimiento: mayor de cuenta corriente (cargos de venta/mora y pagos).
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/008-pines-y-cuenta-corriente.sql
--
--  Los ALTER no son idempotentes: si ya fueron aplicados MySQL devuelve
--  "Duplicate column name" / "Unknown column" y se puede ignorar.
-- ============================================================

-- ---------------- PINes multiples ----------------
CREATE TABLE IF NOT EXISTS sucursal_pin (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id BIGINT NOT NULL,
  pin         VARCHAR(20) NOT NULL,
  etiqueta    VARCHAR(100),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_sucursalpin_sucursal (sucursal_id, activo),
  CONSTRAINT fk_sucursalpin_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migra el PIN unico anterior (migracion 007) a la tabla, si existe y tiene valor.
INSERT INTO sucursal_pin (sucursal_id, pin, etiqueta, activo)
  SELECT id, pin_autorizacion, 'PIN principal', 1
    FROM sucursal
   WHERE pin_autorizacion IS NOT NULL AND pin_autorizacion <> '';

-- Quita la columna unica (ya migrada a sucursal_pin).
ALTER TABLE sucursal DROP COLUMN pin_autorizacion;

-- ---------------- Limites de credito ----------------
ALTER TABLE sucursal ADD COLUMN limite_credito_default FLOAT NOT NULL DEFAULT 0 AFTER usa_facturacion;
ALTER TABLE cliente  ADD COLUMN limite_credito FLOAT NOT NULL DEFAULT 0 AFTER tipo_documento;

-- ---------------- Cuenta corriente ----------------
CREATE TABLE IF NOT EXISTS cliente_movimiento (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id  BIGINT NOT NULL,
  tipo        VARCHAR(20) NOT NULL,       -- CARGO_VENTA | CARGO_MORA | PAGO
  monto       FLOAT NOT NULL DEFAULT 0,
  fecha       DATETIME,
  venta_id    BIGINT,
  descripcion VARCHAR(255),
  usuario_id  BIGINT,
  INDEX idx_climov_cliente (cliente_id),
  CONSTRAINT fk_climov_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id),
  CONSTRAINT fk_climov_venta   FOREIGN KEY (venta_id)   REFERENCES venta(id),
  CONSTRAINT fk_climov_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Opcional: respaldar en la cuenta corriente las ventas a credito EMITIDAS que ya
-- existian (para que el saldo arranque con la deuda vigente). Comentado por defecto.
-- INSERT INTO cliente_movimiento (cliente_id, tipo, monto, fecha, venta_id, descripcion)
--   SELECT cliente_id, 'CARGO_VENTA', total, fecha_hora, id, CONCAT('Venta #', id)
--     FROM venta
--    WHERE forma_pago = 'CREDITO' AND estado = 'EMITIDA' AND cliente_id IS NOT NULL;
