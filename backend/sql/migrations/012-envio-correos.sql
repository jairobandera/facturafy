-- ============================================================
--  Migracion 012 - Paquete "Solo envio de correos"
-- ============================================================
--  Automatiza el envio del estado de cuenta de la quincena por email, cargando los
--  datos desde Excel (sin usar la facturacion de la app). Agrega:
--    * sucursal.usa_envio_correos (flag del paquete).
--    * contacto_correo: lista de contactos reutilizable por sucursal (clave/nombre/email).
--    * envio_correo + envio_correo_detalle: historial de envios y sus destinatarios.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/012-envio-correos.sql
-- ============================================================

ALTER TABLE sucursal
  ADD COLUMN usa_envio_correos BOOLEAN NOT NULL DEFAULT FALSE AFTER usa_consulta_precio;

CREATE TABLE IF NOT EXISTS contacto_correo (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id BIGINT NOT NULL,
  clave       VARCHAR(100) NOT NULL,
  nombre      VARCHAR(255),
  email       VARCHAR(255),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_contacto_sucursal_clave UNIQUE (sucursal_id, clave),
  CONSTRAINT fk_contacto_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS envio_correo (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id   BIGINT NOT NULL,
  fecha         DATETIME,
  usuario_id    BIGINT,
  asunto        VARCHAR(255),
  periodo_desde DATE,
  periodo_hasta DATE,
  total         INT NOT NULL DEFAULT 0,
  enviados      INT NOT NULL DEFAULT 0,
  fallidos      INT NOT NULL DEFAULT 0,
  sin_contacto  INT NOT NULL DEFAULT 0,
  INDEX idx_envio_sucursal (sucursal_id, fecha),
  CONSTRAINT fk_envio_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id),
  CONSTRAINT fk_envio_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS envio_correo_detalle (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  envio_id BIGINT NOT NULL,
  clave    VARCHAR(100),
  nombre   VARCHAR(255),
  email    VARCHAR(255),
  monto    FLOAT NOT NULL DEFAULT 0,
  estado   VARCHAR(20),
  error    VARCHAR(255),
  CONSTRAINT fk_enviodet_envio FOREIGN KEY (envio_id) REFERENCES envio_correo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
