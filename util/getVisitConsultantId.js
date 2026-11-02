import OracleDB from "oracledb";


/**
 * Get visit consultant id
 *
 * @param {String} visitNo - visit number in the form (E123456) where E is attendance_type and 123456 is visit ID
 * @param {Object} dbConn - OracleDB connection to use
 * @return {String} Visit Consultant ID
 */
export async function getVisitConsultantId(visitNo, dbConn) {
  if (!visitNo || !dbConn) return "";

  visitNo = String(visitNo);

  const attendanceType = visitNo.substring(0, 1);
  const visitId = visitNo.substring(1, visitNo.length);

  clientLogger.info(
    `Getting consultant ID for visitNo: ${visitNo} and visitId: ${visitId} , attendanceType: ${attendanceType}`,
  );

  let query = "";
  let binds = {};
  const options = {
    outFormat: OracleDB.OUT_FORMAT_OBJECT,
  };

  if (attendanceType === "O") {
    query = `
      SELECT consultant
      FROM appointments a
      WHERE a.appointment_id = :visitId
    `;
    binds = { visitId };
  } else if (attendanceType === "I" || attendanceType === "D") {
    query = `
      SELECT pe.consultant_id AS consultant_id
      FROM patient_ad pa,
           patient_eligibility pe
      WHERE pa.admission_no = :visitId
      AND pe.patient_id = pa.patient_id
      AND pe.episode_no = pa.episode_no
      AND pe.eligibility_status NOT IN ('C','S')
      AND pe.responsibility = '1'
      AND TRUNC(SYSDATE) BETWEEN TRUNC(pe.eligibility_start) AND TRUNC(NVL(pe.eligibility_end, SYSDATE))
    `;
    binds = { visitId };
  } else if (attendanceType === "E") {
    query = `
      SELECT eps.staff_id
      FROM patient_emergency_visit pev,
           er_pat_staff eps
      WHERE pev.er_visit_id = :visitId
      AND eps.er_visit_id = pev.er_visit_id
      AND pev.er_status != 'N'
    `;
    binds = { visitId };
  } else {
    return "";
  }

  try {
    const result = await dbConn.execute(query, binds, options);

    clientLogger.info(
      `getVisitConsultantId - Query executed for visitNo: ${visitNo}, Result: ${result.rows.length} rows found and consultant ID: ${result.rows[0] ? result.rows[0].CONSULTANT_ID || result.rows[0].CONSULTANT || result.rows[0].STAFF_ID : "''"}`,
    );

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return row.CONSULTANT_ID || row.CONSULTANT || row.STAFF_ID || "";
    }
  } catch (error) {
    throw error;
  }

  return "";
}