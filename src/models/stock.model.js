const { db, nextId, commit } = require("../db/memory");

function findRecord(warehouseId, productId) {
  return db.stock.find((s) => s.warehouseId === warehouseId && s.productId === productId);
}

function getOrCreate(warehouseId, productId) {
  let rec = findRecord(warehouseId, productId);
  if (!rec) {
    rec = { id: nextId("stock"), warehouseId, productId, qty: 0 };
    db.stock.push(rec);
    commit(); // mutation: new stock record
  }
  return rec;
}

function adjust(warehouseId, productId, delta) {
  const rec = getOrCreate(warehouseId, productId);
  const newQty = rec.qty + delta;
  if (newQty < 0) {
    const err = new Error("stock insuficiente");
    err.code = "STOCK_INSUFFICIENT";
    throw err;
  }
  rec.qty = newQty;
  commit(); // mutation: qty change
  return rec;
}

function move(fromWarehouseId, toWarehouseId, productId, qty) {
  const fromRec = getOrCreate(fromWarehouseId, productId);
  const toRec = getOrCreate(toWarehouseId, productId);
  if (fromRec.qty < qty) {
    const err = new Error("stock insuficiente");
    err.code = "STOCK_INSUFFICIENT";
    throw err;
  }
  fromRec.qty -= qty;
  commit(); // mutation: from decremented
  toRec.qty += qty;
  commit(); // mutation: to incremented
  return { from: fromRec, to: toRec };
}

function list(filter = {}) {
  const { warehouseId = null, productId = null } = filter;
  let items = db.stock.slice();
  if (Number.isFinite(warehouseId)) items = items.filter((s) => s.warehouseId === warehouseId);
  if (Number.isFinite(productId)) items = items.filter((s) => s.productId === productId);
  return items;
}

module.exports = {
  findRecord,
  getOrCreate,
  adjust,
  move,
  list,
};

