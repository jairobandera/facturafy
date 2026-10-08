# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Facturafy** is a multi-company **facturación + control de stock** system. It started as a fork of
Stockify 2.0 (inventory / stock-counting; the original lives in the sibling folder `../Stockify2.0`)
and adds a billing module on top, on the same **zero-framework** stack. The API shape, endpoint paths
and DTO field names from Stockify are preserved for compatibility; the API base is still
`/Stockify/api/v1`.

- **Backend**: raw Node.js (native `http` module, no Express) + `ws` for WebSocket + `mysql2` for
  MySQL/MariaDB + `bcryptjs` + `nodemailer` (SMTP para el estado de cuenta de la quincena). ES modules
  (`"type": "module"`). `nodemailer` se sumó para el envío de correo; el resto del stack sigue mínimo.
- **Frontend**: plain HTML/CSS/JS SPA (no framework, no build step). ES modules loaded directly by the
  browser. Bootstrap, Chart.js, SweetAlert2, XLSX, jsPDF come from CDNs (see `frontend/index.html`).
- The backend serves both the API and the static frontend from the same origin/port.

Comments and identifiers are in Spanish; keep that convention.

## Commands

All backend commands run from `backend/`:

```bash
cd backend
npm install          # install the 3 deps
cp .env.example .env # then edit DB_USER / DB_PASS (a default .env already exists)
npm run db:init      # create database + tables + seed data (scripts/init-db.js, sql/schema.sql)
                     # WARNING: schema.sql drops every table first — only for a fresh/disposable DB
npm start            # run server (serves API + WebSocket + frontend) on http://localhost:8080/
npm run dev          # same, with node --watch for auto-restart
```

There is **no test suite, no linter, and no build step** — the frontend is served as-is.

**Schema changes on a database that already has data**: `db:init` would wipe it, so add the change to
`sql/schema.sql` (and re-run `npm run db:export`) *and* write the equivalent `ALTER` statements to
`sql/migrations/NNN-descripcion.sql`, to be applied by hand:

```bash
mysql -u <usuario> -p <base> < backend/sql/migrations/001-lote-afecta-stock.sql
```

Test users (password `12345`): `superadmin` (SUPERADMINISTRADOR), `admin` (ADMINISTRADOR),
`empleado` (EMPLEADO), `cajero` (CAJERO, Sucursal Centro con paquete de facturación). The DB name is
`facturafy` (see `.env`), independent from the original Stockify DB.

## Backend architecture

Entry: `server.js` → `src/app.js` (`handleRequest`) handles CORS, auth extraction, routing, and static
files. `src/routes.js` mounts every module's router under `/<resource>` beneath the API base
(`API_BASE`, default `/Stockify/api/v1`).

**Two module styles** live under `src/modules/<domain>/`:

1. **Simple CRUD** — a single `<domain>.module.js` calls `createCrud()` from `src/core/crud.js`,
   passing `{ table, entityLabel, fields }`. The factory generates repository + service + routes
   (list active, list all `/all`, get `/:id`, create, update, soft-delete). All entities use
   **soft-delete via an `activo` column** — DELETE sets `activo = 0`, it does not remove rows.
   Examples: empresa, sucursal, categoria, proveedor, lote, reporte.
   To extend a CRUD entity with custom routes, pass an `extend` callback to `buildRoutes()` — it runs
   *before* the `/:id` route so custom literal paths don't collide with the `:id` param.

2. **Custom logic** — split into `<domain>.repository.js` (raw SQL) → `<domain>.service.js`
   (business logic) → `<domain>.routes.js` (HTTP), following the original's 3-layer pattern.
   Examples: usuario, producto, conteo (count), conteoProducto, conteoUsuario, estadistica, seguridad.

**Core helpers** (`src/core/`):
- `router.js` — minimal `/resource/:id` matcher; `.use(prefix, subRouter)` mounts one router under
  another. Segment count must match exactly (no wildcards).
