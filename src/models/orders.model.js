const { db, nextId, commit } = require("../db/memory");

function findById(id) {
  return db.orders.find((o) => o.id === id);
}

function create({ customerId, warehouseId, items, totalCents }) {
  const now = new Date().toISOString();
  const order = {
    id: nextId("orders"),
    customerId,
    warehouseId,
    items,
    status: "allocated",
    totalCents,
    createdAt: now,
    updatedAt: now,
  };
  db.orders.push(order);
  commit();
  return order;
}

function updateItemsAndTotal(order, newItems, newTotalCents) {
  order.items = newItems;
  order.totalCents = newTotalCents;
  order.updatedAt = new Date().toISOString();
  commit();
  return order;
}

function setStatus(order, status) {
  order.status = status;
  order.updatedAt = new Date().toISOString();
  commit();
  return order;
}

module.exports = {
  findById,
  create,
  updateItemsAndTotal,
  setStatus,
};

