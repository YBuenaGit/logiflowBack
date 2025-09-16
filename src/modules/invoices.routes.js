const express = require("express");
const controller = require("../controllers/invoices.controller");

const router = express.Router();

router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id", controller.patch);

module.exports = router;