- `crud.js` — the generic CRUD factory described above.
- `jwt.js` — hand-rolled HS256 JWT (native `crypto`, no library). `generateToken`, `verifyToken`
  (uses `timingSafeEqual`), `extractBearer`.
- `password.js` — bcrypt hashing/verify.
- `http.js` — `sendJson`, `sendText`, `sendNoContent`, `readJsonBody`, `applyCors`.
- `httpError.js` — `HttpError` + helpers (`notFound`, `badRequest`, `unauthorized`, `forbidden`).
  Throw these in services/routes; `app.js` maps them to status codes (and `ER_DUP_ENTRY` → 400).
- `sql.js` — `buildSet` (dynamic UPDATE clauses), `toBool`.
- `static.js` — serves the frontend directory.
- `ws.js` — see real-time below.

**Auth is currently permissive at the transport layer**: `app.js` decodes a valid Bearer token into
`ctx.user` if present but does **not** reject requests without one — routes/services are responsible
for any authorization checks. Role authorization is primarily enforced on the frontend router.

**Database access** (`src/config/db.js`): a shared `mysql2/promise` pool. Use `query(sql, params)`
for single statements and `transaction(async (conn) => {...})` (auto commit/rollback) for
multi-statement operations — see `conteo.module.js` for the transaction pattern. The pool uses
`dateStrings: true` (DATE/DATETIME come back as strings to avoid timezone drift) and
`namedPlaceholders: true`.

**Config** comes from `src/config/env.js`, read from `.env`. Key vars: `PORT`, `API_BASE`,
`CORS_ORIGIN`, `DB_*`, `JWT_SECRET`, `JWT_EXPIRATION_HOURS`, `SERVE_FRONTEND`.

## Per-sucursal uniqueness

The same physical product may exist in more than one sucursal (a warehouse and a store), each with
its own `cantidad_stock`. So **`producto.codigo_producto` and `codigo_barra.codigo` are unique per
sucursal, not globally** — `uk_producto_codigo_sucursal` and `uk_codigobarra_sucursal` in
`sql/schema.sql`. `codigo_barra.sucursal_id` is a denormalization of the product's sucursal (MySQL
cannot build a UNIQUE over another table's column); `syncCodigosBarra()` in `producto.service.js` is
the only writer of barcodes and keeps it in sync, including when a product moves sucursal.

When adding a lookup by `codigo_producto` or by barcode, **scope it by sucursal** — an unscoped
query is ambiguous by design now. `GET /productos/codigo/:codigo/sucursal/:sucursalId` is the
correct form; the unscoped `/codigo/:codigo` is kept for compatibility and returns the lowest id.

**Barcodes accumulate and are never deleted.** A product holds N rows in `codigo_barra` (a product's
EAN gets replaced and both the old and the new one must keep scanning), and `codigo_barra.activo`
gives it soft-delete like the rest of the system. `syncCodigosBarra()` takes a `modo`: `'merge'`
(the default, used by **every** import — only adds and reactivates) and `'reemplazar'` (deactivates
what is missing from the list). It never issues a `DELETE`, and it no longer throws on a duplicate
EAN: it returns `{ agregados, reactivados, desactivados, yaExistian, conflictos }` and the caller
decides — imports report the conflict and carry on, the product form turns it into a 400 via
`assertSinConflictos()`. Before, one repeated EAN rolled back the transaction and lost the whole
product row.

A barcode is **not required** to create a product (bulk goods and services have none), and
`POST /productos/:id/codigos-barra` accepts either `codigo` or `codigos` and splits on comma,
semicolon, pipe or whitespace — pasting "123, 456" must store two codes, not one.

`crearSimples` merges barcodes into a product that already exists instead of rejecting the row, and
touches nothing else (price and stock belong to the stock Excel). It also **creates the categories**
the file references: `resolverCategoriaDeImport()` looks the category up by id, then by
`codigo_categoria` (ignoring leading zeros — the Excel says `95`, the DB has `095`), then by name,
and only creates a new one when none match; "Sin categoria" is left for rows that name no category
at all. Its result counts every row (`recibidos`, `creados`, `yaExistian`, `errores`,
`categoriasCreadas`, `conflictos`) so the import summary can prove no row was silently dropped —
`actualizarMasivo` (the `general.xls` stock flow) is untouched by all this. Dedicated endpoints:
`POST /productos/codigos-barra?sucursalId=` (bulk, additive), `POST /productos/:id/codigos-barra`
and `DELETE /productos/:id/codigos-barra/:codigo` (soft delete) — the product form can no longer
remove a barcode, only the Códigos de barra screen can.

