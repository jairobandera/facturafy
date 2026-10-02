-- ============================================================
--  Stockify 2.0 - Dump completo importable (MySQL / MariaDB)
--  Generado por: npm run db:export
--
--  Como importar:
--   * IDE/cliente (HeidiSQL, Workbench, DBeaver, phpMyAdmin):
--       abrir este archivo y ejecutarlo, o "Importar" este .sql.
--   * Consola:  mysql -u root -p < stockify_import.sql
--
--  Crea la base "stockify", todas las tablas y datos de ejemplo.
--  Usuarios de prueba (contrasenia = "12345"): superadmin / admin / empleado
-- ============================================================

CREATE DATABASE IF NOT EXISTS `stockify` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `stockify`;

-- ============================================================
--  Stockify 2.0 - Esquema de base de datos (MySQL / MariaDB)
--  Migracion desde el modelo JPA/PostgreSQL original.
-- ============================================================
SET FOREIGN_KEY_CHECKS = 0;

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
  CONSTRAINT fk_sucursal_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id)
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
--  Datos de ejemplo (usuarios de prueba, contrasenia = "12345")
-- ============================================================

INSERT INTO empresa (id, nombre, rut, direccion, telefono) VALUES
  (1, 'Distribuidora Demo S.A.', '210000000012', 'Av. Siempre Viva 742', '099111222');

-- usa_lotes: Pocitos queda sin el apartado de Lotes para mostrar la opcion del superadmin.
INSERT INTO sucursal (id, nombre, direccion, telefono, empresa_id, usa_lotes) VALUES
  (1, 'Sucursal Centro',  'Calle 18 de Julio 1234', '099333444', 1, 1),
  (2, 'Sucursal Pocitos', 'Av. Brasil 2500',        '099555666', 1, 0);

-- cuenta_en_cualquier_sucursal: "empleado2" puede contar en las dos sucursales.
INSERT INTO usuario (id, nombre, apellido, nombre_usuario, contrasenia, rol, sucursal_id, cuenta_en_cualquier_sucursal) VALUES
  (1, 'Sofia',  'Perez',     'superadmin', '$2a$10$4vSXL/OuAJSMEnfP3LV2AeunCkD5LF1/aOBWyZElbOe8yBGTLlZyS', 'SUPERADMINISTRADOR', 1, 0),
  (2, 'Martin', 'Gomez',     'admin',      '$2a$10$4vSXL/OuAJSMEnfP3LV2AeunCkD5LF1/aOBWyZElbOe8yBGTLlZyS', 'ADMINISTRADOR',      1, 0),
  (3, 'Lucia',  'Fernandez', 'empleado',   '$2a$10$4vSXL/OuAJSMEnfP3LV2AeunCkD5LF1/aOBWyZElbOe8yBGTLlZyS', 'EMPLEADO',           1, 0),
  (4, 'Diego',  'Rodriguez', 'empleado2',  '$2a$10$4vSXL/OuAJSMEnfP3LV2AeunCkD5LF1/aOBWyZElbOe8yBGTLlZyS', 'EMPLEADO',           1, 1);

INSERT INTO categoria (id, nombre, descripcion, codigo_categoria, sucursal_id) VALUES
  (1, 'Bebidas', 'Bebidas y refrescos', 'BEB', 1),
  (2, 'Almacen', 'Productos de almacen', 'ALM', 1),
  (3, 'Bebidas', 'Bebidas y refrescos', 'BEB', 2);

INSERT INTO proveedor (id, rut, nombre, direccion, telefono, nombre_vendedor) VALUES
  (1, '215000000018', 'Proveedor Central', 'Ruta 8 km 20', '098000111', 'Juan Vendedor');

INSERT INTO producto (id, codigo_producto, nombre, detalle, precio, cantidad_stock, sucursal_id, categoria_id) VALUES
  (1, 'P001', 'Agua mineral 500ml',  'Botella 500ml', 32.5, 120, 1, 1),
  (2, 'P002', 'Refresco cola 1.5L',  'Botella 1.5L',  89.0, 60,  1, 1),
  (3, 'P003', 'Arroz 1kg',           'Paquete 1kg',   54.0, 80,  1, 2),
  (4, 'P004', 'Fideos 500g',         'Paquete 500g',  41.0, 95,  1, 2),
  -- Los mismos P001 y P002, tambien en Sucursal Pocitos con stock propio: el codigo
  -- de producto y el de barra son unicos POR SUCURSAL, no entre sucursales.
  (5, 'P001', 'Agua mineral 500ml',  'Botella 500ml', 32.5, 40,  2, 3),
  (6, 'P002', 'Refresco cola 1.5L',  'Botella 1.5L',  89.0, 18,  2, 3);

-- Un producto puede tener varios codigos: al mismo articulo le cambian el EAN y
-- conviven el viejo y el nuevo (producto 1). Todos escanean.
INSERT INTO codigo_barra (codigo, producto_id, sucursal_id) VALUES
  ('7791234500011', 1, 1),
  ('7791234599998', 1, 1),
  ('7791234599999', 1, 1),
  ('7791234500028', 2, 1),
  ('7791234500035', 3, 1),
  ('7791234500042', 4, 1),
  ('7791234500011', 5, 2),
  ('7791234500028', 6, 2);

INSERT INTO producto_proveedor (producto_id, proveedor_id) VALUES
  (1, 1), (2, 1), (3, 1), (4, 1);

-- Lotes de ejemplo: fechas relativas a hoy para que siempre haya un caso de cada
-- color del semaforo. El producto 3 queda con un descuadre a proposito (sus lotes
-- suman 100 contra un stock de 80). afecta_stock = 0 significa que el lote solo
-- etiqueta stock que ya estaba contado.
INSERT INTO lote (numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_stock, activo, afecta_stock, producto_id) VALUES
  ('L-1001', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY),   60,  1, 0, 1),
  ('L-1002', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 5 DAY),   40,  1, 0, 1),
  ('L-2001', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 20 DAY),  20,  1, 0, 2),
  ('L-2002', DATE_SUB(CURDATE(), INTERVAL 30 DAY), NULL,                                  25,  1, 0, 2),
  ('L-3001', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 180 DAY), 100, 1, 0, 3),
  ('L-4001', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 60 DAY),  15,  1, 1, 4);
