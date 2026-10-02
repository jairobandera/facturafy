-- ============================================================
--  Migracion 006 - Modulo de Facturacion
-- ============================================================
--  Agrega los paquetes por sucursal (control de stock / facturacion),
--  y las tablas de clientes, ventas y renglones de venta.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/006-facturacion.sql
--
--  Los ALTER no son idempotentes: si ya fueron aplicados MySQL devuelve
--  "Duplicate column name" / "Table already exists" y se puede ignorar.
-- ============================================================

-- ---------------- PAQUETES POR SUCURSAL ----------------
-- usa_stock:       conteos + estadisticas de conteo (lo que ya existia).
-- usa_facturacion: punto de venta + ventas + clientes + estadisticas de venta.
-- Defaults preservan el comportamiento actual: toda sucursal existente queda
-- como "solo control de stock".
ALTER TABLE sucursal
  ADD COLUMN usa_stock BOOLEAN NOT NULL DEFAULT TRUE AFTER usa_lotes;
ALTER TABLE sucursal
  ADD COLUMN usa_facturacion BOOLEAN NOT NULL DEFAULT FALSE AFTER usa_stock;

-- ---------------- CLIENTE ----------------
-- Scoped por sucursal como el resto del sistema. El RUT es opcional: el
-- consumidor final no crea cliente. Cuando hay RUT es unico dentro de la sucursal.
CREATE TABLE IF NOT EXISTS cliente (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  rut             VARCHAR(50),
  razon_social    VARCHAR(255),
  nombre_fantasia VARCHAR(255),
  direccion       VARCHAR(255),
  telefono        VARCHAR(255),
  email           VARCHAR(255),
  -- Tipo de documento del cliente (preparado para la factura electronica de Uruguay).
  tipo_documento  VARCHAR(20) NOT NULL DEFAULT 'RUT',
  sucursal_id     BIGINT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_cliente_rut_sucursal UNIQUE (rut, sucursal_id),
  CONSTRAINT fk_cliente_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- VENTA ----------------
-- Registro interno de la venta. Las columnas cfe_* quedan preparadas para la
-- factura electronica de Uruguay (DGI/CFE): hoy la venta nace con estado INTERNO.
CREATE TABLE IF NOT EXISTS venta (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_hora           DATETIME,
  sucursal_id          BIGINT NOT NULL,
  usuario_id           BIGINT,              -- cajero que emitio la venta
  cliente_id           BIGINT,              -- NULL = consumidor final
  consumidor_final     BOOLEAN NOT NULL DEFAULT TRUE,
  subtotal             FLOAT NOT NULL DEFAULT 0,
  descuento            FLOAT NOT NULL DEFAULT 0,
  total                FLOAT NOT NULL DEFAULT 0,
  forma_pago           VARCHAR(20) NOT NULL DEFAULT 'CONTADO', -- CONTADO | CREDITO
  estado               VARCHAR(20) NOT NULL DEFAULT 'EMITIDA', -- EMITIDA | ANULADA
  motivo_anulacion     VARCHAR(500),
  fecha_anulacion      DATETIME,
  usuario_anulacion_id BIGINT,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  -- ---- Factura electronica (DGI/CFE Uruguay) - preparado, hoy sin uso ----
  cfe_tipo             VARCHAR(20),         -- E_TICKET | E_FACTURA
  cfe_serie            VARCHAR(10),
  cfe_numero           BIGINT,
  cfe_estado           VARCHAR(20) NOT NULL DEFAULT 'INTERNO', -- INTERNO|PENDIENTE|AUTORIZADO|RECHAZADO
  cfe_uuid             VARCHAR(100),
  cfe_cae              VARCHAR(100),
  cfe_qr_url           VARCHAR(500),
  cfe_hash             VARCHAR(255),
  INDEX idx_venta_sucursal_estado (sucursal_id, estado),
  INDEX idx_venta_fecha (fecha_hora),
  CONSTRAINT fk_venta_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  CONSTRAINT fk_venta_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id),
  CONSTRAINT fk_venta_cliente  FOREIGN KEY (cliente_id)  REFERENCES cliente(id),
  CONSTRAINT fk_venta_usuario_anulacion FOREIGN KEY (usuario_anulacion_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- VENTA_DETALLE (renglones) ----------------
-- Guarda snapshot de codigo/nombre/precio: si despues editan el producto, el
-- historial de la venta no cambia.
CREATE TABLE IF NOT EXISTS venta_detalle (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  venta_id        BIGINT NOT NULL,
  producto_id     BIGINT,
  codigo_producto VARCHAR(255),
  nombre          VARCHAR(255),
  precio_unitario FLOAT NOT NULL DEFAULT 0,
  cantidad        INT NOT NULL DEFAULT 0,
  subtotal        FLOAT NOT NULL DEFAULT 0,
  CONSTRAINT fk_vd_venta    FOREIGN KEY (venta_id)    REFERENCES venta(id) ON DELETE CASCADE,
  CONSTRAINT fk_vd_producto FOREIGN KEY (producto_id) REFERENCES producto(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
