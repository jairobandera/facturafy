-- ============================================================
--  Migracion 018 - Suscripciones (claves de activacion por empresa)
-- ============================================================
--  - empresa: prueba de 7 dias desde `fecha_alta`; luego hay que activar con una clave
--    que extiende `suscripcion_hasta`. `suscripcion_ilimitada` = no vence nunca.
--  - codigo_activacion: claves de un solo uso que genera el superadmin por empresa.
--  Las empresas que YA existen arrancan su prueba de 7 dias AHORA: al agregar
--  `fecha_alta` con DEFAULT CURRENT_TIMESTAMP, MySQL/MariaDB la setea a la fecha del ALTER.
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/018-suscripciones.sql
-- ============================================================

ALTER TABLE empresa
  ADD COLUMN fecha_alta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER telefono,
  ADD COLUMN suscripcion_hasta DATE AFTER fecha_alta,
  ADD COLUMN suscripcion_ilimitada BOOLEAN NOT NULL DEFAULT FALSE AFTER suscripcion_hasta;

CREATE TABLE IF NOT EXISTS codigo_activacion (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(40) NOT NULL,
  empresa_id       BIGINT NOT NULL,
  dias             INT NOT NULL,
  usado            BOOLEAN NOT NULL DEFAULT FALSE,
  usado_fecha      DATETIME,
  fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uk_codigo_activacion UNIQUE (codigo),
  CONSTRAINT fk_codact_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
