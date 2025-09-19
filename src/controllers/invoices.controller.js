const { httpError } = require("../utils/error");
const { db } = require("../db/memory");
const Invoices = require("../models/invoices.model");
const {
  createInvoice,
  updateInvoiceStatus,
  InvoicesServiceError,
} = require("../services/invoices.service");

async function create(req, res) {
  try {
    const invoice = createInvoice(req.body || {});
    return res.status(201).json(invoice);
  } catch (err) {
    if (err instanceof InvoicesServiceError) {
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
    const customerId = req.query.customerId ? parseInt(req.query.customerId, 10) : null;
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];

    let items = db.invoices.slice();
    if (status) items = items.filter((i) => i.status === status);
    if (Number.isFinite(customerId)) items = items.filter((i) => i.customerId === customerId);

    const total = items.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const pageItems = items.slice(start, end).map((i) => {
      const result = { ...i };
      if (includeList.includes("order")) {
        const order = db.orders.find((o) => o.id === i.orderId);
        if (order) result.order = order;
      }
      if (includeList.includes("customer")) {
        const customer = db.customers.find((c) => c.id === i.customerId);
        if (customer) result.customer = customer;
      }
      return result;
    });

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
    if (!Number.isFinite(id)) return httpError(res, 404, "Invoice no encontrado");
    const invoice = Invoices.findById(id);
    if (!invoice) return httpError(res, 404, "Invoice no encontrado");
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    const result = { ...invoice };
    if (includeList.includes("order")) {
      const order = db.orders.find((o) => o.id === invoice.orderId);
      if (order) result.order = order;
    }
    if (includeList.includes("customer")) {
      const customer = db.customers.find((c) => c.id === invoice.customerId);
      if (customer) result.customer = customer;
    }
    return res.status(200).json(result);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patch(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Invoice no encontrado");
    const invoice = updateInvoiceStatus(id, req.body || {});
    return res.status(200).json(invoice);
  } catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === "VALIDATION_ERROR") {
        return httpError(res, err.status, err.code, { details: err.details || [] });
      }
      return httpError(res, err.status, err.message || err.code);
    }
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch };
