import express from "express";
import {
  handleMedicationDispense,
} from "../controllers/dispenseController.js";

const router = express.Router();

router.get("/", handleMedicationDispense);

export default router;
