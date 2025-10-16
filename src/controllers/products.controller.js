const { httpError } = require("../utils/error");
const { isNonEmptyString, isPositiveInteger, isBoolean } = require("../utils/validate");
const Products = require("../models/products.model");
const Stock = require("../models/stock.model");

async function create(req, res) {
  try {
    const { sku, name, priceCents } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(sku)) errors.push("sku requerido");
    if (!isNonEmptyString(name)) errors.push("name requerido");
    if (!isPositiveInteger(priceCents)) errors.push("priceCents debe ser > 0");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });

    if (await Products.isSkuTaken(sku)) return httpError(res, 409, "sku ya existe");

    const product = await Products.create({ sku, name, priceCents: Number(priceCents) });
    return res.status(201).json(product);
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
    const { items, total } = await Products.listActive({ q, skip, limit });
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
    if (!Number.isFinite(id)) return httpError(res, 404, "Producto no encontrado");
    const product = await Products.findById(id);
    if (!product || product.deletedAt !== null) return httpError(res, 404, "Producto no encontrado");
    return res.status(200).json(product);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patch(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Producto no encontrado");
    const product = await Products.findById(id);
    if (!product || product.deletedAt !== null) return httpError(res, 404, "Producto no encontrado");

    const { name, priceCents, active } = req.body || {};
    const errors = [];
    if (name !== undefined && !isNonEmptyString(name)) errors.push("name requerido");
    if (priceCents !== undefined && !isPositiveInteger(priceCents)) errors.push("priceCents debe ser > 0");
    if (active !== undefined && !isBoolean(active)) errors.push("active debe ser booleano");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });

    const updated = await Products.update(id, {
      name,
      priceCents: priceCents !== undefined ? Number(priceCents) : undefined,
      active,
    });
    return res.status(200).json(updated);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Producto no encontrado");
    const product = await Products.findById(id);
    if (!product || product.deletedAt !== null) return httpError(res, 404, "Producto no encontrado");

    const stockRecords = await Stock.list({ productId: id });
    const hasStock = stockRecords.some((s) => s.qty > 0);
    if (hasStock) return httpError(res, 409, "Producto con stock disponible");

    const payload = await Products.softDelete(id);
    return res.status(200).json(payload);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patch, remove };
