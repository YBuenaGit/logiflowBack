const { httpError } = require("../utils/error");
const Orders = require("../models/orders.model");
const { db } = require("../db/memory");
const {
  createOrder,
  updateOrder,
  cancelOrder,
  OrdersServiceError,
} = require("../services/orders.service");

function findOrderById(id) {
  return Orders.findById(id);
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
    const order = createOrder(req.body || {});
    return res.status(201).json(order);
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      if (err.code === "VALIDATION_ERROR") {
        return httpError(res, err.status, err.code, { details: err.details || [] });
      }
      return httpError(res, err.status, err.message || err.code);
    }
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
    const updated = updateOrder(id, req.body || {});
    return res.status(200).json(updated);
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      if (err.code === "VALIDATION_ERROR") {
        return httpError(res, err.status, err.code, { details: err.details || [] });
      }
      return httpError(res, err.status, err.message || err.code);
    }
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const payload = cancelOrder(id);
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      return httpError(res, err.status, err.message || err.code);
    }
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };
