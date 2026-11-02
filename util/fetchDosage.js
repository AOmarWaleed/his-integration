import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object|null} DosageInfo
 * @property {number} ADMIN_QTY - Administration quantity
 * @property {string} UOM - Unit of measure
 * @property {string} DOSAGE_CODE - Dosage code
 * @property {string} PER_DESCRIPTION - Period description
 * @property {number} TIMES - Number of times
 * @property {number} NO_OF_DAYS - Number of days
 * @property {string} ADMIN_QTY_UOM - Administration quantity unit
 * @property {Date} DOSAGE_START_DATETIME - Dosage start date time
 * @property {number} NO_OF_PERIODS - Number of periods
 * @property {string} ROUTE - Administration route
 */

/**
 * Fetches dosage information for a medication
  * @param {Object} params - Parameters for fetching dosage
  * @param {number} params.orderLine - Order line ID
  * @param {number} params.iosMain - IOS main ID
  * @param {OracleDB.Connection} params.oracleConnection - Oracle database connection
 * @returns {Promise<DosageInfo>} Dosage information object
 */
export async function fetchDosage({ orderLine, iosMain, oracleConnection }) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching dosage" + JSON.stringify({ orderLine, iosMain }),
    );

    const query = `
        SELECT 
            admin_qty,
            NVL(DECODE(admin_type,
                'M', 'MMOL',
                'D', 'DROPS',
                'U', (SELECT sales_uom_code FROM ios_main_data WHERE ios_main = :iosMain)
            ),admin_qty_uom) uom,
            d.dosage_code,
            dc.description per_description,
            d.times,
            CEIL(no_of_occurrence * (d.no_of_periods * d.type_of_period / 24)) no_of_days,
            admin_qty_uom,
            d.dosage_start_datetime,
            d.no_of_periods,
            d.route,
            d.notes
        FROM ph_dosage_master d 
        JOIN dosage_codes dc ON d.dosage_code = dc.dosage_code
        WHERE d.order_line = :orderLine
    `;

    const result = await oracleConnection.execute(
      query,
      { orderLine, iosMain },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    const dosage = result.rows[0] || null;
    MEDICATION_LOGGER.debug(
      "Fetched dosage" +
        JSON.stringify({ orderLine, iosMain, found: !!dosage }),
    );

    return dosage;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching dosage", error);
    return null;
  }
}
