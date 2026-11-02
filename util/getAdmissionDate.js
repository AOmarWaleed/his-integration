import OracleDB from "oracledb";

/**
 * Get visit start date/time
 *
 * @param {String} visitNo - visit number in the form (E123456) where E is attendance_type and 123456 is visit ID
 * @param {Object} dbConn - OracleDB connection to use
 * @return {String} admission date/time in the form (YYYYMMDDHH24MISS)
 */
export async function getAdmissionDate(visitNo, dbConn) {
  if (!visitNo || !dbConn) return "";

  visitNo = String(visitNo);

  const attendanceType = visitNo.substring(0, 1);
  const visitId = visitNo.substring(1, visitNo.length);

  let query = "";
  const binds = { visitId };
  const options = {
    outFormat: OracleDB.OUT_FORMAT_OBJECT,
  };

  if (attendanceType === "O") {
    query = `
      SELECT TO_CHAR(NVL(start_date, TO_DATE(a.julian_date, 'J')), 'YYYYMMDDHH24MISS') AS admission_date
      FROM appointments a
      WHERE a.appointment_id = :visitId
    `;
  } else if (attendanceType === "I" || attendanceType === "D") {
    query = `
      SELECT TO_CHAR(pa.admit_date, 'YYYYMMDDHH24MISS') AS admission_date
      FROM patient_ad pa
      WHERE pa.admission_no = :visitId
    `;
  } else if (attendanceType === "E") {
    query = `
      SELECT TO_CHAR(NVL(pev.time_treatment_started, pev.time_arrived), 'YYYYMMDDHH24MISS') AS admission_date
      FROM patient_emergency_visit pev
      WHERE pev.er_visit_id = :visitId
    `;
  } else {
    return "";
  }

  try {
    const result = await dbConn.execute(query, binds, options);

    if (result.rows && result.rows.length > 0) {
      return result.rows[0].ADMISSION_DATE || "";
    }
  } catch (error) {
    throw error;
  }

  return "";
}