`proveedor` is the deliberate opposite: `rut` is UNIQUE globally and the supplier is **shared**
across sucursales through the `sucursal_proveedor` join table. `categoria` is already per-sucursal
(`categoria.sucursal_id`), which is why every sucursal gets its own "Sin categoria" (`DEFAULT`).

## Conteos and sucursal scope

`conteo.sucursal_id` says **where** the count happens; it is chosen when the count is created and
everything downstream derives from it (its categories, its products, the scan catalog, the report).
Never re-derive a count's sucursal from the creator or from its rows.

Who may act on a sucursal is `puedeAccederASucursal(usuarioId, sucursalId)`
(`src/modules/usuario/acceso.js`), used by conteo creation, `conteo_usuario` and `conteo_producto`:

- `SUPERADMINISTRADOR` — any sucursal.
- `ADMINISTRADOR` — any sucursal **of their empresa**, which is what lets them start a count in the
  warehouse and in the store.
- `EMPLEADO` — only their own, unless `usuario.cuenta_en_cualquier_sucursal` extends them to their
  empresa. The superadmin sets that flag on the user form.

On the frontend, `auth.getSucursalId()` is the user's **real** sucursal (token) and
`sucursalActiva()` (`core/sucursal.js`) is the one an admin is currently looking at. Pages that show
data use the active one; anything that identifies the user — notably `resolvePerfil()` in
`pages/shared/session.js` — must keep using the token's.

`GET /conteos`, `/conteos/all` and `/conteos/finalizados` take an optional `?sucursalId=`; the
WebSocket payload carries `sucursalId` so clients can ignore events from sucursales they are not
looking at (`publish()` is a global broadcast).

## Optional sections per sucursal

`sucursal.usa_lotes` (set by the superadmin in the sucursal form) decides whether that branch's
admins get the **Lotes** section. It is enforced on both sides:

- **Backend**: `assertUsaLotes(sucursalId)` / `assertUsaLotesPorProducto(productoId)` in
  `lote.module.js` throw 403 on every lote read and write (the product-based variant is what covers
  create/update/delete and `ajustar-stock`).
- **Frontend**: `core/sucursal.js` fetches `/sucursales/:id` once per app load and caches it
  (`stockify_sucursal` in localStorage). `usaLotes()` feeds the sidebar (greyed item with a padlock,
  no link — `.sk-nav-disabled`), the dashboard cards, and the route guard
  `router.add(path, handler, { role, requiere })`. Deliberately **not** in the JWT: a token lasts
  hours, so a toggle would only take effect after re-login.

To add another optional section, follow the same three points: a `usa_*` column on `sucursal`
(via `createCrud` fields, with `default`), a check in that module's service, and `requiere` on the
route plus the NAV entry.

## Stock model (producto vs lote)

`producto.cantidad_stock` is the single source of truth. It is written **absolutely** by the manual
form, by the catalog import (`crear-simples`) and by the stock Excel (`actualizar-masivo`, which
replaces the value — that is the "stock final" flow used before a conteo). Finalizing a conteo does
**not** write back to it.

A **lote** only labels part of that stock:

```
producto.cantidad_stock = suma de lotes activos + stock sin lote
```

`lote.afecta_stock` records whether that particular lote added its quantity to the product (new
goods). When it is 0 the lote merely describes stock that was already counted, and creating,
editing or deactivating it leaves `cantidad_stock` untouched. Only `afecta_stock = 1` lotes move the
product's stock, and `lote.module.js` reverts the old contribution and applies the new one on every
update (`aporte()` / `adjustStock`). A negative "stock sin lote" is a descuadre — surfaced by
`GET /lotes/sucursal/:id/resumen` and fixable with `POST /lotes/ajustar-stock`.

