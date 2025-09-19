const express = require("express");
const { db } = require("../db/memory");
const Customers = require("../models/customers.model");
const Products = require("../models/products.model");
const Warehouses = require("../models/warehouses.model");
const Stock = require("../models/stock.model");
const {
  createOrder,
  updateOrder,
  cancelOrder,
  OrdersServiceError,
} = require("../services/orders.service");
const {
  createShipment,
  updateShipmentStatus,
  cancelShipment,
  ShipmentsServiceError,
} = require("../services/shipments.service");
const {
  createInvoice,
  updateInvoiceStatus,
  InvoicesServiceError,
} = require("../services/invoices.service");
const { validateCustomerPayload, isNonEmptyString } = require("../utils/validate");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  next();
});

// Helpers de formato (reutilizables en este router)
function formatARS(cents) {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}

function formatLocal(iso, tz) {
  return new Date(iso).toLocaleString("es-AR", { timeZone: tz });
}

function getTz(req) {
  return req.query.tz || "America/Argentina/Tucuman";
}

// Helper de traduccion de estados
function translateStatus(kind, code) {
  const maps = {
    order: {
      allocated: "reservado",
      shipped: "enviado",
      delivered: "entregado",
      cancelled: "cancelado",
    },
    shipment: {
      created: "creado",
      out_for_delivery: "en reparto",
      delivered: "entregado",
      failed: "fallido",
      cancelled: "cancelado",
    },
    invoice: {
      issued: "emitida",
      paid: "pagada",
      void: "anulada",
    },
  };
  const map = maps[kind] || {};
  return map[code] || code;
}

const SUCCESS_MESSAGES = {
  customer_created: "Cliente creado correctamente.",
  customer_updated: "Cliente actualizado correctamente.",
  customer_deleted: "Cliente eliminado correctamente.",
  product_created: "Producto creado correctamente.",
  product_updated: "Producto actualizado correctamente.",
  product_deleted: "Producto eliminado correctamente.",
  warehouse_created: "Deposito creado correctamente.",
  warehouse_updated: "Deposito actualizado correctamente.",
  warehouse_deleted: "Deposito eliminado correctamente.",
  order_created: "Pedido creado correctamente.",
  order_updated: "Pedido actualizado correctamente.",
  order_cancelled: "Pedido cancelado correctamente.",
  stock_adjusted: "Stock actualizado correctamente.",
  stock_moved: "Stock transferido correctamente.",
  shipment_created: "Envio creado correctamente.",
  shipment_status_updated: "Estado del envio actualizado.",
  shipment_cancelled: "Envio cancelado correctamente.",
  invoice_created: "Factura creada correctamente.",
  invoice_status_updated: "Estado de la factura actualizado.",
};

const ERROR_MESSAGES = {
  customer_not_found: "Cliente no encontrado.",
  customer_has_active_orders: "No se puede eliminar un cliente con pedidos activos.",
  product_not_found: "Producto no encontrado.",
  product_has_stock: "No se puede eliminar un producto con stock disponible.",
  warehouse_not_found: "Deposito no encontrado.",
  warehouse_has_stock: "No se puede eliminar un deposito con stock asignado.",
  order_not_found: "Pedido no encontrado.",
  order_not_modifiable: "No se puede modificar este pedido.",
  order_not_cancelable: "No se puede cancelar este pedido.",
  order_stock_insufficient: "Stock insuficiente para el pedido.",
  order_internal_error: "Ocurrio un error procesando el pedido.",
  stock_invalid: "No se pudo ajustar el stock.",
  stock_insufficient: "Stock insuficiente para realizar la operacion.",
  shipment_not_found: "Envio no encontrado.",
  shipment_not_allowed: "No se puede ejecutar esta accion para el envio.",
  shipment_internal_error: "Ocurrio un error procesando el envio.",
  invoice_not_found: "Factura no encontrada.",
  invoice_not_allowed: "No se puede ejecutar esta accion para la factura.",
  invoice_internal_error: "Ocurrio un error procesando la factura.",
};

const FORM_ERROR_MESSAGE = "Revisa los errores del formulario.";

function normalizeFlash(flash = {}) {
  return {
    success: Array.isArray(flash.success) ? flash.success.slice() : [],
    error: Array.isArray(flash.error) ? flash.error.slice() : [],
  };
}

function flashFromQuery(req) {
  const flash = normalizeFlash();
  const successKey = req.query.success;
  if (successKey && SUCCESS_MESSAGES[successKey]) {
    flash.success.push(SUCCESS_MESSAGES[successKey]);
  }
  const errorKey = req.query.error;
  if (errorKey && ERROR_MESSAGES[errorKey]) {
    flash.error.push(ERROR_MESSAGES[errorKey]);
  }
  return flash;
}

// Customers helpers
function projectCustomers(list) {
  return list
    .filter((c) => c.deletedAt === null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      status: c.status,
    }));
}

