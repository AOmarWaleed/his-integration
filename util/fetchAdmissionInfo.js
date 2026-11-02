import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} AdmissionInfo
 * @property {Date} admit_date - Admission date
 * @property {Date} discharge_date - Clinical discharge date or estimated discharge date
 * @property {string} admission_mode - Admission mode
 * @property {string} outcome_code - Outcome code
 */

/**
 * Fetches admission information for a patient
 * @param {object} params - Parameters for fetching admission info
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Optional Oracle DB connection for query execution
 * @returns {Promise<Array<AdmissionInfo>>} Array of admission information
 */
export async function fetchAdmissionInfo({ patientId, episodeNo, oracleConnection }) {
    try {
        MEDICATION_LOGGER.debug('Fetching admission info' + JSON.stringify({ patientId, episodeNo }));

        const query = `
            SELECT pa.admit_date ADMIT_DATE,
                   NVL(pa.clinical_discharge_date, pa.est_discharge_date) DISCHARGE_DATE,
                   pa.admission_mode,
                   pa.outcome outcome_code
            FROM patient_ad pa
            WHERE pa.patient_id = :patientId 
                AND pa.episode_no = :episodeNo
        `;

        const result = await oracleConnection.execute(query, { patientId, episodeNo }, {
            outFormat: OracleDB.OUT_FORMAT_OBJECT
        });

        MEDICATION_LOGGER.debug('Fetched admission info' + JSON.stringify({ 
            patientId, 
            episodeNo, 
            count: result.rows.length 
        }));

        return result.rows;
    } catch (error) {
        MEDICATION_LOGGER.error('Error fetching admission info', error);
        return [];
    }
}