## Real-time (WebSocket)

`src/core/ws.js` replaces the original Spring STOMP broker. Clients connect to `/ws` and receive
`{ topic, payload }` JSON messages; the frontend filters by `topic`. **Clients only listen, never
publish.** Backend code calls `publish(topic, payload)` (e.g. from the conteo module). The three
topics, kept identical to the original: `conteo-activo`, `conteo-finalizado`,
`conteo-producto-actualizado`. Frontend subscribes in `frontend/assets/js/core/ws.js`.

## Frontend architecture

No build — `index.html` loads `assets/js/app.js` as an ES module, which imports everything else.

- `app.js` — registers every route with `router.add(path, handler, { role })` and starts the router.
  Roles: `SUPERADMINISTRADOR`, `ADMINISTRADOR`, `EMPLEADO`, `CAJERO`.
- `core/router.js` — **hash-based** router (`#/path/:param`) with per-route role guards. Unauthorized
  or wrong-role access redirects to login or the role's home dashboard (`auth.homeRoute()`).
- `core/auth.js` — token stored in `localStorage` (`stockify_token`); decodes JWT client-side to read
  `rol`, `sucursalId`, `sub`, `exp`.
- `core/api.js` — fetch wrapper; attaches the Bearer token, unwraps errors; on 401/403 with an expired
  token, logs out.
- `core/config.js` — derives `apiBase` and `wsUrl` from `window.location.origin` (same-origin as backend).
- `core/lifecycle.js` — `runCleanups()` runs teardown for the previous page (WS unsubscribes, timers)
  on every navigation; `app.js` wraps each page handler with it.
- Other core: `layout.js`, `ui.js` (SweetAlert wrappers), `dom.js`.
- `components/` — reusable building blocks: `crudPage.js` (generic CRUD page over `dataTable` +
  `formModal`), `dataTable.js`, `formModal.js`, `excel.js`, `cards.js`, `badges.js`, `page.js`,
  `sucursalSelect.js`.
- `dataTable` paginates at **20 rows** by default (`porPagina`, 0 disables it); the search resets to
  page 1 and the footer shows "Mostrando X-Y de Z". Every table in the app gets this for free.
- The admin inventory pages (categorías, productos, proveedores, lotes) carry a **sucursal selector**
  from `components/sucursalSelect.js`: `sucursalSelect(onCambio)` for the toolbar and
  `campoSucursal(sucursales)` for the create form. Both start on the user's own sucursal
  (`sucursalActiva()`, see the conteos section) and only render when the empresa has more than one.
  The create form offers the field **only on create** — moving an existing record between sucursales
  is a different operation and is not exposed there.
- `pages/` — organized by role: `superadmin/`, `admin/`, `empleado/`, plus `shared/` (e.g.
  `conteoView.js`, `session.js`) and `login.js`.

## API resources

Base `/<API_BASE>` (default `/Stockify/api/v1`): `/seguridad/login`, `/usuarios`, `/empresas`,
`/sucursales`, `/categorias`, `/proveedores`, `/productos`, `/lotes`, `/conteos`, `/conteoproducto`,
`/conteo-usuarios`, `/sucursal-proveedor`, `/reportes`, `/estadisticas`.

Beyond the CRUD routes, `/lotes` adds `GET /sucursal/:id/por-vencer?dias=30` (expiry watchlist with
`diasRestantes`), `GET /sucursal/:id/resumen` (stock del producto vs stock en lotes por producto) and
`POST /ajustar-stock` (`{ productoId }`, iguala el stock del producto a la suma de sus lotes).
`/productos` adds `GET /codigo/:codigoProducto/sucursal/:sucursalId` — the sucursal-scoped lookup
that should be preferred over the ambiguous `GET /codigo/:codigoProducto` — y dos endpoints
**públicos** (sin login) para el kiosko de consulta de precios:
`GET /productos/consulta/sucursal/:id` (`{ sucursalNombre, habilitado }`) y
`GET /productos/consulta/sucursal/:id/codigo/:codigo` (`{ nombre, imagen, precio }` o 404; 403 si la
sucursal no tiene la consulta habilitada).

Facturación resources: `/clientes` (CRUD + `GET /sucursal/:id` + `GET /sucursal/:id/rut/:rut`;
cuenta corriente: `GET /:id/cuenta`, `POST /:id/pagos`, `POST /:id/mora`, `PUT /:id/limite`,
`GET /:id/quincena?desde=&hasta=`, `POST /quincena/enviar`, `GET /correo/estado`),
`/ventas` (`POST /`, `GET /sucursal/:id?desde=&hasta=&estado=`, `GET /turno/:turnoId`,
`GET /cliente/:clienteId`, `GET /:id`, `POST /:id/anular`), `/turnos` (see Turnos below) and
`/estadisticas-venta` (`/resumen`, `/facturado-mes`, `/top-productos`), `/cotizaciones`
(`GET /vivas?empresaId=`, `GET /venta?empresaId=&moneda=`, `GET|PUT /empresa/:empresaId`) y
`/envio-correos` (paquete solo-correos: `GET|POST /contactos/sucursal/:id`, `DELETE /contactos/:id`,
`POST /enviar/sucursal/:id`, `GET /sucursal/:id` historial, `GET /:id` detalle del lote).
`/sucursales` adds the PIN management (`GET|POST /:id/pines`, `PUT|DELETE /:id/pines/:pinId`, max 3
active, value never returned), the SMTP per-sucursal (`GET|PUT /:id/smtp`, la contraseña solo se
devuelve al editar) y lleva `limiteCreditoDefault` en el CRUD (`PUT /sucursales/:id`).

## Facturación (módulo nuevo de Facturafy)

**Paquetes por sucursal.** Two flags on `sucursal` decide what each branch has, set by the superadmin
in **Configuraciones** (`#/superadmin/configuraciones`, saved via `PUT /sucursales/:id`):
`usa_stock` (conteos + estadísticas de conteo) and `usa_facturacion` (POS + ventas + clientes +
estadísticas de venta). Hay además `usa_envio_correos` (paquete "Solo envío de correos", ver abajo).
Inventory (productos/categorías/proveedores) is shared, pero se **oculta** cuando no hay ni stock ni
facturación. Los "paquetes" (Completo / Solo facturación / Solo stock / **Solo envío de correos**) son
presets sobre estos flags. Defaults: `usa_stock = 1`, el resto `0`.

Enforced on both sides like `usa_lotes`: backend `assertUsaFacturacion` / `assertUsaStock` /
`assertUsaEnvioCorreos` (`src/modules/sucursal/paquetes.js`); frontend `usaStock()` / `usaFacturacion()`
/ `usaEnvioCorreos()` (`core/sucursal.js`) feed the NAV y los route guards (`requiere`). En
`layout.js#buildSidebar`, una **sección** con `oculto` oculta su título **y** todos sus items (patrón
`saltando`), por eso el paquete solo-correos deja el menú limpio. Las secciones del NAV son
**colapsables** (estado por rol en localStorage).

**Rol CAJERO.** Fourth role (`usuario.service.js` ROLES). Logs in to `#/facturacion/dashboard`
(`auth.homeRoute`). The cajero sells (POS), busca clientes para facturar y anula ventas de su turno
(con PIN). **No crea ni gestiona clientes**: eso es del **administrador**, que no vende (ve ventas,
anula, estadísticas, clientes + cuenta corriente, turnos y configuración). Reportes/estadísticas de
conteo and de facturación are **separate** sections, never mixed.

