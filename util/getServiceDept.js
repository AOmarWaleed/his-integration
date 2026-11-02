import OracleDB from "oracledb";

/**
 * Finds service dept using work entity
 *
 * @param {String} workEntity - OASIS work Entity
 * @param {Object} dbConn - OracleDB connection to use
 * @return {String} return service dept
 */
export async function getServiceDept(workEntity, dbConn) {
  if (!workEntity) return "";
  if (!dbConn) throw new Error("Missing dbConn");

  const query = `
    /* Formatted on 8/28/2026 3:25:41 PM (QP5 v5.371) */
SELECT d.dept_type
  FROM work_entities_data  w
       JOIN service_dept_data d ON d.service_dept = w.clinic_service_dept
 WHERE work_entity = :p_work_entity 
  `;

  const binds = { p_work_entity: workEntity };
  const options = {
    outFormat: OracleDB.OUT_FORMAT_OBJECT,
  };

  try {
    const result = await dbConn.execute(query, binds, options);

    if (result.rows && result.rows.length > 0) {
      return result.rows[0].DEPT_TYPE || "";
    }
  } catch (error) {
    throw error;
  }

  return "";
}