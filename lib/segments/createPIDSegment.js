import axios from "axios";
import { clientLogger } from "../../config/logger.js";
import { CONST, NPHIES_FAIL_ID } from "../../util/constant.js";
import { fetchPatientById } from "../../util/fetchPatient.js";
import { getPatientIdentityInfo } from "../../util/getPatientIdentityInfo.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import OracleDB from "oracledb";

export default async function createPIDSegment(
  masterRow,
  dbConn,
  apiTransId = null,
  facilityId = null,
  sequence = 1,
) {
  let patientData = {};
  if (masterRow.patient_id) {
    patientData = await fetchPatientById({
      patientId: masterRow.patient_id,
      oracleConnection: dbConn,
      facilityId,
    });
    if (patientData) {
      clientLogger.debug(
        `Fetched patient data for patient_id ${masterRow.patient_id}: ${JSON.stringify(
          patientData,
        )}`,
      );
    } else {
      await insertApiMessage({
        apiTransId,
        errorMessage: `No patient data found for ,Patient ID : ${masterRow.patient_id || "''"} ,EpisodeNo : ${masterRow.episode_no || "''"}`,
      });
    }
  } else {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Patient ID is required to fetch patient data ,Patient ID : ${masterRow.patient_id || "''"} ,EpisodeNo : ${masterRow.episode_no || "''"}`,
    });
  }

  if (!patientData.HEALTH_ID) {
    await insertApiMessage({
      apiTransId,
            errorMessage: `Health ID missing for ,Patient ID:${patientData.PATIENT_ID || "''"} ,Facility: ${facilityId || "''"}, NOT found using ,Birth Date : ${patientData?.getHealthIdInfo?.dob || "''"} ,ID-No : ${patientData?.getHealthIdInfo?.identityNo || "''"} ,Type : ${patientData?.getHealthIdInfo?.identityType || "''"}`,

      errorId: NPHIES_FAIL_ID.HEALTH_ID,
    });

  
  }

  if (
    patientData.HEALTH_ID &&
    patientData?.HEALTH_ID?.trim()?.toLowerCase() == "undefined"
  ) {
    patientData.HEALTH_ID = null;
    clientLogger.warn(
      `HealthId is set to null because it was "undefined" for patientId: ${patientData.PATIENT_ID}`,
    );
    await insertApiMessage({
      apiTransId,
      errorMessage: `Health ID was "undefined" for ,Patient ID: ${patientData.PATIENT_ID || "''"} ,EpisodeNo : ${masterRow.episode_no || "''"} and has been set to null`,
      errorId: NPHIES_FAIL_ID.HEALTH_ID,
    });
  }

  if (!patientData.BIRTH_TIME) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Date of Birth is required ,Patient ID : ${masterRow.patient_id || "''"} ,EpisodeNo : ${masterRow.episode_no || "''"}`,
    });
  }

  const setId = sequence.toString(); // PID.1 - Set ID
  const healthIdField = `${patientData.HEALTH_ID?.trim()}^^^NPHIES&${CONST.NPHIES_ID_AUTHORITY}.1&ISO^NI`; // PID.3 - Health ID (healthid)

  const englishName = [
    // PID.5 - Patient Name
    patientData.LAST_NAME || "Unknown", // pat_name_4 / pat_name_family
    patientData.FIRST_NAME || "Unknown", // pat_name_1
    patientData.SECOND_NAME || "", // pat_name_2
    patientData.THIRD_NAME ? patientData.THIRD_NAME?.slice(0, 10) : "", // pat_name_3 ? max 10 chars
    masterRow.pat_name_prefix ? masterRow.pat_name_prefix?.slice(0, 8) : "", // pat_title ? max 8 chars
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].join("^");

  const mothersMaidenName = [
    // PID.6 - Mother's Maiden Name
    patientData.MOTHER_NAME || "", // mothers_name_1
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].join("^");

  const dateOfBirth = patientData.BIRTH_TIME || ""; // PID.7 - Date of Birth (dob)

  const arabicName = [
    // PID.9 - Patient Alias
    patientData.PAT_NAME_FAMILY_A || "", // scnd_pat_name_4
    patientData.PAT_NAME_1_A || "", // scnd_pat_name_1
    patientData.PAT_NAME_OTHERS_A || "", // scnd_pat_name_2
    patientData.PAT_NAME_SUFFIX_A
      ? patientData.PAT_NAME_SUFFIX_A?.slice(0, 10)
      : "", // scnd_pat_name_3
    patientData.PAT_NAME_PREFIX_A
      ? patientData.PAT_NAME_PREFIX_A?.slice(0, 8)
      : "", // scnd_pat_title
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].join("^");

  const race = ""; // PID.10 - Race

  let streetAddress = patientData.STREET || ""; // street from patient_contacts
  if (patientData.DISTRICT) {
    // district from codes
    streetAddress += streetAddress
      ? ", " + patientData.DISTRICT
      : patientData.DISTRICT;
  }

  const patientAddress = [
    // PID.11 - Patient Address
    streetAddress,
    "",
    patientData.CITY || "", // city from patient_contacts
    patientData.STATE || "", // state from patient_contacts
    patientData.POSTAL_CODE || "", // postal_code from patient_contacts
    "SAU",
    "H",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].join("^");

  const homePhone = patientData.HOME_PHONE // PID.13 - Home Phone (home_phone)
    ? [patientData.HOME_PHONE, "", "", "", "", "", "", "", "", "", "", ""].join(
        "^",
      )
    : "";

  const businessPhone = patientData.BUSINESS_PHONE // PID.14 - Business Phone (phone_1)
    ? [
        patientData.BUSINESS_PHONE,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ].join("^")
    : "";

  const mobilePhone = patientData.MOBILE_NO // PID.15 - Mobile Phone (mobile_phone)
    ? [
        patientData.MOBILE_NO,
        "PRS",
        "CP",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ].join("^")
    : "";

  const patientAccountNumber = [
    // PID.18 - Patient Account Number
    masterRow.episode_no || "", // episode_no
    masterRow.visit_no || "", // visit_no
    masterRow.appointment_id || "", // appointment_id
    "",
    "",
    "",
    "",
    "",
  ].join("^");

  const birthPlace = "UNK"; // PID.23 - Birth Place
  const deathDate = masterRow.death_date || ""; // PID.29 - Death Date (death_date)
  const deathIndicator = masterRow.death_flag || ""; // PID.30 - Death Indicator (death_flag)
  const patientCategory = patientData.PATIENT_CATEGORY || ""; // PID.31 - Patient Category (patient_category)
  const registrationType = patientData.REGISTRATION_TYPE || ""; // PID.32 - Registration Type (registration_type)
  const mrn = masterRow.user_file_id || ""; // PID.2 - Patient ID (mrn/user_file_id)

  return [
    "PID", // Segment name
    setId, // PID.1
    mrn, // PID.2 - mrn/user_file_id
    healthIdField, // PID.3 - healthid
    "", // PID.4 - Alternate Patient ID
    englishName, // PID.5 - Patient Name
    mothersMaidenName, // PID.6 - Mother's Maiden Name
    dateOfBirth, // PID.7 - dob
    patientData?.GENDER_CODE_MAP, // PID.8 - gender
    arabicName, // PID.9 - Patient Alias
    race, // PID.10 - Race
    patientAddress, // PID.11 - Patient Address
    "", // PID.12 - County Code
    homePhone, // PID.13 - home_phone
    businessPhone, // PID.14 - phone_1
    "", // PID.15 - Primary Language
    patientData?.MARITAL_STATUS_CODE_MAP, // PID.16 - marital_code
    patientData?.RELIGION_CODE_MAP, // PID.17 - religion_code
    "", //patientAccountNumber, // PID.18 - episode_no/visit_no/appointment_id
    "", // PID.19 - SSN Number
    "", // PID.20 - Driver's License Number
    "", // PID.21 - Mother's Identifier
    "", // PID.22 - Ethnic Group
    birthPlace, // PID.23 - Birth Place (UNK)
    "", // PID.24 - Multiple Birth Indicator
    "", // PID.25 - Birth Order
    "", // PID.26 - Citizenship
    "", // PID.27 - Veterans Military Status
    patientData?.NATIONALITY_CODE_MAP, // PID.28 - Nationality
    deathDate, // PID.29 - Patient Death Date and Time
    deathIndicator, // PID.30 - Patient Death Indicator
    "", // PID.31 - Identity Unknown Indicator
    "", // PID.32 - Identity Reliability Code
    "", // PID.33 - Last Update Date/Time
    "", // PID.34 - Last Update Facility
    "", // PID.35 - Taxonomic Classification Code
    "", // PID.36 - Breed Code
    "", // PID.37 - Strain
    "", // PID.38 - Production Class Code
  ].join("|");
}
