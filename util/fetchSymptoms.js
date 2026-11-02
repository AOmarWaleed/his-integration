import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} Symptom
 * @property {string} DIAGNOSIS_NOTE - Symptom/diagnosis note
 */

/**
 * Fetches symptoms (chief complaints) for a patient
 * @param {object} params - Parameters for fetching symptoms
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Optional Oracle DB connection for query execution
 * @returns {Promise<Array<Symptom>>} Array of symptom notes
 */
export async function fetchSymptoms({
  patientId,
  episodeNo,
  oracleConnection,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching symptoms" + JSON.stringify({ patientId, episodeNo }),
    );

    const query = `
        SELECT pdn.diagnosis_note
        FROM patient_diagnosis_notes pdn
        WHERE 1 = 1 
            AND pdn.patient_id = :patientId 
            AND pdn.episode_no = :episodeNo 
            AND pdn.diagnosis_division = 1233 
            AND NVL(pdn.status, 'x') <> 'Q'
    `;

    const result = await oracleConnection.execute(
      query,
      { patientId, episodeNo },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    MEDICATION_LOGGER.req_creation_datedebug(
      "Fetched symptoms" +
        JSON.stringify({ patientId, episodeNo, count: result.rows.length }),
    );

    return result.rows;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching symptoms", error);
    return [];
  }
}
