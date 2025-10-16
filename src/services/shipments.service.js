const Orders = require("../models/orders.model");
const Shipments = require("../models/shipments.model");
const {
  validateCreateShipment,
  validateShipmentStatusTransition,
} = require("../utils/validate");

class ShipmentsServiceError extends Error {
  constructor(status, code, message, details = null) {
    super(message || code);
    this.name = "ShipmentsServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseId(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

async function findOrderById(id) {
  return Orders.findById(id);
}

async function findShipmentById(id) {
  return Shipments.findById(id);
}

function ensureOrderAllocatable(order) {
  if (!order) {
    throw new ShipmentsServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  if (order.status !== "allocated") {
    throw new ShipmentsServiceError(409, "ORDER_INVALID_STATUS", "Order no esta en estado 'allocated'");
  }
}

async function createShipment(payload = {}) {
  const errors = validateCreateShipment(payload);
  if (errors.length) {
    throw new ShipmentsServiceError(400, "VALIDATION_ERROR", "VALIDATION_ERROR", errors);
  }

  const orderId = parseId(payload.orderId);
  if (!Number.isFinite(orderId)) {
    throw new ShipmentsServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  const order = await findOrderById(orderId);
  ensureOrderAllocatable(order);

  const destination = {
    address: String(payload.destination.address),
  };
  if (payload.destination.lat !== undefined) destination.lat = Number(payload.destination.lat);
  if (payload.destination.lng !== undefined) destination.lng = Number(payload.destination.lng);

  const shipment = await Shipments.create({
    orderId,
    originWarehouseId: order.warehouseId,
    destination,
  });
  await Orders.setStatus(order, "shipped");
  return shipment;
}

async function updateShipmentStatus(idValue, payload = {}) {
  const id = parseId(idValue);
  if (!Number.isFinite(id)) {
    throw new ShipmentsServiceError(404, "SHIPMENT_NOT_FOUND", "Shipment no encontrado");
  }
  const shipment = await findShipmentById(id);
  if (!shipment) {
    throw new ShipmentsServiceError(404, "SHIPMENT_NOT_FOUND", "Shipment no encontrado");
  }
  const nextStatus = (payload?.status || "").toString();
  if (!nextStatus) {
    throw new ShipmentsServiceError(400, "STATUS_REQUIRED", "status requerido");
  }
  if (!validateShipmentStatusTransition(shipment.status, nextStatus)) {
    throw new ShipmentsServiceError(400, "TRANSITION_NOT_ALLOWED", "TRANSITION_NOT_ALLOWED");
  }
  const updated = await Shipments.setStatusAndTrack(shipment, nextStatus, payload?.note);
  if (nextStatus === "delivered") {
    const order = await findOrderById(shipment.orderId);
    if (order) await Orders.setStatus(order, "delivered");
  }
  return updated;
}

async function cancelShipment(idValue) {
  const id = parseId(idValue);
  if (!Number.isFinite(id)) {
    throw new ShipmentsServiceError(404, "SHIPMENT_NOT_FOUND", "Shipment no encontrado");
  }
  const shipment = await findShipmentById(id);
  if (!shipment) {
    throw new ShipmentsServiceError(404, "SHIPMENT_NOT_FOUND", "Shipment no encontrado");
  }
  if (shipment.status === "delivered") {
    throw new ShipmentsServiceError(409, "SHIPMENT_DELIVERED", "Shipment ya entregado");
  }
  const cancelled = await Shipments.cancel(shipment);
  const order = await findOrderById(shipment.orderId);
  if (order && order.status === "shipped") {
    await Orders.setStatus(order, "allocated");
  }
  return { id: cancelled.id, status: cancelled.status };
}

module.exports = {
  createShipment,
  updateShipmentStatus,
  cancelShipment,
  ShipmentsServiceError,
};
