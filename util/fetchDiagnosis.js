import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} Diagnosis
 * @property {string} DIAG_CODE - Diagnosis code
 * @property {string} DESCRIPTION - Diagnosis description
 * @property {string} CODE_TYPE - Code type (principal/secondary)
 */

/**
 * Fetches diagnoses for a patient
 * @param {object} params
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Oracle DB connection
 * @returns {Promise<Array<Diagnosis>>} Array of diagnosis objects
 */
export async function fetchDiagnosis({
  patientId,
  episodeNo,
  oracleConnection,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching diagnoses" + JSON.stringify({ patientId, episodeNo }),
    );

    const query = `
    /* Formatted on 8/15/2026 1:38:41 PM (QP5 v5.227.12220.39754) */
  SELECT diag_code,
         description,
         code_type,
         date_recorded,
         start_date,
         end_date
    FROM (  SELECT dc.hosp_code diag_code,
                   dd.description,
                   DECODE (NVL (pdn.diag_type, 'P'),  'P', 'principal',  'S', 'secondary',  'principal') AS code_type,
                   NVL (pdn.final_flag, 'N') AS final_flag,
                   MIN (pdn.date_recorded) date_recorded,
                   MIN (ppm.start_date) start_date,
                   MAX (ppm.end_date) end_date
              FROM patient_diagnosis_notes pdn
                   JOIN patient_problem_master ppm
                      ON     ppm.patient_problem_id = pdn.patient_problem_id
                         AND ppm.end_date IS NULL
                   JOIN diagnosis_codes dc ON pdn.diag_code = dc.diag_code
                   JOIN diagnosis_desc dd
                      ON     dd.diag_code = dc.diag_code
                         AND dd.language_id = 1
             WHERE     pdn.patient_id = :patientId
                   AND pdn.episode_no = :episodeNo
                   AND pdn.patient_diagnosis_id = NVL (:patientDiagnosisId, pdn.patient_diagnosis_id)
                   AND pdn.diagnosis_division = 1232
                   AND NVL (pdn.status, 'x') NOT IN ('Q', 'E')
          GROUP BY dc.hosp_code,
                   dd.description,
                   DECODE (NVL (pdn.diag_type, 'P'),  'P', 'principal',  'S', 'secondary',  'principal'),
                   NVL (pdn.final_flag, 'N'))
ORDER BY final_flag DESC, CASE code_type WHEN 'principal' THEN 1 WHEN 'secondary' THEN 2 ELSE 3 END, date_recorded DESC
  `;

    const result = await oracleConnection.execute(
      query,
      {
        patientId,
        episodeNo,
        patientDiagnosisId: null, //todo walid to get cause for medication request
      },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    MEDICATION_LOGGER.debug(
      "Fetched diagnoses" +
        JSON.stringify({ patientId, episodeNo, count: result.rows.length }),
    );

    return result.rows;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching diagnoses", error);
    return [];
  }

}
