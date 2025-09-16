const express = require("express");
const controller = require("../controllers/shipments.controller");

const router = express.Router();

router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id/status", controller.patchStatus);
router.delete("/:id", controller.remove);

module.exports = router;

