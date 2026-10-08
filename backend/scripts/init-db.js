// Inicializa la base de datos: crea el esquema y carga datos de ejemplo.
// Uso: npm run db:init
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';
import { hashPassword } from '../src/core/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(__dirname, '..', 'sql');

async function main() {
  // Conexion sin base seleccionada para poder crearla.
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  console.log(`> Creando base de datos "${config.db.database}" si no existe...`);
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await root.query(`USE \`${config.db.database}\``);

  console.log('> Ejecutando schema.sql...');
  const schema = fs.readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8');
  await root.query(schema);

  console.log('> Cargando datos de ejemplo...');
  await seed(root);

  await root.end();
  console.log('\n✅ Base de datos lista.');
  console.log('   Usuarios de prueba (contrasenia = "12345"):');
  console.log('     - superadmin   (SUPERADMINISTRADOR)');
  console.log('     - admin        (ADMINISTRADOR, Sucursal Centro)');
  console.log('     - empleado     (EMPLEADO, Sucursal Centro)');
  console.log('     - empleado2    (EMPLEADO, cuenta en cualquier sucursal)');
  console.log('     - cajero       (CAJERO, Sucursal Centro, facturacion)');
  console.log('   PINes de anulacion de Sucursal Centro: 1234 / 9999');
  console.log('   Limite de credito por defecto (cuentas nuevas) de Centro: 5000');
}

