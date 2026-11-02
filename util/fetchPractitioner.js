import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";
import { fetchPhysician } from "./fetchPhysician.js";


/**
 * Fetches practitioner/physician data for a given patient and episode
 * @param {Object} params - Parameters for fetching practitioner data
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @param {Object} params.oracleConnection - Oracle database connection
 * @param {number} params.facilityId - Facility ID for configuration
 * @returns {Promise<Object|null>} Practitioner data object or null if not found
 */
export async function fetchPractitioner({
  patientId,
  episodeNo,
  oracleConnection,
  facilityId
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching practitioner" + JSON.stringify({ patientId, episodeNo }),
    );

    const query = `
        SELECT DISTINCT pe.consultant_id
        FROM patient_eligibility pe
        --JOIN orders_master om ON om.patient_id = pe.patient_id AND om.episode_no = pe.episode_no
        --JOIN order_lines ol ON ol.master_order_no = om.master_order_no
        --JOIN service_request_item sri ON sri.order_line = ol.order_line
        WHERE pe.eligibility_status = 'O' 
            AND pe.responsibility = 1 
            AND pe.patient_id = :patientId 
            AND pe.episode_no = :episodeNo
    `;

    const result = await oracleConnection.execute(
      query,
      { patientId, episodeNo },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    

    const CONSULTANT_ID = result.rows[0]?.CONSULTANT_ID || '';
  
    

    const staffData  = await fetchPhysician({
      connection: oracleConnection,
      staffId: CONSULTANT_ID,
      facilityId: facilityId, 
    })
    

   

    if (!staffData) {
      MEDICATION_LOGGER.warn(
        "No practitioner found for patient" + JSON.stringify({ patientId, episodeNo }),
      );
      return null;
    }

  

    
    
   

    
    return  staffData;
  } catch (error) {
    console.log({error});
    
    MEDICATION_LOGGER.error("Error fetching practitioner" + JSON.stringify(error));
    return null;
  }
}
