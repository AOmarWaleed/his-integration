import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} ChiefComplaint
 * @property {string} chief_complaint - Chief complaint description
 * @property {Date} start_date - Start date of the chief complaint
 * @property {Date} end_date - End date of the chief complaint
 */

/**
 * Fetches chief complaints descriptions
 * @param {object} params - Parameters for fetching chief complaints
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Optional Oracle DB connection for query execution
 * @returns {Promise<Array<ChiefComplaint>>} Array of chief complaint descriptions
 */
export async function fetchChiefComplaints({ patientId, episodeNo, oracleConnection }) {
    try {
        MEDICATION_LOGGER.debug('Fetching chief complaints' + JSON.stringify({ patientId, episodeNo }));

        const query = `
            SELECT pm.description chief_complaint, pm.start_date, pm.end_date
            FROM patient_problem_master pm
            WHERE pm.patient_id = :patientId 
                AND pm.episode_no = :episodeNo
        `;

        const result = await oracleConnection.execute(query, { patientId, episodeNo }, {
            outFormat: OracleDB.OUT_FORMAT_OBJECT
        });

        MEDICATION_LOGGER.debug('Fetched chief complaints' + JSON.stringify({ patientId, episodeNo, count: result.rows.length }));

        return result.rows;
    } catch (error) {
        MEDICATION_LOGGER.error('Error fetching chief complaints', error);
        return [];
    }
}
