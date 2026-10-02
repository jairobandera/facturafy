-- ============================================================
--  Migracion 005 - Codigos de barra: baja logica
-- ============================================================
--  A un producto le cambian el EAN y conviven el viejo y el nuevo:
--  los codigos se acumulan y NINGUNA importacion borra. Para poder
--  sacar uno equivocado sin perderlo, codigo_barra pasa a tener
--  baja logica como el resto del sistema.
--
--  Un codigo inactivo deja de escanear pero sigue ocupando
--  uk_codigobarra_sucursal: el EAN queda reservado a su producto y,
--  si otro lo reclama, se reporta como conflicto en vez de moverse solo.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/005-codigo-barra-activo.sql
--
--  El ALTER no es idempotente: si ya fue aplicado MySQL devuelve
--  "Duplicate column name" y se puede ignorar.
-- ============================================================

ALTER TABLE codigo_barra
  ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE AFTER sucursal_id;