function renderCustomersPage(req, res, overrides = {}) {
  const customers = projectCustomers(db.customers);
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);
  const createValues = {
    name: overrides.createValues?.name ?? "",
    email: overrides.createValues?.email ?? "",
  };
  const createErrors = overrides.createErrors || [];
  const editErrors = overrides.editErrors || [];

  let editCustomer;
  if (Object.prototype.hasOwnProperty.call(overrides, "editCustomer")) {
    editCustomer = overrides.editCustomer;
  } else {
    const editParam = req.query.edit;
    const editId = editParam ? Number(editParam) : NaN;
    if (Number.isFinite(editId)) {
      const found = customers.find((c) => c.id === editId);
      if (found) {
        editCustomer = { ...found };
      } else {
        flash.error.push("Cliente no encontrado.");
        editCustomer = null;
      }
    } else {
      editCustomer = null;
    }
  }

  res.locals.flashMessages = flash;
  return res.render("customers/index", {
    customers,
    createValues,
    createErrors,
    editCustomer,
    editErrors,
  });
}

// Orders helpers
function buildOrderOptions() {
  const customers = db.customers
    .filter((c) => c.deletedAt === null && c.status === "active")
    .map((c) => ({ id: c.id, name: c.name }));
  const warehouses = db.warehouses
    .filter((w) => w.deletedAt === null)
    .map((w) => ({ id: w.id, name: w.name }));
  const products = db.products
    .filter((p) => p.deletedAt === null && p.active === true)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      priceARS: formatARS(p.priceCents),
      label: `${p.sku} - ${p.name}`,
    }));
  return { customers, warehouses, products };
}

function ensureProductsForItems(orderOptions, items) {
  if (!items || !Array.isArray(items)) return;
  const existing = new Map(orderOptions.products.map((p) => [Number(p.id), p]));
  for (const item of items) {
    const id = Number(item.productId);
    if (!Number.isFinite(id) || id <= 0 || existing.has(id)) continue;
    const product = db.products.find((p) => p.id === id) || null;
    const label = product
      ? `${product.sku} - ${product.name} (inactivo)`
      : `Producto #${id}`;
    orderOptions.products.push({
      id,
      sku: product ? product.sku : `#${id}`,
      name: product ? product.name : "",
      priceARS: product ? formatARS(product.priceCents) : formatARS(0),
      label,
    });
    existing.set(id, true);
  }
}

function buildStockOptions() {
  const warehouses = db.warehouses
    .filter((w) => w.deletedAt === null)
    .map((w) => ({ id: w.id, name: w.name }));
  warehouses.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const products = db.products
    .filter((p) => p.deletedAt === null && p.active === true)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, label: `${p.sku} - ${p.name}` }));
  products.sort((a, b) => (a.label || "").localeCompare(b.label || ""));

  return { warehouses, products };
}

function ensureStockProducts(options, stockItems) {
  const existing = new Map(options.products.map((p) => [Number(p.id), p]));
  for (const item of stockItems) {
    const id = Number(item.productId);
    if (!Number.isFinite(id) || existing.has(id)) continue;
    options.products.push({
      id,
      sku: item.productSku || `#${id}`,
      name: item.productName || "",
      label: item.productSku && item.productName ? `${item.productSku} - ${item.productName}` : `Producto #${id}`,
    });
    existing.set(id, true);
  }
  options.products.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
}

function projectStockRecords() {
  const join = db.stock.map((s) => {
    const w = db.warehouses.find((x) => x.id === s.warehouseId) || {};
    const p = db.products.find((x) => x.id === s.productId) || {};
    return {
      id: s.id,
      warehouseId: s.warehouseId,
      warehouseName: w && w.name ? w.name : `Deposito ${s.warehouseId}`,
      productId: s.productId,
      productSku: p && p.sku ? p.sku : String(s.productId),
      productName: p && p.name ? p.name : "",
      qty: s.qty,
    };
  });
  join.sort((a, b) => {
    const wa = (a.warehouseName || "").localeCompare(b.warehouseName || "");
    if (wa !== 0) return wa;
    return (a.productSku || "").localeCompare(b.productSku || "");
  });
  return join;
}

function renderStockPage(req, res, overrides = {}) {
  const stock = projectStockRecords();
  const stockOptions = buildStockOptions();
  ensureStockProducts(stockOptions, stock);
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);

  const adjustValues = {
    warehouseId: overrides.adjustValues?.warehouseId ?? "",
    productId: overrides.adjustValues?.productId ?? "",
    delta: overrides.adjustValues?.delta ?? "",
  };
  const adjustErrors = overrides.adjustErrors || [];

  const moveValues = {
    fromWarehouseId: overrides.moveValues?.fromWarehouseId ?? "",
    toWarehouseId: overrides.moveValues?.toWarehouseId ?? "",
    productId: overrides.moveValues?.productId ?? "",
    qty: overrides.moveValues?.qty ?? "",
  };
  const moveErrors = overrides.moveErrors || [];

  res.locals.flashMessages = flash;
  return res.render("stock/index", {
    stock,
    stockOptions,
    adjustValues,
    adjustErrors,
    moveValues,
    moveErrors,
  });
}

const SHIPMENT_TRANSITIONS = {
  created: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "failed", "cancelled"],
  delivered: [],
  failed: [],
  cancelled: [],
};

function nextShipmentStatuses(current) {
  return SHIPMENT_TRANSITIONS[current] || [];
}

