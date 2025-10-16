const {
  getCollection,
  getNextSequence,
  unwrapFindAndModifyResult,
} = require("../db/mongo");

function collection() {
  return getCollection("customers");
}

async function findById(id) {
  return collection().findOne({ id });
}

async function isEmailTaken(email, excludeId = null) {
  const filter = {
    email,
    deletedAt: null,
  };
  if (excludeId != null) {
    filter.id = { $ne: excludeId };
  }
  const existing = await collection().findOne(filter);
  return Boolean(existing);
}

async function create({ name, email }) {
  const now = new Date().toISOString();
  const customer = {
    id: await getNextSequence("customers"),
    name,
    email,
    status: "active",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await collection().insertOne(customer);
  return customer;
}

async function update(id, fields) {
  const updates = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.email !== undefined) updates.email = fields.email;
  if (fields.status !== undefined) updates.status = fields.status;
  if (Object.keys(updates).length === 0) {
    const current = await findById(id);
    return current;
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
        status: "blocked",
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
    filter.name = { $regex: q, $options: "i" };
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
    .project({ id: 1, name: 1, email: 1, status: 1 })
    .toArray();
}

module.exports = {
  findById,
  isEmailTaken,
  create,
  update,
  softDelete,
  listActive,
  findActive,
};
