const { httpError } = require("../utils/error");
const {
  validateCreateOrder,
  validateUpdateOrder,
} = require("../utils/validate");
const Orders = require("../models/orders.model");
const Stock = require("../models/stock.model");
const { db } = require("../db/memory");

function findCustomerByIdActive(id) {
  return db.customers.find((c) => c.id === id && c.deletedAt === null && c.status === "active");
}

function findWarehouseByIdActive(id) {
  return db.warehouses.find((w) => w.id === id && w.deletedAt === null);
}

function findProductByIdActive(id) {
  return db.products.find((p) => p.id === id && p.deletedAt === null && p.active === true);
}

function findOrderById(id) {
  return Orders.findById(id);
}

function calcTotalCents(items) {
  let total = 0;
  for (const it of items) {
    const product = db.products.find((p) => p.id === it.productId);
    if (product) total += Number(it.qty) * Number(product.priceCents);
  }
  return total;
}

function embedOrder(order, includeList) {
  const result = { ...order, items: order.items.map((it) => ({ ...it })) };
  if (includeList.includes("customer")) {
    const customer = db.customers.find((c) => c.id === order.customerId);
    if (customer) result.customer = customer;
  }
  if (includeList.includes("items.product")) {
    result.items = result.items.map((it) => {
      const product = db.products.find((p) => p.id === it.productId);
      return { ...it, product: product || null };
    });
  }
  return result;
}

async function create(req, res) {
  try {
    const errors = validateCreateOrder(req.body || {});
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });

    const customerId = parseInt(req.body.customerId, 10);
    const warehouseId = parseInt(req.body.warehouseId, 10);
    const items = (req.body.items || []).map((it) => ({ productId: parseInt(it.productId, 10), qty: parseInt(it.qty, 10) }));

    const customer = findCustomerByIdActive(customerId);
    if (!customer) return httpError(res, 404, "Customer no encontrado o inactivo");
    const warehouse = findWarehouseByIdActive(warehouseId);
    if (!warehouse) return httpError(res, 404, "Warehouse no encontrado");

    // Validate products and stock sufficiency
    for (const it of items) {
      const product = findProductByIdActive(it.productId);
      if (!product) return httpError(res, 404, "Producto no encontrado o inactivo");
      const rec = Stock.getOrCreate(warehouseId, it.productId); // may create + commit
      if (rec.qty < it.qty) return httpError(res, 409, "stock insuficiente");
    }

    // Reserve stock
    for (const it of items) {
      try {
        Stock.adjust(warehouseId, it.productId, -it.qty);
      } catch (e) {
        return httpError(res, 500, "INTERNAL_ERROR");
      }
    }

    const totalCents = calcTotalCents(items);
    const order = Orders.create({ customerId, warehouseId, items, totalCents });
    return res.status(201).json(order);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit || "20", 10) || 20, 1);
    const status = (req.query.status || "").toString().trim();
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];

    let items = db.orders.slice();
    if (status) items = items.filter((o) => o.status === status);

    const total = items.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const pageItems = items.slice(start, end).map((o) => embedOrder(o, includeList));

    res.set("X-Total-Count", String(total));
    res.set("X-Page", String(page));
    res.set("X-Limit", String(limit));
    return res.status(200).json(pageItems);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function getById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Order no encontrado");
    const order = findOrderById(id);
    if (!order) return httpError(res, 404, "Order no encontrado");
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    return res.status(200).json(embedOrder(order, includeList));
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patch(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Order no encontrado");
    const order = findOrderById(id);
    if (!order) return httpError(res, 404, "Order no encontrado");
    if (order.status !== "allocated") return httpError(res, 409, "order no modificable");

    const errors = validateUpdateOrder(req.body || {}, order);
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });

    const warehouseId = order.warehouseId;
    const currentMap = new Map(order.items.map((it) => [it.productId, it.qty]));
    const newItems = (req.body.items || []).map((it) => ({ productId: parseInt(it.productId, 10), qty: parseInt(it.qty, 10) }));
    const newMap = new Map(newItems.map((it) => [it.productId, it.qty]));

    const productIds = new Set([...currentMap.keys(), ...newMap.keys()]);

    // validate products and stock for positive deltas
    for (const pid of productIds) {
      const product = findProductByIdActive(pid);
      if (!product) return httpError(res, 404, "Producto no encontrado o inactivo");
      const prev = currentMap.get(pid) || 0;
      const next = newMap.get(pid) || 0;
      const delta = next - prev;
      if (delta > 0) {
        const rec = Stock.getOrCreate(warehouseId, pid);
        if (rec.qty < delta) return httpError(res, 409, "stock insuficiente");
      }
    }

    // apply deltas via stock model
    for (const pid of productIds) {
      const prev = currentMap.get(pid) || 0;
      const next = newMap.get(pid) || 0;
      const delta = next - prev;
      if (delta !== 0) {
        try {
          Stock.adjust(warehouseId, pid, -delta);
        } catch (e) {
          return httpError(res, 500, "INTERNAL_ERROR");
        }
      }
    }

    const totalCents = calcTotalCents(newItems);
    const updated = Orders.updateItemsAndTotal(order, newItems, totalCents);
    return res.status(200).json(updated);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Order no encontrado");
    const order = findOrderById(id);
    if (!order) return httpError(res, 404, "Order no encontrado");
    if (order.status !== "allocated") return httpError(res, 409, "order no cancelable");

    for (const it of order.items) {
      try {
        Stock.adjust(order.warehouseId, it.productId, it.qty);
      } catch (e) {
        return httpError(res, 500, "INTERNAL_ERROR");
      }
    }
    Orders.setStatus(order, "cancelled");
    return res.status(200).json({ id: order.id, status: order.status });
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };

