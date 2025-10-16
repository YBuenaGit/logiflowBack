const { httpError } = require("../utils/error");
const { isNonEmptyString, validateCustomerPayload } = require("../utils/validate");
const Customers = require("../models/customers.model");
const Orders = require("../models/orders.model");

async function create(req, res) {
  try {
    const errors = validateCustomerPayload(req.body || {});
    if (errors.length) {
      return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    }
    const { name, email } = req.body;
    if (await Customers.isEmailTaken(email)) {
      return httpError(res, 409, "email ya existe");
    }
    const customer = await Customers.create({ name, email });
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
    const skip = (page - 1) * limit;
    const { items, total } = await Customers.listActive({ q, skip, limit });
    res.set("X-Total-Count", String(total));
    res.set("X-Page", String(page));
    res.set("X-Limit", String(limit));
    return res.status(200).json(items);
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
    const customer = await Customers.findById(id);
    if (!customer || customer.deletedAt !== null) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    const result = { ...customer };
    if (includeList.includes("orders")) {
      result.orders = await Orders.findByCustomerId(id);
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
    const customer = await Customers.findById(id);
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
      if (await Customers.isEmailTaken(email, id)) {
        return httpError(res, 409, "email ya existe");
      }
    }

    const updated = await Customers.update(id, { name, email, status });
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
    const customer = await Customers.findById(id);
    if (!customer || customer.deletedAt !== null) {
      return httpError(res, 404, "Customer no encontrado");
    }
    const hasActiveOrders = await Orders.hasActiveOrders(id);
    if (hasActiveOrders) {
      return httpError(res, 409, "Cliente con pedidos activos");
    }
    const payload = await Customers.softDelete(id);
    return res.status(200).json(payload);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };
