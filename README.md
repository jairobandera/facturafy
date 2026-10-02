# Stockify 2.0

**Stockify 2.0** es un sistema **multi-empresa** de **gestión de inventario y conteos de stock**.
Permite administrar empresas, sucursales, usuarios (con roles), categorías, productos, proveedores
y lotes, y realizar **conteos de inventario colaborativos en tiempo real** (varios usuarios contando
a la vez), con reportes de diferencias entre el stock esperado y el contado.

Es una reescritura completa del Stockify original (Spring Boot + Angular) sobre un stack **sin
frameworks**.

## ¿Qué hace?

- **Multi-empresa / multi-sucursal**: cada empresa agrupa sucursales; los usuarios, categorías,
  productos y conteos pertenecen a una sucursal.
- **Roles**: `SUPERADMINISTRADOR` (gestiona empresas, sucursales y usuarios), `ADMINISTRADOR`
  (gestiona el inventario y los conteos de su sucursal) y `EMPLEADO` (participa en los conteos).
- **Inventario**: categorías, productos (con código de barras), lotes y proveedores.
- **Conteos de stock en tiempo real**:
  - **Conteo libre**: se van agregando productos a mano.
  - **Conteo por categorías**: carga automáticamente todos los productos de las categorías elegidas.
  - Varios usuarios cuentan simultáneamente y ven las actualizaciones **al instante** (WebSocket).
  - **Escaneo de código de barras** con la cámara del dispositivo o con un lector físico.
  - Aviso cuando un producto ya fue contado por otra persona.
- **Conteos finalizados**: búsqueda por rango de fechas y **reapertura** de un conteo para reajustes.
- **Reportes**: diferencias (faltantes / sobrantes), diferencia monetaria, quién contó cada
  producto, y exportación a **PDF**.

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

| Usuario      | Rol                 |
|--------------|---------------------|
| `superadmin` | SUPERADMINISTRADOR  |
| `admin`      | ADMINISTRADOR       |
| `empleado`   | EMPLEADO            |

## Base de datos

Hay dos formas de crear la base:

### Opción A — script de inicialización (recomendada)

Con MySQL corriendo y el `.env` configurado:

```bash
cd backend
npm run db:init
```

Crea la base `stockify`, todas las tablas (`backend/sql/schema.sql`) y carga datos de ejemplo.

### Opción B — importar un dump SQL desde un IDE / cliente

Si preferís administrar la base con un cliente gráfico (**phpMyAdmin**, **HeidiSQL**,
**MySQL Workbench**, **DBeaver**), usá el dump autocontenido:

```bash
cd backend
npm run db:export        # genera backend/sql/stockify_import.sql
```

El archivo `backend/sql/stockify_import.sql` incluye `CREATE DATABASE` + tablas + datos de ejemplo.
Importalo:

- **phpMyAdmin**: pestaña *Importar* → elegí el archivo → *Continuar*.
- **HeidiSQL / Workbench / DBeaver**: abrí el `.sql` y ejecutalo.
- **Consola**: `mysql -u root -p < sql/stockify_import.sql`

> El repositorio ya incluye un `stockify_import.sql` generado. Regeneralo con `npm run db:export`
> si cambiás el esquema o los datos semilla.

## Estructura del proyecto

```
Stockify2.0/
├── backend/
│   ├── server.js                 # Punto de entrada (HTTP + WebSocket)
│   ├── sql/
│   │   ├── schema.sql            # Esquema MySQL (tablas)
│   │   └── stockify_import.sql   # Dump completo importable (generado)
│   ├── scripts/
│   │   ├── init-db.js            # Crea BD + tablas + datos semilla  (npm run db:init)
│   │   └── export-sql.js         # Genera el dump importable         (npm run db:export)
│   └── src/
│       ├── config/               # env.js, db.js (pool MySQL)
│       ├── core/                 # router, jwt, ws, http, crud genérico, etc.
│       └── modules/              # un módulo por dominio (usuario, producto, conteo, ...)
└── frontend/
    ├── index.html
    └── assets/
        ├── css/styles.css
        └── js/
            ├── app.js            # Registro de rutas (SPA)
            ├── core/             # api, auth, ws, router, layout, ui, dom
            ├── components/       # dataTable, formModal, crudPage, barcode, excel, cards
            └── pages/            # login + superadmin/ + admin/ + empleado/ + shared/
```

### Arquitectura del backend

Cada módulo sigue 3 capas: **repository** (SQL) → **service** (lógica) → **routes** (HTTP).
Las entidades CRUD simples (empresa, sucursal, categoría, proveedor, reporte) se generan con el
factory `src/core/crud.js`; los módulos con lógica propia (producto, lote, conteo, estadística)
están escritos explícitamente. Todas las entidades usan **borrado lógico** con la columna `activo`.

### Tiempo real

El backend publica por WebSocket en 3 topics: `conteo-activo`, `conteo-finalizado` y
`conteo-producto-actualizado`. El frontend (`assets/js/core/ws.js`) se suscribe y actualiza la UI
en vivo durante los conteos.

## API

Base: `http://localhost:8080/Stockify/api/v1` (configurable en `.env`).

Recursos: `/seguridad/login`, `/usuarios`, `/empresas`, `/sucursales`, `/categorias`,
`/proveedores`, `/productos`, `/lotes`, `/conteos`, `/conteoproducto`, `/conteo-usuarios`,
`/sucursal-proveedor`, `/reportes`, `/estadisticas`.

## Notas

- **CORS** está abierto por defecto (`CORS_ORIGIN=*`); restringilo en producción.
- Cambiá `JWT_SECRET` en producción.
- El **escaneo por cámara** requiere un origen seguro (**HTTPS** o `localhost`). Desde un celular
  por HTTP en la red local, la cámara queda bloqueada por el navegador (el lector físico sí funciona);
  para usar la cámara en el celular, servilo por HTTPS (por ejemplo con un túnel como ngrok).
