import OracleDB from "oracledb";
import { getExtCode } from "./getExtCode.js";

/**
 * Get admission type code for PV1.5 based on visit number with fallback to "88" (Unknown) if not found or on error. For inpatient visits, this is based on patient_ad.patient_admission_category. For other visit types, this can be extended as needed (currently defaults to "88").
 *
 * @param {String} visitNo - visit number in the form (E123456) where E is attendance_type and 123456 is visit ID
 * @param {Object} dbConn - OracleDB connection to use
 * @return {Object} admission type code for PV1.5 based on visit number
 */
export const getAdmissionType = async (visitNo, dbConn) => {
  if (!visitNo)
    return {
      methodOfAdm: "88",
      dischargeDisposition: "",
      admissionSourceCode: "",
    };

  const visitId = visitNo.substring(1, visitNo.length);

  const query = `
    SELECT 
    pa.patient_admission_category ,
    discharge_condition,
    referred_type

    FROM patient_ad pa 
    WHERE pa.admission_no = :visitId
  `;

  const binds = { visitId };
  const options = { outFormat: OracleDB.OUT_FORMAT_OBJECT };

  try {
    const result = await dbConn.execute(query, binds, options);
    let methodOfAdm = "88"; // Default to "Unknown"
    let dischargeDisposition = "";
    let admissionSourceCode = "";
    // console.log({query , binds, result});
    if (result.rows && result.rows.length > 0) {
      const code = result.rows[0].PATIENT_ADMISSION_CATEGORY;
      const dischargeCond = result.rows[0].DISCHARGE_CONDITION;
      const admissionSource = result.rows[0].REFERRED_TYPE;

      if (code) {
        let methodOfAdmResults = await getExtCode({
          oasis_code: code,
          mapping_type: "CODES",
          mapping_sub_type: "399",
          source: "NPHIES CLINICAL",
          ext_type: "ADMISSION TYPE",
          dbConn: dbConn,
        });

        let methodOfAdm = methodOfAdmResults.ext_code;

        methodOfAdm = String(methodOfAdm);

        if (methodOfAdm && methodOfAdm.length === 1) {
          methodOfAdm = "0" + methodOfAdm;
        }
        if (!!dischargeCond) {
          const result = await getExtCode({
            oasis_code: dischargeCond,
            mapping_type: "CODES",
            mapping_sub_type: "400",
            source: "NPHIES CLINICAL",
            ext_type: "DISCHARGE DISPOSITION",
            dbConn: dbConn,
          });
          dischargeDisposition = result.ext_code || "";
        }
        if (!!admissionSource) {
          const result = await getExtCode({
            oasis_code: admissionSource,
            mapping_type : "CODES",
            mapping_sub_type: "399",
            ext_type: "ADMISSION TYPE",
            source: "NPHIES CLINICAL",

            dbConn: dbConn,
          });
          admissionSourceCode = result.ext_code || "9"; //! default 9
        }
        return {
          methodOfAdm: methodOfAdm || "88",
          dischargeDisposition,
          admissionSourceCode,
        };
      }
    }

    return {
      methodOfAdm: methodOfAdm || "88",
      dischargeDisposition,
      admissionSourceCode,
    };
  } catch (error) {
    console.error("Error getting admission type:", error);
  }

  return {
    methodOfAdm: "88",
    dischargeDisposition: "",
    admissionSourceCode: "",
  };
};
