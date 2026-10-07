-- ============================================================
--  Stockify 2.0 - Esquema de base de datos (MySQL / MariaDB)
--  Migracion desde el modelo JPA/PostgreSQL original.
-- ============================================================
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS cliente_movimiento;
DROP TABLE IF EXISTS venta_detalle;
DROP TABLE IF EXISTS venta;
DROP TABLE IF EXISTS turno_usuario;
DROP TABLE IF EXISTS turno;
DROP TABLE IF EXISTS cliente;
DROP TABLE IF EXISTS sucursal_pin;
DROP TABLE IF EXISTS reporte_conteo;
DROP TABLE IF EXISTS producto_proveedor;
DROP TABLE IF EXISTS conteo_usuario;
DROP TABLE IF EXISTS conteo_producto;
DROP TABLE IF EXISTS sucursal_proveedor;
DROP TABLE IF EXISTS lote;
DROP TABLE IF EXISTS codigo_barra;
DROP TABLE IF EXISTS conteo;
DROP TABLE IF EXISTS reporte;
DROP TABLE IF EXISTS producto;
DROP TABLE IF EXISTS categoria;
DROP TABLE IF EXISTS proveedor;
DROP TABLE IF EXISTS usuario;
DROP TABLE IF EXISTS sucursal;
DROP TABLE IF EXISTS empresa;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------- EMPRESA ----------------
CREATE TABLE empresa (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(255),
  rut       VARCHAR(255),
  direccion VARCHAR(255),
  telefono  VARCHAR(255),
  activo    BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- SUCURSAL ----------------
CREATE TABLE sucursal (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(255),
  direccion  VARCHAR(255),
  telefono   VARCHAR(255),
  empresa_id BIGINT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  -- Habilita el apartado de Lotes para los administradores de esta sucursal.
  -- Si esta en 0, el menu queda deshabilitado y la API de lotes rechaza la sucursal.
  usa_lotes  BOOLEAN NOT NULL DEFAULT TRUE,
  -- Paquetes contratados por la sucursal (los configura el superadmin):
  --   usa_stock:       control de stock (conteos + estadisticas de conteo).
  --   usa_facturacion: facturacion (punto de venta + ventas + clientes).
  -- Una empresa puede tener una sucursal con el paquete completo y otra con uno solo.
  usa_stock       BOOLEAN NOT NULL DEFAULT TRUE,
  usa_facturacion BOOLEAN NOT NULL DEFAULT FALSE,
  -- Limite de credito por defecto para las cuentas de cliente NUEVAS de la sucursal
  -- (lo fija el administrador). 0 = sin limite. Al crear un cliente se copia a
  -- cliente.limite_credito, que el admin puede editar despues por cliente.
  limite_credito_default FLOAT NOT NULL DEFAULT 0,
  -- Credenciales de correo (SMTP) propias de la sucursal, para enviar el estado de
  -- cuenta de la quincena desde SU casilla. Las carga el superadministrador en el
  -- formulario de sucursal. smtp_pass NUNCA se devuelve en un GET. Si estan vacias,
  -- el envio usa la config global del .env (si existe).
  smtp_user   VARCHAR(255),
  smtp_pass   VARCHAR(255),
  smtp_host   VARCHAR(255) DEFAULT 'smtp.gmail.com',
  smtp_port   INT DEFAULT 465,
  smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
  smtp_from   VARCHAR(255),
  CONSTRAINT fk_sucursal_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- SUCURSAL_PIN (PINes de anulacion) ----------------
-- Hasta 3 PINes activos por sucursal (el maximo se controla en el servicio). El cajero
-- ingresa cualquiera de ellos para anular una venta. El valor del PIN nunca se devuelve
-- en un GET: solo la etiqueta y si esta configurado. Los administra el administrador.
CREATE TABLE sucursal_pin (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id BIGINT NOT NULL,
  pin         VARCHAR(20) NOT NULL,
  etiqueta    VARCHAR(100),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_sucursalpin_sucursal (sucursal_id, activo),
  CONSTRAINT fk_sucursalpin_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- USUARIO ----------------
CREATE TABLE usuario (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(255),
  apellido       VARCHAR(255),
  nombre_usuario VARCHAR(255),
  contrasenia    VARCHAR(255),
  rol            VARCHAR(30),
  sucursal_id    BIGINT,
  -- Permite participar en conteos de otras sucursales de su misma empresa.
  cuenta_en_cualquier_sucursal BOOLEAN NOT NULL DEFAULT FALSE,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_usuario_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- CATEGORIA ----------------
CREATE TABLE categoria (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(255),
  descripcion       VARCHAR(255),
  codigo_categoria  VARCHAR(255),
  sucursal_id       BIGINT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_categoria_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- PROVEEDOR ----------------
CREATE TABLE proveedor (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  rut             VARCHAR(255) NOT NULL UNIQUE,
  nombre          VARCHAR(255) NOT NULL,
  direccion       VARCHAR(255),
  telefono        VARCHAR(255),
  nombre_vendedor VARCHAR(255),
  activo          BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- PRODUCTO ----------------
CREATE TABLE producto (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  codigo_producto VARCHAR(255) NOT NULL,
  imagen          LONGTEXT,
  nombre          VARCHAR(255) NOT NULL,
  detalle         VARCHAR(255),
  precio          FLOAT NOT NULL,
  cantidad_stock  BIGINT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  sucursal_id     BIGINT NOT NULL,
  categoria_id    BIGINT NOT NULL,
  -- El codigo de producto es unico dentro de la sucursal, no entre sucursales.
  CONSTRAINT uk_producto_codigo_sucursal UNIQUE (codigo_producto, sucursal_id),
  CONSTRAINT fk_producto_sucursal  FOREIGN KEY (sucursal_id)  REFERENCES sucursal(id),
  CONSTRAINT fk_producto_categoria FOREIGN KEY (categoria_id) REFERENCES categoria(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- CODIGO_BARRA ----------------
CREATE TABLE codigo_barra (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  codigo      VARCHAR(255) NOT NULL,
  producto_id BIGINT NOT NULL,
  -- Desnormalizado desde producto: MySQL no acepta un UNIQUE sobre una columna de
  -- otra tabla y el mismo EAN debe poder existir una vez por sucursal.
  -- Lo mantiene sincronizado syncCodigosBarra() en producto.service.js.
  sucursal_id BIGINT NOT NULL,
  -- Baja logica: un codigo nunca se borra. Las importaciones solo suman; solo la
  -- accion explicita del usuario desactiva uno (y deja de escanear, pero queda).
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_codigobarra_sucursal UNIQUE (codigo, sucursal_id),
  CONSTRAINT fk_codigobarra_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE,
  CONSTRAINT fk_codigobarra_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- LOTE ----------------
CREATE TABLE lote (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero_lote       VARCHAR(255) NOT NULL,
  fecha_ingreso     DATE NOT NULL,
  fecha_vencimiento DATE,
  cantidad_stock    INT NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Indica si este lote sumo su cantidad al stock del producto (mercaderia nueva).
  -- Si es 0 el lote solo etiqueta stock que ya estaba contado (por ejemplo el del Excel).
  afecta_stock      BOOLEAN NOT NULL DEFAULT FALSE,
  producto_id       BIGINT NOT NULL,
  -- El numero de lote lo asigna el proveedor: se repite entre productos, no dentro del mismo.
  CONSTRAINT uk_lote_numero_producto UNIQUE (numero_lote, producto_id),
  INDEX idx_lote_vencimiento (fecha_vencimiento),
  CONSTRAINT fk_lote_producto FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- PRODUCTO_PROVEEDOR (N:M) ----------------
CREATE TABLE producto_proveedor (
  producto_id  BIGINT NOT NULL,
  proveedor_id BIGINT NOT NULL,
  PRIMARY KEY (producto_id, proveedor_id),
  CONSTRAINT fk_pp_producto  FOREIGN KEY (producto_id)  REFERENCES producto(id)  ON DELETE CASCADE,
  CONSTRAINT fk_pp_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedor(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- SUCURSAL_PROVEEDOR ----------------
CREATE TABLE sucursal_proveedor (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id  BIGINT NOT NULL,
  proveedor_id BIGINT NOT NULL,
  CONSTRAINT fk_sp_sucursal  FOREIGN KEY (sucursal_id)  REFERENCES sucursal(id),
  CONSTRAINT fk_sp_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedor(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- CONTEO ----------------
CREATE TABLE conteo (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_hora        DATETIME,
  conteo_finalizado BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id        BIGINT,
  -- Sucursal en la que se cuenta. La elige el admin al crear el conteo (por defecto
  -- la suya) y de ella salen las categorias, los productos y el catalogo de escaneo.
  sucursal_id       BIGINT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  tipo_conteo       VARCHAR(20) NOT NULL DEFAULT 'LIBRE',
  INDEX idx_conteo_sucursal (sucursal_id, activo),
  CONSTRAINT fk_conteo_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id),
  CONSTRAINT fk_conteo_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- CONTEO_PRODUCTO (renglones del conteo) ----------------
CREATE TABLE conteo_producto (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  precio_actual     FLOAT NOT NULL DEFAULT 0,
  cantidad_esperada INT,
  cantidad_contada  INT,
  conteo_id         BIGINT,
  producto_id       BIGINT,
  usuario_id        BIGINT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_cp_conteo   FOREIGN KEY (conteo_id)   REFERENCES conteo(id),
  CONSTRAINT fk_cp_producto FOREIGN KEY (producto_id) REFERENCES producto(id),
  CONSTRAINT fk_cp_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- CONTEO_USUARIO (participantes) ----------------
CREATE TABLE conteo_usuario (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  conteo_id  BIGINT NOT NULL,
  CONSTRAINT uq_conteo_usuario UNIQUE (conteo_id, usuario_id),
  CONSTRAINT fk_cu_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  CONSTRAINT fk_cu_conteo  FOREIGN KEY (conteo_id)  REFERENCES conteo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- REPORTE ----------------
CREATE TABLE reporte (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_generacion      DATE,
  total_faltante        FLOAT NOT NULL DEFAULT 0,
  total_sobrante        FLOAT NOT NULL DEFAULT 0,
  diferencia_monetaria  FLOAT NOT NULL DEFAULT 0,
  activo                BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- REPORTE_CONTEO (N:M) ----------------
CREATE TABLE reporte_conteo (
  reporte_id BIGINT NOT NULL,
  conteo_id  BIGINT NOT NULL,
  PRIMARY KEY (reporte_id, conteo_id),
  CONSTRAINT fk_rc_reporte FOREIGN KEY (reporte_id) REFERENCES reporte(id) ON DELETE CASCADE,
  CONSTRAINT fk_rc_conteo  FOREIGN KEY (conteo_id)  REFERENCES conteo(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
--  FACTURACION
-- ============================================================

-- ---------------- CLIENTE ----------------
-- Scoped por sucursal. El RUT es opcional (el consumidor final no crea cliente)
-- y es unico dentro de la sucursal cuando esta presente.
CREATE TABLE cliente (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  rut             VARCHAR(50),
  razon_social    VARCHAR(255),
  nombre_fantasia VARCHAR(255),
  direccion       VARCHAR(255),
  telefono        VARCHAR(255),
  email           VARCHAR(255),
  -- Tipo de documento (preparado para la factura electronica de Uruguay).
  tipo_documento  VARCHAR(20) NOT NULL DEFAULT 'RUT',
  -- Limite de credito del cliente (0 = sin limite). Se copia de
  -- sucursal.limite_credito_default al crearlo; el admin lo edita por cliente.
  limite_credito  FLOAT NOT NULL DEFAULT 0,
  sucursal_id     BIGINT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_cliente_rut_sucursal UNIQUE (rut, sucursal_id),
  CONSTRAINT fk_cliente_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- TURNO (caja) ----------------
-- Un turno agrupa las ventas de una jornada de caja. Es UNO por sucursal a la vez:
-- mientras hay un turno ABIERTO, los cajeros que entran se suman a el (turno_usuario).
-- numero: 1=manana, 2=tarde, 3=noche, 4=otro. El responsable es el cajero que se
-- marco como tal al abrir o sumarse (puede no haber responsable todavia). El cierre
-- lo hace el responsable o un administrador y genera el reporte de arqueo.
CREATE TABLE turno (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id            BIGINT NOT NULL,
  numero                 TINYINT NOT NULL,                       -- 1..4
  estado                 VARCHAR(20) NOT NULL DEFAULT 'ABIERTO', -- ABIERTO | CERRADO
  fecha_apertura         DATETIME,
  fecha_cierre           DATETIME,
  usuario_apertura_id    BIGINT,                                 -- quien abrio el turno
  usuario_responsable_id BIGINT,                                 -- cajero responsable (NULL si nadie se marco)
  usuario_cierre_id      BIGINT,                                 -- quien lo cerro
  observaciones_cierre   VARCHAR(500),
  activo                 BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_turno_sucursal_estado (sucursal_id, estado),
  CONSTRAINT fk_turno_sucursal    FOREIGN KEY (sucursal_id)            REFERENCES sucursal(id),
  CONSTRAINT fk_turno_apertura    FOREIGN KEY (usuario_apertura_id)    REFERENCES usuario(id),
  CONSTRAINT fk_turno_responsable FOREIGN KEY (usuario_responsable_id) REFERENCES usuario(id),
  CONSTRAINT fk_turno_cierre      FOREIGN KEY (usuario_cierre_id)      REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- TURNO_USUARIO (cajeros que trabajan el turno) ----------------
-- Varios cajeros pueden trabajar el mismo turno. Un cajero se une una sola vez.
CREATE TABLE turno_usuario (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  turno_id       BIGINT NOT NULL,
  usuario_id     BIGINT NOT NULL,
  es_responsable BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_union    DATETIME,
  CONSTRAINT uk_turno_usuario UNIQUE (turno_id, usuario_id),
  CONSTRAINT fk_tu_turno   FOREIGN KEY (turno_id)   REFERENCES turno(id) ON DELETE CASCADE,
  CONSTRAINT fk_tu_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- VENTA ----------------
-- Registro interno de la venta. Las columnas cfe_* quedan preparadas para la
-- factura electronica de Uruguay (DGI/CFE): hoy la venta nace con estado INTERNO.
CREATE TABLE venta (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha_hora           DATETIME,
  sucursal_id          BIGINT NOT NULL,
  turno_id             BIGINT,              -- turno de caja al que pertenece la venta
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
  INDEX idx_venta_turno (turno_id),
  INDEX idx_venta_fecha (fecha_hora),
  CONSTRAINT fk_venta_turno    FOREIGN KEY (turno_id)    REFERENCES turno(id),
  CONSTRAINT fk_venta_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  CONSTRAINT fk_venta_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id),
  CONSTRAINT fk_venta_cliente  FOREIGN KEY (cliente_id)  REFERENCES cliente(id),
  CONSTRAINT fk_venta_usuario_anulacion FOREIGN KEY (usuario_anulacion_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- VENTA_DETALLE (renglones) ----------------
-- Guarda snapshot de codigo/nombre/precio: si despues editan el producto, el
-- historial de la venta no cambia.
CREATE TABLE venta_detalle (
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

-- ---------------- CLIENTE_MOVIMIENTO (cuenta corriente) ----------------
-- Mayor de la cuenta corriente del cliente. El saldo (lo que debe) es
-- SUMA(cargos) - SUMA(pagos). Tipos:
--   CARGO_VENTA -> una venta a credito (referencia la venta)
--   CARGO_MORA  -> cargo por mora que aplica el administrador (fijo o %)
--   PAGO        -> abono del cliente (total o parcial)
-- monto siempre positivo; el signo lo da el tipo (CARGO_* suma, PAGO resta).
CREATE TABLE cliente_movimiento (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id  BIGINT NOT NULL,
  tipo        VARCHAR(20) NOT NULL,       -- CARGO_VENTA | CARGO_MORA | PAGO
  monto       FLOAT NOT NULL DEFAULT 0,
  fecha       DATETIME,
  venta_id    BIGINT,                     -- solo para CARGO_VENTA
  descripcion VARCHAR(255),
  usuario_id  BIGINT,                     -- quien lo registro
  INDEX idx_climov_cliente (cliente_id),
  CONSTRAINT fk_climov_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id),
  CONSTRAINT fk_climov_venta   FOREIGN KEY (venta_id)   REFERENCES venta(id),
  CONSTRAINT fk_climov_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