function projectShipments(list, tz) {
  return list.map((s) => {
    const order = db.orders.find((o) => o.id === s.orderId) || null;
    const customer = order ? db.customers.find((c) => c.id === order.customerId) || null : null;
    const warehouseId = s.origin?.warehouseId ?? (order ? order.warehouseId : null);
    const warehouse = warehouseId ? db.warehouses.find((w) => w.id === warehouseId) || null : null;
    const nextStatusesCodes = nextShipmentStatuses(s.status);
    return {
      id: s.id,
      orderId: s.orderId,
      customerName: customer ? customer.name : "",
      warehouseName: warehouse ? warehouse.name : "",
      status: s.status,
      statusLabel: translateStatus("shipment", s.status),
      originWarehouseId: warehouseId,
      destinationAddress: s.destination?.address ?? "",
      updatedAtLocal: formatLocal(s.updatedAt, tz),
      tracking: (s.tracking || []).map((t) => ({
        tsLocal: formatLocal(t.ts, tz),
        status: t.status,
        statusLabel: translateStatus("shipment", t.status),
        note: t.note || "",
      })),
      nextStatuses: nextStatusesCodes.map((code) => ({ code, label: translateStatus("shipment", code) })),
    };
  });
}

function buildShipmentOptions() {
  const orders = db.orders
    .filter((o) => o.status === "allocated")
    .map((o) => {
      const customer = db.customers.find((c) => c.id === o.customerId) || null;
      const warehouse = db.warehouses.find((w) => w.id === o.warehouseId) || null;
      const customerName = customer ? customer.name : "";
      const warehouseName = warehouse ? warehouse.name : "";
      return {
        id: o.id,
        label: `Pedido #${o.id} - ${customerName || "sin cliente"} (${warehouseName || "sin deposito"})`,
      };
    });
  orders.sort((a, b) => (a.id || 0) - (b.id || 0));
  return { orders };
}

function renderShipmentsPage(req, res, overrides = {}) {
  const tz = getTz(req);
  const shipments = projectShipments(db.shipments, tz);
  const shipmentOptions = buildShipmentOptions();
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);

  const createValues = {
    orderId: overrides.createValues?.orderId ?? "",
    destination: {
      address: overrides.createValues?.destination?.address ?? "",
      lat: overrides.createValues?.destination?.lat ?? "",
      lng: overrides.createValues?.destination?.lng ?? "",
    },
  };
  const createErrors = overrides.createErrors || [];
  const statusErrors = overrides.statusErrors || {};

  res.locals.flashMessages = flash;
  return res.render("shipments/index", {
    shipments,
    shipmentOptions,
    createValues,
    createErrors,
    statusErrors,
  });
}

const INVOICE_TRANSITIONS = {
  issued: ["paid", "void"],
  paid: [],
  void: [],
};

function nextInvoiceStatuses(current) {
  return INVOICE_TRANSITIONS[current] || [];
}

function projectInvoices(list, tz) {
  return list.map((i) => {
    const customer = db.customers.find((c) => c.id === i.customerId) || null;
    const nextStatusesCodes = nextInvoiceStatuses(i.status);
    return {
      id: i.id,
      orderId: i.orderId,
      customerName: customer ? customer.name : "",
      amountARS: formatARS(i.amountCents),
      status: i.status,
      statusLabel: translateStatus("invoice", i.status),
      createdAtLocal: formatLocal(i.createdAt, tz),
      updatedAtLocal: formatLocal(i.updatedAt, tz),
      nextStatuses: nextStatusesCodes.map((code) => ({ code, label: translateStatus("invoice", code) })),
    };
  });
}

function buildInvoiceOptions() {
  const eligibleOrders = db.orders
    .filter((o) => o.status === "delivered")
    .filter((o) => !db.invoices.some((inv) => inv.orderId === o.id))
    .map((o) => {
      const customer = db.customers.find((c) => c.id === o.customerId) || null;
      return {
        id: o.id,
        label: `Pedido #${o.id} - ${customer ? customer.name : "sin cliente"}`,
      };
    });
  eligibleOrders.sort((a, b) => (a.id || 0) - (b.id || 0));
  return { orders: eligibleOrders };
}

function renderInvoicesPage(req, res, overrides = {}) {
  const tz = getTz(req);
  const invoices = projectInvoices(db.invoices, tz);
  const invoiceOptions = buildInvoiceOptions();
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);

  const createValues = {
    orderId: overrides.createValues?.orderId ?? "",
  };
  const createErrors = overrides.createErrors || [];
  const statusErrors = overrides.statusErrors || {};

  res.locals.flashMessages = flash;
  return res.render("invoices/index", {
    invoices,
    invoiceOptions,
    createValues,
    createErrors,
    statusErrors,
  });
}

function projectOrders(list, tz) {
  return list.map((o) => {
    const customer = db.customers.find((c) => c.id === o.customerId) || null;
    const warehouse = db.warehouses.find((w) => w.id === o.warehouseId) || null;
    const items = o.items.map((it) => {
      const product = db.products.find((p) => p.id === it.productId) || null;
      return {
        productId: it.productId,
        qty: it.qty,
        productSku: product ? product.sku : String(it.productId),
        productName: product ? product.name : "",
      };
    });
    return {
      id: o.id,
      customerName: customer ? customer.name : "",
      warehouseName: warehouse ? warehouse.name : "",
      totalARS: formatARS(o.totalCents),
      status: o.status,
      statusLabel: translateStatus("order", o.status),
      createdAtLocal: formatLocal(o.createdAt, tz),
      updatedAtLocal: formatLocal(o.updatedAt, tz),
      itemsCount: items.length,
      items,
      canModify: o.status === "allocated",
      canCancel: o.status === "allocated",
    };
  });
}

