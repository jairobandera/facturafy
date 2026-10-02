# Facturafy

**Facturafy** es un sistema **multi-empresa** de **facturación y control de stock**.
Permite administrar empresas, sucursales, usuarios (con roles), categorías, productos, proveedores,
lotes y **clientes**; **facturar en un punto de venta** (POS) con descuento automático de stock; y
realizar **conteos de inventario colaborativos en tiempo real**, con reportes de diferencias.

Cada sucursal contrata uno de tres **paquetes** (los configura el superadministrador): **Completo**
(facturación + control de stock), **Solo facturación** o **Solo control de stock**. Una misma empresa
puede tener una sucursal con el paquete completo y otra con uno solo.

Nació como evolución de **Stockify 2.0** (control de stock) sobre el mismo stack **sin frameworks**.

## ¿Qué hace?

- **Multi-empresa / multi-sucursal**: cada empresa agrupa sucursales; usuarios, categorías,
  productos, clientes, conteos y ventas pertenecen a una sucursal.
- **Paquetes por sucursal**: el superadmin habilita, desde **Configuraciones**, el control de stock
  y/o la facturación de cada sucursal. El menú y las secciones se adaptan a lo contratado.
- **Roles**:
  - `SUPERADMINISTRADOR` — gestiona empresas, sucursales, usuarios y los paquetes de cada sucursal.
  - `ADMINISTRADOR` — gestiona el inventario, los conteos y, en facturación, ve las **ventas
    realizadas**, las **anula**, consulta las **estadísticas de facturación** y da de alta clientes.
    No vende.
  - `EMPLEADO` — participa en los conteos.
  - `CAJERO` — opera el **punto de venta**: factura, da de alta clientes y anula ventas.
- **Inventario** (compartido por ambos paquetes): categorías, productos (con código de barras),
  lotes y proveedores.

### Facturación

- **Punto de venta (POS)** pensado para ser rápido:
  - **Escaneo de código de barras**: con la cámara, o pasando el producto por un **lector físico**
    (funciona incluso **sin** apretar ningún botón: estando en el POS, al escanear se busca el
    producto y se abre el modal de cantidad).
  - **Búsqueda manual** por nombre, código o código de barra.
  - Carrito que **unifica productos iguales**, con subtotal, total y cantidad editable.
  - Cliente por defecto **consumidor final**; opcionalmente un cliente por **RUT** (con alta rápida).
  - Pago **contado** o **crédito**.
  - Al facturar se registra la venta y **se descuenta el stock** de cada producto.
  - **Comprobante en PDF**.
- **Ventas realizadas** (administrador): historial con filtros por fecha y estado, detalle de cada
  venta y **anulación con motivo obligatorio** (que **devuelve el stock** al inventario).
- **Clientes**: alta/edición de clientes de facturación (RUT, razón social, etc.), por sucursal.
- **Estadísticas de facturación**: total facturado, contado vs crédito, ventas anuladas y productos
  más vendidos (separadas de las estadísticas de conteos).
- **Factura electrónica de Uruguay (DGI/CFE)**: **preparada** (columnas, variables de entorno y un
  adaptador `cfe.js`). Hoy las ventas se registran internamente (`cfe_estado = INTERNO`); activarla
  es un cambio mínimo cuando se tengan las credenciales.

### Control de stock

- **Conteos de stock en tiempo real**:
  - **Conteo libre**: se van agregando productos a mano.
  - **Conteo por categorías**: carga automáticamente todos los productos de las categorías elegidas.
  - Varios usuarios cuentan simultáneamente y ven las actualizaciones **al instante** (WebSocket).
  - Escaneo de código de barras con la cámara o con un lector físico.
  - Aviso cuando un producto ya fue contado por otra persona.
- **Conteos finalizados**: búsqueda por rango de fechas y **reapertura** para reajustes.
- **Reportes**: diferencias (faltantes / sobrantes), diferencia monetaria, quién contó cada producto,
  y exportación a **PDF**.
