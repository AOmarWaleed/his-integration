import { clientLogger } from "../config/logger.js";
import { insertApiMessage } from "./insertApiMsgs.js";
import {  getConfValue } from "./loadConf.js";

export const ALLOWED_HL7_MESSAGE_TYPES = new Set([
  "A01",
  "A02",
  "A03_ER",
  "A03_IP",
  "A03_OPD",
  "A04_OPD",
  "A04_ER",
  "A11_ER",
  "A11_IP",
  "A13_ER",
  "A13_IP",
  "A13_OPD",
  // !!
  "A04",
  "A04_OPD",
  "A04_ER",
  "A08",
  "A011",
  "A013",
  "O01",
  "O11",
  "R01",
  "A03_OPD",
  "A03_IP",
  "A11_ER",
  "ALL",
  "A11_IP",
  "A13_ER",
  "A13_OPD",
  "A13_IP",
]);
export const MESSAGE_TYPES_REQUIRING_EPISODE = new Set([
  "A01",
  "A03",
  "A011",
  "A013",
  "O01",
  "O11",
  "R01",
]);

export const CONST = {
  NPHIES_OID_BASE: "2.16.840.1.113883.3.3731.1",
  RECEIVING_APP_OID: "",
  SENDING_FACILITY_OID: "",
  SENDING_APP_OID: "",
  SENDING_FACILITY: "",
  SENDING_APP: "",
  RECEIVING_APP: "",
  RECEIVING_FACILITY: "MOH^2.16.840.1.113883.3.3731.1.1.2^ISO",
  NPHIES_CS_ADT_HL7_VERSION: "",
  NPHIES_ID_AUTHORITY: "2.16.840.1.113883.3.3731.1.100.1",
  VISIT_NO_AUTHORITY: "",
  PROCESSING_ID: "P",
  PROVIDER_ID_AUTHORITY: "2.16.840.1.113883.3.3731.1.2.1",
  HEALTH_CARE_FACILITY_ID_AUTHORITY: "2.16.840.1.113883.3.3731.1.1.100",
};


export async function initConstants(
  nphiesCsOrgId,
  facilityId,
  apiTransId = null,
) {

  clientLogger.info(
    `Initializing constants with NPHIES_CS_ORG_ID: ${nphiesCsOrgId} and facilityId: ${facilityId}`,
  );

  if (!nphiesCsOrgId && apiTransId) {
    await insertApiMessage({
      apiTransId,
      errorMessage: "NPHIES_CS_ORG_ID is required to initialize constants",
    });
  }

  if (!nphiesCsOrgId && !apiTransId) {
    throw new Error("NPHIES_CS_ORG_ID is required to initialize constants");
  }

  CONST["RECEIVING_APP_OID"] = `${CONST.NPHIES_OID_BASE}.1.2.2`;
  CONST["SENDING_FACILITY_OID"] = `${CONST.NPHIES_OID_BASE}.${nphiesCsOrgId}`;
  CONST["SENDING_APP_OID"] = `${CONST.SENDING_FACILITY_OID}.20`;
  CONST["NPHIES_ID_AUTHORITY"] = `${CONST.NPHIES_OID_BASE}.1.100`;


  const NPHIES_CS_SENDING_FACILITY = await getConfValue({
    key: "NPHIES_CS_SENDING_FACILITY",
    facilityId,
  });
  CONST["SENDING_FACILITY"] =
    `${NPHIES_CS_SENDING_FACILITY}^${nphiesCsOrgId}^ISO`;

  const NPHIES_CS_SENDING_APPLICATION = await getConfValue({
    key: "NPHIES_CS_SENDING_APPLICATION",
    facilityId,
  });
  CONST["SENDING_APP"] =
    `${NPHIES_CS_SENDING_APPLICATION}^${CONST.SENDING_APP_OID}^ISO`;
  CONST["RECEIVING_APP"] = `nphise^${CONST["RECEIVING_APP_OID"]}^ISO`;

  const NPHIES_CS_ADT_HL7_VERSION = await getConfValue({
    key: "NPHIES_CS_ADT_HL7_VERSION",
    facilityId,
  });
  CONST["NPHIES_CS_ADT_HL7_VERSION"] = NPHIES_CS_ADT_HL7_VERSION;
  CONST["VISIT_NO_AUTHORITY"] =
    `${process.env.TEST_NPHIES_CS ?  `2.16.840.1.113883.3.3731.5.1.${nphiesCsOrgId}` : await getConfValue({facilityId: facilityId , key : "NPHIES_CS_OID"}) }`;


    if (!CONST["VISIT_NO_AUTHORITY"]) {
      if (apiTransId) {
        await insertApiMessage({
          apiTransId,
          errorMessage: "VISIT_NO_AUTHORITY is required to initialize constants",
          errorId: NPHIES_FAIL_ID.NPHIES_CS_OID,
        });
      }
    }


  const HL7_PROCESSING_ID = await getConfValue({
    key: "HL7_PROCESSING_ID",
    facilityId,
  });
  CONST["PROCESSING_ID"] = HL7_PROCESSING_ID || "P";
}

