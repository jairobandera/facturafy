-- ============================================================
--  Migracion 002 - Unicidad por sucursal (producto y codigo de barra)
-- ============================================================
--  Permite que el mismo producto fisico exista en dos sucursales:
--  mismo codigo_producto y mismo EAN, una vez por sucursal.
--
--  Para bases YA creadas. Una base nueva (npm run db:init) ya trae
--  estos cambios en schema.sql.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/002-unicidad-por-sucursal.sql
--
--  Los ALTER no son idempotentes: si alguno ya fue aplicado MySQL
--  devuelve "Duplicate column/key name" y se puede ignorar.
-- ============================================================

-- ---- PRE-CHEQUEO -------------------------------------------
-- Las dos consultas deben devolver 0 filas. Si devuelven algo hay
-- duplicados DENTRO de una misma sucursal: resolverlos antes de seguir,
-- porque los UNIQUE nuevos van a fallar.

SELECT codigo_producto, sucursal_id, COUNT(*) AS repetidos
  FROM producto
 GROUP BY codigo_producto, sucursal_id
HAVING COUNT(*) > 1;

SELECT cb.codigo, p.sucursal_id, COUNT(*) AS repetidos
  FROM codigo_barra cb
  JOIN producto p ON p.id = cb.producto_id
 GROUP BY cb.codigo, p.sucursal_id
HAVING COUNT(*) > 1;

-- ---- 1) codigo_barra: sucursal propia ----------------------
-- Desnormalizacion necesaria: MySQL no acepta un UNIQUE sobre una
-- columna de otra tabla.

ALTER TABLE codigo_barra ADD COLUMN sucursal_id BIGINT NULL AFTER producto_id;

UPDATE codigo_barra cb
  JOIN producto p ON p.id = cb.producto_id
   SET cb.sucursal_id = p.sucursal_id;

ALTER TABLE codigo_barra MODIFY sucursal_id BIGINT NOT NULL;

ALTER TABLE codigo_barra
  ADD CONSTRAINT fk_codigobarra_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursal(id);

-- ---- 2) codigo_barra: de UNIQUE global a UNIQUE por sucursal
ALTER TABLE codigo_barra DROP INDEX codigo;

ALTER TABLE codigo_barra
  ADD CONSTRAINT uk_codigobarra_sucursal UNIQUE (codigo, sucursal_id);

-- ---- 3) producto: unicidad de codigo_producto por sucursal --
-- Antes no habia ningun indice: la unicidad se validaba solo en la app
-- (y de forma global), asi que dos altas simultaneas podian duplicar.
ALTER TABLE producto
  ADD CONSTRAINT uk_producto_codigo_sucursal UNIQUE (codigo_producto, sucursal_id);