- **Estadísticas de conteos** y **lotes con vencimientos** (apartado opcional por sucursal).

## Tecnologías

| Capa        | Tecnología                                                        |
|-------------|-------------------------------------------------------------------|
| Backend     | **Node.js puro** (módulo `http` nativo, sin Express)              |
| Tiempo real | **WebSocket nativo** (`ws`) con topics                            |
| Base datos  | **MySQL / MariaDB** (`mysql2`)                                    |
| Auth        | **JWT** HS256 con el módulo `crypto` nativo · contraseñas `bcryptjs` |
| Frontend    | **HTML + CSS + JavaScript puro** (SPA con módulos ES, sin build)  |

> Dependencias del backend: solo `mysql2`, `ws` y `bcryptjs`.
> El frontend usa Bootstrap, Bootstrap Icons, Chart.js, SweetAlert2, XLSX, jsPDF y
> **html5-qrcode** (escaneo de códigos de barra) vía CDN.

## Requisitos

- **Node.js** 18 o superior.
- **MySQL** o **MariaDB** corriendo. La forma más fácil es con **XAMPP**:
  descargalo, abrí el *Control Panel* y presioná **Start** en **MySQL** (y en Apache si querés
  phpMyAdmin para administrar la base desde el navegador).

## Puesta en marcha

```bash
# 1) Instalar dependencias del backend
cd backend
npm install

# 2) Configurar la conexión: copiar el ejemplo y ajustar credenciales
#    (DB_USER / DB_PASS según tu MySQL; en XAMPP suele ser user "root" sin contraseña)
cp .env.example .env          # PowerShell:  Copy-Item .env.example .env

# 3) Crear la base de datos + tablas + datos de ejemplo
npm run db:init

# 4) Levantar el servidor (sirve API + WebSocket + frontend en el mismo puerto)
npm start
```

Luego abrí **http://localhost:8080/** en el navegador.

Para desarrollo con recarga automática: `npm run dev` (usa `node --watch`).

### Usuarios de prueba (contraseña `12345`)

| Usuario      | Rol                 | Notas                                        |
|--------------|---------------------|----------------------------------------------|
| `superadmin` | SUPERADMINISTRADOR  | Gestiona empresas, sucursales y paquetes     |
| `admin`      | ADMINISTRADOR       | Sucursal Centro (paquete completo)           |
| `empleado`   | EMPLEADO            | Participa en conteos                          |
| `cajero`     | CAJERO              | Sucursal Centro, opera el punto de venta      |

> La sucursal **Centro** viene con el **paquete completo** y **Pocitos** con **solo control de
> stock**, para probar cómo cambia el menú según lo contratado.

## Base de datos

Hay dos formas de crear la base (su nombre por defecto es **`facturafy`**, configurable en `.env`):

### Opción A — script de inicialización (recomendada)

Con MySQL corriendo y el `.env` configurado:

```bash
cd backend
npm run db:init
```

Crea la base `facturafy`, todas las tablas (`backend/sql/schema.sql`) y carga datos de ejemplo.

> **Ojo:** `schema.sql` **borra** todas las tablas antes de crearlas. Para una base que ya tiene
> datos, en vez de reinicializar aplicá las migraciones a mano desde `backend/sql/migrations/`
> (por ejemplo `006-facturacion.sql` agrega los paquetes y las tablas de facturación).

### Opción B — importar un dump SQL desde un IDE / cliente

Si preferís administrar la base con un cliente gráfico (**phpMyAdmin**, **HeidiSQL**,
**MySQL Workbench**, **DBeaver**), generá un dump autocontenido:

```bash
cd backend
npm run db:export        # genera backend/sql/stockify_import.sql
```

El archivo incluye `CREATE DATABASE` + tablas + datos de ejemplo. Importalo:

