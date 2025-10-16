const { MongoClient } = require("mongodb");

let client;
let database;

async function connect({ uri, dbName } = {}) {
  if (database) {
    return database;
  }

  const mongoUri = uri || process.env.MONGODB_URI || "mongodb://localhost:27017";
  const databaseName = dbName || process.env.MONGODB_DB || "logiflow";

  client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
  });

  await client.connect();
  database = client.db(databaseName);
  await ensureIndexes();
  return database;
}

function getDb() {
  if (!database) {
    throw new Error("MongoDB connection has not been initialized. Call connect() first.");
  }
  return database;
}

function getCollection(name) {
  return getDb().collection(name);
}

async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}

async function getNextSequence(sequenceName) {
  const counters = getCollection("counters");
  const result = await counters.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const doc = result && typeof result === "object" && result.value !== undefined ? result.value : result;
  if (!doc || typeof doc.seq !== "number") {
    throw new Error(`Failed to retrieve sequence for ${sequenceName}`);
  }
  return doc.seq;
}

async function ensureIndexes() {
  const db = getDb();

  await Promise.all([
    db.collection("customers").createIndex({ id: 1 }, { unique: true }),
    db.collection("customers").createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { deletedAt: null } }
    ),
    db.collection("products").createIndex({ id: 1 }, { unique: true }),
    db.collection("products").createIndex(
      { sku: 1 },
      { unique: true, partialFilterExpression: { deletedAt: null } }
    ),
    db.collection("warehouses").createIndex({ id: 1 }, { unique: true }),
    db.collection("stock").createIndex({ id: 1 }, { unique: true }),
    db.collection("stock").createIndex(
      { warehouseId: 1, productId: 1 },
      { unique: true }
    ),
    db.collection("orders").createIndex({ id: 1 }, { unique: true }),
    db.collection("orders").createIndex({ customerId: 1 }),
    db.collection("orders").createIndex({ warehouseId: 1 }),
    db.collection("shipments").createIndex({ id: 1 }, { unique: true }),
    db.collection("shipments").createIndex({ orderId: 1 }),
    db.collection("invoices").createIndex({ id: 1 }, { unique: true }),
    db.collection("invoices").createIndex({ orderId: 1 }, { unique: true }),
  ]);
}

module.exports = {
  connect,
  disconnect,
  getDb,
  getCollection,
  getNextSequence,
};
