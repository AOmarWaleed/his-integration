import OracleDB from "oracledb";

/**
 * Get consultant responsibility code from patient_eligibility table for given patient, episode, work entity, attendance type, and consultant. Returns "1" if responsibility code cannot be found or on error.
 * This function checks for eligibility records that match the given parameters and have an eligibility_status that is not 'C' or 'S', and returns the responsibility code from the first matching record. This is used to determine if the consultant is responsible for the patient during the visit, which can affect how they are represented in the PV1 segment.
 * @param {String} patientId - patient ID
 * @param {String} episodeNo - episode number
 * @param {String} workEntity - OASIS work entity ID
 * @param {String} attendanceType - attendance type (e.g. "I", "O", "E")
 * @param {String} consultantId - staff ID of the consultant
 * @param {Object} dbConn - OracleDB connection to use for fetching eligibility details
 * @return {String} responsibility code for the consultant (e.g. "1") or "1" if not found or on error
 */
export const getConsultantResponsibility = async (
  patientId,
  episodeNo,
  workEntity,
  attendanceType,
  consultantId,
  dbConn,
) => {
  if (!episodeNo || !patientId || !consultantId) return "1";

  const query = `
    SELECT pe.responsibility
    FROM patient_eligibility pe
    WHERE pe.patient_id = :patientId
    AND pe.episode_no = :episodeNo
    AND pe.eligibility_work_entity = :workEntity
    AND pe.consultant_id = :consultantId
    AND pe.attendance_type = :attendanceType
    AND pe.eligibility_status NOT IN ('C','S')
  `;

  const binds = {
    patientId,
    episodeNo,
    workEntity,
    consultantId,
    attendanceType,
  };
  const options = { outFormat: OracleDB.OUT_FORMAT_OBJECT };

  try {
    const result = await dbConn.execute(query, binds, options);

    if (result.rows && result.rows.length > 0) {
      return result.rows[0].RESPONSIBILITY || "1";
    }
  } catch (error) {
    console.error("Error getting consultant responsibility:", error);
  }

  return "1";
};