**POS** (`pages/cajero/pos.js`): usa `components/barcode.js` (`manualSearch`, `findByCode`) y el lector
físico (listener de teclado) para agregar productos — el escaneo con cámara se quitó; cart is a
`Map(productoId → {producto, cantidad})` so equal products unify into one row; default cliente is
**consumidor final** (`cliente_id = NULL`), o un cliente **registrado** elegido con buscador
(`/clientes/sucursal/:id`). Sin turno abierto el POS no opera. `POST /ventas` recalculates
totals **server-side**, inserts `venta` + `venta_detalle` (snapshot of código/nombre/precio) and
**discounts** `producto.cantidad_stock`. `POST /ventas/:id/anular` requires a `motivo` and **returns**
the stock. Comprobante PDF via jsPDF.

**Turnos de caja (`/turnos`).** El cajero, al entrar, debe **iniciar turno** antes de que el POS,
Clientes y Ventas del turno se habiliten (gate en el front vía `core/turno.js`, y el POS manda
`turnoId` en cada venta). Un turno es **uno por sucursal a la vez** (`turno.estado = 'ABIERTO'`,
enforced en `turno.service.js#abrir` con `FOR UPDATE`): si ya hay uno abierto, el cajero se **suma**
(`POST /:id/unirse`) en vez de abrir otro. `numero` 1=mañana/2=tarde/3=noche/4=otro. Varios cajeros
comparten el turno (`turno_usuario`); el **responsable** es quien marcó el checkbox al abrir/sumarse
(`turno.usuario_responsable_id`, puede quedar sin responsable). **Cerrar** (`POST /:id/cerrar`,
responsable o admin — el route deriva `esAdmin` de `ctx.user.rol`) marca `CERRADO` y devuelve el
reporte de **arqueo** (`GET /:id/reporte`: totales por forma de pago, ventas, anuladas,
participantes). No hay fondo de caja ni conteo físico en la app (es procedimiento interno). Cada
`venta` lleva `turno_id`; `GET /ventas/turno/:turnoId` lista las del turno para la pantalla del cajero.

**Anulación por el cajero con PIN.** El cajero anula/elimina una venta de su turno ingresando
**motivo + PIN de autorización**. Los PINes viven en la tabla `sucursal_pin` (hasta 3 activos por
sucursal, con etiqueta; el máximo lo controla el servicio) y **los gestiona el administrador** en
`#/admin/configuracion`. `venta.routes.js` exige el PIN cuando el rol no es admin
(`requierePin = !esAdmin`) y valida contra cualquier PIN activo de la sucursal; el admin anula desde
`#/admin/ventas` sin PIN. El valor del PIN **nunca** se devuelve en un GET (el listado trae id,
etiqueta y activo).

**Clientes, cuenta corriente y crédito.** El **alta/gestión de clientes es solo del administrador**
(`#/admin/clientes`); el cajero solo busca un cliente registrado para facturarle. El **email es
obligatorio** (se usa para el estado de cuenta). El documento usa dos radios (RUT/Cédula) sobre **un
único** input; el número va a `cliente.rut` y el tipo a `cliente.tipo_documento`. `core/validacion.js`
valida cédula y RUT uruguayos reales (dígito verificador). La **cuenta corriente** es un mayor
(`cliente_movimiento`: `CARGO_VENTA` | `CARGO_MORA` | `PAGO`); el saldo = Σcargos − Σpagos
(`src/modules/cliente/cuenta.js`). Una venta a crédito inserta un `CARGO_VENTA` dentro de la
transacción y la anulación lo revierte. El **límite de crédito** por cliente (`cliente.limite_credito`,
0 = sin límite) se copia al crearlo de `sucursal.limite_credito_default` (lo fija el admin); el POS
rechaza una venta a crédito si `saldo + total > límite` (chequeo server-side en `venta.service.js`).
El admin aplica **mora** (monto fijo o % del saldo) y registra **pagos**. **Cerrar la quincena** =
`POST /clientes/quincena/enviar` arma el estado de cuenta (facturas del período + saldo a pagar) y lo
manda por **email** (SMTP vía `nodemailer`, `src/core/mailer.js`, config `SMTP_*` en `.env`) a uno,
varios o todos los clientes; **no** modifica el saldo. El administrador también ve
`#/admin/turnos` (historial + arqueo + cerrar) y `#/admin/configuracion` (PINes + límite por defecto).

