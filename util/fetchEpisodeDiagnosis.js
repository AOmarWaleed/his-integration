import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} EpisodeDiagnosis
 * @property {number} patient_id - Patient ID
 * @property {number} episode_no - Episode number
 * @property {string} diagnosis_code - Diagnosis code
 * @property {string} icd_code - ICD code
 * @property {string} description - Diagnosis description
 * @property {string} final_diagnosis - Final diagnosis flag
 * @property {string} diag_type - Diagnosis type
 * @property {string} diagnosis_type_desc - Diagnosis type description (PRINCIPAL/ADDITIONAL)
 * @property {string} admit_flag - Admit flag
 * @property {Date} date_recorded - Date recorded
 */

/**
 * Fetches episode diagnosis information for a patient
 * @param {object} params - Parameters for fetching episode diagnosis
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Optional Oracle DB connection for query execution
 * @param {number|null} [params.patientDiagnosisId=null] - Optional patient diagnosis ID to filter results
 * @returns {Promise<Array<EpisodeDiagnosis>>} Array of episode diagnosis information
 */
export async function fetchEpisodeDiagnosis({ patientId, episodeNo, patientDiagnosisId = null, oracleConnection }) {
    try {
        MEDICATION_LOGGER.debug('Fetching episode diagnosis' + JSON.stringify({ patientId, episodeNo , patientDiagnosisId }));

        const query = `
            SELECT pdn.patient_id,
         pdn.episode_no,
         pdn.diag_code AS diagnosis_code,
         dc.hosp_code AS icd_code,
         dd.description,
         pdn.final_flag AS final_diagnosis,
         pdn.diag_type,
         CASE WHEN NVL (pdn.diag_type, 'P') = 'P' THEN 'PRINCIPAL' ELSE 'ADDITIONAL' END AS diagnosis_type_desc,
         pdn.admit_flag,
         pdn.date_recorded
    FROM patient_diagnosis_notes pdn
         JOIN patient_problem_master ppm
            ON     ppm.patient_problem_id = pdn.patient_problem_id
               AND ppm.end_date IS NULL
         JOIN diagnosis_codes dc ON pdn.diag_code = dc.diag_code
         LEFT JOIN diagnosis_desc dd
            ON     dd.diag_code = pdn.diag_code
               AND dd.language_id = 1
   WHERE     pdn.patient_id = :p_patient_id
         AND pdn.episode_no = :p_episode_no
         AND pdn.diagnosis_division = 1232
         AND NVL (pdn.status, 'x') NOT IN ('Q', 'E')
         AND ppm.currently_active_flag = 'Y'
         AND pdn.patient_diagnosis_id = NVL (:p_patient_diagnosis_id, pdn.patient_diagnosis_id)
ORDER BY NVL (pdn.final_flag, 'N') DESC, CASE WHEN NVL (pdn.diag_type, 'P') = 'P' THEN 1 WHEN pdn.diag_type = 'S' THEN 2 ELSE 2 END, pdn.date_recorded DESC
        `;

        const result = await oracleConnection.execute(query, { 
            p_patient_id: patientId, 
            p_episode_no: episodeNo,
            p_patient_diagnosis_id: patientDiagnosisId
        }, {
            outFormat: OracleDB.OUT_FORMAT_OBJECT
        });

        MEDICATION_LOGGER.debug('Fetched episode diagnosis (patientDiagnosisId=' + patientDiagnosisId + ')' + JSON.stringify({ 
            patientId, 
            episodeNo, 
            count: result.rows.length ,
            code  : result.rows[0]?.DIAGNOSIS_CODE || null,
            description : result.rows[0]?.DESCRIPTION || null,
            row : result.rows[0] || null
        }));

        return result.rows;
    } catch (error) {
        MEDICATION_LOGGER.error('Error fetching episode diagnosis', error);
        return [];
    }
}