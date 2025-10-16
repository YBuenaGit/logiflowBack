const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const { MongoClient } = require("mongodb");

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB || "logiflow";
  const jsonPath = path.join(process.cwd(), "db.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`No se encontró el archivo ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const collections = [
    "customers",
    "products",
    "warehouses",
    "stock",
    "orders",
    "shipments",
    "invoices",
  ];

  for (const name of collections) {
    const list = Array.isArray(data[name]) ? data[name] : [];
    const col = db.collection(name);
    await col.deleteMany({});
    if (list.length) {
      await col.insertMany(list);
    }
    console.log(`Colección ${name} actualizada (${list.length} documentos).`);
  }

  const counters = data.counters || {};
  const countersDocs = Object.entries(counters).map(([key, value]) => ({
    _id: key,
    seq: Number(value) || 0,
  }));
  const countersCol = db.collection("counters");
  await countersCol.deleteMany({});
  if (countersDocs.length) {
    await countersCol.insertMany(countersDocs);
  }
  console.log("Colección counters actualizada.");

  await client.close();
  console.log("Importación completada.");
}

main().catch((err) => {
  console.error("Error importando datos desde db.json", err);
  process.exit(1);
});
