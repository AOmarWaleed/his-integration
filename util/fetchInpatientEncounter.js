import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} InpatientEncounter
 * @property {Date} startDate - Admit date
 * @property {Date} endDate - Discharge date
 * @property {string} admissionMode - Admission mode
 * @property {string} outcomeCode - Outcome code
 */

/**
 * Fetches inpatient encounter data
 * @param {Object} params - Parameters
 * @param {Object} params.connection - Oracle database connection
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @returns {Promise<InpatientEncounter|null>} Inpatient encounter data
 */
export async function fetchInpatientEncounter({
  connection,
  patientId,
  episodeNo,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching inpatient encounter" + JSON.stringify({ patientId, episodeNo }),
    );

    const query = `
        SELECT pa.admit_date start_date
              ,NVL(pa.clinical_discharge_date, pa.est_discharge_date) end_date
              ,pa.admission_mode
              ,pa.outcome outcome_code
              ,pa.*
        FROM patient_ad pa
        WHERE pa.patient_id = :patientId 
          AND pa.episode_no = :episodeNo
    `;

    const result = await connection.execute(
      query,
      {
        patientId: {
          dir: OracleDB.BIND_IN,
          type: OracleDB.NUMBER,
          val: patientId,
        },
        episodeNo: {
          dir: OracleDB.BIND_IN,
          type: OracleDB.NUMBER,
          val: episodeNo,
        },
      },
      { outFormat: OracleDB.OUT_FORMAT_OBJECT },
    );

    if (result.rows.length === 0) {
      return null;
    }

    MEDICATION_LOGGER.debug(
      "Fetched inpatient encounter: " + JSON.stringify(result.rows[0]),
    );

    return result.rows[0] || null;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching inpatient encounter", error);
    return null;
  }
}
