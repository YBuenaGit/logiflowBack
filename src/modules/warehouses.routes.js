const express = require("express");
const controller = require("../controllers/warehouses.controller");

const router = express.Router();

router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id", controller.patch);
router.delete("/:id", controller.remove);

module.exports = router;
