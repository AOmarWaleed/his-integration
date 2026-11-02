import express from "express";
import {
    handleEpisodeDiagnosis,
    handleAdmissionInfo,
    handleEpisodeVitalSign,
    handleChiefComplaints,
    handleEpisodeMainSymptoms,
    handleClinicalData,
} from "../controllers/queriesController.js";

const router = express.Router();


router.get("/episode-diagnosis", handleEpisodeDiagnosis);
router.get("/admission-info", handleAdmissionInfo);
router.get("/episode-vital-sign", handleEpisodeVitalSign);
router.get("/chief-complaints", handleChiefComplaints);
router.get("/episode-main-symptoms", handleEpisodeMainSymptoms);
router.get("/clinical-data", handleClinicalData);

export default router;
