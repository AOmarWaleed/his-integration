import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * Fetches episode main symptoms for a patient episode.
 * Tries the dedicated table first, then falls back to diagnosis notes if needed.
 *
 * @param {object} params - Parameters for fetching episode main symptoms
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {object} params.oracleConnection - Oracle DB connection for query execution
 * @returns {Promise<Array<object>>} Array of symptom rows
 */
export async function fetchEpisodeMainSymptoms({ patientId, episodeNo, oracleConnection }) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching episode main symptoms" + JSON.stringify({ patientId, episodeNo }),
    );

    const candidateQueries = [
      {
        name: "episode_main_symptoms",
        sql: `
          SELECT *
          FROM episode_main_symptoms
          WHERE patient_id = :patientId
            AND episode_no = :episodeNo
        `,
      },
      {
        name: "patient_diagnosis_notes",
        sql: `
          SELECT pdn.diagnosis_note AS symptom_description,
                 pdn.patient_id,
                 pdn.episode_no,
                 pdn.diagnosis_division,
                 pdn.status
          FROM patient_diagnosis_notes pdn
          WHERE pdn.patient_id = :patientId
            AND pdn.episode_no = :episodeNo
            AND NVL(pdn.status, 'x') <> 'Q'
        `,
      },
    ];

    for (const candidate of candidateQueries) {
      try {
        const result = await oracleConnection.execute(
          candidate.sql,
          { patientId, episodeNo },
          {
            outFormat: OracleDB.OUT_FORMAT_OBJECT,
          },
        );

        MEDICATION_LOGGER.debug(
          "Fetched episode main symptoms" +
            JSON.stringify({ patientId, episodeNo, source: candidate.name, count: result.rows.length }),
        );

        return result.rows || [];
      } catch (error) {
        MEDICATION_LOGGER.debug(
          `Query source ${candidate.name} fail for episode main symptoms` +
            JSON.stringify({ patientId, episodeNo, error: error.message }),
        );
      }
    }

    return [];
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching episode main symptoms", error);
    return [];
  }
}