function extractOrderFormItems(rawItems) {
  const source = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === "object"
    ? Object.values(rawItems)
    : [];
  return source.map((it) => ({
    productId: typeof it?.productId === "string" ? it.productId.trim() : "",
    qty: typeof it?.qty === "string" ? it.qty.trim() : "",
  }));
}

function filterNonEmptyOrderItems(items) {
  return items.filter((it) => it.productId !== "" || it.qty !== "");
}

function padOrderItems(items, minRows = 3) {
  const rows = items.map((it) => ({
    productId: typeof it.productId === "string" ? it.productId : String(it.productId ?? ""),
    qty: typeof it.qty === "string" ? it.qty : String(it.qty ?? ""),
  }));
  while (rows.length < minRows) {
    rows.push({ productId: "", qty: "" });
  }
  return rows;
}

function findOrderForEdit(id) {
  const order = db.orders.find((o) => o.id === id);
  if (!order) return null;
  const customer = db.customers.find((c) => c.id === order.customerId) || null;
  const warehouse = db.warehouses.find((w) => w.id === order.warehouseId) || null;
  return {
    id: order.id,
    status: order.status,
    statusLabel: translateStatus("order", order.status),
    customerName: customer ? customer.name : "",
    warehouseName: warehouse ? warehouse.name : "",
    warehouseId: order.warehouseId,
    items: padOrderItems(order.items.map((it) => ({
      productId: String(it.productId),
      qty: String(it.qty),
    })), Math.max(order.items.length, 1)),
  };
}

function renderOrdersPage(req, res, overrides = {}) {
  const tz = getTz(req);
  const orders = projectOrders(db.orders, tz);
  const orderOptions = buildOrderOptions();
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);

  const createValues = {
    customerId: overrides.createValues?.customerId ?? "",
    warehouseId: overrides.createValues?.warehouseId ?? "",
  };
  const rawCreateItems = overrides.createItems || [];
  const createItems = padOrderItems(rawCreateItems.length ? rawCreateItems : [], 3);
  const createErrors = overrides.createErrors || [];
  const editErrors = overrides.editErrors || [];

  let editOrder;
  if (Object.prototype.hasOwnProperty.call(overrides, "editOrder")) {
    editOrder = overrides.editOrder;
  } else {
    const editParam = req.query.edit;
    const editId = editParam ? Number(editParam) : NaN;
    if (Number.isFinite(editId)) {
      const found = findOrderForEdit(editId);
      if (found) {
        if (found.status !== "allocated") {
          flash.error.push("Solo se pueden modificar pedidos en estado 'reservado'.");
        } else {
          editOrder = found;
        }
      } else {
        flash.error.push("Pedido no encontrado.");
      }
    }
  }

  if (editOrder) {
    ensureProductsForItems(orderOptions, editOrder.items);
  }
  ensureProductsForItems(orderOptions, createItems);

  res.locals.flashMessages = flash;
  return res.render("orders/index", {
    orders,
    orderOptions,
    createValues,
    createItems,
    createErrors,
    editOrder,
    editErrors,
  });
}

function mapOrderErrorToQuery(code) {
  switch (code) {
    case "ORDER_NOT_FOUND":
      return "order_not_found";
    case "ORDER_NOT_MODIFIABLE":
      return "order_not_modifiable";
    case "STOCK_INSUFFICIENT":
      return "order_stock_insufficient";
    default:
      return "order_internal_error";
  }
}

function mapShipmentErrorToQuery(code) {
  switch (code) {
    case "SHIPMENT_NOT_FOUND":
      return "shipment_not_found";
    case "SHIPMENT_DELIVERED":
    case "ORDER_INVALID_STATUS":
    case "ORDER_NOT_FOUND":
      return "shipment_not_allowed";
    default:
      return "shipment_internal_error";
  }
}

function mapInvoiceErrorToQuery(code) {
  switch (code) {
    case "INVOICE_NOT_FOUND":
      return "invoice_not_found";
    case "ORDER_ALREADY_INVOICED":
    case "ORDER_INVALID_STATUS":
    case "ORDER_NOT_FOUND":
      return "invoice_not_allowed";
    default:
      return "invoice_internal_error";
  }
}

function mapStockErrorToQuery(code) {
  switch (code) {
    case "STOCK_INSUFFICIENT":
      return "stock_insufficient";
    default:
      return "stock_invalid";
  }
}

// Productos helpers
function parsePriceToCents(input) {
  if (input === null || input === undefined) return NaN;
  const normalized = String(input).replace(",", ".").trim();
  if (!normalized) return NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

function centsToPriceInput(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function projectProducts(list) {
  return list
    .filter((p) => p.deletedAt === null)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      priceCents: p.priceCents,
      priceARS: formatARS(p.priceCents),
      active: !!p.active,
    }));
}

