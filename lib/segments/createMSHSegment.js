import { CONST, NPHIES_FAIL_ID } from "../../util/constant.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import { formatDateTimeWithTimezone } from "./datesFormate.js";
import { v4 as uuidv4 } from 'uuid';
/**
 * Create MSH (Message Header) Segment
 */
export default async function createMSHSegment(data = {}, apiTransId = null) {
  clientLogger.debug(`Creating MSH segment with data: ${JSON.stringify(data)}`); // Debug log to trace input data
  let { messageType = "", message_control_id  } = data;

  if (!/^[A-Z]{2,4}\^[A-Z][A-Z0-9]{0,3}$/i.test(messageType)) {
    clientLogger.error(messageType);
    
    await insertApiMessage({
      apiTransId,
      errorMessage: "Invalid message type format. Expected format: ABC^A01 or similar",
      errorId: NPHIES_FAIL_ID.MESSAGE_TYPE,
    });
  }
  if(!message_control_id){
    await insertApiMessage({
      apiTransId,
      errorMessage: `message_control_id not provided ,Patient ID : ${data?.patient_id || "''"} ,EpisodeNo : ${data?.episode_no || "''"}`,
      errorId: NPHIES_FAIL_ID.MESSAGE_CONTROL_ID,
    });
  }

  return [
    "MSH", // MSH - Field Separator (R)
    String.raw`^~\&`, // MSH.1 - Encoding Characters (R)
    CONST.SENDING_APP, // MSH.2 - Sending Application (R)
    CONST.SENDING_FACILITY, // MSH.3 - Sending Facility (R)
    "", //CONST.RECEIVING_APP, // MSH.4 - Receiving Application (O)
    CONST.RECEIVING_FACILITY, // MSH.5 - Receiving Facility (O)
    formatDateTimeWithTimezone(new Date()), // MSH.6 - Date/Time of Message (R)
    "", // MSH.7 - Security (I)
    messageType, // MSH.8 - Message Type (R)
    message_control_id, // MSH.9 - Message Control ID (R)
    CONST.PROCESSING_ID, // MSH.10 - Processing ID (R) //! todo conf (HL7_PROCESSING_ID)
    CONST.NPHIES_CS_ADT_HL7_VERSION, // MSH.11 - Version ID (R)
    "", // MSH.12 - Sequence Number (I)
    "", // MSH.13 - Continuation Pointer (I)
    "", // MSH.14 - Accept Acknowledgment Type (I)
    "AL", // MSH.15 - Application Acknowledgment Type (I)
    "SAU", // MSH.16 - Country Code (I)
    "", // MSH.17 - Character Set (I)
    "", // MSH.18 - Principal Language of Message (I)
    "", // MSH.19 - Alternate Character Set Handling Scheme (I)
    "", // MSH.20 - Message Profile Identifier (I)
  ].join("|");
};