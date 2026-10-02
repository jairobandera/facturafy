-- ============================================================
--  Migracion 004 - Conteos por sucursal
-- ============================================================
--  El conteo pasa a saber en que sucursal se cuenta (antes se
--  deducia del creador o de los renglones, y no siempre coincidian),
--  y el usuario puede tener permiso para contar en otras sucursales
--  de su misma empresa.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/004-conteo-sucursal.sql
--
--  Los ALTER no son idempotentes: si alguno ya fue aplicado MySQL
--  devuelve "Duplicate column/key name" y se puede ignorar.
-- ============================================================

-- ---- 1) conteo.sucursal_id ---------------------------------
ALTER TABLE conteo ADD COLUMN sucursal_id BIGINT NULL AFTER usuario_id;

ALTER TABLE conteo
  ADD CONSTRAINT fk_conteo_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id);

ALTER TABLE conteo ADD INDEX idx_conteo_sucursal (sucursal_id, activo);

-- Backfill 1: por la sucursal del usuario que creo el conteo.
UPDATE conteo c
  JOIN usuario u ON u.id = c.usuario_id
   SET c.sucursal_id = u.sucursal_id
 WHERE c.sucursal_id IS NULL AND u.sucursal_id IS NOT NULL;

-- Backfill 2: los que quedaron sin creador, por la sucursal de sus renglones.
UPDATE conteo c
   SET c.sucursal_id = (
     SELECT MIN(p.sucursal_id)
       FROM conteo_producto cp
       JOIN producto p ON p.id = cp.producto_id
      WHERE cp.conteo_id = c.id)
 WHERE c.sucursal_id IS NULL;

-- Control: conteos que quedaron sin sucursal (sin creador y sin renglones).
-- Son conteos vacios; se pueden asignar a mano o dejar como estan.
SELECT id, fecha_hora, usuario_id, tipo_conteo
  FROM conteo
 WHERE sucursal_id IS NULL;

-- ---- 2) usuario.cuenta_en_cualquier_sucursal ---------------
-- Por defecto FALSE: cada usuario sigue limitado a su sucursal.
ALTER TABLE usuario
  ADD COLUMN cuenta_en_cualquier_sucursal BOOLEAN NOT NULL DEFAULT FALSE AFTER sucursal_id;
