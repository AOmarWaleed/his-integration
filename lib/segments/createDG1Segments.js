import OracleDB from "oracledb";

/**
 * Create DG1 (Diagnosis) Segment for NPHIES HL7 messages
 *
 * @param {Object} data - Contains patient_id, episode_no and other data
 * @param {Object} dbConn - Database connection
 * @param {number} sequence - Starting sequence number
 * @returns {Promise<Array>} - Array of DG1 segment strings
 */
export default async function createDG1Segments(data, dbConn, sequence = 1) {
  if (!data.patient_id) {
    clientLogger.error("patient_id is required for DG1 segment");
    return [];
  }

  if (!data.episode_no) {
    clientLogger.error("episode_no is required for DG1 segment");
    return [];
  }

  let result = null;
  const dg1Segments = [];
  let counter = sequence;

  try {
    // Query to get diagnosis data - matching the original Mirth query
    const query = `
        SELECT   a.hosp_code
                ,Initcap(b.description) AS description
                ,'2.16.840.1.113883.6.135' AS diag_tp
                ,Decode(final_flag, 'Y', 'F', 'W') AS finalflag
                ,To_Char(Min(pdn.date_recorded), 'YYYYMMDDHH24MISS') AS date_recorded
        FROM     patient_diagnosis_notes pdn
                ,codes_data c
                ,diagnosis_codes a
                ,diagnosis_desc b
        WHERE    pdn.diagnosis_division = c.code
        AND      c.user_code = 'DIAG'
        AND      c.code_type = 292
        AND      Nvl(pdn.status, 'Y') NOT IN ('N', 'Q')
        AND      pdn.diag_code IS NOT NULL
        AND      a.diag_code = b.diag_code
        AND      a.diag_code = pdn.diag_code
        AND      a.icd_release_no = 10
        AND      pdn.patient_id = :patientId
        AND      pdn.episode_no = :episodeNo
        GROUP BY a.hosp_code
                ,Initcap(b.description)
                ,Decode(final_flag, 'Y', 'F', 'W')
        ORDER BY date_recorded DESC
    `;

    clientLogger.debug(
      `Executing DG1 query for patient_id: ${data.patient_id}, episode_no: ${data.episode_no}`,
    );

    result = await dbConn.execute(
      query,
      {
        patientId: data.patient_id,
        episodeNo: data.episode_no,
      },
      {
        outFormat: OracleDB.OUT_FORMAT_OBJECT,
      },
    );

    // console.log({result});

    if (result.rows && result.rows.length > 0) {
      for (const row of result.rows) {
        // Skip if hosp_code is empty (matches original logic)
        // console.log('hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh' , row);
        if (!row.HOSP_CODE) continue;

        // Clean the values by removing newlines and carriage returns
        const cleanValue = (value) => {
          if (!value) return "";

          return (
            String(value)
              // Normalize all line breaks / whitespace runs to a single space
              .replace(/(\r\n|\r|\n)/g, " ")
              .replaceAll('&', "And")
              // Remove tabs and other control chars (HL7 treats \T\ as tab; a literal tab breaks the field)
              .replace(/[\t\v\f\u0000-\u001F\u007F]/g, " ")
              // Collapse multiple spaces
              .replace(/\s+/g, " ")
              // Trim leading/trailing whitespace (also fixes the " Neweishy" leading-space issue)
              .trim()
          );
        };

        const diagCodeId = cleanValue(row.HOSP_CODE);
        const diagCodeText = cleanValue(row.DESCRIPTION);
        const diagCodeCodingSystem = cleanValue(row.DIAG_TP);
        const diagType = cleanValue(row.FINALFLAG);
        const diagDateTime = cleanValue(row.DATE_RECORDED);

        // Build DG1 segment according to HL7 structure:
        // DG1.1 - Set ID
        // DG1.3 - Diagnosis Code (CE data type)
        // DG1.5 - Diagnosis Date/Time
        // DG1.6 - Diagnosis Type

        const dg1Segment = [
          "DG1", // Segment name
          counter.toString(), // DG1.1 - Set ID
          "", // DG1.2 - Diagnosis Coding Method
          [
            // DG1.3 - Diagnosis Code (CE)
            diagCodeId, // DG1.3.1 - Identifier
            diagCodeText, // DG1.3.2 - Text
            diagCodeCodingSystem, // DG1.3.3 - Name of Coding System
            "", // DG1.3.4 - Alternate Identifier
            "", // DG1.3.5 - Alternate Text
            "", // DG1.3.6 - Name of Alternate Coding System
          ].join("^"),
          "", // DG1.4 - Diagnosis Description
          diagDateTime, // DG1.5 - Diagnosis Date/Time
          diagType, // DG1.6 - Diagnosis Type
          "", // DG1.7 - Major Diagnostic Category
          "", // DG1.8 - Diagnostic Related Group
          "", // DG1.9 - DRG Approval Indicator
          "", // DG1.10 - Outlier Type
          "", // DG1.11 - Outlier Days
          "", // DG1.12 - Outlier Cost
          "", // DG1.13 - Grouper Version and Type
          "", // DG1.14 - Diagnosis Priority
          "", // DG1.15 - Diagnosing Clinician
          "", // DG1.16 - Diagnosis Classification
          "", // DG1.17 - Confidential Indicator
          "", // DG1.18 - Attestation Date/Time
          "", // DG1.19 - Diagnosis Identifier
          diagType, // DG1.20 - Diagnosis Action Code
        ].join("|");

        clientLogger.debug(
          `Constructed DG1 segment for diagnosis code ${diagCodeId}: ${dg1Segment}`,
        );
        dg1Segments.push(dg1Segment);
        counter++;

        clientLogger.debug(
          `Added DG1 segment: ${diagCodeId} - ${diagCodeText}`,
        );
      }
    } else {
      clientLogger.error(
        `No diagnosis found for patient_id: ${data.patient_id}, episode_no: ${data.episode_no}`,
      );
    }

    return dg1Segments;
  } catch (error) {
    clientLogger.error(`Error creating DG1 segments: ${error.message}`);
    throw error;
  } finally {
    // Ensure database resources are properly closed
    if (result && typeof result.close === "function") {
      try {
        await result.close();
      } catch (closeError) {
        clientLogger.error(
          `Error closing database result: ${closeError.message}`,
        );
      }
    }
  }
}