// +++++++++++++++++++++++++++++++++++++++++++++++++
// +++++++++++++++++++++++++++++++++++++++++++++++++
// +++++++++++++++++++++++++++++++++++++++++++++++++
// +++++++++++++++++++++++++++++++++++++++++++++++++

// ! ask if necessary to insert it at conf table
/**
 * SAML Name Format URIs
 * From SAML 2.0 specifications
 */
export const NAME_FORMATS = {
  /** Issuer name format */
  ISSUER: "urn:oasis:names:tc:SAML:2.0:nameid-format:entity",
  /** Unspecified name format for NameID */
  UNSPECIFIED: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
  /** Basic attribute name format */
  BASIC: "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
};

/**
 * SAML Status Codes
 */
export const STATUS = {
  /** Success status */
  SUCCESS: "urn:oasis:names:tc:SAML:2.0:status:Success",
};

/**
 * SAML Authentication Context Class
 */
export const AUTH_CONTEXT =
  "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";

/**
 * SAML Subject Confirmation Method
 */
export const SUBJECT_CONFIRMATION_METHOD =
  "urn:oasis:names:tc:SAML:2.0:cm:bearer";

export const NPHIES_FAIL_ID = {
  MAP_WE: "MAP_WE",
  HEALTH_ID: "HEALTH_ID",
  MAP_MRID_GENERIC: "MAP_MRID_GENERIC",
  MAP_MRID_BRAND: "MAP_MRID_BRAND",
  MAP_UOM: "MAP_UOM",
  MAP_ROUTE: "MAP_ROUTE",
  ORGANISM  :"ORGANISM",
  SUB_RESULTS : "SUB_RESULTS",
  MACHINE_READABLE : "MACHINE_READABLE",
  NOT_FOUND_FACILITY: "NOT_FOUND_FACILITY",
  ORACLE_CONNECTION: "ORACLE_CONNECTION",
  DIAGNOSIS: "DIAGNOSIS",
  EVENT_TYPE: "EVENT_TYPE",
  MESSAGE_CONTROL_ID: "MESSAGE_CONTROL_ID",
  MESSAGE_TYPE: "MESSAGE_TYPE",
  VISIT_NO  : "VISIT_NO",
  CONSULTANT_ID : "CONSULTANT_ID",
  HOSPITAL_SERVICE: "HOSPITAL_SERVICE",
  ATTENDING_DOCTOR: "ATTENDING_DOCTOR",
  ADMIT_DATE: "ADMIT_DATE",
  INVALID_MEDICATION_REQUEST_DATA: "INVALID_MEDICATION_REQUEST_DATA",
  INVALID_MEDICATION_DISPENSE_DATA: "INVALID_MEDICATION_DISPENSE_DATA",
  JSON5_PARSE_ERROR: "JSON5_PARSE_ERROR",
  VITAL_SIGN: "VITAL_SIGN",
  DIAGNOSIS: "DIAGNOSIS",
  HEIGHT_WEIGHT: "HEIGHT_WEIGHT",
  PATIENT_ID: "PATIENT_ID",
  EPISODE_NO: "EPISODE_NO",
  DISCHARGE_DATE : "DISCHARGE_DATE",
  ADMIT_DATE : "ADMIT_DATE",
  ALLERGY_TYPE : "ALLERGY_TYPE" ,
  ALLERGEN : "ALLERGEN" ,
  MAP_PROCEDURE_CODE : "MAP_PROCEDURE_CODE",
  PROCEDURE_DATE : "PROCEDURE_DATE",
  PREDEFINED_QUERY : "PREDEFINED_QUERY",
  NPHIES_CS_OID : "NPHIES_CS_OID",
  MAP_ANTIMICROBIAL : "MAP_ANTIMICROBIAL",
  PHYSICIAN_IDENTIFIER_NO: "PHYSICIAN_IDENTIFIER_NO",
  MAP_PROCEDURE_CODE : "MAP_PROCEDURE_CODE",
  MAP_MODALITY: "MAP_MODALITY",
  MAP_BODY_REGION: "MAP_BODY_REGION",
  NO_SUB_RESULTS: "NO_SUB_RESULTS",
  MAP_LOINC_IOS: "MAP_LOINC_IOS",
  MAP_LOINC_DEPT: "MAP_LOINC_DEPT",
  ORG_ID: "ORG_ID",
  MAP_INTERPRETATION : "MAP_INTERPRETATION",
  MAP_LOINC_RESULT: "MAP_LOINC_RESULT",
  MAP_PACKAGING_DISPLAY : "MAP_PACKAGING_DISPLAY",
  SPECIMEN_COLLECTION_TIME : "SPECIMEN_COLLECTION_TIME"
};



export const COLOR = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};