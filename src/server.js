const express = require("express");
const path = require("path");

const app = express();

app.use(express.json());

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
  console.log(`\n*********************************\n      LOGIFLOW  GRUPO 14\n*********************************\n`);
});
