const { db, nextId, commit } = require("../db/memory");

function findById(id) {
  return db.invoices.find((i) => i.id === id);
}

function create({ orderId, customerId, amountCents }) {
  const now = new Date().toISOString();
  const invoice = {
    id: nextId("invoices"),
    orderId,
    customerId,
    amountCents,
    status: "issued",
    createdAt: now,
    updatedAt: now,
  };
  db.invoices.push(invoice);
  commit();
  return invoice;
}

function setStatus(invoice, status) {
  invoice.status = status;
  invoice.updatedAt = new Date().toISOString();
  commit();
  return invoice;
}

module.exports = {
  findById,
  create,
  setStatus,
};

