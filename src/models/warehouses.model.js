const {
  getCollection,
  getNextSequence,
  unwrapFindAndModifyResult,
} = require("../db/mongo");

function collection() {
  return getCollection("warehouses");
}

async function findById(id) {
  return collection().findOne({ id });
}

async function create({ name, city }) {
  const now = new Date().toISOString();
  const warehouse = {
    id: await getNextSequence("warehouses"),
    name,
    city,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await collection().insertOne(warehouse);
  return warehouse;
}

async function update(id, fields) {
  const updates = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.city !== undefined) updates.city = fields.city;
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
      { city: { $regex: q, $options: "i" } },
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
    .find({ deletedAt: null })
    .project({ id: 1, name: 1, city: 1 })
    .toArray();
}

module.exports = {
  findById,
  create,
  update,
  softDelete,
  listActive,
  findActive,
};
