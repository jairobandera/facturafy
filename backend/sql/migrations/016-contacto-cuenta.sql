-- ============================================================
--  Migracion 016 - N° de cuenta en contactos (clientes de correo)
-- ============================================================
--  La clave del contacto suele ser el RUT/documento, pero el informe de
--  estado de cuenta cruza por el "N° de Cuenta Corriente". Guardamos la
--  cuenta aparte para poder cruzar por clave O por cuenta.
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/016-contacto-cuenta.sql
-- ============================================================

ALTER TABLE contacto_correo ADD COLUMN cuenta VARCHAR(100) AFTER clave;
