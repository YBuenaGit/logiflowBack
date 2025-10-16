const express = require("express");
const Customers = require("../models/customers.model");
const Products = require("../models/products.model");
const Warehouses = require("../models/warehouses.model");
const Stock = require("../models/stock.model");
const OrdersModel = require("../models/orders.model");
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
const { getCollection } = require("../db/mongo");

const router = express.Router();
//(*)
router.use((req, res, next) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  next();
});

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

async function loadState() {
  const [customers, products, warehouses, stock, orders, shipments, invoices] = await Promise.all([
    getCollection("customers").find().toArray(),
    getCollection("products").find().toArray(),
    getCollection("warehouses").find().toArray(),
    getCollection("stock").find().toArray(),
    getCollection("orders").find().toArray(),
    getCollection("shipments").find().toArray(),
    getCollection("invoices").find().toArray(),
  ]);
  return { customers, products, warehouses, stock, orders, shipments, invoices };
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

async function renderCustomersPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const customers = projectCustomers(state.customers);
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
function buildOrderOptions(state) {
  const customers = state.customers
    .filter((c) => c.deletedAt === null && c.status === "active")
    .map((c) => ({ id: c.id, name: c.name }));
  const warehouses = state.warehouses
    .filter((w) => w.deletedAt === null)
    .map((w) => ({ id: w.id, name: w.name }));
  const products = state.products
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

function ensureProductsForItems(state, orderOptions, items) {
  if (!items || !Array.isArray(items)) return;
  const existing = new Map(orderOptions.products.map((p) => [Number(p.id), p]));
  for (const item of items) {
    const id = Number(item.productId);
    if (!Number.isFinite(id) || id <= 0 || existing.has(id)) continue;
    const product = state.products.find((p) => p.id === id) || null;
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

function buildStockOptions(state) {
  const warehouses = state.warehouses
    .filter((w) => w.deletedAt === null)
    .map((w) => ({ id: w.id, name: w.name }));
  warehouses.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const products = state.products
    .filter((p) => p.deletedAt === null && p.active === true)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, label: `${p.sku} - ${p.name}` }));
  products.sort((a, b) => (a.label || "").localeCompare(b.label || ""));

  return { warehouses, products };
}

function ensureStockProducts(state, options, stockItems) {
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

function projectStockRecords(state) {
  const join = state.stock.map((s) => {
    const w = state.warehouses.find((x) => x.id === s.warehouseId) || {};
    const p = state.products.find((x) => x.id === s.productId) || {};
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

async function renderStockPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const stock = projectStockRecords(state);
  const stockOptions = buildStockOptions(state);
  ensureStockProducts(state, stockOptions, stock);
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

function projectShipments(state, list, tz) {
  return list.map((s) => {
    const order = state.orders.find((o) => o.id === s.orderId) || null;
    const customer = order ? state.customers.find((c) => c.id === order.customerId) || null : null;
    const warehouseId = s.origin?.warehouseId ?? (order ? order.warehouseId : null);
    const warehouse = warehouseId ? state.warehouses.find((w) => w.id === warehouseId) || null : null;
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

function buildShipmentOptions(state) {
  const orders = state.orders
    .filter((o) => o.status === "allocated")
    .map((o) => {
      const customer = state.customers.find((c) => c.id === o.customerId) || null;
      const warehouse = state.warehouses.find((w) => w.id === o.warehouseId) || null;
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

async function renderShipmentsPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const tz = getTz(req);
  const shipments = projectShipments(state, state.shipments, tz);
  const shipmentOptions = buildShipmentOptions(state);
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

function projectInvoices(state, list, tz) {
  return list.map((i) => {
    const customer = state.customers.find((c) => c.id === i.customerId) || null;
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

function buildInvoiceOptions(state) {
  const eligibleOrders = state.orders
    .filter((o) => o.status === "delivered")
    .filter((o) => !state.invoices.some((inv) => inv.orderId === o.id))
    .map((o) => {
      const customer = state.customers.find((c) => c.id === o.customerId) || null;
      return {
        id: o.id,
        label: `Pedido #${o.id} - ${customer ? customer.name : "sin cliente"}`,
      };
    });
  eligibleOrders.sort((a, b) => (a.id || 0) - (b.id || 0));
  return { orders: eligibleOrders };
}

async function renderInvoicesPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const tz = getTz(req);
  const invoices = projectInvoices(state, state.invoices, tz);
  const invoiceOptions = buildInvoiceOptions(state);
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

function projectOrders(state, list, tz) {
  return list.map((o) => {
    const customer = state.customers.find((c) => c.id === o.customerId) || null;
    const warehouse = state.warehouses.find((w) => w.id === o.warehouseId) || null;
    const items = o.items.map((it) => {
      const product = state.products.find((p) => p.id === it.productId) || null;
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

function findOrderForEdit(state, id) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return null;
  const customer = state.customers.find((c) => c.id === order.customerId) || null;
  const warehouse = state.warehouses.find((w) => w.id === order.warehouseId) || null;
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

async function renderOrdersPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const tz = getTz(req);
  const orders = projectOrders(state, state.orders, tz);
  const orderOptions = buildOrderOptions(state);
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
      const found = findOrderForEdit(state, editId);
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
    ensureProductsForItems(state, orderOptions, editOrder.items);
  }
  ensureProductsForItems(state, orderOptions, createItems);

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

async function renderProductsPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const products = projectProducts(state.products);
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

function projectWarehouses(state) {
  return state.warehouses
    .filter((w) => w.deletedAt === null)
    .map((w) => ({
      id: w.id,
      name: w.name,
      city: w.city,
      itemsEnStock: state.stock.filter((s) => s.warehouseId === w.id).length,
    }));
}

async function renderWarehousesPage(req, res, overrides = {}) {
  const state = overrides.state || (await loadState());
  const warehouses = projectWarehouses(state);
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
router.get("/", async (req, res) => {
  const state = await loadState();
  const counts = {
    customers: state.customers.filter((c) => c.deletedAt === null).length,
    products: state.products.filter((p) => p.deletedAt === null).length,
    warehouses: state.warehouses.filter((w) => w.deletedAt === null).length,
    stock: state.stock.length,
    orders: state.orders.length,
    shipments: state.shipments.length,
    invoices: state.invoices.length,
  };
  res.locals.flashMessages = flashFromQuery(req);
  return res.render("index", { counts });
});

// Clientes
router.get("/customers", async (req, res) => {
  await renderCustomersPage(req, res);
});

router.post("/customers", async (req, res) => {
  const state = await loadState();
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const payload = { name, email };
  const errors = validateCustomerPayload(payload);
  if (await Customers.isEmailTaken(email)) {
    errors.push("email ya existe");
  }
  if (errors.length) {
    return renderCustomersPage(req, res, {
      state,
      createValues: payload,
      createErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      editCustomer: null,
    });
  }
  await Customers.create(payload);
  return res.redirect("/views/customers?success=customer_created");
});

router.post("/customers/:id/update", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/customers?error=customer_not_found");
  }
  const customer = await Customers.findById(id);
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
  if (email !== customer.email && (await Customers.isEmailTaken(email, id))) {
    errors.push("email ya existe");
  }

  if (errors.length) {
    const state = await loadState();
    return renderCustomersPage(req, res, {
      state,
      editCustomer: { id, name, email, status: status || customer.status },
      editErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      createValues: { name: "", email: "" },
    });
  }

  await Customers.update(id, { name, email, status });
  return res.redirect("/views/customers?success=customer_updated");
});

router.post("/customers/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/customers?error=customer_not_found");
  }
  const customer = await Customers.findById(id);
  if (!customer || customer.deletedAt !== null) {
    return res.redirect("/views/customers?error=customer_not_found");
  }
  const hasActiveOrders = await OrdersModel.hasActiveOrders(id);
  if (hasActiveOrders) {
    return res.redirect("/views/customers?error=customer_has_active_orders");
  }
  await Customers.softDelete(id);
  return res.redirect("/views/customers?success=customer_deleted");
});

// Pedidos
router.get("/orders", async (req, res) => {
  await renderOrdersPage(req, res);
});

router.post("/orders", async (req, res) => {
  const state = await loadState();
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
    await createOrder(payload);
    return res.redirect("/views/orders?success=order_created");
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      return renderOrdersPage(req, res, {
        state,
        createValues: { customerId, warehouseId },
        createItems: rawItems,
        createErrors: errors,
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return renderOrdersPage(req, res, {
      state,
      createValues: { customerId, warehouseId },
      createItems: rawItems,
      createErrors: ["Ocurrio un error inesperado."],
      flashMessages: { error: ["Ocurrio un error inesperado."] },
    });
  }
});

router.post("/orders/:id/update", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/orders?error=order_not_found");
  }
  const rawItems = extractOrderFormItems(req.body.items);
  const filteredItems = filterNonEmptyOrderItems(rawItems);
  const payload = { items: filteredItems.map((it) => ({ productId: it.productId, qty: it.qty })) };

  try {
    await updateOrder(id, payload);
    return res.redirect("/views/orders?success=order_updated");
  } catch (err) {
    if (err instanceof OrdersServiceError) {
      const state = await loadState();
      const baseOrder = findOrderForEdit(state, id);
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
        state,
        editOrder,
        editErrors: errors,
        flashMessages,
      });
    }
    return res.redirect("/views/orders?error=order_internal_error");
  }
});

router.post("/orders/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/orders?error=order_not_found");
  }
  try {
    await cancelOrder(id);
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
router.get("/products", async (req, res) => {
  await renderProductsPage(req, res);
});

router.post("/products", async (req, res) => {
  const sku = typeof req.body.sku === "string" ? req.body.sku.trim() : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const priceInput = typeof req.body.price === "string" ? req.body.price.trim() : "";
  const priceCents = parsePriceToCents(priceInput);

  const errors = [];
  if (!isNonEmptyString(sku)) errors.push("sku requerido");
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!Number.isInteger(priceCents) || priceCents <= 0) errors.push("precio debe ser mayor a 0");
  if (sku && (await Products.isSkuTaken(sku))) errors.push("sku ya existe");

  if (errors.length) {
    const state = await loadState();
    return renderProductsPage(req, res, {
      state,
      createValues: { sku, name, price: priceInput },
      createErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      editProduct: null,
    });
  }

  await Products.create({ sku, name, priceCents });
  return res.redirect("/views/products?success=product_created");
});

router.post("/products/:id/update", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/products?error=product_not_found");
  }
  const product = await Products.findById(id);
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
    const state = await loadState();
    return renderProductsPage(req, res, {
      state,
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

  await Products.update(id, { name, priceCents, active });
  return res.redirect("/views/products?success=product_updated");
});

router.post("/products/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/products?error=product_not_found");
  }
  const product = await Products.findById(id);
  if (!product || product.deletedAt !== null) {
    return res.redirect("/views/products?error=product_not_found");
  }
  const stockRecords = await Stock.list({ productId: id });
  const hasStock = stockRecords.some((s) => s.qty > 0);
  if (hasStock) {
    return res.redirect("/views/products?error=product_has_stock");
  }
  await Products.softDelete(id);
  return res.redirect("/views/products?success=product_deleted");
});

// Depositos
router.get("/warehouses", async (req, res) => {
  await renderWarehousesPage(req, res);
});

router.post("/warehouses", async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";

  const errors = [];
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!isNonEmptyString(city)) errors.push("city requerido");

  if (errors.length) {
    const state = await loadState();
    return renderWarehousesPage(req, res, {
      state,
      createValues: { name, city },
      createErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      editWarehouse: null,
    });
  }

  await Warehouses.create({ name, city });
  return res.redirect("/views/warehouses?success=warehouse_created");
});

router.post("/warehouses/:id/update", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }
  const warehouse = await Warehouses.findById(id);
  if (!warehouse || warehouse.deletedAt !== null) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }

  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";

  const errors = [];
  if (!isNonEmptyString(name)) errors.push("name requerido");
  if (!isNonEmptyString(city)) errors.push("city requerido");

  if (errors.length) {
    const state = await loadState();
    return renderWarehousesPage(req, res, {
      state,
      editWarehouse: { id, name, city, itemsEnStock: state.stock.filter((s) => s.warehouseId === id).length },
      editErrors: errors,
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
      createValues: { name: "", city: "" },
    });
  }

  await Warehouses.update(id, { name, city });
  return res.redirect("/views/warehouses?success=warehouse_updated");
});

router.post("/warehouses/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }
  const warehouse = await Warehouses.findById(id);
  if (!warehouse || warehouse.deletedAt !== null) {
    return res.redirect("/views/warehouses?error=warehouse_not_found");
  }
  const stockRecords = await Stock.list({ warehouseId: id });
  const hasStock = stockRecords.some((s) => s.qty > 0);
  if (hasStock) {
    return res.redirect("/views/warehouses?error=warehouse_has_stock");
  }
  await Warehouses.softDelete(id);
  return res.redirect("/views/warehouses?success=warehouse_deleted");
});

// Envios
router.get("/shipments", async (req, res) => {
  await renderShipmentsPage(req, res);
});

router.post("/shipments", async (req, res) => {
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
    await createShipment(payload);
    return res.redirect("/views/shipments?success=shipment_created");
  } catch (err) {
    if (err instanceof ShipmentsServiceError) {
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      const state = await loadState();
      return renderShipmentsPage(req, res, {
        state,
        createValues,
        createErrors: errors,
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect("/views/shipments?error=shipment_internal_error");
  }
});

router.post("/shipments/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/shipments?error=shipment_not_found");
  }
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";
  const note = typeof req.body.note === "string" ? req.body.note.trim() : "";

  const statusPayload = { status };
  if (note) statusPayload.note = note;

  try {
    await updateShipmentStatus(id, statusPayload);
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
        const state = await loadState();
        return renderShipmentsPage(req, res, {
          state,
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

router.post("/shipments/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/shipments?error=shipment_not_found");
  }
  try {
    await cancelShipment(id);
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
router.get("/invoices", async (req, res) => {
  await renderInvoicesPage(req, res);
});

router.post("/invoices", async (req, res) => {
  const orderId = typeof req.body.orderId === "string" ? req.body.orderId.trim() : "";
  const createValues = { orderId };

  const state = await loadState();

  if (!orderId) {
    return renderInvoicesPage(req, res, {
      state,
      createValues,
      createErrors: ["orderId requerido"],
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  try {
    await createInvoice({ orderId });
    return res.redirect("/views/invoices?success=invoice_created");
  } catch (err) {
    if (err instanceof InvoicesServiceError) {
      const errors = err.code === "VALIDATION_ERROR" ? err.details || [] : [err.message || FORM_ERROR_MESSAGE];
      return renderInvoicesPage(req, res, {
        state,
        createValues,
        createErrors: errors,
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect("/views/invoices?error=invoice_internal_error");
  }
});

router.post("/invoices/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.redirect("/views/invoices?error=invoice_not_found");
  }
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";

  if (!status) {
    const state = await loadState();
    return renderInvoicesPage(req, res, {
      state,
      statusErrors: { [id]: ["status requerido"] },
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  try {
    await updateInvoiceStatus(id, { status });
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
        const state = await loadState();
        return renderInvoicesPage(req, res, {
          state,
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
router.get("/stock", async (req, res) => {
  await renderStockPage(req, res);
});

router.post("/stock/adjust", async (req, res) => {
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

  const state = await loadState();
  const warehouse = Number.isInteger(warehouseId)
    ? state.warehouses.find((w) => w.id === warehouseId && w.deletedAt === null)
    : null;
  if (!warehouse) errors.push("Deposito no encontrado");
  const product = Number.isInteger(productId)
    ? state.products.find((p) => p.id === productId && p.deletedAt === null)
    : null;
  if (!product) errors.push("Producto no encontrado");

  if (errors.length) {
    return renderStockPage(req, res, {
      state,
      adjustValues,
      adjustErrors: errors,
      moveValues: { fromWarehouseId: "", toWarehouseId: "", productId: "", qty: "" },
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  try {
    await Stock.adjust(warehouseId, productId, delta);
    return res.redirect("/views/stock?success=stock_adjusted");
  } catch (err) {
    const key = mapStockErrorToQuery(err && err.code ? err.code : err && err.message === "stock insuficiente" ? "STOCK_INSUFFICIENT" : "");
    if (err && err.message === "stock insuficiente") {
      return renderStockPage(req, res, {
        state,
        adjustValues,
        adjustErrors: ["stock insuficiente"],
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect(`/views/stock?error=${key}`);
  }
});

router.post("/stock/move", async (req, res) => {
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

  const state = await loadState();
  const fromWarehouse = Number.isInteger(fromWarehouseId)
    ? state.warehouses.find((w) => w.id === fromWarehouseId && w.deletedAt === null)
    : null;
  if (!fromWarehouse) errors.push("Deposito origen no encontrado");
  const toWarehouse = Number.isInteger(toWarehouseId)
    ? state.warehouses.find((w) => w.id === toWarehouseId && w.deletedAt === null)
    : null;
  if (!toWarehouse) errors.push("Deposito destino no encontrado");
  const product = Number.isInteger(productId)
    ? state.products.find((p) => p.id === productId && p.deletedAt === null)
    : null;
  if (!product) errors.push("Producto no encontrado");

  if (errors.length) {
    return renderStockPage(req, res, {
      state,
      moveValues,
      moveErrors: errors,
      adjustValues: { warehouseId: "", productId: "", delta: "" },
      flashMessages: { error: [FORM_ERROR_MESSAGE] },
    });
  }

  try {
    await Stock.move(fromWarehouseId, toWarehouseId, productId, qty);
    return res.redirect("/views/stock?success=stock_moved");
  } catch (err) {
    const key = mapStockErrorToQuery(err && err.code ? err.code : err && err.message === "stock insuficiente" ? "STOCK_INSUFFICIENT" : "");
    if (err && err.message === "stock insuficiente") {
      return renderStockPage(req, res, {
        state,
        moveValues,
        moveErrors: ["stock insuficiente"],
        flashMessages: { error: [FORM_ERROR_MESSAGE] },
      });
    }
    return res.redirect(`/views/stock?error=${key}`);
  }
});

module.exports = router;
