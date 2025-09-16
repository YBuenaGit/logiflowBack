const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isPositiveInteger = (v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v));
const isBoolean = (v) => typeof v === "boolean";
const isFiniteNumber = (v) => Number.isFinite(Number(v));

function validateCustomerPayload(body) {
  const errors = [];
  if (!isNonEmptyString(body?.name)) errors.push("name requerido");
  if (!isNonEmptyString(body?.email)) errors.push("email requerido");
  return errors;
}

// Orders
function validateCreateOrder(body = {}) {
  const errors = [];
  const { customerId, warehouseId, items } = body;
  if (!isPositiveInteger(customerId)) errors.push("customerId debe ser entero > 0");
  if (!isPositiveInteger(warehouseId)) errors.push("warehouseId debe ser entero > 0");
  if (!Array.isArray(items) || items.length < 1) errors.push("items debe ser un array con al menos 1 elemento");
  if (Array.isArray(items)) {
    items.forEach((it, idx) => {
      if (!isPositiveInteger(it?.productId)) errors.push(`items[${idx}].productId debe ser entero > 0`);
      if (!isPositiveInteger(it?.qty)) errors.push(`items[${idx}].qty debe ser entero > 0`);
    });
  }
  return errors;
}

function validateUpdateOrder(body = {}, currentOrder = null) {
  const errors = [];
  if (!currentOrder || typeof currentOrder !== "object") {
    errors.push("order actual requerido");
    return errors;
  }
  if (currentOrder.status !== "allocated") {
    errors.push("solo se puede modificar cuando el status es 'allocated'");
    return errors;
  }
  const { items } = body;
  if (!Array.isArray(items) || items.length < 1) errors.push("items debe ser un array con al menos 1 elemento");
  if (Array.isArray(items)) {
    items.forEach((it, idx) => {
      if (!isPositiveInteger(it?.productId)) errors.push(`items[${idx}].productId debe ser entero > 0`);
      if (!isPositiveInteger(it?.qty)) errors.push(`items[${idx}].qty debe ser entero > 0`);
    });
  }
  return errors;
}

// Shipments
function validateCreateShipment(body = {}) {
  const errors = [];
  const { orderId, destination } = body;
  if (!isPositiveInteger(orderId)) errors.push("orderId debe ser entero > 0");
  const addr = destination?.address;
  if (!isNonEmptyString(addr)) errors.push("destination.address requerido");
  if (destination?.lat !== undefined && !isFiniteNumber(destination.lat)) errors.push("destination.lat debe ser numérico");
  if (destination?.lng !== undefined && !isFiniteNumber(destination.lng)) errors.push("destination.lng debe ser numérico");
  return errors;
}

function validateShipmentStatusTransition(current, next) {
  const map = {
    created: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered", "failed", "cancelled"],
    delivered: [],
    failed: [],
    cancelled: [],
  };
  const allowed = map[current] || [];
  return allowed.includes(next);
}

// Invoices
function validateCreateInvoice(body = {}) {
  const errors = [];
  const { orderId } = body;
  if (!isPositiveInteger(orderId)) errors.push("orderId debe ser entero > 0");
  return errors;
}

function validateInvoiceStatusTransition(current, next) {
  const map = {
    issued: ["paid", "void"],
    paid: [],
    void: [],
  };
  const allowed = map[current] || [];
  return allowed.includes(next);
}

module.exports = {
  isNonEmptyString,
  isPositiveInteger,
  isBoolean,
  validateCustomerPayload,
  isFiniteNumber,
  validateCreateOrder,
  validateUpdateOrder,
  validateCreateShipment,
  validateShipmentStatusTransition,
  validateCreateInvoice,
  validateInvoiceStatusTransition,
};
