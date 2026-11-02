import express from "express";
import {
docOrderRequestControllers  ,
} from "../controllers/docController.js";

const router = express.Router();

router.get("/", docOrderRequestControllers);

export default router;