function renderProductsPage(req, res, overrides = {}) {
  const products = projectProducts(db.products);
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);
  const createValues = {
    sku: overrides.createValues?.sku ?? "",
    name: overrides.createValues?.name ?? "",
    price: overrides.createValues?.price ?? "",
  };
  const createErrors = overrides.createErrors || [];
  const editErrors = overrides.editErrors || [];

  let editProduct;
  if (Object.prototype.hasOwnProperty.call(overrides, "editProduct")) {
    editProduct = overrides.editProduct;
  } else {
    const editParam = req.query.edit;
    const editId = editParam ? Number(editParam) : NaN;
    if (Number.isFinite(editId)) {
      const found = products.find((p) => p.id === editId);
      if (found) {
        editProduct = {
          id: found.id,
          sku: found.sku,
          name: found.name,
          price: centsToPriceInput(found.priceCents),
          active: found.active,
        };
      } else {
        flash.error.push("Producto no encontrado.");
      }
    }
  }

  res.locals.flashMessages = flash;
  return res.render("products/index", {
    products,
    createValues,
    createErrors,
    editProduct,
    editErrors,
  });
}

function projectWarehouses(list) {
  return list
    .filter((w) => w.deletedAt === null)
    .map((w) => ({
      id: w.id,
      name: w.name,
      city: w.city,
      itemsEnStock: db.stock.filter((s) => s.warehouseId === w.id).length,
    }));
}

function renderWarehousesPage(req, res, overrides = {}) {
  const warehouses = projectWarehouses(db.warehouses);
  const flash = overrides.flashMessages ? normalizeFlash(overrides.flashMessages) : flashFromQuery(req);
  const createValues = {
    name: overrides.createValues?.name ?? "",
    city: overrides.createValues?.city ?? "",
  };
  const createErrors = overrides.createErrors || [];
  const editErrors = overrides.editErrors || [];

  let editWarehouse;
  if (Object.prototype.hasOwnProperty.call(overrides, "editWarehouse")) {
    editWarehouse = overrides.editWarehouse;
  } else {
    const editParam = req.query.edit;
    const editId = editParam ? Number(editParam) : NaN;
    if (Number.isFinite(editId)) {
      const found = warehouses.find((w) => w.id === editId);
      if (found) {
        editWarehouse = { ...found };
      } else {
        flash.error.push("Deposito no encontrado.");
      }
    }
  }

  res.locals.flashMessages = flash;
  return res.render("warehouses/index", {
    warehouses,
    createValues,
    createErrors,
    editWarehouse,
    editErrors,
  });
}

// Indice de vistas
router.get("/", (req, res) => {
  const counts = {
    customers: db.customers.filter((c) => c.deletedAt === null).length,
    products: db.products.filter((p) => p.deletedAt === null).length,
    warehouses: db.warehouses.filter((w) => w.deletedAt === null).length,
    stock: db.stock.length,
    orders: db.orders.length,
    shipments: db.shipments.length,
    invoices: db.invoices.length,
  };
  res.locals.flashMessages = flashFromQuery(req);
  return res.render("index", { counts });
});

// Clientes
router.get("/customers", (req, res) => {
  return renderCustomersPage(req, res);
});

router.post("/customers", (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const payload = { name, email };
  const errors = validateCustomerPayload(payload);
  if (Customers.isEmailTaken(email)) {
    errors.push("email ya existe");
  }
  if (errors.length) {
    return renderCustomersPage(req, res, {
      createValues: payload,
      createErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      editCustomer: null,
    });
  }
  Customers.create(payload);
  return res.redirect("/views/customers?success=customer_created");
});

router.post("/customers/:id/update", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/customers?error=customer_not_found");
  }
  const customer = Customers.findById(id);
  if (!customer || customer.deletedAt !== null) {
    return res.redirect("/views/customers?error=customer_not_found");
  }

  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";

  const errors = [];
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!isNonEmptyString(email)) errors.push("email requerido");
  if (!["active", "blocked"].includes(status)) errors.push("status invalido");
  if (email !== customer.email && Customers.isEmailTaken(email, id)) {
    errors.push("email ya existe");
  }

  if (errors.length) {
    return renderCustomersPage(req, res, {
      editCustomer: { id, name, email, status: status || customer.status },
      editErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      createValues: { name: "", email: "" },
    });
  }

  Customers.update(id, { name, email, status });
  return res.redirect("/views/customers?success=customer_updated");
});

router.post("/customers/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/customers?error=customer_not_found");
  }
  const customer = Customers.findById(id);
  if (!customer || customer.deletedAt !== null) {
    return res.redirect("/views/customers?error=customer_not_found");
  }
  const hasActiveOrders = db.orders.some(
    (o) => o.customerId === id && o.status !== "cancelled" && o.status !== "delivered"
  );
  if (hasActiveOrders) {
    return res.redirect("/views/customers?error=customer_has_active_orders");
  }
  Customers.softDelete(id);
  return res.redirect("/views/customers?success=customer_deleted");
});

// Pedidos
router.get("/orders", (req, res) => {
  return renderOrdersPage(req, res);
});

