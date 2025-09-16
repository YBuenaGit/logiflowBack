const express = require("express");
const controller = require("../controllers/stock.controller");

const router = express.Router();

router.post("/adjust", controller.adjust);
router.post("/move", controller.move);
router.get("/", controller.list);

module.exports = router;

