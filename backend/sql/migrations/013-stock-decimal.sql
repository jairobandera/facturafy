-- ============================================================
--  Migracion 013 - Stock con decimales
-- ============================================================
--  Pasa las cantidades de stock de entero a DECIMAL(14,3) para admitir, por ejemplo,
--  combustible en litros (49.921,83). No afecta ventas (venta_detalle.cantidad sigue
--  entera). Las cantidades existentes se conservan (los enteros entran sin cambios).
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/013-stock-decimal.sql
-- ============================================================

ALTER TABLE producto        MODIFY COLUMN cantidad_stock    DECIMAL(14,3) NOT NULL;
ALTER TABLE lote            MODIFY COLUMN cantidad_stock    DECIMAL(14,3) NOT NULL;
ALTER TABLE conteo_producto MODIFY COLUMN cantidad_esperada DECIMAL(14,3);
ALTER TABLE conteo_producto MODIFY COLUMN cantidad_contada  DECIMAL(14,3);