- **phpMyAdmin**: pestaña *Importar* → elegí el archivo → *Continuar*.
- **HeidiSQL / Workbench / DBeaver**: abrí el `.sql` y ejecutalo.
- **Consola**: `mysql -u root -p < sql/stockify_import.sql`

## Estructura del proyecto

```
Facturafy/
├── backend/
│   ├── server.js                 # Punto de entrada (HTTP + WebSocket)
│   ├── sql/
│   │   ├── schema.sql            # Esquema MySQL (tablas)
│   │   ├── migrations/           # Cambios incrementales (006-facturacion.sql, ...)
│   │   └── stockify_import.sql   # Dump completo importable (generado)
│   ├── scripts/
│   │   ├── init-db.js            # Crea BD + tablas + datos semilla  (npm run db:init)
│   │   └── export-sql.js         # Genera el dump importable         (npm run db:export)
│   └── src/
│       ├── config/               # env.js, db.js (pool MySQL)
│       ├── core/                 # router, jwt, ws, http, crud genérico, etc.
│       └── modules/              # un módulo por dominio:
│                                 #   stock: usuario, producto, lote, conteo, estadistica, ...
│                                 #   facturación: cliente, venta, estadisticaVenta, facturacion/cfe
│                                 #   paquetes por sucursal: sucursal/paquetes.js
└── frontend/
    ├── index.html
    └── assets/
        ├── css/styles.css
        └── js/
            ├── app.js            # Registro de rutas (SPA)
            ├── core/             # api, auth, ws, router, layout, ui, dom, sucursal
            ├── components/       # dataTable, formModal, crudPage, barcode, excel, cards
            └── pages/            # login + superadmin/ + admin/ + empleado/ + cajero/ + shared/
```

### Arquitectura del backend

Cada módulo sigue 3 capas: **repository** (SQL) → **service** (lógica) → **routes** (HTTP).
Las entidades CRUD simples (empresa, sucursal, categoría, proveedor, cliente, reporte) se generan con
el factory `src/core/crud.js`; los módulos con lógica propia (producto, lote, conteo, **venta**,
estadísticas) están escritos explícitamente. Todas las entidades usan **borrado lógico** con la
columna `activo`.

Los **paquetes** se verifican en el backend con `assertUsaFacturacion` / `assertUsaStock`
(`src/modules/sucursal/paquetes.js`) y en el frontend con `usaStock()` / `usaFacturacion()`
(`core/sucursal.js`), que adaptan el menú y las rutas.

### Tiempo real

El backend publica por WebSocket en 3 topics: `conteo-activo`, `conteo-finalizado` y
`conteo-producto-actualizado`. El frontend (`assets/js/core/ws.js`) se suscribe y actualiza la UI
en vivo durante los conteos.

## API

Base: `http://localhost:8080/Stockify/api/v1` (configurable en `.env`).

Recursos de stock: `/seguridad/login`, `/usuarios`, `/empresas`, `/sucursales`, `/categorias`,
`/proveedores`, `/productos`, `/lotes`, `/conteos`, `/conteoproducto`, `/conteo-usuarios`,
`/sucursal-proveedor`, `/reportes`, `/estadisticas`.

Recursos de facturación: `/clientes`, `/ventas`, `/estadisticas-venta`.

## Notas

- **CORS** está abierto por defecto (`CORS_ORIGIN=*`); restringilo en producción.
- Cambiá `JWT_SECRET` en producción.
- Para activar la **factura electrónica (DGI/CFE)**: poné `CFE_ENABLED=true` y las credenciales
  `CFE_*` en el `.env`, e implementá el envío al proveedor en
  `backend/src/modules/facturacion/cfe.js`. Las columnas `cfe_*` de la tabla `venta` ya existen.
- El **escaneo por cámara** requiere un origen seguro (**HTTPS** o `localhost`). Desde un celular
  por HTTP en la red local, la cámara queda bloqueada por el navegador (el lector físico sí funciona);
  para usar la cámara en el celular, servilo por HTTPS (por ejemplo con un túnel como ngrok).
