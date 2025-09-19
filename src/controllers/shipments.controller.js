const { httpError } = require("../utils/error");
const { db } = require("../db/memory");
const Shipments = require("../models/shipments.model");
const {
  createShipment,
  updateShipmentStatus,
  cancelShipment,
  ShipmentsServiceError,
} = require("../services/shipments.service");

function embedShipment(shipment, includeList) {
  const result = { ...shipment, tracking: shipment.tracking ? shipment.tracking.slice() : [] };
  if (includeList.includes("order")) {
    const order = db.orders.find((o) => o.id === shipment.orderId);
    if (order) result.order = order;
  }
  if (includeList.includes("customer")) {
    const order = db.orders.find((o) => o.id === shipment.orderId);
    if (order) {
      const customer = db.customers.find((c) => c.id === order.customerId);
      if (customer) result.customer = customer;
    }
  }
  return result;
}

async function create(req, res) {
  try {
    const shipment = createShipment(req.body || {});
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

    let items = db.shipments.slice();
    if (status) items = items.filter((s) => s.status === status);

    const total = items.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const pageItems = items.slice(start, end).map((s) => embedShipment(s, includeList));

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
    if (!Number.isFinite(id)) return httpError(res, 404, "Shipment no encontrado");
    const shipment = Shipments.findById(id);
    if (!shipment) return httpError(res, 404, "Shipment no encontrado");
    const include = (req.query.include || "").toString();
    const includeList = include ? include.split(",").map((s) => s.trim()) : [];
    return res.status(200).json(embedShipment(shipment, includeList));
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function patchStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Shipment no encontrado");
    const shipment = updateShipmentStatus(id, req.body || {});
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
    const payload = cancelShipment(id);
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
      return httpError(res, err.status, err.message || err.code);
    }
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patchStatus, remove };
