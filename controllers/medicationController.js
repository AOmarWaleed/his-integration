import { MEDICATION_LOGGER } from "../config/logger.js";
import { validatePrescription } from "../validation/medicationValidation.js";
import { medicationPrescriptionToNPHIES } from "../services/medication/medicationMain.js";

/**
 * Export prescription to NPHIES bundle
 * as end point the patient id is required and just send the first row
 * Query params: patientId (required), episodeNo (optional)
 */
export const handleMedicationPrescription = async (req, res, next) => {
  const requestUrl = `${req.originalUrl}`;
  MEDICATION_LOGGER.info(
    `Received request for medication prescription export: ${requestUrl}`,
  );
  try {
    const validation = validatePrescription(req.query);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: {
          description: validation.errors.join(", "),
          msgId: -10002,
        },
      });
    }

    MEDICATION_LOGGER.info(
      `Exporting prescriptions: patientId=${validation.value.patientId || "all"}, episodeNo=${validation.value.episodeNo || "all"}, facilityId=${validation.value.facilityId || "''"}`,
    );

    const facility = req.facility;
    const connection = req.oracleConnection;

    const result = await medicationPrescriptionToNPHIES(connection, {
      startDate: validation.value.startDate || null,
      endDate: validation.value.endDate || null,
      patientId: validation.value.patientId || null,
      episodeNo: validation.value.episodeNo || null,
      status: validation.value.status || null,
      orderLine: validation.value.orderLine || null,

      requestUrl,
      facility: facility,
    });
    // api_trans_id

    const isAllSuccess = result.failedCount === 0;
    const description = `${result.message}${result.exportedBundles?.length > 0 ? `\nSuccess transactions id (${result.exportedBundles.map((b) => b.api_trans_id).join(", ")})` : ""}${result.failedRequests?.length > 0 ? `\nFailed transactions id (${result.failedRequests.map((b) => b.api_trans_id + " : " + b.message).join(", ")})` : ""}`;

    MEDICATION_LOGGER.info(
      `Medication prescription export result: success=${isAllSuccess}, description=${description}`,
    );

    if (!isAllSuccess) {
      return res.status(200).json({
        success: false,
        data: {
          description: ( description?.length > 100 ? (description?.split(' ' , 30).join(' ') + '...') : description) || "fail to export medication prescriptions",
          msgId: -10003,
        },
        // details : result
      });
    }
    res.json({
      success: true,
      data: {
        // result,
        msgId: 10001,
        description:
          description || "Medication prescriptions exported successfully",
      },
      // details: result
    });
  } catch (error) {
    // console.log(error);

    MEDICATION_LOGGER.error(
      `Error exporting prescription bundle: ${error.message}`,
    );
    res.status(500).json({
      success: false,
      data: {
        description:
          error.message ||
          "An error occurred while exporting medication prescriptions",
        msgId: -10002,
      },
      details: {
        error: error.message,
        stack: error.stack,
      },
    });
  } finally {
    if (req.oracleConnection) {
      try {
        await req.oracleConnection.close();
      } catch (err) {
        MEDICATION_LOGGER.error("Error closing connection:", err);
      }
    }
  }
};
