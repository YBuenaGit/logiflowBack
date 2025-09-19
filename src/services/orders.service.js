const { db } = require("../db/memory");
const Orders = require("../models/orders.model");
const Stock = require("../models/stock.model");
const {
  validateCreateOrder,
  validateUpdateOrder,
} = require("../utils/validate");

class OrdersServiceError extends Error {
  constructor(status, code, message, details = null) {
    super(message || code);
    this.name = "OrdersServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseId(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

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

function normalizeItems(rawItems) {
  const list = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === "object"
    ? Object.values(rawItems)
    : [];
  return list.map((it) => ({
    productId: parseId(it?.productId),
    qty: parseId(it?.qty),
  }));
}

function ensureValidItems(items) {
  return items.every((it) => Number.isInteger(it.productId) && it.productId > 0 && Number.isInteger(it.qty) && it.qty > 0);
}

function assertOrderIsAllocated(order, message = "order no modificable") {
  if (!order) {
    throw new OrdersServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  if (order.status !== "allocated") {
    throw new OrdersServiceError(409, "ORDER_NOT_MODIFIABLE", message);
  }
}

function createOrder(payload = {}) {
  const errors = validateCreateOrder(payload);
  if (errors.length) {
    throw new OrdersServiceError(400, "VALIDATION_ERROR", "VALIDATION_ERROR", errors);
  }

  const customerId = parseId(payload.customerId);
  const warehouseId = parseId(payload.warehouseId);
  const items = normalizeItems(payload.items);
  if (!ensureValidItems(items)) {
    throw new OrdersServiceError(400, "VALIDATION_ERROR", "VALIDATION_ERROR", ["items invalidos"]);
  }

  const customer = findCustomerByIdActive(customerId);
  if (!customer) {
    throw new OrdersServiceError(404, "CUSTOMER_NOT_FOUND", "Customer no encontrado o inactivo");
  }
  const warehouse = findWarehouseByIdActive(warehouseId);
  if (!warehouse) {
    throw new OrdersServiceError(404, "WAREHOUSE_NOT_FOUND", "Warehouse no encontrado");
  }

  for (const it of items) {
    const product = findProductByIdActive(it.productId);
    if (!product) {
      throw new OrdersServiceError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado o inactivo");
    }
    const rec = Stock.getOrCreate(warehouseId, it.productId);
    if (rec.qty < it.qty) {
      throw new OrdersServiceError(409, "STOCK_INSUFFICIENT", "stock insuficiente");
    }
  }

  for (const it of items) {
    try {
      Stock.adjust(warehouseId, it.productId, -it.qty);
    } catch (err) {
      throw new OrdersServiceError(500, "INTERNAL_ERROR", "INTERNAL_ERROR");
    }
  }

  const totalCents = calcTotalCents(items);
  const order = Orders.create({ customerId, warehouseId, items, totalCents });
  return order;
}

function updateOrder(idValue, payload = {}) {
  const id = parseId(idValue);
  if (!Number.isFinite(id)) {
    throw new OrdersServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  const order = findOrderById(id);
  assertOrderIsAllocated(order);

  const errors = validateUpdateOrder(payload, order);
  if (errors.length) {
    throw new OrdersServiceError(400, "VALIDATION_ERROR", "VALIDATION_ERROR", errors);
  }

  const warehouseId = order.warehouseId;
  const currentMap = new Map(order.items.map((it) => [it.productId, it.qty]));
  const items = normalizeItems(payload.items);
  if (!ensureValidItems(items)) {
    throw new OrdersServiceError(400, "VALIDATION_ERROR", "VALIDATION_ERROR", ["items invalidos"]);
  }
  const newMap = new Map(items.map((it) => [it.productId, it.qty]));

  const productIds = new Set([...currentMap.keys(), ...newMap.keys()]);
  for (const pid of productIds) {
    const product = findProductByIdActive(pid);
    if (!product) {
      throw new OrdersServiceError(404, "PRODUCT_NOT_FOUND", "Producto no encontrado o inactivo");
    }
    const prev = currentMap.get(pid) || 0;
    const next = newMap.get(pid) || 0;
    const delta = next - prev;
    if (delta > 0) {
      const rec = Stock.getOrCreate(warehouseId, pid);
      if (rec.qty < delta) {
        throw new OrdersServiceError(409, "STOCK_INSUFFICIENT", "stock insuficiente");
      }
    }
  }

  for (const pid of productIds) {
    const prev = currentMap.get(pid) || 0;
    const next = newMap.get(pid) || 0;
    const delta = next - prev;
    if (delta !== 0) {
      try {
        Stock.adjust(warehouseId, pid, -delta);
      } catch (err) {
        throw new OrdersServiceError(500, "INTERNAL_ERROR", "INTERNAL_ERROR");
      }
    }
  }

  const totalCents = calcTotalCents(items);
  const updated = Orders.updateItemsAndTotal(order, items, totalCents);
  return updated;
}

function cancelOrder(idValue) {
  const id = parseId(idValue);
  if (!Number.isFinite(id)) {
    throw new OrdersServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  const order = findOrderById(id);
  assertOrderIsAllocated(order, "order no cancelable");

  for (const it of order.items) {
    try {
      Stock.adjust(order.warehouseId, it.productId, it.qty);
    } catch (err) {
      throw new OrdersServiceError(500, "INTERNAL_ERROR", "INTERNAL_ERROR");
    }
  }
  Orders.setStatus(order, "cancelled");
  return { id: order.id, status: order.status };
}

module.exports = {
  createOrder,
  updateOrder,
  cancelOrder,
  OrdersServiceError,
};