router.post("/orders", (req, res) => {
  const customerId = typeof req.body.customerId === "string" ? req.body.customerId.trim() : "";
  const warehouseId = typeof req.body.warehouseId === "string" ? req.body.warehouseId.trim() : "";
  const rawItems = extractOrderFormItems(req.body.items);
  const filteredItems = filterNonEmptyOrderItems(rawItems);
  const payload = {
    customerId,
    warehouseId,
    items: filteredItems.map((it) => ({ productId: it.productId, qty: it.qty })),
  };

  try {
    createOrder(payload);
    return res.redirect("/views/orders?success=order_created");
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      return renderOrdersPage(req, res, {
        createValues: { customerId, warehouseId },
        createItems: rawItems,
        createErrors: errors,
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return renderOrdersPage(req, res, {
      createValues: { customerId, warehouseId },
      createItems: rawItems,
      createErrors: ["Ocurrio un error inesperado."],
      flashMessages: { error: ["Ocurrio un error inesperado."] },
    });
  }
});

router.post("/orders/:id/update", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/orders?error=order_not_found");
  }
  const rawItems = extractOrderFormItems(req.body.items);
  const filteredItems = filterNonEmptyOrderItems(rawItems);
  const payload = { items: filteredItems.map((it) => ({ productId: it.productId, qty: it.qty })) };

  try {
    updateOrder(id, payload);
    return res.redirect("/views/orders?success=order_updated");
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      const baseOrder = findOrderForEdit(id);
      if (!baseOrder) {
        return res.redirect("/views/orders?error=order_not_found");
      }
      const editOrder = {
        ...baseOrder,
        items: padOrderItems(rawItems.length ? rawItems : baseOrder.items, Math.max(rawItems.length, 1)),
      };
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      const flashMessages = err.code === "VALIDATION_ERROR" ? { error: [FORM_ERROR_MESSAGE] } : { error: [err.message || FORM_ERROR_MESSAGE] };
      return renderOrdersPage(req, res, {
        editOrder,
        editErrors: errors,
        flashMessages,
      });
    }
    return res.redirect("/views/orders?error=order_internal_error");
  }
});

router.post("/orders/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/orders?error=order_not_found");
  }
  try {
    cancelOrder(id);
    return res.redirect("/views/orders?success=order_cancelled");
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      const key = err.code === "ORDER_NOT_MODIFIABLE" ? "order_not_cancelable" : mapOrderErrorToQuery(err.code);
      return res.redirect(`/views/orders?error=${key}`);
    }
    return res.redirect("/views/orders?error=order_internal_error");
  }
});

// Productos
router.get("/products", (req, res) => {
  return renderProductsPage(req, res);
});

router.post("/products", (req, res) => {
  const sku = typeof req.body.sku === "string" ? req.body.sku.trim() : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const priceInput = typeof req.body.price === "string" ? req.body.price.trim() : "";
  const priceCents = parsePriceToCents(priceInput);

  const errors = [];
  if (!isNonEmptyString(sku)) errors.push("sku requerido");
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!Number.isInteger(priceCents) || priceCents <= 0) errors.push("precio debe ser mayor a 0");
  if (sku && Products.isSkuTaken(sku)) errors.push("sku ya existe");

  if (errors.length) {
    return renderProductsPage(req, res, {
      createValues: { sku, name, price: priceInput },
      createErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      editProduct: null,
    });
  }

  Products.create({ sku, name, priceCents });
  return res.redirect("/views/products?success=product_created");
});

router.post("/products/:id/update", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/products?error=product_not_found");
  }
  const product = Products.findById(id);
  if (!product || product.deletedAt !== null) {
    return res.redirect("/views/products?error=product_not_found");
  }

  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const priceInput = typeof req.body.price === "string" ? req.body.price.trim() : "";
  const priceCents = parsePriceToCents(priceInput);
  const activeRaw = typeof req.body.active === "string" ? req.body.active.trim() : "";
  let active = product.active;
  if (activeRaw === "true") active = true;
  else if (activeRaw === "false") active = false;

  const errors = [];
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!Number.isInteger(priceCents) || priceCents <= 0) errors.push("precio debe ser mayor a 0");
  if (!["true", "false"].includes(activeRaw)) errors.push("estado invalido");

  if (errors.length) {
    return renderProductsPage(req, res, {
      editProduct: {
        id,
        sku: product.sku,
        name,
        price: priceInput || centsToPriceInput(product.priceCents),
        active,
      },
      editErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      createValues: { sku: "", name: "", price: "" },
    });
  }

  Products.update(id, { name, priceCents, active });
  return res.redirect("/views/products?success=product_updated");
});

router.post("/products/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/products?error=product_not_found");
  }
  const product = Products.findById(id);
  if (!product || product.deletedAt !== null) {
    return res.redirect("/views/products?error=product_not_found");
  }
  const hasStock = db.stock.some((s) => s.productId === id && s.qty > 0);
  if (hasStock) {
    return res.redirect("/views/products?error=product_has_stock");
  }
  Products.softDelete(id);
  return res.redirect("/views/products?success=product_deleted");
});

// Depositos
router.get("/warehouses", (req, res) => {
  return renderWarehousesPage(req, res);
});

router.post("/warehouses", (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";

  const errors = [];
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!isNonEmptyString(city)) errors.push("city requerido");

  if (errors.length) {
    return renderWarehousesPage(req, res, {
      createValues: { name, city },
      createErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      editWarehouse: null,
    });
  }

  Warehouses.create({ name, city });
  return res.redirect("/views/warehouses?success=warehouse_created");
});

router.post("/warehouses/:id/update", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }
  const warehouse = Warehouses.findById(id);
  if (!warehouse || warehouse.deletedAt !== null) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }

  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";

  const errors = [];
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!isNonEmptyString(city)) errors.push("city requerido");

  if (errors.length) {
    return renderWarehousesPage(req, res, {
      editWarehouse: { id, name, city, itemsEnStock: db.stock.filter((s) => s.warehouseId === id).length },
      editErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      createValues: { name: "", city: "" },
    });
  }

  Warehouses.update(id, { name, city });
  return res.redirect("/views/warehouses?success=warehouse_updated");
});

router.post("/warehouses/:id/delete", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }
  const warehouse = Warehouses.findById(id);
  if (!warehouse || warehouse.deletedAt !== null) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }
  const hasStock = db.stock.some((s) => s.warehouseId === id && s.qty > 0);
  if (hasStock) {
    return res.redirect("/views/warehouses?error=warehouse_has_stock");
  }
  Warehouses.softDelete(id);
  return res.redirect("/views/warehouses?success=warehouse_deleted");
});

// Envios
router.get("/shipments", (req, res) => {
  return renderShipmentsPage(req, res);
});

router.post("/shipments", (req, res) => {
  const orderId = typeof req.body.orderId === "string" ? req.body.orderId.trim() : "";
  const destinationAddress = typeof req.body.destinationAddress === "string" ? req.body.destinationAddress.trim() : "";
  const destinationLat = typeof req.body.destinationLat === "string" ? req.body.destinationLat.trim() : "";
  const destinationLng = typeof req.body.destinationLng === "string" ? req.body.destinationLng.trim() : "";

  const createValues = {
    orderId,
    destination: {
      address: destinationAddress,
      lat: destinationLat,
      lng: destinationLng,
    },
  };

  const payload = {
    orderId,
    destination: { address: destinationAddress },
  };
  if (destinationLat) payload.destination.lat = destinationLat;
  if (destinationLng) payload.destination.lng = destinationLng;

  try {
    createShipment(payload);
    return res.redirect("/views/shipments?success=shipment_created");
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      return renderShipmentsPage(req, res, {
        createValues,
        createErrors: errors,
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect("/views/shipments?error=shipment_internal_error");
  }
});

router.post("/shipments/:id/status", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/shipments?error=shipment_not_found");
  }
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";
  const note = typeof req.body.note === "string" ? req.body.note.trim() : "";

  const statusPayload = { status };
  if (note) statusPayload.note = note;

  try {
    updateShipmentStatus(id, statusPayload);
    return res.redirect("/views/shipments?success=shipment_status_updated");
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
      const inlineErrors = [];
      if (err.code === "VALIDATION_ERROR") {
        inlineErrors.push(...(err.details || []));
      } else if (err.code === "TRANSITION_NOT_ALLOWED" || err.code === "STATUS_REQUIRED") {
        inlineErrors.push(err.message || FORM_ERROR_MESSAGE);
      }
      if (inlineErrors.length) {
        return renderShipmentsPage(req, res, {
          statusErrors: { [id]: inlineErrors },
          flashMessages: { error: [FORM_ERROR_MESSAGE] },
        });
      }
      const key = mapShipmentErrorToQuery(err.code);
      return res.redirect(`/views/shipments?error=${key}`);
    }
    return res.redirect("/views/shipments?error=shipment_internal_error");
  }
});

router.post("/shipments/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/shipments?error=shipment_not_found");
  }
  try {
    cancelShipment(id);
    return res.redirect("/views/shipments?success=shipment_cancelled");
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
      const key = mapShipmentErrorToQuery(err.code);
      return res.redirect(`/views/shipments?error=${key}`);
    }
    return res.redirect("/views/shipments?error=shipment_internal_error");
  }
});

// Facturas
router.get("/invoices", (req, res) => {
  return renderInvoicesPage(req, res);
});

