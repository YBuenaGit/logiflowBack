const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(process.cwd(), "db.json");

function ensureDbFile() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      customers: [],
      products: [],
      warehouses: [],
      stock: [],
      orders: [],
      shipments: [],
      invoices: [],
      counters: {
        customers: 1, products: 1, warehouses: 1, stock: 1,
        orders: 1, shipments: 1, invoices: 1
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = readDb();

function nextId(table) {
  const id = db.counters[table]++;
  writeDb(db); 
  return id;
}

function commit() {
  writeDb(db);
}

function reload() {
  db = readDb();
}

module.exports = { db, nextId, commit, reload };