**Monedas, comentario y vuelto en la venta.** El total "oficial" (`venta.subtotal`/`total`) **siempre
está en UYU**. Cuando se cobra en otra moneda se guardan `moneda_pago` (UYU|USD|ARS|EUR), `cotizacion`
(UYU por 1 unidad) y `total_moneda` (= `total / cotizacion`); el crédito se fuerza a UYU. Las
cotizaciones manuales son **por empresa** (tabla `cotizacion`, compra/venta en UYU por unidad), las
carga el admin en Configuración. `cotizacion.module.js#paraVenta` resuelve la cotización de una venta
(**admin `compra`; API en vivo si falta** — `open.er-api.com`, base UYU, cacheada 10 min) y
`#paraConversor` la del conversor del cajero (**API; admin si falla**). `venta.efectivo_recibido` y
`vuelto` (en `moneda_pago`) guardan el efectivo y el vuelto de las ventas al contado, y
`venta.comentario` una nota del cajero que sale en la boleta (PDF) y en el email del estado de cuenta.

**Consulta de precios (kiosko).** Página pública `frontend/consulta.html?sucursal=<id>` (HTML
autónomo, sin login ni el SPA) para que el cliente pase un producto por el lector y vea
nombre/imagen/precio; a los 5 s vuelve a la pantalla de escaneo. Se habilita por sucursal con el flag
`sucursal.usa_consulta_precio` (requiere `usa_facturacion`), que el **superadmin** activa en
Configuraciones (ahí se copia el enlace del kiosko). Backend: `producto.service.js#consultaInfo` /
`#consultaPrecio` (busca por código de barra o código de producto, scope sucursal; devuelve solo
nombre/imagen/precio y 403 si no está habilitado). Los endpoints son públicos a propósito.

**Paquete "Solo envío de correos" (`src/modules/envioCorreo/`).** Para negocios que ya tienen su
sistema y solo quieren automatizar el envío de la quincena por email, cargando los datos desde Excel
(no usan la facturación de la app ni la tabla `cliente`). Flag `sucursal.usa_envio_correos`. Dos
insumos: (1) **contactos** (`contacto_correo`: clave/nombre/email, por sucursal, reutilizable, merge
por clave) que se cargan desde Excel; (2) **estado de cuenta** por quincena (Excel con una fila por
ítem), que el front agrupa por **clave** y manda como `estados: [{clave, lineas:[{concepto,fecha,
monto}], total}]`. El backend cruza por clave contra `contacto_correo`, arma el HTML con la tabla y
envía (reusa `mailer.js#resolverSmtp` + `enviarConFallback`, el helper extraído del flujo de la
quincena de facturación). Guarda historial en `envio_correo` + `envio_correo_detalle`. Front:
`pages/admin/correos{Contactos,Enviar,Historial}.js`, reusando `components/excel.js`
(`importFromExcelRaw`, `findHeaderRow`, `claveCodigo`, `parsePrecio`) y `components/plantillas.js`
(plantillas `correosContactos` / `correosEstadoCuenta`). La clave se normaliza con `claveCodigo`.

**Correo SMTP por sucursal con respaldo.** Las credenciales viven en `sucursal.smtp_*` (las carga el
superadmin en el form de sucursal; `smtp_pass` solo se devuelve al editar). `mailer.js#resolverSmtp`
usa la casilla de la sucursal y, si no tiene, la global del `.env`. En `enviarQuincena`, si el envío
con la casilla propia falla, **reintenta con el SMTP global del `.env`** como respaldo.

**Factura electrónica (DGI/CFE Uruguay) — preparada, hoy apagada.** `venta` has `cfe_*` columns and
every venta is born `cfe_estado = 'INTERNO'`. `src/modules/facturacion/cfe.js#emitirCFE()` is a no-op
until `CFE_ENABLED=true` and a provider are configured in `.env` (`CFE_*`). Activating it should be a
minimal change: set credentials + implement the provider branch in `cfe.js`.
