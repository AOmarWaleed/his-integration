import { query } from "../../config/pgDB.js";
import { clientLogger } from "../../config/logger.js";
import { NPHIES_FAIL_ID } from "../../util/constant.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import { cleanHL7Text } from "../createADTMsg.js";
import { formatDateTimeWithTimezone } from "./datesFormate.js";
import oracledb from "oracledb";
import { formatDoctor } from "../../util/formatDoctor.js";

/**
 * Create PR1 (Procedures) Segment
 */
export default async function createPR1Segment(
  data = {},
  connection,
  apiTransId = null,
  sequence = 1,
) {
  const result = await query(
    `SELECT pq.query_string, pq.* FROM predefined_query pq where pq.code = $1`,
    ["EPISODE_NPHIES_CS_PR1"],
  );

  if (result.rows.length == 0) {
    clientLogger.debug(
      `No pre-defined query found for code EPISODE_OPERATION. required for segment PR1.`,
    );

    await insertApiMessage({
      apiTransId,
      errorMessage:
        "No pre-defined query found for code EPISODE_OPERATION. required for segment PR1.",
      errorId: NPHIES_FAIL_ID.PREDEFINED_QUERY,
    });

    return [];
  }

  const queryResult = await connection.execute(
    result.rows[0].query_string.trim().endsWith(";")
      ? result.rows[0].query_string.trim().slice(0, -1)
      : result.rows[0].query_string,
    {
      p_patient_id: data.patient_id,
      p_episode_no: data.episode_no,
    },
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    },
  );

  if (queryResult.rows.length == 0) {
    clientLogger.debug(
      `No data found for pre-defined query with code EPISODE_OPERATION. required for segment PR1 using patient_id: ${data.patient_id} and episode_no: ${data.episode_no}.`,
    );
    
    return [];
  }

  const PR1Segments = [];
  let sequenceCounter = sequence;

  for (const row of queryResult.rows) {
    clientLogger.debug(
      `Processing row for PR1 segment: ${JSON.stringify(row)}`,
    );

    const {
      PRODUCT_CODE = '',
      NPHIES_CODE = '',
      NPHIES_DESCRIPTION = '',
      CODING_SYSTEM = '' ,
      PROCEDURE_TYPE = '' , 
      PRACTITIONER_STAFF_ID = '',
      PROCEDURE_DATE = ''
    } = row;

 
  // ! Validations   
    if (!PRACTITIONER_STAFF_ID) {
      await insertApiMessage({
        apiTransId,
        errorMessage:
          `No PRACTITIONER_STAFF_ID found for ,PRODUCT_CODE : ${PRODUCT_CODE}, patient_id : ${data.patient_id}, episode_no : ${data.episode_no}.`,
        errorId: NPHIES_FAIL_ID.CONSULTANT_ID,
      });
    }


   
    if (!NPHIES_CODE) {
      await insertApiMessage({
        apiTransId,
        errorMessage:
          `No NPHIES_CODE mapping found for ,PRODUCT_CODE : ${PRODUCT_CODE}.`,
        errorId: NPHIES_FAIL_ID.MAP_PROCEDURE_CODE,
      });
    }

    if (!PROCEDURE_DATE) {
      await insertApiMessage({
        apiTransId,
        errorMessage: "Procedure Date/Time is required",
        errorId: NPHIES_FAIL_ID.PROCEDURE_DATE,
      });
    }


    // ! Build CE for PR1.3
    const procedureCode = [
     NPHIES_CODE,
     cleanHL7Text(NPHIES_DESCRIPTION),
     CODING_SYSTEM
    ].join("^");
    // ! Build PR1-12 Procedure Practitioner
    const procedurePractitioner = await formatDoctor(PRACTITIONER_STAFF_ID , connection , data)

    const segment = [
      "PR1", // 0  - Segment name
      sequenceCounter.toString(), // 1  - PR1.1  Set ID
      '', // 2  - PR1.2  Coding Method ()
      procedureCode, // 3  - PR1.3  Procedure Code
      '', // 4  - PR1.4  Description
      formatDateTimeWithTimezone(PROCEDURE_DATE), // 5  - PR1.5  Date/Time
      PROCEDURE_TYPE, // 6  - PR1.6  Functional Type
      "", // 7  - PR1.7  Minutes
      "", // 8  - PR1.8  Anesthesiologist
      "", // 9  - PR1.9  Anesthesia Code
      "", // 10 - PR1.10 Anesthesia Minutes
      "", // 11 - PR1.11 Surgeon
      procedurePractitioner, // 12 - PR1.12 Procedure Practitioner
      "", // 13 - PR1.13 Consent Code
      "", // 14 - PR1.14 Priority // 0
      '', // 15 - PR1.15 Associated Diagnosis ??
      "", // 16 - PR1.16 Code Modifier
      "", // 17 - PR1.17 DRG Type
      "", // 18 - PR1.18 Tissue Type
      "", // 19 - PR1.19 Identifier
      "", // 20 - PR1.20 Action Code
    ].join("|");

    PR1Segments.push(segment);
    clientLogger.debug(`Added PR1 segment: ${segment} for sequenceCounter: ${sequenceCounter}`);
    sequenceCounter++;

  }

  return PR1Segments;
}
