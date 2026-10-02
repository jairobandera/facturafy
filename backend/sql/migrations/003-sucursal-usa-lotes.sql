-- ============================================================
--  Migracion 003 - Sucursal: apartado de Lotes opcional
-- ============================================================
--  El superadmin decide, por sucursal, si sus administradores ven
--  el apartado de Lotes. Las sucursales que ya existen quedan con
--  el apartado HABILITADO (DEFAULT TRUE) para no cambiarles nada.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/003-sucursal-usa-lotes.sql
--
--  El ALTER no es idempotente: si ya fue aplicado MySQL devuelve
--  "Duplicate column name" y se puede ignorar.
-- ============================================================

ALTER TABLE sucursal
  ADD COLUMN usa_lotes BOOLEAN NOT NULL DEFAULT TRUE AFTER activo;