router.post("/invoices", (req, res) => {
  const orderId = typeof req.body.orderId === "string" ? req.body.orderId.trim() : "";
  const createValues = { orderId };

  try {
    createInvoice({ orderId });
    return res.redirect("/views/invoices?success=invoice_created");
  } catch (err) {
    if (err instanceof InvoicesServiceError) {
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      return renderInvoicesPage(req, res, {
        createValues,
        createErrors: errors,
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect("/views/invoices?error=invoice_internal_error");
  }
});

router.post("/invoices/:id/status", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/invoices?error=invoice_not_found");
  }
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";

  try {
    updateInvoiceStatus(id, { status });
    return res.redirect("/views/invoices?success=invoice_status_updated");
  } catch (err) {
    if (err instanceof InvoicesServiceError) {
      const inlineErrors = [];
      if (err.code === "VALIDATION_ERROR") {
        inlineErrors.push(...(err.details || []));
      } else if (err.code === "TRANSITION_NOT_ALLOWED" || err.code === "STATUS_REQUIRED") {
        inlineErrors.push(err.message || FORM_ERROR_MESSAGE);
      }
      if (inlineErrors.length) {
        return renderInvoicesPage(req, res, {
          statusErrors: { [id]: inlineErrors },
          flashMessages: { error: [FORM_ERROR_MESSAGE] },
        });
      }
      const key = mapInvoiceErrorToQuery(err.code);
      return res.redirect(`/views/invoices?error=${key}`);
    }
    return res.redirect("/views/invoices?error=invoice_internal_error");
  }
});

// Stock
router.get("/stock", (req, res) => {
  return renderStockPage(req, res);
});

router.post("/stock/adjust", (req, res) => {
  const warehouseIdRaw = typeof req.body.warehouseId === "string" ? req.body.warehouseId.trim() : "";
  const productIdRaw = typeof req.body.productId === "string" ? req.body.productId.trim() : "";
  const deltaRaw = typeof req.body.delta === "string" ? req.body.delta.trim() : "";

  const adjustValues = { warehouseId: warehouseIdRaw, productId: productIdRaw, delta: deltaRaw };
  const errors = [];

  const warehouseId = Number(warehouseIdRaw);
  if (!Number.isInteger(warehouseId)) errors.push("warehouseId invalido");
  const productId = Number(productIdRaw);
  if (!Number.isInteger(productId)) errors.push("productId invalido");
  const delta = Number(deltaRaw);
  if (!Number.isFinite(delta) || delta === 0) errors.push("delta debe ser distinto de cero");

  if (errors.length) {
    return renderStockPage(req, res, {
      adjustValues,
      adjustErrors: errors,
      moveValues: { fromWarehouseId: "", toWarehouseId: "", productId: "", qty: "" },
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  const warehouse = db.warehouses.find((w) => w.id === warehouseId && w.deletedAt === null);
  if (!warehouse) errors.push("Deposito no encontrado");
  const product = db.products.find((p) => p.id === productId && p.deletedAt === null);
  if (!product) errors.push("Producto no encontrado");

  if (errors.length) {
    return renderStockPage(req, res, {
      adjustValues,
      adjustErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  try {
    Stock.adjust(warehouseId, productId, delta);
    return res.redirect("/views/stock?success=stock_adjusted");
  } catch (err) {
    const key = mapStockErrorToQuery(err && err.code ? err.code : err && err.message === "stock insuficiente" ? "STOCK_INSUFFICIENT" : "");
    if (err && err.message === "stock insuficiente") {
      return renderStockPage(req, res, {
        adjustValues,
        adjustErrors: ["stock insuficiente"],
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect(`/views/stock?error=${key}`);
  }
});

router.post("/stock/move", (req, res) => {
  const fromRaw = typeof req.body.fromWarehouseId === "string" ? req.body.fromWarehouseId.trim() : "";
  const toRaw = typeof req.body.toWarehouseId === "string" ? req.body.toWarehouseId.trim() : "";
  const productIdRaw = typeof req.body.productId === "string" ? req.body.productId.trim() : "";
  const qtyRaw = typeof req.body.qty === "string" ? req.body.qty.trim() : "";

  const moveValues = { fromWarehouseId: fromRaw, toWarehouseId: toRaw, productId: productIdRaw, qty: qtyRaw };
  const errors = [];

  const fromWarehouseId = Number(fromRaw);
  if (!Number.isInteger(fromWarehouseId)) errors.push("fromWarehouseId invalido");
  const toWarehouseId = Number(toRaw);
  if (!Number.isInteger(toWarehouseId)) errors.push("toWarehouseId invalido");
  const productId = Number(productIdRaw);
  if (!Number.isInteger(productId)) errors.push("productId invalido");
  const qty = Number(qtyRaw);
  if (!Number.isInteger(qty) || qty <= 0) errors.push("qty debe ser mayor a cero");
  if (Number.isInteger(fromWarehouseId) && Number.isInteger(toWarehouseId) && fromWarehouseId === toWarehouseId) {
    errors.push("Los depositos deben ser distintos");
  }

  if (errors.length) {
    return renderStockPage(req, res, {
      moveValues,
      moveErrors: errors,
      adjustValues: { warehouseId: "", productId: "", delta: "" },
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  const fromWarehouse = db.warehouses.find((w) => w.id === fromWarehouseId && w.deletedAt === null);
  if (!fromWarehouse) errors.push("Deposito origen no encontrado");
  const toWarehouse = db.warehouses.find((w) => w.id === toWarehouseId && w.deletedAt === null);
  if (!toWarehouse) errors.push("Deposito destino no encontrado");
  const product = db.products.find((p) => p.id === productId && p.deletedAt === null);
  if (!product) errors.push("Producto no encontrado");

  if (errors.length) {
    return renderStockPage(req, res, {
      moveValues,
      moveErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  try {
    Stock.move(fromWarehouseId, toWarehouseId, productId, qty);
    return res.redirect("/views/stock?success=stock_moved");
  } catch (err) {
    if (err && err.message === "stock insuficiente") {
      return renderStockPage(req, res, {
        moveValues,
        moveErrors: ["stock insuficiente"],
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    const key = mapStockErrorToQuery(err && err.code ? err.code : "");
    return res.redirect(`/views/stock?error=${key}`);
  }
});

module.exports = router;
