import { getExtCode } from "./getExtCode.js";
import { getServiceDept } from "./getServiceDept.js";

/**
 * Get hospital service code for PV1.10 based on work entity with fallback to service dept or empty string if not found. This function first retrieves the service department for the given work entity, then looks up the corresponding hospital service code from the mapping table using the service department. If no code is found for the service department, it attempts to look up the code using the work entity itself. If still not found, it returns an empty string.
 * @param {String} workEntity - OASIS work entity ID
 * @param {Object} dbConn - OracleDB connection to use for fetching service department and hospital service code
 * @return {Object} An object containing the hospital service code and department type:
 *   - hospitalService: {String} hospital service code for PV1.10 based on work entity or empty string if not found
 *   - deptType: {String} service department type for the given work entity
 */
export const getHospitalService = async (workEntity, dbConn) => {
  let deptType = await getServiceDept(workEntity, dbConn);
  let results = await getExtCode({
    oasis_code: deptType, 
    mapping_type: "DEPT_TYPE",
    source: "NPHIES CLINICAL",
    ext_type: "FACILITY UNITS AND DEPARTMENTS",
    dbConn,
  });
  let pv1_10_code = results.ext_code;

  if (!pv1_10_code) {
    const results = await getExtCode({
      oasis_code: workEntity,
      mapping_type: "WARD",
      source: "NPHIES CLINICAL",
      ext_type: "FACILITY UNITS AND DEPARTMENTS",
      dbConn,
    });
    pv1_10_code = results.ext_code;
    
  }

  return {hospitalService :pv1_10_code , deptType };
};
