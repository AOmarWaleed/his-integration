import express from "express";
import registryRoutes from "./registryRoutes.js";
import ssoRoutes from "./ssoRoutes.js";
import queriesRoutes from "./queriesRoutes.js";
import adtRoutes from "./adtRoutes.js";
import medicationRoutes from "./medicationRoutes.js";
import docRoutes from "./docRoutes.js";
import dispenseRoutes from "./dispenseRoutes.js";
import { facilityAndConnection } from "../middleware/facilityAndConnection.js";
import { authenticateToken } from "../controllers/authenticateTokenController.js";
import { clientLogger } from "../config/logger.js";

// ! adt 
// {{NphiesCsURL}}/api/v1/hl7/adt?patientId=989665&messageType=A03_IP&episodeNo=5&startDate=2026-01-01&status=E&facilityId=2

// ! doc 
// {{NphiesCsURL_LIVE}}/api/v1/hl7/doc?patientId=982716&episodeNo=1&facilityId=1&docType=radiology-order&status=&startDate=2026-01-01

// ! medication-request
// {{NphiesCsURL}}/api/v1/hl7/medication-request?startDate=2000-01-01&facilityId=7&patientId=16075&episodeNo=3&orderLine=912960&status=DF


// ! medication-dispense
// {{NphiesCsURL_LIVE}}/api/v1/hl7/medication-dispense?patientId=16638&episodeNo=2&deliveryLine=739652&facilityId=7&startDate=2000-01-01&status=F



const app = express();


// call nohise atd
app.use("/adt", adtRoutes);

// Registry
app.use("/registry", registryRoutes);

// SSO
app.use("/sso", ssoRoutes);

// medication routes
// NPHIES_CS_MEDICATION_REQUEST_URL
app.use("/medication-request", facilityAndConnection, medicationRoutes);

// doc routes
app.use("/doc", facilityAndConnection, docRoutes);

// Dispense routes
// NPHIES_CS_MEDICATION_DISPENSE_URL
app.use("/medication-dispense", facilityAndConnection, dispenseRoutes);

// Cron control moved to the dedicated worker process.
app.get("/restart-jobs", async (req, res) => {
  try {
    res.status(409).json({
      success: false,
      message:
        "Cron jobs run in the dedicated worker process. Restart the worker process to reload jobs.",
    });
  } catch (error) {
    clientLogger.error("Error restarting jobs: " + error);
    res.status(500).json({ success: false, message: "fail to restart jobs" });
  }
});

app.use("/queries", authenticateToken , facilityAndConnection,queriesRoutes);


export default app;
