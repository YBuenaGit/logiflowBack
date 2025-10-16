# Logiflow MVP

Aplicación Node.js/Express para la gestión logística del MVP "Logiflow". Permite administrar clientes, productos, depósitos, stock, pedidos, envíos y facturas desde una API REST y una interfaz web (Pug).

## Características

- API REST modular (clientes, productos, depósitos, stock, pedidos, envíos, facturas).
- Panel web en Express + Pug para operaciones manuales.
- Persistencia en **MongoDB** usando el driver oficial.
- Secuencias por colección (`counters`) para IDs incrementales.
- Validaciones y reglas de negocio encapsuladas en servicios.
- Script de importación desde `db.json` (compatibilidad con los datos históricos).

## Requisitos

- Node.js 18+ (el driver de Mongo 6.13 requiere >=16.20.1; se recomienda 18 LTS o superior).
- Cuenta/cluster en MongoDB Atlas u otro MongoDB accesible.

## Configuración

1. Clonar o descargar el proyecto.
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Crear un archivo `.env` en la raíz con las variables necesarias (ejemplo):
   ```env
   MONGODB_URI="mongodb+srv://usuario:password@cluster.mongodb.net/?retryWrites=true&w=majority"
   MONGODB_DB="logiflow"
   PORT="3000"
   ```
   - `MONGODB_URI`: connection string completa de tu cluster.
   - `MONGODB_DB`: nombre de la base (por defecto se usa `logiflow`).
   - `PORT`: puerto HTTP para Express (default `3000`).

> **Nota:** antes de la migración a MongoDB la persistencia se hacía en un archivo `db.json`. Ese archivo se conserva como snapshot y ahora se usa para importar datos al cluster.

## Importar datos desde `db.json`

Si querés volcar el contenido histórico del archivo `db.json` a tu base Mongo:
```bash
npm run seed
```
El script `scripts/seed-from-json.js` lee `db.json`, reemplaza el contenido de las colecciones principales (`customers`, `products`, `warehouses`, `stock`, `orders`, `shipments`, `invoices`) y actualiza la colección `counters` para respetar los IDs secuenciales.

## Ejecución

```bash
npm start
```
Al iniciarse verás en consola algo como:
```
API on http://localhost:3000
*********************************
      LOGIFLOW  GRUPO 14
*********************************
```

La aplicación expone:

- API JSON bajo `/customers`, `/products`, `/warehouses`, `/stock`, `/orders`, `/shipments`, `/invoices` (CRUD y endpoints específicos según cada dominio).
- Vistas HTML bajo `/views` (ej. `http://localhost:3000/views/customers`).

Para desarrollo podés usar nodemon u otra herramienta que reinicie el proceso si lo preferís.

## Estructura principal

```
src/
  controllers/   → controladores Express por dominio
  models/        → acceso a datos (MongoDB) y operaciones de persistencia
  services/      → lógica de negocio y validaciones adicionales
  modules/       → rutas de la interfaz Pug y rutas API agrupadas
  views/         → templates Pug
  utils/         → helpers de validación y manejo de errores
  db/mongo.js    → conexión y helpers para MongoDB
scripts/
  seed-from-json.js → importador desde db.json
docs/
  mongodb.md     → guía rápida de configuración
```

## Testing / validación

Actualmente no hay tests automatizados. Se recomienda verificar manualmente:

- `/customers` (alta/listado/edición/baja).
- `/products` y `/stock` (ajustes y transferencias deben afectar el inventario).
- Flujo pedido → envío → factura (`/orders`, `/shipments`, `/invoices`).

## Migración de JSON a MongoDB

La implementación original guardaba la información en `db.json` mediante un módulo in-memory. La migración consistió en:

- Reemplazar el módulo `src/db/memory.js` por `src/db/mongo.js`.
- Actualizar modelos para usar colecciones Mongo, operaciones asíncronas y un contador global de IDs.
- Adaptar servicios/controladores para trabajar con las nuevas funciones asíncronas.
- Ajustar las vistas Pug para leer desde Mongo en cada render.
- Añadir `dotenv` para cargar configuración desde `.env`.

Esto permite escalar la persistencia sin sacrificar la lógica de negocio existente, preservando la posibilidad de importar/exportar datos del viejo archivo JSON.

## Endpoints principales (resumen)

- `GET /customers` – lista clientes activos.
- `POST /customers` – crea nuevo cliente.
- `PATCH /customers/:id` – actualiza datos básicos.
- `DELETE /customers/:id` – baja lógica (bloquea y marca `deletedAt`).
- `GET /products` / `POST /products` / `PATCH /products/:id` / `DELETE /products/:id`.
- `POST /stock/adjust` – ajusta inventario (JSON API); equivalente en vistas.
- `POST /stock/move` – transfiere stock entre depósitos.
- `POST /orders` – crea pedido, descuenta stock, valida disponibilidad.
- `PATCH /orders/:id` – modifica items (solo cuando está `allocated`).
- `DELETE /orders/:id` – cancela pedido (devuelve stock).
- `POST /shipments` – crea envío a partir de un pedido `allocated`.
- `POST /shipments/:id/status` – actualiza estado con tracking.
- `POST /shipments/:id/cancel` – revierte envío y regresa pedido a `allocated`.
- `POST /invoices` – genera factura para pedidos entregados.
- `POST /invoices/:id/status` – cambia estado (`issued`, `paid`, `void`).

## Producción / despliegue

- Configurar variables de entorno en el host (MONGODB_URI, MONGODB_DB, PORT).
- Ejecutar `npm install` y `npm run seed` si se requiere importar datos base.
- Iniciar con `npm start` o usar un process manager (PM2, systemd, etc.).
