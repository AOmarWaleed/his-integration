import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} DispenseLine
 * @property {number} MASTER_NO - Master order number
 * @property {number} DELIVERY_LINE - Delivery line number (transaction_id)
 * @property {number} PATIENT_ID - Patient ID
 * @property {number} EPISODE_NO - Episode number
 * @property {string} ENCOUNTER_TYPE - Encounter type (attendance_type)
 * @property {string} ENCOUNTER_IDENTIFIER - HL7 encounter identifier
 * @property {Date} START_DATE - Episode start date
 * @property {Date} END_DATE - Episode end date
 * @property {number} ORDER_LINE - Order line number
 * @property {string} DESCRIPTION - Medication description
 * @property {number} IOS_MAIN - IOS main code
 * @property {string} NATIONAL_DRUG_CODING - National drug code
 * @property {string} MEDICATION_CATEGORY_CODE - Medication category code (C/U)
 * @property {string} MEDICATION_CATEGORY_DESC - Medication category description (Controlled/Uncontrolled)
 * @property {string} REQ_NO - Request number (for logging)
 */

/**
 * Fetches dispense lines for a specific patient and episode with delivery information
 * Follows the same JOIN order as fetchPrescriptionLines
 *
 * @param {object} params - Parameters for fetching dispense lines
 * @param {string|null} params.status - Status filter (optional) - filters on nphies_cs_sent
 * @param {string} params.pharmacyCategory - pharmacyCategory
 * @param {number|null} params.deliveryLine - Delivery line filter (optional)
 * @param {object} params.oracleConnection - Oracle database connection
 * @returns {Promise<Array<DispenseLine>>} Array of dispense line objects
 */
export async function fetchDispenseLines({
  deliveryLine,
  status,
  oracleConnection,
  pharmacyCategory,
}) {
  MEDICATION_LOGGER.debug(
    "💽💉Fetching dispense lines" + JSON.stringify({ deliveryLine, status }),
  );
  try {
    const query = `
      SELECT 
        om.master_order_no AS master_no,
        dl.delivery_line,
         DECODE (ol.status,  'R', 'completed',  'O', 'completed',  'C', 'cancelled',  'D', 'completed') prescription_status,
         CASE
          WHEN ol.status = 'D' AND dl.units_delivered = ol.units_ordered
          THEN 
             'FF'
          WHEN ol.status = 'D' AND dl.units_delivered != ol.units_ordered
          THEN 
             'FFC'
          ELSE
             'FFP'
       END
          AS dispense_item_type,
        om.patient_id,
        om.episode_no,
        om.attendance_type AS encounter_type,
        om.hl7_encounter AS encounter_identifier,
        pe.start_date,
        pe.end_date,
        ol.order_line,
        imn.description,
        imn.ios_main,
        imn.product_code,
        imn.national_drug_coding,
        order_utl.GET_MEDICATION_ORDER_DESC (ol.order_line) dosage_desc,
        DECODE(UPPER(cd.description), 'CONTROLED', 'C', 'U') AS medication_category_code,
        DECODE(UPPER(cd.description), 'CONTROLED', 'Controlled', 'Uncontrolled') AS medication_category_desc
      FROM 
        order_lines ol
        JOIN ios_master_data ims ON ol.ios = ims.ios
        JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
        JOIN orders_master om ON om.master_order_no = ol.master_order_no
        JOIN ph_ios_medicine m ON m.ios_main = imn.ios_main
        LEFT OUTER JOIN ph_cautionary_advisory_labels c ON c.cautionary_id = m.cautionary_id
        LEFT OUTER JOIN codes_data cd ON cd.code = m.medicine_category AND cd.code_type = 384
        JOIN patient_episodes pe ON pe.patient_id = om.patient_id AND pe.episode_no = om.episode_no
        JOIN delivery_lines dl ON dl.order_line = ol.order_line
      WHERE 
        1 = 1
        AND dl.delivery_line = :p_delivery_line
        AND INSTR (
          :p_pharmacy_category,
          ',' || IMS.PRODUCT_CATEGORY_CODE || ','
        ) > 0
        AND ol.nphies_cs_sent in ('S' , 'DS') 
        AND (   ol.status NOT IN ('P', 'Q')                    
               OR (ol.status = 'C' AND ol.nphies_cs_sent = 'S')  
               )
        AND (   (dl.nphies_cs_sent = :p_status)
            OR (    :p_status IS NULL
                AND dl.nphies_cs_sent IS NULL))
    `;

    const result = await oracleConnection.execute(
      query,
      {
        p_delivery_line: deliveryLine,
        p_status: status,
        p_pharmacy_category: pharmacyCategory,
      },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    MEDICATION_LOGGER.debug(
      "\x1b[31mFetched dispense lines\x1b[0m" +
        JSON.stringify({
          deliveryLine,
          status,
          count: result.rows.length,
        }),
    );

    return result.rows;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching dispense lines", error);
    return [];
  }
}
