import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object|null} EncounterType
 * @property {string} ENCOUNTER_TYPE - Encounter type code (O=Outpatient, I=Inpatient, E=Emergency, D=Day case)
 */

/**
 * @typedef {Object|null} Encounter
 * @property {string} ENCOUNTER_ID - Encounter ID
 * @property {string} ENCOUNTER_CLASS_CODE - Encounter class code
 * @property {string} ENCOUNTER_CLASS_DISPLAY - Encounter class display text
 */
export async function fetchEncounter({
  patientId,
  episodeNo,
  oracleConnection,
  encounterType,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "mapping encounter type" +
        JSON.stringify({ patientId, episodeNo, encounterType }),
    );

    //     const query = `
    //         SELECT pe.start_date,
    //        pe.end_date,
    //        pg.admission_no encounter_no,
    //        pg.attendance_type encounter_type
    //   FROM patient_eligibility pg
    //        JOIN patient_episodes pe
    //           ON     pe.patient_id = pg.patient_id
    //              AND pe.episode_no = pg.episode_no
    //  WHERE     pe.patient_id = :patientId
    //        AND PE.EPISODE_NO = :episodeNo
    //        AND pg.eligibility_status != 'C'
    //        and rownum = 1
    //     `;

    //     const result = await oracleConnection.execute(
    //       query,
    //       { patientId, episodeNo },
    //       {
    //         outFormat: OracleDB.OUT_FORMAT_OBJECT,
    //       },
    //     );

    const encounter = encounterType
      ? {
          ENCOUNTER_TYPE: encounterType,
          ENCOUNTER_CLASS_CODE: getEncounterClassCode(
            encounterType,
          ),
          ENCOUNTER_CLASS_DISPLAY: getEncounterClassDisplay(
            encounterType,
          ),
        }
      : null;

    MEDICATION_LOGGER.debug(
      "Fetched encounter type" +
        JSON.stringify({
          patientId,
          episodeNo,
          encounter: encounter
            ? {
                ENCOUNTER_TYPE: encounter.ENCOUNTER_TYPE,
                ENCOUNTER_CLASS_CODE: encounter.ENCOUNTER_CLASS_CODE,
                ENCOUNTER_CLASS_DISPLAY: encounter.ENCOUNTER_CLASS_DISPLAY,
              }
            : null,
        }),
    );

    return encounter;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching encounter type", error);
    return null;
  }
}

/**
 * Gets encounter class code based on attendance type
 * @param {string} attendanceType - Attendance type (O, I, E, D)
 * @returns {string} Encounter class code
 */
function getEncounterClassCode(attendanceType) {
  const codes = {
    O: "AMB",
    I: "IMP",
    E: "EMER",
    D: "IMP",
  };
  return codes[attendanceType] || "";
}

/**
 * Gets encounter class display text
 * @param {string} attendanceType - Attendance type
 * @returns {string} Display text
 */
function getEncounterClassDisplay(attendanceType) {
  const displays = {
    O: "Ambulatory",
    I: "Inpatient",
    E: "Emergency",
    D: "Inpatient",
  };
  return displays[attendanceType] || "";
}
