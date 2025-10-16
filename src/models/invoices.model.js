const {
  getCollection,
  getNextSequence,
  unwrapFindAndModifyResult,
} = require("../db/mongo");

function collection() {
  return getCollection("invoices");
}

async function findById(id) {
  return collection().findOne({ id });
}

async function create({ orderId, customerId, amountCents }) {
  const now = new Date().toISOString();
  const invoice = {
    id: await getNextSequence("invoices"),
    orderId,
    customerId,
    amountCents,
    status: "issued",
    createdAt: now,
    updatedAt: now,
  };
  await collection().insertOne(invoice);
  return invoice;
}

async function setStatus(invoice, status) {
  const result = await collection().findOneAndUpdate(
    { id: invoice.id },
    {
      $set: {
        status,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" }
  );
  return unwrapFindAndModifyResult(result);
}

async function list({ filter = {}, skip = 0, limit = 20, sort = { createdAt: -1 } } = {}) {
  const cursor = collection()
    .find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit);
  const [items, total] = await Promise.all([
    cursor.toArray(),
    collection().countDocuments(filter),
  ]);
  return { items, total };
}

async function findByOrderId(orderId) {
  return collection().findOne({ orderId });
}

module.exports = {
  findById,
  create,
  setStatus,
  list,
  findByOrderId,
};
