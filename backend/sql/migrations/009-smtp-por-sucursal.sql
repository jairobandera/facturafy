-- ============================================================
--  Migracion 009 - Credenciales de correo (SMTP) por sucursal
-- ============================================================
--  Cada sucursal puede tener su propia casilla de envio (correo + contrasena de
--  aplicacion de 16 caracteres). La carga el superadministrador en el formulario de
--  sucursal. Si estan vacias, el envio usa la config global del .env (si existe).
--  smtp_pass NUNCA se devuelve en un GET.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/009-smtp-por-sucursal.sql
-- ============================================================

ALTER TABLE sucursal
  ADD COLUMN smtp_user   VARCHAR(255)            AFTER limite_credito_default,
  ADD COLUMN smtp_pass   VARCHAR(255)            AFTER smtp_user,
  ADD COLUMN smtp_host   VARCHAR(255) DEFAULT 'smtp.gmail.com' AFTER smtp_pass,
  ADD COLUMN smtp_port   INT DEFAULT 465         AFTER smtp_host,
  ADD COLUMN smtp_secure BOOLEAN NOT NULL DEFAULT TRUE AFTER smtp_port,
  ADD COLUMN smtp_from   VARCHAR(255)            AFTER smtp_secure;
