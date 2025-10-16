const {
  getCollection,
  getNextSequence,
  unwrapFindAndModifyResult,
} = require("../db/mongo");

function collection() {
  return getCollection("stock");
}

async function findRecord(warehouseId, productId) {
  return collection().findOne({ warehouseId, productId });
}

async function getOrCreate(warehouseId, productId) {
  const existing = await findRecord(warehouseId, productId);
  if (existing) {
    return existing;
  }

  const record = {
    id: await getNextSequence("stock"),
    warehouseId,
    productId,
    qty: 0,
  };

  try {
    await collection().insertOne(record);
    return record;
  } catch (err) {
    if (err && err.code === 11000) {
      return findRecord(warehouseId, productId);
    }
    throw err;
  }
}

async function adjust(warehouseId, productId, delta) {
  await getOrCreate(warehouseId, productId);
  const filter = { warehouseId, productId };
  if (delta < 0) {
    filter.qty = { $gte: Math.abs(delta) };
  }
  const result = await collection().findOneAndUpdate(
    filter,
    { $inc: { qty: delta } },
    { returnDocument: "after" }
  );
  const doc = unwrapFindAndModifyResult(result);
  if (!doc) {
    const err = new Error("stock insuficiente");
    err.code = "STOCK_INSUFFICIENT";
    throw err;
  }
  return doc;
}

async function move(fromWarehouseId, toWarehouseId, productId, qty) {
  if (qty <= 0) {
    const err = new Error("qty invalido");
    err.code = "INVALID_QTY";
    throw err;
  }

  const from = await adjust(fromWarehouseId, productId, -qty);
  try {
    const to = await adjust(toWarehouseId, productId, qty);
    return { from, to };
  } catch (err) {
    await adjust(fromWarehouseId, productId, qty);
    throw err;
  }
}

async function list(filter = {}) {
  const query = {};
  if (Number.isFinite(filter.warehouseId)) {
    query.warehouseId = filter.warehouseId;
  }
  if (Number.isFinite(filter.productId)) {
    query.productId = filter.productId;
  }
  return collection().find(query).toArray();
}

module.exports = {
  findRecord,
  getOrCreate,
  adjust,
  move,
  list,
};
