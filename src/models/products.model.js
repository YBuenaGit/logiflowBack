const { db, nextId, commit } = require("../db/memory");

function findById(id) {
  return db.products.find((p) => p.id === id);
}

function isSkuTaken(sku, excludeId = null) {
  const target = sku;
  return db.products.some(
    (p) => p.deletedAt === null && p.sku === target && (excludeId == null || p.id !== excludeId)
  );
}

function create({ sku, name, priceCents }) {
  const now = new Date().toISOString();
  const product = {
    id: nextId("products"),
    sku,
    name,
    priceCents,
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.products.push(product);
  commit();
  return product;
}

function update(id, fields) {
  const product = findById(id);
  if (!product) return null;
  if (fields.name !== undefined) product.name = fields.name;
  if (fields.priceCents !== undefined) product.priceCents = fields.priceCents;
  if (fields.active !== undefined) product.active = fields.active;
  product.updatedAt = new Date().toISOString();
  commit();
  return product;
}

function softDelete(id) {
  const product = findById(id);
  if (!product) return null;
  const when = new Date().toISOString();
  product.deletedAt = when;
  product.active = false;
  product.updatedAt = when;
  commit();
  return { id: product.id, deletedAt: when };
}

module.exports = {
  findById,
  isSkuTaken,
  create,
  update,
  softDelete,
};

