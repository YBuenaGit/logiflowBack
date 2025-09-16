const { db, nextId, commit } = require("../db/memory");

function findById(id) {
  return db.shipments.find((s) => s.id === id);
}

function create({ orderId, originWarehouseId, destination }) {
  const now = new Date().toISOString();
  const shipment = {
    id: nextId("shipments"),
    orderId,
    status: "created",
    origin: { warehouseId: originWarehouseId },
    destination,
    tracking: [{ ts: now, status: "created" }],
    createdAt: now,
    updatedAt: now,
  };
  db.shipments.push(shipment);
  commit();
  return shipment;
}

function setStatusAndTrack(shipment, nextStatus, note) {
  const now = new Date().toISOString();
  shipment.status = nextStatus;
  const entry = { ts: now, status: nextStatus };
  if (note) entry.note = String(note);
  shipment.tracking.push(entry);
  shipment.updatedAt = now;
  commit();
  return shipment;
}

function cancel(shipment) {
  const now = new Date().toISOString();
  shipment.status = "cancelled";
  shipment.tracking.push({ ts: now, status: "cancelled" });
  shipment.updatedAt = now;
  commit();
  return shipment;
}

module.exports = {
  findById,
  create,
  setStatusAndTrack,
  cancel,
};

