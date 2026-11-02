import OracleDB from "oracledb";
import { MEDICATION_LOGGER } from "../config/logger.js";

/**
 * @typedef {Object} VitalSigns
 * @property {string} temperature - Body temperature
 * @property {string} weight - Weight
 * @property {string} lowBloodPressure - Diastolic blood pressure
 * @property {string} highBloodPressure - Systolic blood pressure
 * @property {string} pulse - Pulse rate
 * @property {string} respiratoryRate - Respiratory rate
 * @property {string} height - Height
 * @property {string} oxygenSaturation - Oxygen saturation
 */

/**
 * Fetches patient vital signs
 * Note: This function calls a stored procedure get_patient_readings
 * @param {Object} params - Parameters
 * @param {Object} params.connection - Oracle database connection
 * @param {number} params.patientId - Patient ID
 * @param {number} params.episodeNo - Episode number
 * @returns {Promise<VitalSigns>} Vital signs data
 */
export async function fetchPatientReadings({
  connection,
  patientId,
  episodeNo,
}) {
  try {
    MEDICATION_LOGGER.debug(
      "Fetching vital signs" + JSON.stringify({ patientId, episodeNo }),
    );

    // Using the stored procedure insurance_mnt.get_patient_readings
    const query = `
        DECLARE
            v_temperature VARCHAR2(80);
            v_weight VARCHAR2(80);
            v_low_blood_pressure VARCHAR2(80);
            v_high_blood_pressure VARCHAR2(80);
            v_pulse VARCHAR2(80);
            v_respiratory_rate VARCHAR2(80);
            v_height VARCHAR2(80);
            v_oxygen_saturation VARCHAR2(80);
            v_result NUMBER;
        BEGIN
            v_result := insurance_mnt.get_patient_readings(
                p_patient_id => :patientId,
                p_episode_no => :episodeNo,
                p_temperature => v_temperature,
                p_weight => v_weight,
                p_low_blood_pressure => v_low_blood_pressure,
                p_hight_blood_pressure => v_high_blood_pressure,
                p_pulse_rate => v_pulse,
                p_respiratory_rate => v_respiratory_rate,
                p_hight => v_height,
                p_oxygen_saturation => v_oxygen_saturation
            );
            
            :temperature := v_temperature;
            :weight := v_weight;
            :low_bp := v_low_blood_pressure;
            :high_bp := v_high_blood_pressure;
            :pulse := v_pulse;
            :resp_rate := v_respiratory_rate;
            :height := v_height;
            :oxygen_sat := v_oxygen_saturation;
            :result := v_result;
        END;
    `;

    const binds = {
      patientId: {
        dir: OracleDB.BIND_IN,
        type: OracleDB.NUMBER,
        val: patientId,
      },
      episodeNo: {
        dir: OracleDB.BIND_IN,
        type: OracleDB.NUMBER,
        val: episodeNo,
      },
      temperature: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.STRING,
        maxSize: 80,
      },
      weight: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 80 },
      low_bp: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 80 },
      high_bp: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 80 },
      pulse: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 80 },
      resp_rate: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 80 },
      height: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 80 },
      oxygen_sat: {
        dir: OracleDB.BIND_OUT,
        type: OracleDB.STRING,
        maxSize: 80,
      },
      result: { dir: OracleDB.BIND_OUT, type: OracleDB.NUMBER },
    };

    const result = await connection.execute(query, binds, {
      outFormat: OracleDB.OUT_FORMAT_OBJECT,
    });

    const vitalSigns = {
      TEMPERATURE: result.outBinds.temperature || "",
      WEIGHT: result.outBinds.weight || "",
      LOW_BLOOD_PRESSURE: result.outBinds.low_bp || "",
      HIGH_BLOOD_PRESSURE: result.outBinds.high_bp || "",
      PULSE: result.outBinds.pulse || "",
      RESPIRATORY_RATE: result.outBinds.resp_rate || "",
      HEIGHT: result.outBinds.height || "",
      OXYGEN_SATURATION: result.outBinds.oxygen_sat || "",
    };

    MEDICATION_LOGGER.debug(
      "Fetched vital signs: " + JSON.stringify(vitalSigns),
    );
    MEDICATION_LOGGER.debug("Procedure result: " + result.outBinds.result);

    return vitalSigns;
  } catch (error) {
    MEDICATION_LOGGER.error("Error fetching patient readings", error);
    return {
      TEMPERATURE: "",
      WEIGHT: "",
      LOW_BLOOD_PRESSURE: "",
      HIGH_BLOOD_PRESSURE: "",
      PULSE: "",
      RESPIRATORY_RATE: "",
      HEIGHT: "",
      OXYGEN_SATURATION: "",
    };
  }
}
