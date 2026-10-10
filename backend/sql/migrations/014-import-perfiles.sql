-- ============================================================
--  Migracion 014 - Perfiles de mapeo de columnas (importacion de Excel)
-- ============================================================
--  Guarda por empresa+tipo un mapeo nombrado para importar Excels sin encabezado
--  (o con columnas distintas) sin tener que re-mapear cada vez.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/014-import-perfiles.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS import_perfil (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  empresa_id BIGINT NOT NULL,
  tipo       VARCHAR(30) NOT NULL,
  nombre     VARCHAR(100) NOT NULL,
  mapeo      TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_importperfil (empresa_id, tipo, activo),
  CONSTRAINT fk_importperfil_empresa FOREIGN KEY (empresa_id) REFERENCES empresa(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
