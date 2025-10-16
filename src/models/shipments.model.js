const { getCollection, getNextSequence } = require("../db/mongo");

function collection() {
  return getCollection("shipments");
}

async function findById(id) {
  return collection().findOne({ id });
}

async function create({ orderId, originWarehouseId, destination }) {
  const now = new Date().toISOString();
  const shipment = {
    id: await getNextSequence("shipments"),
    orderId,
    status: "created",
    origin: { warehouseId: originWarehouseId },
    destination,
    tracking: [{ ts: now, status: "created" }],
    createdAt: now,
    updatedAt: now,
  };
  await collection().insertOne(shipment);
  return shipment;
}

async function setStatusAndTrack(shipment, nextStatus, note) {
  const now = new Date().toISOString();
  const entry = { ts: now, status: nextStatus };
  if (note) {
    entry.note = String(note);
  }
  const result = await collection().findOneAndUpdate(
    { id: shipment.id },
    {
      $set: {
        status: nextStatus,
        updatedAt: now,
      },
      $push: { tracking: entry },
    },
    { returnDocument: "after" }
  );
  return result.value;
}

async function cancel(shipment) {
  const now = new Date().toISOString();
  const result = await collection().findOneAndUpdate(
    { id: shipment.id },
    {
      $set: {
        status: "cancelled",
        updatedAt: now,
      },
      $push: { tracking: { ts: now, status: "cancelled" } },
    },
    { returnDocument: "after" }
  );
  return result.value;
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

module.exports = {
  findById,
  create,
  setStatusAndTrack,
  cancel,
  list,
};
