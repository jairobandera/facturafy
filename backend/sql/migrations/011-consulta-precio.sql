-- ============================================================
--  Migracion 011 - Consulta de precios (kiosko)
-- ============================================================
--  Agrega el flag por sucursal que habilita la pagina publica de consulta de precios
--  (el cliente escanea un codigo y ve nombre/imagen/precio). Requiere facturacion.
--  Lo activa el superadministrador en Configuraciones.
--
--  Uso:
--    mysql -u <usuario> -p <base> < backend/sql/migrations/011-consulta-precio.sql
-- ============================================================

ALTER TABLE sucursal
  ADD COLUMN usa_consulta_precio BOOLEAN NOT NULL DEFAULT FALSE AFTER usa_facturacion;
