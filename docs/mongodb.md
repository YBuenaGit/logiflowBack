# Conexión con MongoDB

La aplicación ahora persiste toda la información en MongoDB. Para ejecutarla es necesario definir las siguientes variables de entorno:

- `MONGODB_URI`: cadena de conexión de tu cluster (por ejemplo `mongodb+srv://…`).
- `MONGODB_DB`: nombre de la base de datos. Si no se especifica se usa `logiflow`.
- `PORT` (opcional): puerto HTTP, por defecto `3000`.

## Puesta en marcha

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Exportar las variables de entorno (`MONGODB_URI`/`MONGODB_DB`).
3. Iniciar el servidor:
   ```bash
   npm start
   ```

## Importar datos desde `db.json`

Se agregó el script `scripts/seed-from-json.js` para copiar el contenido histórico del archivo `db.json` a MongoDB.

```bash
MONGODB_URI="<cadena>" MONGODB_DB="logiflow" node scripts/seed-from-json.js
```

El script reemplaza el contenido de las colecciones `customers`, `products`, `warehouses`, `stock`, `orders`, `shipments`, `invoices` y actualiza la colección `counters` para conservar la numeración incremental.
