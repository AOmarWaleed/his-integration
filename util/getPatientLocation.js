/**
 * Returns the current patient location given a visit ID in the form "AXXX" where A is attendance_type
 * and XXX is the visit ID
 *
 * @param {String} visitNo - e.g. "E1234567", "I234567", "O1234567"
 * @param {Object} dbConn - OracleDB connection to use for fetching visit details
 * @return {Object} return location object (entityId, entityName, entityShortName, roomNumber, roomName, bed)
 */
export async function getPatientLocation(visitNo, dbConn) {
  if (!visitNo) throw new Error("Missing visitNo");
  if (!dbConn) throw new Error("Missing dbConn");

  visitNo = String(visitNo);

  const attendanceType = visitNo.substring(0, 1);
  const visitId = visitNo.substring(1, visitNo.length);

  const location = {
    entityId: "",
    entityName: "",
    entityShortName: "",
    roomNumber: "",
    roomName: "",
    bed: "",
  };

  let query = "";
  const binds = { visitId };
  const options = {
    outFormat: OracleDB.OUT_FORMAT_OBJECT,
  };

  if (attendanceType === "I" || attendanceType === "D") {
    query = `
      SELECT bd.work_entity AS entity_id,
             wed.description AS entity_name,
             wed.short_name AS entity_short_name,
             bd.room_no AS room_number,
             rm.description AS room_name,
             bd.bed_location AS bed
      FROM patient_ad pa, 
           bed_details bd, 
           work_entities_data wed, 
           room_master rm
      WHERE pa.admission_no = bd.admission_no
      AND bd.work_entity = wed.work_entity
      AND bd.room_no = rm.room_no(+)
      AND bd.current_record = 'Y'
      AND pa.admission_no = :visitId
    `;
  } else if (attendanceType === "E") {
    query = `
      SELECT pev.work_entity AS entity_id,
             wed.description AS entity_name,
             wed.short_name AS entity_short_name,
             '' AS room_number,
             '' AS room_name,
             '' AS bed
      FROM patient_emergency_visit pev, 
           work_entities_data wed
      WHERE pev.work_entity = wed.work_entity
      AND pev.er_visit_id = :visitId
    `;
  } else if (attendanceType === "O") {
    query = `
      SELECT a.work_entity AS entity_id,
             wed.description AS entity_name,
             wed.short_name AS entity_short_name,
             '' AS room_number,
             '' AS room_name,
             '' AS bed
      FROM appointments a, 
           work_entities_data wed
      WHERE a.work_entity = wed.work_entity
      AND a.appointment_id = :visitId
    `;
  } else {
    throw new Error("Invalid attendance type: " + attendanceType);
  }

  try {
    const result = await dbConn.execute(query, binds, options);

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      location.entityId = row.ENTITY_ID || "";
      location.entityName = row.ENTITY_NAME || "";
      location.entityShortName = row.ENTITY_SHORT_NAME || "";
      location.roomNumber = row.ROOM_NUMBER || "";
      location.roomName = row.ROOM_NAME || "";
      location.bed = row.BED || "";
    } else {
      throw new Error("Invalid visitNo: " + visitNo);
    }
  } catch (error) {
    throw error;
  }

  return location;
}
