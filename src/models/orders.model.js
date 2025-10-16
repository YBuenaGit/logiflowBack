const {
  getCollection,
  getNextSequence,
  unwrapFindAndModifyResult,
} = require("../db/mongo");

function collection() {
  return getCollection("orders");
}

async function findById(id) {
  return collection().findOne({ id });
}

async function create({ customerId, warehouseId, items, totalCents }) {
  const now = new Date().toISOString();
  const order = {
    id: await getNextSequence("orders"),
    customerId,
    warehouseId,
    items,
    status: "allocated",
    totalCents,
    createdAt: now,
    updatedAt: now,
  };
  await collection().insertOne(order);
  return order;
}

async function updateItemsAndTotal(order, newItems, newTotalCents) {
  const result = await collection().findOneAndUpdate(
    { id: order.id },
    {
      $set: {
        items: newItems,
        totalCents: newTotalCents,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" }
  );
  return unwrapFindAndModifyResult(result);
}

async function setStatus(order, status) {
  const result = await collection().findOneAndUpdate(
    { id: order.id },
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

async function findByCustomerId(customerId) {
  return collection().find({ customerId }).toArray();
}

async function hasActiveOrders(customerId) {
  const activeStatuses = ["allocated", "shipped"];
  const existing = await collection().findOne({
    customerId,
    status: { $in: activeStatuses },
  });
  return Boolean(existing);
}

module.exports = {
  findById,
  create,
  updateItemsAndTotal,
  setStatus,
  list,
  findByCustomerId,
  hasActiveOrders,
};
