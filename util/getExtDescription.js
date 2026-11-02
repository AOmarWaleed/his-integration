import OracleDB from "oracledb";

/**
 * Returns external code description from external_codes table
 *
 * @param {Object} params - Parameters for the function
 * @param {String} params.ext_code - external code to look up
 * @param {String} params.ext_type - external code type
 * @param {String} params.source - source of the external code
 * @param {Object} params.dbConn - OracleDB connection to use
 * @return {Promise<{ext_desc: string}>} the description of the external code
 */
export async function getExtDescription({
  ext_code,
  ext_type,
  source,
  dbConn,
}) {
  if (!ext_code) return { ext_desc: "" };
  if (!dbConn) throw new Error("Missing dbConn");

  try {
    const query = `
      SELECT DESCRIPTION ext_desc
      FROM external_codes
      WHERE EXT_CODE = :p_ext_code
        AND EXT_TYPE = :p_ext_type
        AND SOURCE = :p_source
    `;

    const binds = {
      p_ext_code: ext_code.toString(),
      p_ext_type: ext_type?.toString() || null,
      p_source: source.toString(),
    };

    const options = {
      outFormat: OracleDB.OUT_FORMAT_OBJECT,
    };

    const result = await dbConn.execute(query, binds, options);

    if (result.rows && result.rows.length > 0) {
      return {
        ext_desc: result.rows[0].EXT_DESC || "",
      };
    } else {
      return {
        ext_desc: "",
      };
    }
  } catch (error) {
    clientLogger.error("Error in getExtDescription: " + JSON.stringify(error));
    return {
      ext_desc: "",
      error_message: error.message,
    };
  }
}