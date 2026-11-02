import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} EpisodeVitalSign
 * @property {number} hight - Patient height
 * @property {number} weight - Patient weight
 * @property {number} temperature - Patient temperature
 * @property {number} high_blood_pressure - High blood pressure (systolic)
 * @property {number} low_blood_pressure - Low blood pressure (diastolic)
 * @property {number} pulse_rate - Pulse rate
 * @property {number} respiratory_rate - Respiratory rate
 * @property {number} oxygen_saturation - Oxygen saturation
 */

/**
 * Fetches the most recent vital signs for a patient episode
 * @param {object} params - Parameters for fetching episode vital signs
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Oracle DB connection for query execution
 * @returns {Promise<EpisodeVitalSign|null>} The most recent vital signs or null if not found
 */
export async function fetchEpisodeVitalSign({ patientId, episodeNo, oracleConnection }) {
    try {
        MEDICATION_LOGGER.debug('Fetching episode vital signs' + JSON.stringify({ patientId, episodeNo }));

        const query = `
            WITH r AS (
                SELECT * FROM patient_readings 
                WHERE patient_id = :patientId AND episode_no = :episodeNo
            )
            SELECT 
                (SELECT hight FROM (SELECT hight FROM r WHERE hight IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS hight,
                (SELECT weight FROM (SELECT weight FROM r WHERE weight IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS weight,
                (SELECT temperature FROM (SELECT temperature FROM r WHERE temperature IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS temperature,
                (SELECT high_blood_pressure FROM (SELECT high_blood_pressure FROM r WHERE high_blood_pressure IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS high_blood_pressure,
                (SELECT low_blood_pressure FROM (SELECT low_blood_pressure FROM r WHERE low_blood_pressure IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS low_blood_pressure,
                (SELECT pulse_rate FROM (SELECT pulse_rate FROM r WHERE pulse_rate IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS pulse_rate,
                (SELECT respiratory_rate FROM (SELECT respiratory_rate FROM r WHERE respiratory_rate IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS respiratory_rate,
                (SELECT oxygen_saturation FROM (SELECT oxygen_saturation FROM r WHERE oxygen_saturation IS NOT NULL ORDER BY reading_date DESC) WHERE ROWNUM = 1) AS oxygen_saturation
            FROM DUAL
        `;

        const result = await oracleConnection.execute(query, { 
            patientId, 
            episodeNo 
        }, {
            outFormat: OracleDB.OUT_FORMAT_OBJECT
        });

        MEDICATION_LOGGER.debug('Fetched episode vital signs' + JSON.stringify({ 
            patientId, 
            episodeNo, 
            found: result.rows.length > 0 
        }));

        // Return the first row (should only be one) or null if no data
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        MEDICATION_LOGGER.error('Error fetching episode vital signs', error);
        return null;
    }
}