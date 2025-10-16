const {
  getCollection,
  getNextSequence,
  unwrapFindAndModifyResult,
} = require("../db/mongo");

function collection() {
  return getCollection("products");
}

async function findById(id) {
  return collection().findOne({ id });
}

async function isSkuTaken(sku, excludeId = null) {
  const filter = {
    sku,
    deletedAt: null,
  };
  if (excludeId != null) {
    filter.id = { $ne: excludeId };
  }
  const existing = await collection().findOne(filter);
  return Boolean(existing);
}

async function create({ sku, name, priceCents }) {
  const now = new Date().toISOString();
  const product = {
    id: await getNextSequence("products"),
    sku,
    name,
    priceCents,
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await collection().insertOne(product);
  return product;
}

async function update(id, fields) {
  const updates = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.priceCents !== undefined) updates.priceCents = fields.priceCents;
  if (fields.active !== undefined) updates.active = fields.active;
  if (Object.keys(updates).length === 0) {
    return findById(id);
  }
  updates.updatedAt = new Date().toISOString();
  const result = await collection().findOneAndUpdate(
    { id },
    { $set: updates },
    { returnDocument: "after" }
  );
  return unwrapFindAndModifyResult(result);
}

async function softDelete(id) {
  const when = new Date().toISOString();
  const result = await collection().findOneAndUpdate(
    { id },
    {
      $set: {
        deletedAt: when,
        active: false,
        updatedAt: when,
      },
    },
    { returnDocument: "after", projection: { id: 1, deletedAt: 1 } }
  );
  return unwrapFindAndModifyResult(result);
}

async function listActive({ q = "", skip = 0, limit = 20 } = {}) {
  const filter = { deletedAt: null };
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
    ];
  }
  const cursor = collection()
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const [items, total] = await Promise.all([
    cursor.toArray(),
    collection().countDocuments(filter),
  ]);
  return { items, total };
}

async function findActive() {
  return collection()
    .find({ deletedAt: null, active: true })
    .project({ id: 1, name: 1, sku: 1, priceCents: 1 })
    .toArray();
}

async function findByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  return collection()
    .find({ id: { $in: ids } })
    .toArray();
}

module.exports = {
  findById,
  isSkuTaken,
  create,
  update,
  softDelete,
  listActive,
  findActive,
  findByIds,
};
