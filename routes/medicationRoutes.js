import express from "express";
import {
  handleMedicationPrescription,
} from "../controllers/medicationController.js";

const router = express.Router();

router.get("/", handleMedicationPrescription);

export default router;
