const { db, nextId, commit } = require("../db/memory");

function findById(id) {
  return db.customers.find((c) => c.id === id);
}

function isEmailTaken(email, excludeId = null) {
  const target = email;
  return db.customers.some(
    (c) => c.deletedAt === null && c.email === target && (excludeId == null || c.id !== excludeId)
  );
}

function create({ name, email }) {
  const now = new Date().toISOString();
  const customer = {
    id: nextId("customers"),
    name,
    email,
    status: "active",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.customers.push(customer);
  commit();
  return customer;
}

function update(id, fields) {
  const customer = findById(id);
  if (!customer) return null;
  if (fields.name !== undefined) customer.name = fields.name;
  if (fields.email !== undefined) customer.email = fields.email;
  if (fields.status !== undefined) customer.status = fields.status;
  customer.updatedAt = new Date().toISOString();
  commit();
  return customer;
}

function softDelete(id) {
  const customer = findById(id);
  if (!customer) return null;
  const when = new Date().toISOString();
  customer.deletedAt = when;
  customer.status = "blocked";
  customer.updatedAt = when;
  commit();
  return { id: customer.id, deletedAt: when };
}

module.exports = {
  findById,
  isEmailTaken,
  create,
  update,
  softDelete,
};

