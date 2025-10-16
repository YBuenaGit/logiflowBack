require("dotenv").config();
const express = require("express");
const path = require("path");
const { connect } = require("./db/mongo");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// --- DB lazy init (una sola vez por proceso) ---
let dbInitPromise = null;
function ensureDb() {
  if (!dbInitPromise) {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB;
    dbInitPromise = connect({ uri, dbName });
  }
  return dbInitPromise;
}
// Conectamos antes de procesar cualquier request
app.use((req, res, next) => {
  ensureDb().then(() => next()).catch(next);
});

app.get("/", (req, res) => {
  return res.status(200).json({ ok: true, name: "logiflow-mvp" });
});

app.use("/views", require("./modules/views.routes"));

app.use("/customers", require("./modules/customers.routes"));
app.use("/products", require("./modules/products.routes"));
app.use("/warehouses", require("./modules/warehouses.routes"));
app.use("/stock", require("./modules/stock.routes"));
app.use("/orders", require("./modules/orders.routes"));
app.use("/shipments", require("./modules/shipments.routes"));
app.use("/invoices", require("./modules/invoices.routes"));

app.use((req, res, next) => {
  return res.status(404).json({ message: "Not Found" });
});


app.use((err, req, res, next) => {
  return res.status(500).json({ message: "INTERNAL_ERROR" });
});

module.exports = app;

if (require.main === module) {
  ensureDb().then(() => {
    const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
    app.listen(PORT, () => {
      console.log(`API on http://localhost:${PORT}`);
      console.log(`\n*********************************\n      LOGIFLOW  GRUPO 14\n*********************************\n`);
    });
  }).catch((err) => {
    console.error("Failed to initialize application", err);
    process.exit(1);
  });
}
