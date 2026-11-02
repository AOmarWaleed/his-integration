import { query } from "../config/pgDB.js";
import { clientLogger } from "../config/logger.js";
import { getOracleConnection } from "../config/oracle-dynamic.js";
import { getDefaultFacilityByUserId } from "../util/getDefaultFacilityByUserId.js";

/**
 * Middleware to fetch facility details and establish Oracle connection based on facilityId in query parameters.
 * Adds facility and oracleConnection to req object for downstream use.
 *
 * ⚠️ CONNECTION LIFECYCLE:
 * - This middleware creates and obtains an Oracle connection
 * - Connection is attached to req.oracleConnection
 * - THE CONTROLLER/ROUTE HANDLER IS RESPONSIBLE for closing this connection in a finally block
 *
 * USAGE IN CONTROLLER:
 * export const myController = async (req, res, next) => {
 *   const connection = req.oracleConnection;  // Connection created by middleware
 *   try {
 *     // use connection
 *   } finally {
 *     if (connection) {
 *       try {
 *         await connection.close();
 *       } catch (err) {
 *         logger.error("Connection close error:", err);
 *       }
 *     }
 *   }
 * };
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 *
 */
export const facilityAndConnection = async (req, res, next) => {
  try {
    let { facilityId } = req.query;

    if (!facilityId || isNaN(facilityId)) {
      const { userId } = req.user || {};
      const facility = await getDefaultFacilityByUserId(userId);
      facilityId = facility?.facility_id;

      clientLogger.debug(
        `✅✅🔥💀🔃 facilityId not provided or invalid. Using default facilityId ${facilityId} for userId ${userId}`,
      );
    }

    if (!facilityId) {
      clientLogger.error("facilityId query parameter is missing");
      return res.status(400).json({
        success: false,
        data: {
          description: "facilityId query parameter is required",
          msgId: -10002,
        },
      });
    }

    const { rows: facilities } = await query(
      `
        select 
          facility_id, 
          name, 
          vat_number, 
          crn, 
          street, 
          building_number, 
          plot_id, 
          district, 
          city, 
          postal_code,
          region,
          country_code, 
          created_by,
          creation_date,
          modified_by,
          modification_date,
          logo,
          name_locale,
          street_locale,
          district_locale,
          city_locale,
          region_locale,
          phone,
          p_o_box,
          email,
          website,
          cchi_no,
          nphies_license,
          org_id,
          his_db_driver,
          his_db_host,
          his_db_port,
          his_db_name,
          his_db_username,
          his_db_password,
          nphies_cs_org_id
        from facility
        where facility_id = $1
      `,
      [facilityId],
    );
    if (!facilities || facilities.length === 0) {
      clientLogger.error("No facilities found in the database");
      return res.status(404).json({
        success: false,
        data: {
          description: "No facilities found in the database",
          msgId: -10002,
        },
      });
    }

    const facility = facilities[0];
    const connection = await getOracleConnection({
      facilityId,
      poolScope: "api",
      userParam: facility.his_db_username,
      passwordParam: facility.his_db_password,
      connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
    });

    clientLogger.info(
      "✅ .Successfully established Oracle connection for facility" +
        JSON.stringify({ facilityId }),
    );

    clientLogger.debug("facility " + facility?.name);

    req.facility = facility;
    req.oracleConnection = connection;
    next();
  } catch (err) {
    clientLogger.error("Error in facilityAndConnection middleware: " + err);
    next(err);
  }
};
