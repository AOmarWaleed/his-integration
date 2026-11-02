import OracleDB from "oracledb";

/**
 * Retrieves visit data for a patient from the database
 * @param {Object} patientData - The patient data object containing the patient ID
 * @param {Object} connection - The OracleDB connection object
 * @param {number} [episodeNo] - The optional episode number to filter the visit data
 * @returns {Object} The visit data for the patient
 */
export async function getVisitData(patientData, connection, episodeNo) {
  let data;

  if (episodeNo) {
    const {
      rows: [visitData],
    } = await connection.execute(
      `SELECT
            pe.episode_no AS visit_no,
            pg.attendance_type,
            pe.start_date,
            pg.*
          FROM patient_episodes pe
          JOIN oasis.patient_eligibility pg
            ON pg.patient_id = pe.patient_id AND pg.episode_no = pe.episode_no
          WHERE pe.patient_id = :id
          and pe.episode_no = :episode_no
          ORDER BY pe.start_date DESC`,
      [patientData.patient_id, episodeNo],
      { outFormat:  OracleDB.OUT_FORMAT_OBJECT },
    );

    data = visitData;
  } else {
    const {
      rows: [visitData],
    } = await connection.execute(
      `SELECT
            pe.episode_no AS visit_no,
            pg.attendance_type,
            pe.start_date,
            pg.*
          FROM patient_episodes pe
          JOIN oasis.patient_eligibility pg
            ON pg.patient_id = pe.patient_id AND pg.episode_no = pe.episode_no
          WHERE pe.patient_id = :id
          ORDER BY pe.start_date DESC`,
      [patientData.patient_id],
      { outFormat: OracleDB.OUT_FORMAT_OBJECT },
    );
    data = visitData;
  }

  return data;
}