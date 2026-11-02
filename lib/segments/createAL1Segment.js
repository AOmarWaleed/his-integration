import { query } from "../../config/pgDB.js";
import { clientLogger } from "../../config/logger.js";
import { NPHIES_FAIL_ID } from "../../util/constant.js";
import { getExtCode } from "../../util/getExtCode.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import oracledb from "oracledb";

/**
 * Create AL1 (Allergy Information) Segments
 */
export default async function createAL1Segment(
  data = {},
  connection,
  apiTransId = null,
  sequence = 1,
) {
  // ! 1. Get predefined query
  const result = await query(
    `SELECT pq.query_string, pq.* FROM predefined_query pq where pq.code = $1`,
    ["PATIENT_ALLERGY"],
  );

  if (result.rows.length == 0) {
    clientLogger.debug(
      `No pre-defined query found for code PATIENT_ALLERGY. required for segment AL1.`,
    );

    await insertApiMessage({
      apiTransId,
      errorMessage:
        "No pre-defined query found for code PATIENT_ALLERGY. required for segment AL1.",
      errorId: NPHIES_FAIL_ID.PREDEFINED_QUERY,
    });

    return [];
  }

  // ! 2. Execute the query
  const queryResult = await connection.execute(
    result.rows[0].query_string.trim().endsWith(";")
      ? result.rows[0].query_string.trim().slice(0, -1)
      : result.rows[0].query_string,
    {
      p_patient_id: data.patient_id,
    },
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    },
  );

  if (queryResult.rows.length == 0) {
    clientLogger.debug(
      `No data found for pre-defined query with code PATIENT_ALLERGY. required for segment AL1.`,
    );
   

    return [];
  }

  const AL1Segments = [];
  let sequenceCounter = sequence;

  for (const row of queryResult.rows) {
    clientLogger.debug(
      `Processing row for AL1 segment: ${JSON.stringify(row)}`,
    );

    const {
      ALLERGYCODE = "",
      ALLERGYDESCRIPTION = "",
      ALLERGYTYPE = "",
      SEVERITY_CODE = "",
      ADDED_DATE = "",
    } = row;

    if (ALLERGYCODE == "NKDA") {
      clientLogger.debug(`Skipping AL1 segment for NKDA allergy code.`);
      continue; // Skip this iteration for NKDA
    }

    // ! AL1.2 - Allergy Type (CE)   case "ALG":  return "Allergy"
    const allergyTypeCode = "ALG" || ALLERGYTYPE?.toUpperCase(); // TODO CHECK
    const allergyTypeText = "Allergy" || ALLERGYTYPE?.toUpperCase(); // TODO CHECK

    const allergyTypeField = [
      allergyTypeCode, // Identifier
      allergyTypeText, // Text
      "", // Name of Coding System
      "", // Alternate Identifier
      "", // Alternate Text
      "", // Name of Alternate Coding System
    ].join("^");

    // ! AL1.3 - Allergen Code Mnemonic Description (CE)
    const allergenCode = null; // ALLERGYCODE ? String(ALLERGYCODE).trim() : "";
    const allergenText = ALLERGYDESCRIPTION
      ? String(ALLERGYDESCRIPTION).trim()
      : "";

    let allergenField = "";
    if (allergenCode) {
      // Identifier + Text + SNOMED Coding System
      allergenField = [
        allergenCode, // Identifier
        allergenText, // Text
        "2.16.840.1.113883.6.96", // Name of Coding System (SNOMED)
        "", // Alternate Identifier
        "", // Alternate Text
        "", // Name of Alternate Coding System
      ].join("^");
    } else if (allergenText) {
      // Free text only
      allergenField = ["", allergenText, "", "", "", ""].join("^");
    }

    // ! AL1.4 - Allergy Severity (CE)
    const severityCode = SEVERITY_CODE
      ? String(SEVERITY_CODE).toUpperCase()
      : "";
    //todo use latest getExtCode  map severity code to text
    const mappedSeverityText = await getExtCode({
      oasis_code: severityCode,
      source: "NPHIES CLINICAL",
      mapping_type: "ALLERGY_SEVERITY",
      dbConn: connection,
    });

    const severityField = severityCode
      ? [
          mappedSeverityText?.ext_code || "U",
          mappedSeverityText?.ext_desc || "Unknown", // DONE MAPPING
          "2.16.840.1.113883.18.55",
          "",
          "",
          "",
        ].join("^")
      : "";

    // ! AL1.5 - Allergy Reaction (ST)
    const reaction = "";

    // ! AL1.6 - Identification Date (DT) - YYYYMMDD
    let identificationDate = "";
    if (ADDED_DATE) {
      const dateObj = new Date(ADDED_DATE);
      if (!isNaN(dateObj.getTime())) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getDate()).padStart(2, "0");
        identificationDate = `${yyyy}${mm}${dd}`;
      }
    }

    // ! Validations
    if (!allergyTypeCode) {
      await insertApiMessage({
        apiTransId,
        errorMessage: `Allergy Type is required ,Patient ID : ${data?.patient_id || "''"} ,EpisodeNo : ${data?.episode_no || "''"}`,
        errorId: NPHIES_FAIL_ID.ALLERGY_TYPE,
      });
    }

    if (!allergenCode && !allergenText) {
      await insertApiMessage({
        apiTransId,
        errorMessage: `Allergen Code or Text is required ,Patient ID : ${data?.patient_id || "''"} ,EpisodeNo : ${data?.episode_no || "''"}`,
        errorId: NPHIES_FAIL_ID.ALLERGEN,
      });
      continue; // !
    }

    // ! Build AL1 segment
    const al1Segment = [
      "AL1", // 0 - Segment Name
      sequenceCounter.toString(), // 1 - AL1.1 Set ID
      allergyTypeField, // 2 - AL1.2 Allergy Type
      allergenField, // 3 - AL1.3 Allergen Code
      severityField, // 4 - AL1.4 Allergy Severity
      reaction, // 5 - AL1.5 Allergy Reaction
      identificationDate, // 6 - AL1.6 Identification Date
    ].join("|");
    AL1Segments.push(al1Segment);
    clientLogger.debug(
      `Added AL1 segment: ${al1Segment} for sequenceCounter: ${sequenceCounter}`,
    );

    sequenceCounter++;
  }

  return AL1Segments;
}
