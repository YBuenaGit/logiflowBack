const { httpError } = require("../utils/error");
const { isNonEmptyString } = require("../utils/validate");
const Warehouses = require("../models/warehouses.model");
const { db } = require("../db/memory");

async function create(req, res) {
  try {
    const { name, city } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(name)) errors.push("name requerido");
    if (!isNonEmptyString(city)) errors.push("city requerido");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    const warehouse = Warehouses.create({ name, city });
    return res.status(201).json(warehouse);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit || "20", 10) || 20, 1);
    const q = (req.query.q || "").toString().trim().toLowerCase();

    let items = db.warehouses.filter((w) => w.deletedAt === null);
    if (q) items = items.filter((w) => w.name.toLowerCase().includes(q) || w.city.toLowerCase().includes(q));

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
    if (!Number.isFinite(id)) return httpError(res, 404, "Warehouse no encontrado");
    const warehouse = Warehouses.findById(id);
    if (!warehouse || warehouse.deletedAt !== null) return httpError(res, 404, "Warehouse no encontrado");
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    const result = { ...warehouse };
    if (includeList.includes("stock")) {
      result.stock = db.stock.filter((s) => s.warehouseId === id);
    }
    return res.status(200).json(result);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patch(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Warehouse no encontrado");
    const warehouse = Warehouses.findById(id);
    if (!warehouse || warehouse.deletedAt !== null) return httpError(res, 404, "Warehouse no encontrado");
    const { name, city } = req.body || {};
    const errors = [];
    if (name !== undefined && !isNonEmptyString(name)) errors.push("name requerido");
    if (city !== undefined && !isNonEmptyString(city)) errors.push("city requerido");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    const updated = Warehouses.update(id, { name, city });
    return res.status(200).json(updated);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Warehouse no encontrado");
    const warehouse = Warehouses.findById(id);
    if (!warehouse || warehouse.deletedAt !== null) return httpError(res, 404, "Warehouse no encontrado");
    const hasStock = db.stock.some((s) => s.warehouseId === id && s.qty > 0);
    if (hasStock) return httpError(res, 409, "Warehouse con stock");
    const payload = Warehouses.softDelete(id);
    return res.status(200).json(payload);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };

