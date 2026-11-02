import { initConstants, NPHIES_FAIL_ID } from "../util/constant.js";
import createMSHSegment from "./segments/createMSHSegment.js";
import createEVNSegment from "./segments/createEVNSegment.js";
import createPIDSegment from "./segments/createPIDSegment.js";
import createPV1Segment from "./segments/createPV1Segment.js";
import createPV2Segment from "./segments/createPV2Segment.js";
import createDG1Segments from "./segments/createDG1Segments.js";
import { getOracleConnection } from "../config/oracle-dynamic.js";
import { clientLogger } from "../config/logger.js";
import { getConfValue } from "../util/loadConf.js";
import { insertApiMessage } from "../util/insertApiMsgs.js";
import OracleDB from "oracledb";
import { getPatientIdentityInfo } from "../util/getPatientIdentityInfo.js";
import axios from "axios";
import { query } from "../config/pgDB.js";
import createPR1Segment from "./segments/createPR1Segment.js";
import createAL1Segment from "./segments/createAL1Segment.js";

/**
 * Builds an HL7 ADT message based on the provided query result and message type. This function initializes necessary constants, establishes a connection to the Oracle database, and constructs the various segments of the HL7 message (MSH, EVN, PID, PV1, PV2, and DG1) using the corresponding segment creation functions. The final message is assembled by joining the individual segments with carriage return delimiters.
 *
 * ⚠️ CONNECTION MANAGEMENT:
 * - If 'connection' parameter is provided: caller is responsible for cleanup
 * - If 'connection' is null: this function will create and CLOSE the connection automatically
 *
 * @param {Object} queryRow - the result row from the database query containing patient and visit information
 * @param {String} messageType - the HL7 message type to build (e.g. "ADT^A01")
 * @param {Object} connection - Oracle connection (optional; if null, function creates and closes its own)
 * @param {string} nphiesCsOrgId - nphiesCsOrgId for the facility
 * @param {string} facilityId - facilityId for the facility
 * @return {String} the complete HL7 ADT message as a string
 */
export async function createADTMessage(
  queryRow,
  messageType,
  connection = null,
  nphiesCsOrgId = null,
  facilityId = null,
  apiTransId = null,
  label = "",
) {
  clientLogger.debug(
    `Creating ADT message for messageType: ${messageType} and label: ${label} with queryRow: ${JSON.stringify(queryRow)}`,
  );
  await initConstants(nphiesCsOrgId, facilityId, apiTransId);

  let oracleConnection = connection;
  let connectionCreatedHere = false;

  try {
    if (!apiTransId) {
      throw new Error("apiTransId is required to create ADT message");
    }

    if (!oracleConnection) {
      const { rows: facilityRows } = await query(
        `SELECT * FROM facility WHERE facility_id = $1`,
        [facilityId],
      );

      if (facilityRows.length === 0) {
        await insertApiMessage({
          apiTransId,
          errorMessage: `Facility with ID ${facilityId} not found`,
          errorId: NPHIES_FAIL_ID.NOT_FOUND_FACILITY,
        });
        throw new Error(`Facility with ID ${facilityId} not found`);
      }
      const facility = facilityRows[0];
      oracleConnection = await getOracleConnection({
        facilityId,
        userParam: facility.his_db_username,
        passwordParam: facility.his_db_password,
        connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
      });
      connectionCreatedHere = true;
    }

    if (!oracleConnection) {
      await insertApiMessage({
        apiTransId,
        errorMessage: "Oracle connection is not established",
        errorId: NPHIES_FAIL_ID.ORACLE_CONNECTION,
      });
      throw new Error("Oracle connection is not established");
    }


    // add facility to the data so later if any function need it
    queryRow.facilityId = facilityId;

    const msgHeaderSegment = await createMSHSegment(
      {
        messageType: messageType,
        message_control_id: queryRow.message_control_id || "",
      },
      apiTransId,
    );

    const evnSegment = await createEVNSegment(
      {
        eventType: messageType.split("^")[1],
        trx_date: queryRow.trx_date,
        recordedDateTime: queryRow.recorded_datetime,
        eventOccurred: queryRow.event_occurred,
      },
      apiTransId,
    );

    const pidSegment = await createPIDSegment(
      queryRow,
      oracleConnection,
      apiTransId,
      facilityId,
    );
    const pv1Segment = await createPV1Segment(
      queryRow,
      oracleConnection,
      apiTransId,
      label,
    );


    const pv2Segment = await createPV2Segment(queryRow, apiTransId);
    const dg1Segments = await createDG1Segments(
      queryRow,
      oracleConnection,
      apiTransId,
    );

    const pr1Segments = await createPR1Segment(
      queryRow,
      oracleConnection,
      apiTransId,
    );
    const al1Segments = await createAL1Segment(
      queryRow,
      oracleConnection,
      apiTransId,
    );

    if (dg1Segments.length == 0 && ["ADT^A03"].includes(messageType)) {
      await insertApiMessage({
        apiTransId,
        errorMessage: `No diagnoses found for ,discharge message (ADT^A03) ,Patient ID : ${queryRow.patient_id || "''"} ,EpisodeNo : ${queryRow.episode_no || "''"}`,
        errorId: NPHIES_FAIL_ID.DIAGNOSIS,
      });
    }

    const msg = [
      msgHeaderSegment,
      evnSegment,
      pidSegment,
      pv1Segment,
      pv2Segment,
      ...((["ADT^A02", "ADT^A03", "ADT^A11"].includes(messageType) )
        ? []
        : al1Segments),
      ...(["ADT^A02"].includes(messageType) ? [] : dg1Segments),
      ...(["ADT^A02", "ADT^A11"].includes(messageType) ? [] : pr1Segments),
    ]
      .filter(Boolean)
      .join("\r");
    return msg;
  } finally {
    // Only close connection if we created it
    if (connectionCreatedHere && oracleConnection) {
      try {
        await oracleConnection.close();
        clientLogger.debug("Connection closed by createADTMessage");
      } catch (closeError) {
        clientLogger.error(
          `Error closing connection in createADTMessage: ${closeError.message}`,
        );
      }
    }
  }
}



export function cleanHL7Text(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "")
    .replace(/\|/g, " ")
    .replace(/\^/g, " ")
    .replace(/~/g, " ")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}