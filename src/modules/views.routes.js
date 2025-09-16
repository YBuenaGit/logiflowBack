const express = require("express");
const { db } = require("../db/memory");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  next();
});

// Helpers de formato (reutilizables en este router)
function formatARS(cents) {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}

function formatLocal(iso, tz) {
  return new Date(iso).toLocaleString("es-AR", { timeZone: tz });
}

function getTz(req) {
  return req.query.tz || "America/Argentina/Tucuman";
}

// Helper de traducción de estados
function translateStatus(kind, code) {
  const maps = {
    order: {
      allocated: "reservado",
      shipped: "enviado",
      delivered: "entregado",
      cancelled: "cancelado",
    },
    shipment: {
      created: "creado",
      out_for_delivery: "en reparto",
      delivered: "entregado",
      failed: "fallido",
      cancelled: "cancelado",
    },
    invoice: {
      issued: "emitida",
      paid: "pagada",
      void: "anulada",
    },
  };
  const map = maps[kind] || {};
  return map[code] || code;
}

// Índice de vistas
router.get("/", (req, res) => {
  const counts = {
    customers: db.customers.filter((c) => c.deletedAt === null).length,
    products: db.products.filter((p) => p.deletedAt === null).length,
    warehouses: db.warehouses.filter((w) => w.deletedAt === null).length,
    stock: db.stock.length,
    orders: db.orders.length,
    shipments: db.shipments.length,
    invoices: db.invoices.length,
  };
  return res.render("index", { counts });
});

// Clientes
router.get("/customers", (req, res) => {
  const customers = db.customers.filter((c) => c.deletedAt === null);
  return res.render("customers/index", { customers });
});

// Pedidos
router.get("/orders", (req, res) => {
  const tz = getTz(req);
  const orders = db.orders.map((o) => {
    const customer = db.customers.find((c) => c.id === o.customerId) || null;
    return {
      id: o.id,
      customerName: customer ? customer.name : "",
      totalARS: formatARS(o.totalCents),
      status: o.status,
      statusLabel: translateStatus("order", o.status),
      createdAtLocal: formatLocal(o.createdAt, tz),
    };
  });
  return res.render("orders/index", { orders });
});

// Productos
router.get("/products", (req, res) => {
  const products = db.products
    .filter((p) => p.deletedAt === null)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      priceARS: formatARS(p.priceCents),
      active: !!p.active,
    }));
  return res.render("products/index", { products });
});

// Depósitos
router.get("/warehouses", (req, res) => {
  const warehouses = db.warehouses
    .filter((w) => w.deletedAt === null)
    .map((w) => ({
      id: w.id,
      name: w.name,
      city: w.city,
      itemsEnStock: db.stock.filter((s) => s.warehouseId === w.id).length,
    }));
  return res.render("warehouses/index", { warehouses });
});

// Envíos
router.get("/shipments", (req, res) => {
  const tz = getTz(req);
  const shipments = db.shipments.map((s) => ({
    id: s.id,
    orderId: s.orderId,
    status: s.status,
    statusLabel: translateStatus("shipment", s.status),
    originWarehouseId: s.origin?.warehouseId ?? null,
    destinationAddress: s.destination?.address ?? "",
    updatedAtLocal: formatLocal(s.updatedAt, tz),
    tracking: (s.tracking || []).map((t) => ({
      tsLocal: formatLocal(t.ts, tz),
      status: t.status,
      statusLabel: translateStatus("shipment", t.status),
    })),
  }));
  return res.render("shipments/index", { shipments });
});

// Facturas
router.get("/invoices", (req, res) => {
  const tz = getTz(req);
  const invoices = db.invoices.map((i) => {
    const customer = db.customers.find((c) => c.id === i.customerId) || null;
    return {
      id: i.id,
      orderId: i.orderId,
      customerName: customer ? customer.name : "",
      amountARS: formatARS(i.amountCents),
      status: i.status,
      statusLabel: translateStatus("invoice", i.status),
      createdAtLocal: formatLocal(i.createdAt, tz),
    };
  });
  return res.render("invoices/index", { invoices });
});

// Stock
router.get("/stock", (req, res) => {
  const join = db.stock.map((s) => {
    const w = db.warehouses.find((x) => x.id === s.warehouseId) || {};
    const p = db.products.find((x) => x.id === s.productId) || {};
    return {
      id: s.id,
      warehouseName: w && w.name ? w.name : `Depósito ${s.warehouseId}`,
      productSku: p && p.sku ? p.sku : String(s.productId),
      productName: p && p.name ? p.name : "",
      qty: s.qty,
    };
  });
  // Ordenar por depósito y luego por SKU (opcional)
  join.sort((a, b) => {
    const wa = (a.warehouseName || "").localeCompare(b.warehouseName || "");
    if (wa !== 0) return wa;
    return (a.productSku || "").localeCompare(b.productSku || "");
  });
  return res.render("stock/index", { stock: join });
});

module.exports = router;
