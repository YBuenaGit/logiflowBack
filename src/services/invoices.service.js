const { db } = require("../db/memory");
const Invoices = require("../models/invoices.model");
const {
  validateCreateInvoice,
  validateInvoiceStatusTransition,
} = require("../utils/validate");

class InvoicesServiceError extends Error {
  constructor(status, code, message, details = null) {
    super(message || code);
    this.name = "InvoicesServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parseId(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function findOrderById(id) {
  return db.orders.find((o) => o.id === id);
}

function findInvoiceById(id) {
  return Invoices.findById(id);
}

function ensureOrderDeliverable(order) {
  if (!order) {
    throw new InvoicesServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  if (order.status !== "delivered") {
    throw new InvoicesServiceError(409, "ORDER_INVALID_STATUS", "Order no esta en estado 'delivered'");
  }
}

function createInvoice(payload = {}) {
  const errors = validateCreateInvoice(payload);
  if (errors.length) {
    throw new InvoicesServiceError(400, "VALIDATION_ERROR", "VALIDATION_ERROR", errors);
  }

  const orderId = parseId(payload.orderId);
  if (!Number.isFinite(orderId)) {
    throw new InvoicesServiceError(404, "ORDER_NOT_FOUND", "Order no encontrado");
  }
  const order = findOrderById(orderId);
  ensureOrderDeliverable(order);

  const exists = db.invoices.some((i) => i.orderId === orderId);
  if (exists) {
    throw new InvoicesServiceError(409, "ORDER_ALREADY_INVOICED", "Order ya tiene invoice");
  }

  const shippingFeeCents = 2000 + Math.round(order.totalCents * 0.1);
  const amountCents = order.totalCents + shippingFeeCents;
  const invoice = Invoices.create({
    orderId,
    customerId: order.customerId,
    amountCents,
  });
  return invoice;
}

function updateInvoiceStatus(idValue, payload = {}) {
  const id = parseId(idValue);
  if (!Number.isFinite(id)) {
    throw new InvoicesServiceError(404, "INVOICE_NOT_FOUND", "Invoice no encontrado");
  }
  const invoice = findInvoiceById(id);
  if (!invoice) {
    throw new InvoicesServiceError(404, "INVOICE_NOT_FOUND", "Invoice no encontrado");
  }
  const nextStatus = (payload?.status || "").toString();
  if (!nextStatus) {
    throw new InvoicesServiceError(400, "STATUS_REQUIRED", "status requerido");
  }
  if (!validateInvoiceStatusTransition(invoice.status, nextStatus)) {
    throw new InvoicesServiceError(400, "TRANSITION_NOT_ALLOWED", "TRANSITION_NOT_ALLOWED");
  }
  Invoices.setStatus(invoice, nextStatus);
  return invoice;
}

module.exports = {
  createInvoice,
  updateInvoiceStatus,
  InvoicesServiceError,
};
