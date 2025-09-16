const { httpError } = require("../utils/error");
const { isNonEmptyString, validateCustomerPayload } = require("../utils/validate");
const Customers = require("../models/customers.model");
const { db } = require("../db/memory");

async function create(req, res) {
  try {
    const errors = validateCustomerPayload(req.body || {});
    if (errors.length) {
      return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    }
    const { name, email } = req.body;
    if (Customers.isEmailTaken(email)) {
      return httpError(res, 409, "email ya existe");
    }
    const customer = Customers.create({ name, email });
    return res.status(201).json(customer);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit || "20", 10) || 20, 1);
    const q = (req.query.q || "").toString().trim().toLowerCase();

    let items = db.customers.filter((c) => c.deletedAt === null);
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q));

    const total = items.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const pageItems = items.slice(start, end);

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
    if (!Number.isFinite(id)) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const customer = Customers.findById(id);
    if (!customer || customer.deletedAt !== null) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    const result = { ...customer };
    if (includeList.includes("orders")) {
      result.orders = db.orders.filter((o) => o.customerId === id);
    }
    return res.status(200).json(result);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patch(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const customer = Customers.findById(id);
    if (!customer || customer.deletedAt !== null) {
      return httpError(res, 404, "Customer no encontrado");
    }

    const { name, email, status } = req.body || {};
    const errors = [];
    if (name !== undefined && !isNonEmptyString(name)) errors.push("name requerido");
    if (email !== undefined && !isNonEmptyString(email)) errors.push("email requerido");
    if (status !== undefined && !["active", "blocked"].includes(status)) errors.push("status invÃ¡lido");
    if (errors.length) {
      return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    }

    if (email !== undefined && email !== customer.email) {
      if (Customers.isEmailTaken(email, id)) {
        return httpError(res, 409, "email ya existe");
      }
    }

    const updated = Customers.update(id, { name, email, status });
    return res.status(200).json(updated);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const customer = Customers.findById(id);
    if (!customer || customer.deletedAt !== null) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const hasActiveOrders = db.orders.some(
      (o) => o.customerId === id && o.status !== "cancelled" && o.status !== "delivered"
    );
    if (hasActiveOrders) {
      return httpError(res, 409, "Cliente con pedidos activos");
    }
    const payload = Customers.softDelete(id);
    return res.status(200).json(payload);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };
