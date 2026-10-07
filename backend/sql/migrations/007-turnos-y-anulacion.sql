-- ============================================================
--  Migracion 007 - Turnos de caja y PIN de anulacion
-- ============================================================
--  Agrega:
--    * sucursal.pin_autorizacion: PIN de supervisor para que el cajero anule ventas.
--    * turno / turno_usuario: turnos de caja compartidos por varios cajeros.
--    * venta.turno_id: a que turno pertenece cada venta.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/007-turnos-y-anulacion.sql
--
--  Los ALTER no son idempotentes: si ya fueron aplicados MySQL devuelve
--  "Duplicate column name" / "Table already exists" y se puede ignorar.
-- ============================================================

-- ---------------- PIN DE ANULACION ----------------
-- El cajero no puede anular una venta sin ingresar el PIN de la sucursal (lo
-- configura el admin/superadmin). NULL = sin PIN definido todavia.
ALTER TABLE sucursal
  ADD COLUMN pin_autorizacion VARCHAR(20) AFTER usa_facturacion;

-- ---------------- TURNO ----------------
-- Uno por sucursal a la vez. numero: 1=manana 2=tarde 3=noche 4=otro.
CREATE TABLE IF NOT EXISTS turno (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id            BIGINT NOT NULL,
  numero                 TINYINT NOT NULL,
  estado                 VARCHAR(20) NOT NULL DEFAULT 'ABIERTO', -- ABIERTO | CERRADO
  fecha_apertura         DATETIME,
  fecha_cierre           DATETIME,
  usuario_apertura_id    BIGINT,
  usuario_responsable_id BIGINT,
  usuario_cierre_id      BIGINT,
  observaciones_cierre   VARCHAR(500),
  activo                 BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_turno_sucursal_estado (sucursal_id, estado),
  CONSTRAINT fk_turno_sucursal    FOREIGN KEY (sucursal_id)            REFERENCES sucursal(id),
  CONSTRAINT fk_turno_apertura    FOREIGN KEY (usuario_apertura_id)    REFERENCES usuario(id),
  CONSTRAINT fk_turno_responsable FOREIGN KEY (usuario_responsable_id) REFERENCES usuario(id),
  CONSTRAINT fk_turno_cierre      FOREIGN KEY (usuario_cierre_id)      REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- TURNO_USUARIO ----------------
CREATE TABLE IF NOT EXISTS turno_usuario (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  turno_id       BIGINT NOT NULL,
  usuario_id     BIGINT NOT NULL,
  es_responsable BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_union    DATETIME,
  CONSTRAINT uk_turno_usuario UNIQUE (turno_id, usuario_id),
  CONSTRAINT fk_tu_turno   FOREIGN KEY (turno_id)   REFERENCES turno(id) ON DELETE CASCADE,
  CONSTRAINT fk_tu_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------- VENTA.turno_id ----------------
ALTER TABLE venta
  ADD COLUMN turno_id BIGINT AFTER sucursal_id,
  ADD INDEX idx_venta_turno (turno_id),
  ADD CONSTRAINT fk_venta_turno FOREIGN KEY (turno_id) REFERENCES turno(id);
