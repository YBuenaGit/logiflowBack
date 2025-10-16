const { httpError } = require("../utils/error");
const { isNonEmptyString } = require("../utils/validate");
const Warehouses = require("../models/warehouses.model");
const Stock = require("../models/stock.model");

async function create(req, res) {
  try {
    const { name, city } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(name)) errors.push("name requerido");
    if (!isNonEmptyString(city)) errors.push("city requerido");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    const warehouse = await Warehouses.create({ name, city });
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
    const skip = (page - 1) * limit;
    const { items, total } = await Warehouses.listActive({ q, skip, limit });
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
    if (!Number.isFinite(id)) return httpError(res, 404, "Warehouse no encontrado");
    const warehouse = await Warehouses.findById(id);
    if (!warehouse || warehouse.deletedAt !== null) return httpError(res, 404, "Warehouse no encontrado");
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    const result = { ...warehouse };
    if (includeList.includes("stock")) {
      result.stock = await Stock.list({ warehouseId: id });
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
    const warehouse = await Warehouses.findById(id);
    if (!warehouse || warehouse.deletedAt !== null) return httpError(res, 404, "Warehouse no encontrado");
    const { name, city } = req.body || {};
    const errors = [];
    if (name !== undefined && !isNonEmptyString(name)) errors.push("name requerido");
    if (city !== undefined && !isNonEmptyString(city)) errors.push("city requerido");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    const updated = await Warehouses.update(id, { name, city });
    return res.status(200).json(updated);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Warehouse no encontrado");
    const warehouse = await Warehouses.findById(id);
    if (!warehouse || warehouse.deletedAt !== null) return httpError(res, 404, "Warehouse no encontrado");
    const stockRecords = await Stock.list({ warehouseId: id });
    const hasStock = stockRecords.some((s) => s.qty > 0);
    if (hasStock) return httpError(res, 409, "Warehouse con stock");
    const payload = await Warehouses.softDelete(id);
    return res.status(200).json(payload);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };
