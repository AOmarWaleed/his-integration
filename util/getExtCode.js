import OracleDB from "oracledb";
import { clientLogger } from "../config/logger.js";

/**
 * Returns external code from Oasis DB mapping tables for a given oasisCode.
 * Equivalent to GET_EXT_CODE from DEVDBA.INSURANCE_MNT package
 *
 * @param {Object} params - Parameters for the function
 * @param {String} params.source - mapping source to use in lookup (i.e. NPHIES, BUPA)
 * @param {String} params.mapping_type - mapping type (e.g. GENDER, NATIONALITY, SPECIALITY, CODES)
 * @param {String} params.oasis_code - oasis code for which to return the external code
 * @param {Object} params.dbConn - OracleDB connection to use
 * @param {String|Null} params.mapping_sub_type - mapping sub type for filtering (IN OUT parameter, optional, default null)
 * @param {String|Null} params.ext_type - external code type for filtering (IN OUT parameter, optional, default null)
 * @param {Date} params.date - effective date for the mapping (optional, default null)
 * @return {Promise<{ext_code: string, ext_desc: string, ext_type?: string, error_code?: number, error_message?: string}>} the external code, description, and ext_type of the given oasis code
 */
export async function getExtCode({
  oasis_code, 
  mapping_type,
  mapping_sub_type = null,
  source,
  ext_type = null,
  date = null,
  dbConn,
}) {
  if (!oasis_code) return { ext_code: "", ext_desc: "", ext_type: "" };
  if (!dbConn) throw new Error("Missing dbConn");

  try {
    // Convert date to Oracle format if provided
    let oracleDate = null;
    if (date) {
      if (date instanceof Date) {
        oracleDate = date;
      } else {
        oracleDate = new Date(date);
      }
    }

    // The SELECT query from GET_EXT_CODE in DEVDBA.INSURANCE_MNT
    const query = `
      SELECT ec.ext_code, ec.description, ec.ext_type
  FROM external_codes_mapping ecm
       JOIN external_codes ec
          ON     ec.source = ecm.source
             AND ec.ext_type = ecm.ext_type
             AND ec.ext_code = ecm.ext_code
 WHERE     ecm.oasis_code = :p_oasis_code
       AND ecm.mapping_type = :p_mapping_type
       AND NVL (ecm.mapping_sub_type, 'X') = NVL (:p_mapping_sub_type, NVL (ecm.mapping_sub_type, 'X'))
       AND ecm.source = :p_source
       AND ecm.ext_type = :p_ext_type
       AND (   :p_date IS NULL
            OR :p_date BETWEEN NVL (ecm.applies_start, TO_DATE ('01/01/0001', 'dd/mm/yyyy')) AND NVL (ecm.applies_end, TO_DATE ('01/01/9999', 'dd/mm/yyyy')))
    `;

    const binds = {
      p_oasis_code: oasis_code.toString(),
      p_mapping_type: mapping_type.toString(),
      p_mapping_sub_type: mapping_sub_type?.toString() || null,
      p_source: source.toString(),
      p_ext_type: ext_type?.toString() || null,
      p_date: oracleDate,
    };

    const options = {
      outFormat: OracleDB.OUT_FORMAT_OBJECT,
    };

    const result = await dbConn.execute(query, binds, options);

    //clientLogger.debug(`getExtCode result: ${JSON.stringify(result.rows)}`);

    if (result.rows && result.rows.length > 0) {
      return {
        ext_code: result.rows[0].EXT_CODE || "",
        ext_desc: result.rows[0].DESCRIPTION || "",
      };
    } else {
      // No mapping found - return empty values
      clientLogger.verbose(`No mapping found for oasis_code: ${oasis_code}, mapping_type: ${mapping_type}, source: ${source} , ext_type: ${ext_type}, mapping_sub_type: ${mapping_sub_type}`);
      
      return {
        ext_code: "",
        ext_desc: "",
      };
    }
  } catch (error) {
    console.log({
      error,
    });

    clientLogger.error("🗺️🗺️Error in getExtCode:" + JSON.stringify(error));
    return {
      ext_code: "",
      ext_desc: "",
      error_code: -7845,
      error_message: error.message,
    };
  }
}
