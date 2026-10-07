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
    Al dar de alta/editar una sucursal, configura su **correo de envío** (SMTP propio por sucursal).
  - `ADMINISTRADOR` — gestiona el inventario y los conteos y, en facturación: ve las **ventas
    realizadas** y las anula, ve **estadísticas de facturación**, gestiona **clientes y su cuenta
    corriente** (crédito, pagos, mora, límite, estado de cuenta por email), ve los **turnos de caja**
    (historial + arqueo) y la **configuración** (PINes de anulación + límite de crédito por defecto).
    No vende.
  - `EMPLEADO` — participa en los conteos.
  - `CAJERO` — opera el **punto de venta**: inicia/uniéndose a un **turno de caja**, factura, consulta
    las ventas de su turno, anula ventas (con **PIN** de un supervisor) y cierra el turno (arqueo).
    **No** da de alta clientes: solo busca clientes ya registrados para facturarles a crédito.
- **Inventario** (compartido por ambos paquetes): categorías, productos (con código de barras),
  lotes y proveedores.

### Facturación

- **Turnos de caja**: el cajero, al entrar, **inicia un turno** (mañana / tarde / noche / otro) o se
  **suma** al turno abierto de la sucursal (es **uno por sucursal** a la vez y lo comparten varios
  cajeros; uno es el **responsable**). Hasta iniciar/unirse al turno, el POS y los clientes quedan
  bloqueados. Al **cerrar** el turno (responsable o administrador) se genera el **reporte de arqueo**
  (totales por forma de pago, ventas, anuladas, participantes) en pantalla y en **PDF**.
- **Punto de venta (POS)** pensado para un **lector físico** de código de barras:
  - Pasás el producto por el lector (funciona **sin** apretar ningún botón) o lo buscás con el botón
    **Buscar producto** (por nombre, código o código de barra). *(El escaneo por cámara se quitó.)*
  - Carrito que **unifica productos iguales**, con subtotal, total y cantidad editable.
  - Cliente por defecto **consumidor final**, o un **cliente registrado** elegido con buscador. Las
    ventas a **crédito** exigen un cliente registrado y respetan su **límite de crédito**.
  - Pago **contado** o **crédito**. Al facturar se registra la venta y **se descuenta el stock**.
  - **Comprobante en PDF**.
- **Ventas del turno** (cajero): lista las ventas de su turno y permite **eliminarlas/anularlas**
  ingresando **motivo + PIN** de autorización de un supervisor (devuelve el stock).
- **Ventas realizadas** (administrador): historial con filtros por fecha y estado, detalle y
  **anulación con motivo** (sin PIN, por ser admin). Devuelve el stock.
- **Clientes y cuenta corriente** (administrador): alta/edición de clientes (RUT o **cédula** con
  validación real, **email obligatorio**, **límite de crédito**). Por cliente: **informe de facturas**
  (ver productos, **imprimir boleta** PDF), **resumen de gastos y deuda**, registrar **pagos**, aplicar
  **mora** (monto fijo o % del saldo), editar el **límite** y **enviar el estado de cuenta** por email.
- **Cierre de quincena**: envía por **email** (SMTP propio de la sucursal) el **estado de cuenta**
  (facturas del período + saldo a pagar) a **uno, varios o todos** los clientes.
- **Configuración** (administrador): **PINes de anulación** (hasta 3 por sucursal) y **límite de
  crédito por defecto** para las cuentas nuevas.
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

> Dependencias del backend: `mysql2`, `ws`, `bcryptjs` y **`nodemailer`** (envío de correo SMTP para
> los estados de cuenta de la quincena).
> El frontend usa Bootstrap, Bootstrap Icons, Chart.js, SweetAlert2, XLSX y jsPDF vía CDN.

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
> stock**, para probar cómo cambia el menú según lo contratado. Centro trae además **PINes de
> anulación** de ejemplo (`1234` / `9999`) y un **límite de crédito por defecto** de `5000`.

## Correo (envío de estados de cuenta)

El estado de cuenta de la quincena se envía por **email (SMTP)**. Las credenciales se guardan
**por sucursal en la base de datos**: el **superadministrador** las carga en el formulario de la
sucursal (**correo de envío** + **contraseña de aplicación**). Cada sucursal envía desde su propia
casilla. Si una sucursal no tiene credenciales propias, se usa como *fallback* el SMTP global del
`.env` (opcional).

Con **Gmail** necesitás una **contraseña de aplicación** de 16 caracteres (requiere Verificación en
2 pasos activada). Se genera acá:

**https://myaccount.google.com/apppasswords**

Cargala **sin espacios** en el campo *Contraseña de aplicación* de la sucursal (tiene un ícono de ojo
para verla). Valores típicos de Gmail: host `smtp.gmail.com`, puerto `465`, seguro `true`.

> *Fallback global (opcional)*: podés dejar un SMTP por defecto en el `.env` con las variables
> `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (ver `.env.example`).
> El estado del envío se ve en **Configuración** (administrador).

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
> datos, en vez de reinicializar aplicá las migraciones a mano desde `backend/sql/migrations/`, en
> orden:
> - `006-facturacion.sql` — paquetes por sucursal + tablas de facturación (clientes, ventas).
> - `007-turnos-y-anulacion.sql` — turnos de caja.
> - `008-pines-y-cuenta-corriente.sql` — PINes de anulación, cuenta corriente y límites de crédito.
> - `009-smtp-por-sucursal.sql` — credenciales de correo por sucursal.
>
> ```bash
> mysql -u <usuario> -p facturafy < backend/sql/migrations/009-smtp-por-sucursal.sql
> ```

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

Recursos de facturación: `/clientes` (CRUD + cuenta corriente: `/:id/cuenta`, `/:id/pagos`,
`/:id/mora`, `/:id/limite`, `/quincena/enviar`), `/ventas` (incluye `/turno/:id` y `/cliente/:id`),
`/turnos` (abrir, unirse, cerrar, reporte de arqueo) y `/estadisticas-venta`. `/sucursales` suma la
gestión de **PINes** (`/:id/pines`) y de **correo SMTP** (`/:id/smtp`, la contraseña nunca se expone
salvo al editar la sucursal).

## Notas

- **CORS** está abierto por defecto (`CORS_ORIGIN=*`); restringilo en producción.
- Cambiá `JWT_SECRET` en producción.
- Para activar la **factura electrónica (DGI/CFE)**: poné `CFE_ENABLED=true` y las credenciales
  `CFE_*` en el `.env`, e implementá el envío al proveedor en
  `backend/src/modules/facturacion/cfe.js`. Las columnas `cfe_*` de la tabla `venta` ya existen.
- El **POS usa un lector físico** de código de barras (actúa como teclado). No usa la cámara.
- Para el **envío de correo** (estados de cuenta): cargá el correo y la **contraseña de aplicación**
  de cada sucursal (superadmin), o un SMTP global en el `.env`. Contraseñas de aplicación de Gmail:
  **https://myaccount.google.com/apppasswords**. El `.env` (y por lo tanto las credenciales globales)
  **no** se sube al repositorio.
