-- ============================================================
--  Migracion 015 - Direccion en contactos (clientes de correo)
-- ============================================================
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/015-contacto-direccion.sql
-- ============================================================

ALTER TABLE contacto_correo ADD COLUMN direccion VARCHAR(255) AFTER email;
