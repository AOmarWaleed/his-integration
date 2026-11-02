import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";
import { executeSqlFile, getRelativePath } from "./runQueryFromFile.js";

/**
 * @typedef {Object} PrescriptionLine
 * @property {number} IOS - IOS code
 * @property {Date} LINE_EXPIRY_DATE - Line expiry date
 * @property {Date} LINE_ORDER_DATE - Line order date
 * @property {string} STATUS - Prescription status
 * @property {string} PRESCRIPTION_STATUS - Prescription status description
 * @property {string} CAUTIONARY_ID - Cautionary ID
 * @property {string} CAUTIONARY_DESCRIPTION - Cautionary description
 * @property {number} ORDER_LINE - Order line number
 * @property {string} AMEND_BY_USER - Last amended by user
 * @property {string} DOSAGE_CODE - Dosage code
 * @property {string} DOSAGE_NARRATIVE - Dosage narrative
 * @property {string} DOSAGE_DESC - Dosage description
 * @property {number} UNITS_GIVEN - Units given
 * @property {number} UNITS_ORDERED - Units ordered
 * @property {string} DESCRIPTION - Medication description
 * @property {number} INVENTORY_IOS - Inventory IOS
 * @property {string} PRODUCT_CODE - Product code
 * @property {number} IOS_MAIN - IOS main code
 * @property {string} IOS_SERVICE_TYPE - Service type
 * @property {string} NATIONAL_DRUG_CODING - National drug code
 * @property {string} SERVICE_CODE - Service code
 * @property {string} PRODUCT_CATEGORY_CODE - Product category code
 * @property {number} SERVICE_DEPT - Service department
 * @property {string} DRUG_DISPENSING_TYPE - Dispensing type (B=Brand, G=Generic)
 * @property {string} SCIENTIFIC_CODE - Scientific code
 * @property {string} SELECTION_REASON - Selection reason
 * @property {number} UNITS_ORDERED - Units ordered
 * @property {number} UNITS_GIVEN - Units given
 * @property {string} AMEND_BY_USER - Last amended by user
 * @property {string} DOSAGE_CODE - Dosage code
 * @property {string} DOSAGE_NARRATIVE - Dosage narrative
 * @property {number} ORDER_LINE - Order line number
 * @property {string} URGENT_FLAG - Urgent flag
 * @property {number} STD_PRICE - Standard price
 * @property {string} REASON_FOR_IOS - Reason for IOS
 * @property {Date} LINE_ORDER_DATE - Line order date
 * @property {string} SERVICE_TYPE - Service type
 */

/**
 * Fetches prescription lines for a specific patient and episode
 * @param {object} params - Parameters for fetching prescription lines
 * @param {string} params.pharmacyCategory - pharmacyCategory
 * @param {string|null} params.status - Status filter (optional)
 * @param {number|null} params.orderLine - Order line filter (optional)
 * @param {object} params.oracleConnection - Oracle database connection
 * @returns {Promise<Array<PrescriptionLine>>} Array of prescription line objects
 */
export async function fetchPrescriptionLines({
  orderNo,
  status,
  orderLine,
  oracleConnection,
  pharmacyCategory
}) {
  MEDICATION_LOGGER.debug(
    "Fetching prescription lines" +
      JSON.stringify({ orderNo, status, orderLine }),
  );
  try {
    const sqlFile = getRelativePath(`queries/prescriptionLines.sql`);

    const result = await executeSqlFile(oracleConnection, sqlFile, {
      p_master_order_no: orderNo,
      p_order_line: orderLine,
      p_status : status ,
      p_pharmacy_category :pharmacyCategory
      
    });

    MEDICATION_LOGGER.debug(
      "💽✅ Fetched prescription lines" +
        JSON.stringify({
          orderNo,
          orderLine: orderLine || "N/A",
          count: result.rows.length,
        }),
    );

    return result.rows;
  } catch (error) {
    MEDICATION_LOGGER.error("💽❌ Error fetching prescription lines", error);
    return [];
  }
}
