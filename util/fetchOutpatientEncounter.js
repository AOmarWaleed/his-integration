import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} OutpatientEncounter
 * @property {Date} startDate - Eligibility start / time seen
 * @property {Date} endDate - Eligibility end
 */

/**
 * Fetches outpatient encounter data
 * @param {Object} params - Parameters
 * @param {Object} params.connection - Oracle database connection
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @returns {Promise<OutpatientEncounter|null>} Outpatient encounter data
 */
export async function fetchOutpatientEncounter({
  connection,
  patientId,
  episodeNo,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching outpatient encounter" +
        JSON.stringify({ patientId, episodeNo }),
    );

    const query = `
        SELECT NVL(pe.eligibility_start, a.time_seen) start_date
              ,pe.eligibility_end end_date
                ,pe.*
        FROM patient_eligibility pe
        LEFT OUTER JOIN appointments a ON pe.patient_id = a.patient_id 
            AND pe.episode_no = a.episode_no
        WHERE pe.patient_id = :patientId 
          AND pe.episode_no = :episodeNo 
          AND pe.responsibility = 1 
          AND pe.eligibility_status != 'C'
        ORDER BY start_date
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

    MEDICATION_LOGGER.debug(
      "Fetched outpatient encounter: " + JSON.stringify(result.rows[0]),
    );

    return result.rows[0] || null;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching outpatient encounter", error);
    return null;
  }
}
