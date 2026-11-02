import { NPHIES_FAIL_ID } from "../../util/constant.js";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
import { formatDateTimeWithTimezone } from "./datesFormate.js";

/**
 * Create EVN (Event Information) Segment
 */
export default async function createEVNSegment(data = {}, apiTransId = null) {
  const {
    eventType = "",
    trx_date,
    recordedDateTime = new Date(),
    eventOccurred = new Date(),
  } = data;

  if (!eventType) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Event type must be provided ,Patient ID : ${data?.patient_id || "''"} ,EpisodeNo : ${data?.episode_no || "''"}`,
      errorId: NPHIES_FAIL_ID.EVENT_TYPE,
    });
  }

  const recordedDateTimeValue = trx_date || recordedDateTime || new Date();
  const eventOccurredValue = trx_date || eventOccurred || new Date();

  return [
    "EVN", // EVN.1 - Segment Name (R)
    eventType, // EVN.2 - Event Type Code (I)
    formatDateTimeWithTimezone(recordedDateTimeValue), // EVN.3 - Recorded Date/Time (O)
    "", // EVN.4 - Date/Time Planned Event (I)
    "", // EVN.5 - Event Reason Code (I)
    "", // EVN.6 - Operator ID (O)
    formatDateTimeWithTimezone(eventOccurredValue), // EVN.7 - Event Occurred (O)
    "", // EVN.8 - Event Facility (O)
  ].join("|");
};
