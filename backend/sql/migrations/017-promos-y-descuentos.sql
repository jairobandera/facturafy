-- ============================================================
--  Migracion 017 - Promos y descuentos (solo paquete completo)
-- ============================================================
--  - promocion / promocion_producto: precio especial para una lista de productos,
--    por sucursal, con vigencia (desde/hasta; hasta NULL = sin fin / baja manual).
--  - descuento_codigo: codigos de un solo uso que el cajero aplica en el POS (% o
--    monto fijo sobre el total), por sucursal, con vencimiento opcional.
--  - venta: columnas para registrar el descuento aplicado (la columna `descuento`
--    ya existia y guarda el monto).
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/017-promos-y-descuentos.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS promocion (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id BIGINT NOT NULL,
  nombre      VARCHAR(255) NOT NULL,
  precio      DECIMAL(14,3) NOT NULL,          -- precio especial aplicado a cada producto de la promo
  fecha_desde DATE,                            -- NULL = desde ya
  fecha_hasta DATE,                            -- NULL = sin fin (hasta baja manual)
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_promocion_sucursal (sucursal_id, activo),
  CONSTRAINT fk_promocion_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS promocion_producto (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  promocion_id BIGINT NOT NULL,
  producto_id  BIGINT NOT NULL,
  CONSTRAINT uk_promoprod UNIQUE (promocion_id, producto_id),
  CONSTRAINT fk_promoprod_promo    FOREIGN KEY (promocion_id) REFERENCES promocion(id) ON DELETE CASCADE,
  CONSTRAINT fk_promoprod_producto FOREIGN KEY (producto_id)  REFERENCES producto(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS descuento_codigo (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id    BIGINT NOT NULL,
  codigo         VARCHAR(60) NOT NULL,
  tipo           VARCHAR(20) NOT NULL,          -- PORCENTAJE | MONTO
  valor          DECIMAL(14,3) NOT NULL,
  fecha_desde    DATE,
  fecha_hasta    DATE,                          -- vencimiento (NULL = sin vencimiento)
  usado          BOOLEAN NOT NULL DEFAULT FALSE,
  usado_venta_id BIGINT,
  usado_fecha    DATETIME,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_descuento_sucursal_codigo UNIQUE (sucursal_id, codigo),
  CONSTRAINT fk_descuento_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  CONSTRAINT fk_descuento_venta    FOREIGN KEY (usado_venta_id) REFERENCES venta(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE venta ADD COLUMN descuento_codigo_id BIGINT NULL AFTER descuento;
ALTER TABLE venta ADD COLUMN descuento_codigo    VARCHAR(60) NULL AFTER descuento_codigo_id;
ALTER TABLE venta ADD COLUMN descuento_tipo      VARCHAR(20) NULL AFTER descuento_codigo;
ALTER TABLE venta ADD COLUMN descuento_valor     DECIMAL(14,3) NULL AFTER descuento_tipo;
