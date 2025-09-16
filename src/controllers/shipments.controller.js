const { httpError } = require("../utils/error");
const { validateCreateShipment, validateShipmentStatusTransition } = require("../utils/validate");
const Shipments = require("../models/shipments.model");
const Orders = require("../models/orders.model");
const { db } = require("../db/memory");

function findOrderById(id) {
  return db.orders.find((o) => o.id === id);
}

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
    const errors = validateCreateShipment(req.body || {});
    if (errors.length) return httpError(res, 400, "VALIDATION_ERROR", { details: errors });
    const orderId = parseInt(req.body.orderId, 10);
    const order = findOrderById(orderId);
    if (!order) return httpError(res, 404, "Order no encontrado");
    if (order.status !== "allocated") return httpError(res, 409, "Order no estÃ¡ en estado 'allocated'");

    const destination = { address: String(req.body.destination.address) };
    if (req.body.destination.lat !== undefined) destination.lat = Number(req.body.destination.lat);
    if (req.body.destination.lng !== undefined) destination.lng = Number(req.body.destination.lng);

    const shipment = Shipments.create({ orderId, originWarehouseId: order.warehouseId, destination });
    Orders.setStatus(order, "shipped");
    return res.status(201).json(shipment);
  } catch (err) {
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
    const shipment = Shipments.findById(id);
    if (!shipment) return httpError(res, 404, "Shipment no encontrado");
    const nextStatus = (req.body?.status || "").toString();
    if (!nextStatus) return httpError(res, 400, "status requerido");
    if (!validateShipmentStatusTransition(shipment.status, nextStatus)) {
      return httpError(res, 400, "TRANSITION_NOT_ALLOWED");
    }
    Shipments.setStatusAndTrack(shipment, nextStatus, req.body?.note);
    if (nextStatus === "delivered") {
      const order = findOrderById(shipment.orderId);
      if (order) Orders.setStatus(order, "delivered");
    }
    return res.status(200).json(shipment);
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return httpError(res, 404, "Shipment no encontrado");
    const shipment = Shipments.findById(id);
    if (!shipment) return httpError(res, 404, "Shipment no encontrado");
    if (shipment.status === "delivered") return httpError(res, 409, "Shipment ya entregado");
    Shipments.cancel(shipment);
    const order = findOrderById(shipment.orderId);
    if (order && order.status === "shipped") {
      Orders.setStatus(order, "allocated");
    }
    return res.status(200).json({ id: shipment.id, status: shipment.status });
  } catch (err) {
    return httpError(res, 500, "INTERNAL_ERROR");
  }
}

module.exports = { create, list, getById, patchStatus, remove };
