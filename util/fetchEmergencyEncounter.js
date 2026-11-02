import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} EmergencyEncounter
 * @property {Date} startDate - Arrival time
 * @property {Date} endDate - End date
 * @property {string} referredType - Referred type
 * @property {string} outcomeCode - Outcome code
 * @property {string} priorityLabel - Priority label
 * @property {Date} timeTriaged - Triage time
 */

/**
 * Fetches emergency encounter data
 * @param {Object} params - Parameters
 * @param {Object} params.connection - Oracle database connection
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @returns {Promise<EmergencyEncounter|null>} Emergency encounter data
 */
export async function fetchEmergencyEncounter({
  connection,
  patientId,
  episodeNo,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching emergency encounter" + JSON.stringify({ patientId, episodeNo }),
    );

    const query = `
        SELECT pev.time_arrived start_date
              ,CASE WHEN pe.end_date < TRUNC(SYSDATE) THEN pe.end_date ELSE NULL END end_date
              ,pev.referred_type
              ,pev.outcome_code
              ,DECODE(pr.priority_label, 1, 'IR', 2, 'VU', 3, 'U', 4, 'SER', 'NU') priority_label
              ,NVL(pev.time_triaged, pev.time_arrived) time_triaged
              ,pev.*
        FROM patient_emergency_visit pev
        JOIN patient_episodes pe ON pev.patient_id = pe.patient_id 
            AND pev.episode_no = pe.episode_no
        JOIN er_priorities pr ON pr.priority = pev.priority
        WHERE pev.patient_id = :patientId 
          AND pev.episode_no = :episodeNo
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
      "Fetched emergency encounter: " + JSON.stringify(result.rows[0]),
    );

    return result.rows[0] || null;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching emergency encounter", error);
    return null;
  }
}
