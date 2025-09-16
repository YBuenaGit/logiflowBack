const { db, nextId, commit } = require("../db/memory");

function findById(id) {
  return db.warehouses.find((w) => w.id === id);
}

function create({ name, city }) {
  const now = new Date().toISOString();
  const warehouse = {
    id: nextId("warehouses"),
    name,
    city,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.warehouses.push(warehouse);
  commit();
  return warehouse;
}

function update(id, fields) {
  const warehouse = findById(id);
  if (!warehouse) return null;
  if (fields.name !== undefined) warehouse.name = fields.name;
  if (fields.city !== undefined) warehouse.city = fields.city;
  warehouse.updatedAt = new Date().toISOString();
  commit();
  return warehouse;
}

function softDelete(id) {
  const warehouse = findById(id);
  if (!warehouse) return null;
  const when = new Date().toISOString();
  warehouse.deletedAt = when;
  warehouse.updatedAt = when;
  commit();
  return { id: warehouse.id, deletedAt: when };
}

module.exports = {
  findById,
  create,
  update,
  softDelete,
};

