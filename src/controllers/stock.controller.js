const { httpError } = require("../utils/error");
const { isPositiveInteger } = require("../utils/validate");
const Stock = require("../models/stock.model");
const Warehouses = require("../models/warehouses.model");
const Products = require("../models/products.model");

async function findWarehouseByIdActive(id) {
  const warehouse = await Warehouses.findById(id);
  if (warehouse && warehouse.deletedAt === null) {
    return warehouse;
  }
  return null;
}

async function findProductByIdActive(id) {
  const product = await Products.findById(id);
  if (product && product.deletedAt === null) {
    return product;
  }
  return null;
}

async function adjust(req, res) {
  try {
    const { warehouseId, productId, delta } = req.body || {};
    const wId = parseInt(warehouseId, 10);
    const pId = parseInt(productId, 10);
    const d = Number(delta);
    const errors = [];
    if (!Number.isFinite(wId)) errors.push("warehouseId invÃ¡lido");
    if (!Number.isFinite(pId)) errors.push("productId invÃ¡lido");
    if (!Number.isFinite(d)) errors.push("delta invÃ¡lido");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });

    const warehouse = await findWarehouseByIdActive(wId);
    if (!warehouse) return httpError(res, 404, "Warehouse no encontrado");
    const product = await findProductByIdActive(pId);
    if (!product) return httpError(res, 404, "Producto no encontrado");

    try {
      const rec = await Stock.adjust(wId, pId, d);
      return res.status(200).json(rec);
    } catch (e) {
      if (e && e.message === "stock insuficiente") {
        return httpError(res, 409, "stock insuficiente");
      }
      return httpError(res, 500, "INTERNAL_ERROR");
    }
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function move(req, res) {
  try {
    const { fromWarehouseId, toWarehouseId, productId, qty } = req.body || {};
    const fromId = parseInt(fromWarehouseId, 10);
    const toId = parseInt(toWarehouseId, 10);
    const pId = parseInt(productId, 10);
    const q = Number(qty);
    const errors = [];
    if (!Number.isFinite(fromId)) errors.push("fromWarehouseId invÃ¡lido");
    if (!Number.isFinite(toId)) errors.push("toWarehouseId invÃ¡lido");
    if (!Number.isFinite(pId)) errors.push("productId invÃ¡lido");
    if (!isPositiveInteger(q)) errors.push("qty debe ser > 0");
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });

    const fromW = await findWarehouseByIdActive(fromId);
    if (!fromW) return httpError(res, 404, "Warehouse origen no encontrado");
    const toW = await findWarehouseByIdActive(toId);
    if (!toW) return httpError(res, 404, "Warehouse destino no encontrado");
    const product = await findProductByIdActive(pId);
    if (!product) return httpError(res, 404, "Producto no encontrado");

    try {
      const payload = await Stock.move(fromId, toId, pId, q);
      return res.status(200).json(payload);
    } catch (e) {
      if (e && e.message === "stock insuficiente") {
        return httpError(res, 409, "stock insuficiente");
      }
      return httpError(res, 500, "INTERNAL_ERROR");
    }
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function list(req, res) {
  try {
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId, 10) : null;
    const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
    const items = await Stock.list({ warehouseId, productId });
    return res.status(200).json(items);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { adjust, move, list };
