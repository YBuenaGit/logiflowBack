const { httpError } = require("../utils/error");
const Shipments = require("../models/shipments.model");
const Orders = require("../models/orders.model");
const Customers = require("../models/customers.model");
const {
  createShipment,
  updateShipmentStatus,
  cancelShipment,
  ShipmentsServiceError,
} = require("../services/shipments.service");

async function embedShipment(shipment, includeList) {
  const result = { ...shipment, tracking: shipment.tracking ? shipment.tracking.slice() : [] };
  if (includeList.includes("order")) {
    const order = await Orders.findById(shipment.orderId);
    if (order) result.order = order;
  }
  if (includeList.includes("customer")) {
    const order = result.order || (await Orders.findById(shipment.orderId));
    if (order) {
      const customer = await Customers.findById(order.customerId);
      if (customer) result.customer = customer;
    }
  }
  return result;
}

async function create(req, res) {
  try {
    const shipment = await createShipment(req.body || {});
    return res.status(201).json(shipment);
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
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
    const skip = (page - 1) * limit;
    const filter = status ? { status } : {};
    const { items, total } = await Shipments.list({ filter, skip, limit, sort: { createdAt: -1 } });
    const embedded = await Promise.all(items.map((s) => embedShipment(s, includeList)));
    res.set("X-Total-Count", String(total));
    res.set("X-Page", String(page));
    res.set("X-Limit", String(limit));
    return res.status(200).json(embedded);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function getById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Shipment no encontrado");
    const shipment = await Shipments.findById(id);
    if (!shipment) return httpError(res, 404, "Shipment no encontrado");
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    const payload = await embedShipment(shipment, includeList);
    return res.status(200).json(payload);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patchStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Shipment no encontrado");
    const shipment = await updateShipmentStatus(id, req.body || {});
    return res.status(200).json(shipment);
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
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
    const payload = await cancelShipment(id);
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
      return httpError(res, err.status, err.message || err.code);
    }
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patchStatus, remove };
