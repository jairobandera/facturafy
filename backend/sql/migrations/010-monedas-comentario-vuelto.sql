-- ============================================================
--  Migracion 010 - Monedas (cotizaciones), comentario y vuelto en la venta
-- ============================================================
--  Agrega:
--    * cotizacion: cotizaciones manuales de USD/ARS/EUR por empresa (compra/venta
--      en PESOS URUGUAYOS por 1 unidad de la moneda).
--    * venta.moneda_pago / cotizacion / total_moneda: cobro en otra moneda (el total
--      "oficial" sigue en UYU).
--    * venta.efectivo_recibido / vuelto: efectivo entregado y vuelto (ventas contado).
--    * venta.comentario: nota opcional del cajero (sale en boleta y correo).
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/010-monedas-comentario-vuelto.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizacion (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  empresa_id  BIGINT NOT NULL,
  moneda      VARCHAR(3) NOT NULL,
  compra      FLOAT NOT NULL DEFAULT 0,
  venta       FLOAT NOT NULL DEFAULT 0,
  actualizado DATETIME,
  CONSTRAINT uk_cotizacion_empresa_moneda UNIQUE (empresa_id, moneda),
  CONSTRAINT fk_cotizacion_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE venta
  ADD COLUMN moneda_pago       VARCHAR(3) NOT NULL DEFAULT 'UYU' AFTER forma_pago,
  ADD COLUMN cotizacion        FLOAT NOT NULL DEFAULT 1          AFTER moneda_pago,
  ADD COLUMN total_moneda      FLOAT NOT NULL DEFAULT 0          AFTER cotizacion,
  ADD COLUMN efectivo_recibido FLOAT                             AFTER total_moneda,
  ADD COLUMN vuelto            FLOAT                             AFTER efectivo_recibido,
  ADD COLUMN comentario        VARCHAR(500)                      AFTER vuelto;

-- Deja consistentes las ventas ya existentes (todas en UYU).
UPDATE venta SET total_moneda = total WHERE total_moneda = 0;
