-- ============================================================
--  Migracion 001 - Lotes: afecta_stock + unicidad por producto
-- ============================================================
--  Para bases YA creadas con el esquema anterior. Una base nueva
--  (npm run db:init) ya trae estos cambios en schema.sql.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/001-lote-afecta-stock.sql
--
--  Los ALTER no son idempotentes: si alguno ya fue aplicado MySQL
--  devuelve "Duplicate column/key name" y se puede ignorar.
-- ============================================================

-- 1) Marca si el lote sumo su cantidad al stock del producto.
--    Los lotes existentes SI la sumaron (era el comportamiento anterior).
ALTER TABLE lote
  ADD COLUMN afecta_stock BOOLEAN NOT NULL DEFAULT FALSE AFTER activo;

UPDATE lote SET afecta_stock = TRUE;

-- 2) El numero de lote lo asigna el proveedor: se repite entre productos.
--    Antes era UNIQUE global, lo que impedia usar el mismo numero en dos productos.
ALTER TABLE lote DROP INDEX numero_lote;

ALTER TABLE lote
  ADD CONSTRAINT uk_lote_numero_producto UNIQUE (numero_lote, producto_id);

-- 3) Indice para las consultas de vencimientos.
ALTER TABLE lote ADD INDEX idx_lote_vencimiento (fecha_vencimiento);
