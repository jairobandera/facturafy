// Genera un dump SQL autocontenido e importable desde cualquier IDE / cliente MySQL
// (phpMyAdmin, HeidiSQL, MySQL Workbench, DBeaver, consola mysql, etc.).
// Incluye: CREATE DATABASE + USE + esquema (schema.sql) + datos de ejemplo.
// Uso: npm run db:export   ->   genera sql/stockify_import.sql
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/core/password.js';
import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, '..', 'sql');
const dbName = config.db.database || 'stockify';

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function main() {
  const schema = fs.readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8').trim();
  const pass = await hashPassword('12345');

  const seed = `
-- ============================================================
--  Datos de ejemplo (usuarios de prueba, contrasenia = "12345")
-- ============================================================

INSERT INTO empresa (id, nombre, rut, direccion, telefono) VALUES
  (1, ${q('Distribuidora Demo S.A.')}, ${q('210000000012')}, ${q('Av. Siempre Viva 742')}, ${q('099111222')});

-- Centro: paquete COMPLETO (stock + facturacion) y limite de credito por defecto 5000.
-- Pocitos: solo control de stock y sin Lotes, para mostrar las opciones del superadmin.
INSERT INTO sucursal (id, nombre, direccion, telefono, empresa_id, usa_lotes, usa_stock, usa_facturacion, limite_credito_default) VALUES
  (1, ${q('Sucursal Centro')},  ${q('Calle 18 de Julio 1234')}, ${q('099333444')}, 1, 1, 1, 1, 5000),
  (2, ${q('Sucursal Pocitos')}, ${q('Av. Brasil 2500')},        ${q('099555666')}, 1, 0, 1, 0, 0);

-- PINes de anulacion de la Sucursal Centro (hasta 3). El cajero ingresa uno para anular.
INSERT INTO sucursal_pin (id, sucursal_id, pin, etiqueta) VALUES
  (1, 1, ${q('1234')}, ${q('Supervisor')}),
  (2, 1, ${q('9999')}, ${q('Encargado')});

-- Cotizaciones de ejemplo (compra/venta en pesos uruguayos por 1 unidad), por empresa.
INSERT INTO cotizacion (empresa_id, moneda, compra, venta, actualizado) VALUES
  (1, ${q('USD')}, 40, 41, NOW()),
  (1, ${q('ARS')}, 0.03, 0.035, NOW()),
  (1, ${q('EUR')}, 44, 46, NOW());

-- cuenta_en_cualquier_sucursal: "empleado2" puede contar en las dos sucursales.
-- "cajero" opera el punto de venta de la Sucursal Centro (paquete con facturacion).
INSERT INTO usuario (id, nombre, apellido, nombre_usuario, contrasenia, rol, sucursal_id, cuenta_en_cualquier_sucursal) VALUES
  (1, ${q('Sofia')},  ${q('Perez')},     ${q('superadmin')}, ${q(pass)}, ${q('SUPERADMINISTRADOR')}, 1, 0),
  (2, ${q('Martin')}, ${q('Gomez')},     ${q('admin')},      ${q(pass)}, ${q('ADMINISTRADOR')},      1, 0),
  (3, ${q('Lucia')},  ${q('Fernandez')}, ${q('empleado')},   ${q(pass)}, ${q('EMPLEADO')},           1, 0),
  (4, ${q('Diego')},  ${q('Rodriguez')}, ${q('empleado2')},  ${q(pass)}, ${q('EMPLEADO')},           1, 1),
  (5, ${q('Carla')},  ${q('Lopez')},     ${q('cajero')},     ${q(pass)}, ${q('CAJERO')},             1, 0);

-- Cliente de ejemplo (Sucursal Centro) para probar la facturacion con RUT y credito.
INSERT INTO cliente (id, rut, razon_social, nombre_fantasia, direccion, telefono, email, tipo_documento, limite_credito, sucursal_id) VALUES
  (1, ${q('210000000019')}, ${q('Comercio del Este S.R.L.')}, ${q('El Este')}, ${q('Av. Italia 3000')}, ${q('099777888')}, ${q('ventas@eleste.com')}, ${q('RUT')}, 5000, 1);

INSERT INTO categoria (id, nombre, descripcion, codigo_categoria, sucursal_id) VALUES
  (1, ${q('Bebidas')}, ${q('Bebidas y refrescos')}, ${q('BEB')}, 1),
  (2, ${q('Almacen')}, ${q('Productos de almacen')}, ${q('ALM')}, 1),
  (3, ${q('Bebidas')}, ${q('Bebidas y refrescos')}, ${q('BEB')}, 2);

INSERT INTO proveedor (id, rut, nombre, direccion, telefono, nombre_vendedor) VALUES
  (1, ${q('215000000018')}, ${q('Proveedor Central')}, ${q('Ruta 8 km 20')}, ${q('098000111')}, ${q('Juan Vendedor')});

INSERT INTO producto (id, codigo_producto, nombre, detalle, precio, cantidad_stock, sucursal_id, categoria_id) VALUES
  (1, ${q('P001')}, ${q('Agua mineral 500ml')},  ${q('Botella 500ml')}, 32.5, 120, 1, 1),
  (2, ${q('P002')}, ${q('Refresco cola 1.5L')},  ${q('Botella 1.5L')},  89.0, 60,  1, 1),
  (3, ${q('P003')}, ${q('Arroz 1kg')},           ${q('Paquete 1kg')},   54.0, 80,  1, 2),
  (4, ${q('P004')}, ${q('Fideos 500g')},         ${q('Paquete 500g')},  41.0, 95,  1, 2),
  -- Los mismos P001 y P002, tambien en Sucursal Pocitos con stock propio: el codigo
  -- de producto y el de barra son unicos POR SUCURSAL, no entre sucursales.
  (5, ${q('P001')}, ${q('Agua mineral 500ml')},  ${q('Botella 500ml')}, 32.5, 40,  2, 3),
  (6, ${q('P002')}, ${q('Refresco cola 1.5L')},  ${q('Botella 1.5L')},  89.0, 18,  2, 3);

-- Un producto puede tener varios codigos: al mismo articulo le cambian el EAN y
-- conviven el viejo y el nuevo (producto 1). Todos escanean.
INSERT INTO codigo_barra (codigo, producto_id, sucursal_id) VALUES
  (${q('7791234500011')}, 1, 1),
  (${q('7791234599998')}, 1, 1),
  (${q('7791234599999')}, 1, 1),
  (${q('7791234500028')}, 2, 1),
  (${q('7791234500035')}, 3, 1),
  (${q('7791234500042')}, 4, 1),
  (${q('7791234500011')}, 5, 2),
  (${q('7791234500028')}, 6, 2);

INSERT INTO producto_proveedor (producto_id, proveedor_id) VALUES
  (1, 1), (2, 1), (3, 1), (4, 1);

-- Lotes de ejemplo: fechas relativas a hoy para que siempre haya un caso de cada
-- color del semaforo. El producto 3 queda con un descuadre a proposito (sus lotes
-- suman 100 contra un stock de 80). afecta_stock = 0 significa que el lote solo
-- etiqueta stock que ya estaba contado.
INSERT INTO lote (numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_stock, activo, afecta_stock, producto_id) VALUES
  (${q('L-1001')}, DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY),   60,  1, 0, 1),
  (${q('L-1002')}, DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 5 DAY),   40,  1, 0, 1),
  (${q('L-2001')}, DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 20 DAY),  20,  1, 0, 2),
  (${q('L-2002')}, DATE_SUB(CURDATE(), INTERVAL 30 DAY), NULL,                                  25,  1, 0, 2),
  (${q('L-3001')}, DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 180 DAY), 100, 1, 0, 3),
  (${q('L-4001')}, DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_ADD(CURDATE(), INTERVAL 60 DAY),  15,  1, 1, 4);
`.trim();

  const out = `-- ============================================================
--  Stockify 2.0 - Dump completo importable (MySQL / MariaDB)
--  Generado por: npm run db:export
--
--  Como importar:
--   * IDE/cliente (HeidiSQL, Workbench, DBeaver, phpMyAdmin):
--       abrir este archivo y ejecutarlo, o "Importar" este .sql.
--   * Consola:  mysql -u root -p < stockify_import.sql
--
--  Crea la base "${dbName}", todas las tablas y datos de ejemplo.
--  Usuarios de prueba (contrasenia = "12345"): superadmin / admin / empleado
-- ============================================================

CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${dbName}\`;

${schema}

${seed}
`;

  const outPath = path.join(sqlDir, 'stockify_import.sql');
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`✅ Dump generado: ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error('❌ Error generando el dump:', err.message);
  process.exit(1);
});