async function seed(conn) {
  // Empresa
  const [empRes] = await conn.query(
    `INSERT INTO empresa (nombre, rut, direccion, telefono) VALUES (?,?,?,?)`,
    ['Distribuidora Demo S.A.', '210000000012', 'Av. Siempre Viva 742', '099111222']
  );
  const empresaId = empRes.insertId;

  // Sucursales
  // Centro: paquete COMPLETO (control de stock + facturacion) para probar todo.
  // usa_consulta_precio 1: kiosko de precios. usa_envio_correos 1: automatizacion de
  // quincenas por Excel (para poder probar el apartado de Correos con el admin).
  const [suc1] = await conn.query(
    `INSERT INTO sucursal (nombre, direccion, telefono, empresa_id, usa_stock, usa_facturacion, usa_consulta_precio, usa_envio_correos, limite_credito_default) VALUES (?,?,?,?,1,1,1,1,?)`,
    ['Sucursal Centro', 'Calle 18 de Julio 1234', '099333444', empresaId, 5000]
  );
  const sucursalId = suc1.insertId;
  // Pocitos queda SOLO con control de stock y sin el apartado de Lotes, para mostrar
  // las opciones del superadmin (paquetes y lotes se habilitan por sucursal).
  const [suc2] = await conn.query(
    `INSERT INTO sucursal (nombre, direccion, telefono, empresa_id, usa_lotes, usa_stock, usa_facturacion) VALUES (?,?,?,?,0,1,0)`,
    ['Sucursal Pocitos', 'Av. Brasil 2500', '099555666', empresaId]
  );
  const sucursal2Id = suc2.insertId;

  // PINes de anulacion de la Sucursal Centro (hasta 3). El cajero ingresa uno para anular.
  await conn.query(
    `INSERT INTO sucursal_pin (sucursal_id, pin, etiqueta) VALUES (?,?,?), (?,?,?)`,
    [sucursalId, '1234', 'Supervisor', sucursalId, '9999', 'Encargado']
  );

  // Cotizaciones de ejemplo (compra/venta en pesos uruguayos por 1 unidad), por empresa.
  await conn.query(
    `INSERT INTO cotizacion (empresa_id, moneda, compra, venta, actualizado) VALUES
       (?,?,?,?,NOW()), (?,?,?,?,NOW()), (?,?,?,?,NOW())`,
    [empresaId, 'USD', 40, 41, empresaId, 'ARS', 0.03, 0.035, empresaId, 'EUR', 44, 46]
  );

  // Usuarios
  const pass = await hashPassword('12345');
  await conn.query(
    // "empleado2" tiene cuenta_en_cualquier_sucursal = 1: cuenta en las dos sucursales.
    // "cajero" opera el punto de venta de la Sucursal Centro (paquete con facturacion).
    `INSERT INTO usuario (nombre, apellido, nombre_usuario, contrasenia, rol, sucursal_id, cuenta_en_cualquier_sucursal) VALUES
      (?,?,?,?,?,?,?), (?,?,?,?,?,?,?), (?,?,?,?,?,?,?), (?,?,?,?,?,?,?), (?,?,?,?,?,?,?)`,
    [
      'Sofia', 'Perez', 'superadmin', pass, 'SUPERADMINISTRADOR', sucursalId, 0,
      'Martin', 'Gomez', 'admin', pass, 'ADMINISTRADOR', sucursalId, 0,
      'Lucia', 'Fernandez', 'empleado', pass, 'EMPLEADO', sucursalId, 0,
      'Diego', 'Rodriguez', 'empleado2', pass, 'EMPLEADO', sucursalId, 1,
      'Carla', 'Lopez', 'cajero', pass, 'CAJERO', sucursalId, 0,
    ]
  );

  // Cliente de ejemplo (Sucursal Centro) para probar la facturacion con RUT y credito.
  await conn.query(
    `INSERT INTO cliente (rut, razon_social, nombre_fantasia, direccion, telefono, email, tipo_documento, limite_credito, sucursal_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ['210000000019', 'Comercio del Este S.R.L.', 'El Este', 'Av. Italia 3000', '099777888', 'ventas@eleste.com', 'RUT', 5000, sucursalId]
  );

  // Contactos de ejemplo para el apartado "Envio de correos" (Sucursal Centro).
  await conn.query(
    `INSERT INTO contacto_correo (sucursal_id, clave, nombre, email) VALUES (?,?,?,?), (?,?,?,?)`,
    [sucursalId, '216000000013', 'Comercio del Este S.R.L.', 'ventas@eleste.com',
     sucursalId, 'CLI-002', 'Juan Perez', 'juan.perez@example.com']
  );

  // Categorias
  const [catBebidas] = await conn.query(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id) VALUES (?,?,?,?)`,
    ['Bebidas', 'Bebidas y refrescos', 'BEB', sucursalId]
  );
  const [catAlmacen] = await conn.query(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id) VALUES (?,?,?,?)`,
    ['Almacen', 'Productos de almacen', 'ALM', sucursalId]
  );

  // Proveedor
  const [prov] = await conn.query(
    `INSERT INTO proveedor (rut, nombre, direccion, telefono, nombre_vendedor) VALUES (?,?,?,?,?)`,
    ['215000000018', 'Proveedor Central', 'Ruta 8 km 20', '098000111', 'Juan Vendedor']
  );

  // Productos de ejemplo
  const productos = [
    ['P001', 'Agua mineral 500ml', 'Botella 500ml', 32.5, 120, catBebidas.insertId, '7791234500011'],
    ['P002', 'Refresco cola 1.5L', 'Botella 1.5L', 89.0, 60, catBebidas.insertId, '7791234500028'],
    ['P003', 'Arroz 1kg', 'Paquete 1kg', 54.0, 80, catAlmacen.insertId, '7791234500035'],
    ['P004', 'Fideos 500g', 'Paquete 500g', 41.0, 95, catAlmacen.insertId, '7791234500042'],
  ];
  const idPorCodigo = {};
  for (const [cod, nombre, detalle, precio, stock, categoriaId, barra] of productos) {
    const [pr] = await conn.query(
      `INSERT INTO producto (codigo_producto, nombre, detalle, precio, cantidad_stock, sucursal_id, categoria_id)
       VALUES (?,?,?,?,?,?,?)`,
      [cod, nombre, detalle, precio, stock, sucursalId, categoriaId]
    );
    idPorCodigo[cod] = pr.insertId;
    await conn.query(
      `INSERT INTO codigo_barra (codigo, producto_id, sucursal_id) VALUES (?,?,?)`,
      [barra, pr.insertId, sucursalId]
    );
    // Al P001 le "cambiaron" el EAN dos veces: los tres conviven y los tres escanean.
    if (cod === 'P001') {
      for (const extra of ['7791234599998', '7791234599999']) {
        await conn.query(
          `INSERT INTO codigo_barra (codigo, producto_id, sucursal_id) VALUES (?,?,?)`,
          [extra, pr.insertId, sucursalId]
        );
      }
    }
    await conn.query(`INSERT INTO producto_proveedor (producto_id, proveedor_id) VALUES (?,?)`, [pr.insertId, prov.insertId]);
  }

  // Los mismos dos productos, tambien en Sucursal Pocitos: mismo codigo_producto y
  // mismo codigo de barra, stock propio. Es el caso "deposito + local" y la prueba
  // de que la unicidad es por sucursal, no global.
  const [catBebidas2] = await conn.query(
    `INSERT INTO categoria (nombre, descripcion, codigo_categoria, sucursal_id) VALUES (?,?,?,?)`,
    ['Bebidas', 'Bebidas y refrescos', 'BEB', sucursal2Id]
  );
  const compartidos = [
    ['P001', 'Agua mineral 500ml', 'Botella 500ml', 32.5, 40, '7791234500011'],
    ['P002', 'Refresco cola 1.5L', 'Botella 1.5L', 89.0, 18, '7791234500028'],
  ];
  for (const [cod, nombre, detalle, precio, stock, barra] of compartidos) {
    const [pr] = await conn.query(
      `INSERT INTO producto (codigo_producto, nombre, detalle, precio, cantidad_stock, sucursal_id, categoria_id)
       VALUES (?,?,?,?,?,?,?)`,
      [cod, nombre, detalle, precio, stock, sucursal2Id, catBebidas2.insertId]
    );
    await conn.query(
      `INSERT INTO codigo_barra (codigo, producto_id, sucursal_id) VALUES (?,?,?)`,
      [barra, pr.insertId, sucursal2Id]
    );
  }

  // Lotes de ejemplo. Las fechas son relativas a hoy para que siempre haya un caso
  // de cada color del semaforo, y P003 queda con un descuadre a proposito
  // (sus lotes suman 100 contra un stock de 80).
  // afecta_stock = 0: el lote solo etiqueta stock que ya estaba contado.
  const lotes = [
    // [numero, codigoProducto, cantidad, diasHastaVencimiento (null = sin vencimiento), afectaStock]
    ['L-1001', 'P001', 60, -5, 0],
    ['L-1002', 'P001', 40, 5, 0],
    ['L-2001', 'P002', 20, 20, 0],
    ['L-2002', 'P002', 25, null, 0],
    ['L-3001', 'P003', 100, 180, 0],
    ['L-4001', 'P004', 15, 60, 1],
  ];
  for (const [numero, codProd, cantidad, dias, afecta] of lotes) {
    await conn.query(
      `INSERT INTO lote (numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_stock, activo, afecta_stock, producto_id)
       VALUES (?, DATE_SUB(CURDATE(), INTERVAL 30 DAY), ${dias === null ? 'NULL' : 'DATE_ADD(CURDATE(), INTERVAL ? DAY)'}, ?, 1, ?, ?)`,
      dias === null
        ? [numero, cantidad, afecta, idPorCodigo[codProd]]
        : [numero, dias, cantidad, afecta, idPorCodigo[codProd]]
    );
  }
}

main().catch((err) => {
  console.error('❌ Error inicializando la base de datos:', err.message);
  process.exit(1);
});
