import OracleDB from "oracledb";
import { CONST, NPHIES_FAIL_ID } from "../../util/constant.js";
import { formatDoctor } from "../../util/formatDoctor.js";
import { getAdmissionDate } from "../../util/getAdmissionDate.js";
import { getAdmissionType } from "../../util/getAdmissionType.js";
import { getConsultantResponsibility } from "../../util/getConsultantResponsibility.js";
import { getHospitalService } from "../../util/getHospitalService.js";
import { getPatientLocation } from "../../util/getPatientLocation.js";
import { getVisitConsultantId } from "../../util/getVisitConsultantId.js";
import { formatDateTimeWithTimezone } from "./datesFormate.js";
import { getConsultantId } from "../../util/getConsultantId.js";
import { clientLogger } from "../../config/logger.js";
import dayjs from "dayjs";
import { insertApiMessage } from "../../util/insertApiMsgs.js";
/**
 * Create PV1 (Patient Visit) Segment for nphies A04
 */
export default async function createPV1Segment(
  data,
  dbConn,
  apiTransId = null,
  label = "",
  sequence = 1,
) {
  if (!data.visit_no) {
    await insertApiMessage({
      apiTransId,
      errorMessage: "visit_no is required",
      errorId: NPHIES_FAIL_ID.VISIT_NO,
    });
  }

  const { episode_no, patient_id } = data || {};
  if (!episode_no || !patient_id) {
    await insertApiMessage({
      apiTransId,
      errorMessage: "Missing EpisodeNo or PatientId",
    });
  }

  // ! get consultant_id for this patient and episode
  const consultantData = await getConsultantId({
    connection: dbConn,
    episodeNo: episode_no,
    patientId: patient_id,
    apiTransId: apiTransId,
  });

  const consultantId = consultantData?.consultant_id;

  //  check if attendance_type exist (in consultant data or original data from the query)  or insert  errors
  if (!data.attendance_type) {
    if (consultantData?.attendance_type) {
      data.attendance_type = consultantData.attendance_type;
    } else {
      data.attendance_type = "";
      await insertApiMessage({
        apiTransId,
        errorMessage: "Attendance Type is required",
      });
    }
  }

  if (!consultantId) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Consultant ID not found for ,Patient ID : ${patient_id || "''"} ,EpisodeNo : ${episode_no || "''"}`,
      errorId: NPHIES_FAIL_ID.CONSULTANT_ID,
    });
    clientLogger.debug(
      `No consultantId found for patient ID ${patient_id} and episode no ${episode_no}. This may be expected for certain visit types.`,
    );
  }

  // PV1.2 - Patient Class
  const patientClass = data.attendance_type;

  // Get patient location
  let roomNumber = "";
  let bed = "";
  let entityId = "";
  try {
    const patLocation = await getPatientLocation(data.visit_no, dbConn);
    roomNumber = patLocation.roomNumber || "";
    bed = patLocation.bed || "";
    entityId = patLocation.entityId || data.work_entity || "";
  } catch (error) {
    // Continue with empty values
  }

  // PV1.3 - Assigned Patient Location
  // Format: entityId^^^^facilityId^ISO
  const facilityId = CONST.SENDING_FACILITY?.split("^")[1] || data.facility_id;

  const assignedPatientLocation = [
    entityId, // PV1.3.1 - Point of Care
    roomNumber, // PV1.3.2 - Room
    bed, // PV1.3.3 - Bed
    facilityId, // PV1.3.4 - Facility (Universal ID)
    "ISO", // PV1.3.5 - Universal ID Type
    "", // PV1.3.6 - Location Status
    "", // PV1.3.7 - Person Location Type
    "", // PV1.3.8 - Building
    "", // PV1.3.9 - Floor
    "", // PV1.3.10 - Location Description
    "", // PV1.3.11 - Comprehensive Location Identifier
    "", // PV1.3.12 - Assigning Authority for Location
  ].join("^");

  // PV1.6 - Prior Patient Location
  const priorPatientLocation = data.prior_work_entity
    ? [
        data.prior_work_entity || "",
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

  // PV1.19 - Visit Number
  const visitNumber = `${data.visit_no}^^^VISNo&${CONST.VISIT_NO_AUTHORITY}&ISO`;

  // PV1.44 - Admit Date/Time
  const admitDateTime =
    (await getAdmissionDate(data.visit_no, dbConn)) || data.admit_date || "";
  clientLogger.debug(
    // Admit Date/Time for visit_no I42222286: 20260609005142
    // "discharge_date":"20260811135503"
    `Admit Date/Time for visit_no ${data.visit_no}: ${admitDateTime}`,
  );

  // Get values
  const { methodOfAdm, dischargeDisposition, admissionSourceCode } =
    await getAdmissionType(data.visit_no, dbConn);
  clientLogger.debug(
    `Admission Type for visit_no ${data.visit_no}: ${methodOfAdm}`,
  );
  const {hospitalService , deptType } = await getHospitalService(data.work_entity, dbConn);
  clientLogger.debug(
    `Hospital Service for work_entity ${data.work_entity}: ${hospitalService}, deptType: ${deptType}`,
  );

  if (
    !hospitalService &&
    ["A03_IP", "A01", "A03_ER", "A03_OPD"].includes(label)
  ) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Hospital Service information could not be found for ,work_entity : ${data.work_entity || "''"}`,
      errorId: NPHIES_FAIL_ID.MAP_WE,
    });
  } else {
    clientLogger.debug(
      `⛔🗺️ Hospital Service information found for work_entity ${data.work_entity}: ${hospitalService}`,
    );
  }

  // Get doctor responsibility
  const responsibility = consultantData?.responsibility || "1";

  clientLogger.debug(
    `Consultant Responsibility for patient_id ${data.patient_id}, episode_no ${data.episode_no}, work_entity ${data.work_entity}, attendance_type ${data.attendance_type}, consultant_id ${consultantId}: ${responsibility}`,
  );

  // Format doctor fields
  const attendingDoctor = await formatDoctor(consultantId, dbConn, data);

  clientLogger.debug(
    `Attending Doctor (Format doctor fields) for consultant_id ${consultantId}: ${attendingDoctor}`,
  );

  if (!attendingDoctor && ["A03_IP"].includes(label)) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Attending Doctor information could not be formatted for ,consultant_id : ${consultantId || "''"}`,
      errorId: NPHIES_FAIL_ID.ATTENDING_DOCTOR,
    });
  } else {
    clientLogger.debug(
      `Attending Doctor information formatted successfully for consultant_id ${consultantId}: ${attendingDoctor}`,
    );
  }

  // Referring, Consulting, and Admitting doctors are the same if responsibility = 1
  let referringDoctor = "";
  let consultingDoctor = "";
  let admittingDoctor = "";

  if (responsibility === "1" && attendingDoctor) {
    referringDoctor = attendingDoctor;
    consultingDoctor = attendingDoctor;
    admittingDoctor = attendingDoctor;
  }

  // Get discharge date
  const dischargeDateTime = data.discharge_date || "";

  // Validate Outpatient visit date difference
  if (
    patientClass?.toUpperCase() === "O" ||
    patientClass?.toUpperCase() === "OUTPATIENT"
  ) {
    let validAdmitDate = false;
    let admitDate = null;
    let dischargeDate = null;

    // Check if admit date exists and is valid
    if (admitDateTime) {
      admitDate = dayjs(admitDateTime, "YYYYMMDDHHmmss");
      if (admitDate.isValid()) {
        validAdmitDate = true;
      } else {
        // Insert error if admit date is invalid
        await insertApiMessage({
          apiTransId,
          errorMessage:
            `Outpatient visit validation fail for ,visit_no : ${data.visit_no || "''"}: ` +
            `,Admit date/time (${admitDateTime}) is invalid. Expected format: YYYYMMDDHHmmss.`,
          errorId: NPHIES_FAIL_ID.ADMIT_DATE,
        });
      }
    } else {
      // Insert error if admit date does not exist
      await insertApiMessage({
        apiTransId,
        errorMessage:
          `Outpatient visit validation fail for ,visit_no : ${data.visit_no || "''"}: ` +
          `,Admit date/time is missing. This field is required for Outpatient visits.`,
        errorId: NPHIES_FAIL_ID.ADMIT_DATE,
      });
    }

    // Handle discharge date
    if (dischargeDateTime) {
      dischargeDate = dayjs(dischargeDateTime, "YYYYMMDDHHmmss");
      if (!dischargeDate.isValid()) {
        // If discharge date is invalid, set it equal to admit date
        if (validAdmitDate) {
          const formattedAdmitDate = admitDate.format("YYYYMMDDHHmmss");
          data.discharge_date = formattedAdmitDate;
          dischargeDate = admitDate;

          clientLogger.debug(
            `Invalid discharge date for visit_no ${data.visit_no}. ` +
              `Set discharge date equal to admit date: ${formattedAdmitDate}`,
          );
        } else {
          // If admit date is also invalid, log warning
          clientLogger.debug(
            `Invalid discharge date for visit_no ${data.visit_no}: ${dischargeDateTime}. ` +
              `Cannot set to admit date as admit date is invalid.`,
          );
        }
      }
    } else {
      // If discharge date doesn't exist, set it equal to admit date
      if (validAdmitDate) {
        const formattedAdmitDate = admitDate.format("YYYYMMDDHHmmss");
        data.discharge_date = formattedAdmitDate;
        dischargeDate = admitDate;

        clientLogger.debug(
          `Missing discharge date for visit_no ${data.visit_no}. ` +
            `Set discharge date equal to admit date: ${formattedAdmitDate}`,
        );
      } else {
        clientLogger.debug(
          `Missing discharge date for visit_no ${data.visit_no}. ` +
            `Cannot set to admit date as admit date is invalid.`,
        );
      }
    }

    // If both dates are valid, check the 24-hour rule
    if (validAdmitDate && dischargeDate && dischargeDate.isValid()) {
      const diffInHours = dischargeDate.diff(admitDate, "hour", true);
      const diffInHoursAbsolute = Math.abs(diffInHours);

      clientLogger.debug(
        `Outpatient visit ${data.visit_no} - Admit: ${admitDateTime}, Discharge: ${data.discharge_date}, Difference: ${diffInHoursAbsolute} hours`,
      );

      // If difference exceeds 24 hours, set discharge date equal to admit date
      if (diffInHoursAbsolute > 24) {
        const formattedAdmitDate = admitDate.format("YYYYMMDDHHmmss");
        data.discharge_date = formattedAdmitDate;

        clientLogger.debug(
          `Outpatient visit ${data.visit_no} - Discharge date (${dischargeDateTime}) is more than 24 hours from admit date. ` +
            `Automatically set discharge date to admit date: ${formattedAdmitDate}`,
        );
      } else {
        clientLogger.debug(
          `Outpatient visit ${data.visit_no} - Admit and Discharge dates are valid within 24 hours.`,
        );
      }
    }
  }

  if (!dischargeDateTime && ["A03_ER", "A03_IP", "A03_OPD"].includes(label)) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Discharge Date is required for ,visit_no : ${data.visit_no || "''"} ,label : ${label || "''"}`,
      errorId: NPHIES_FAIL_ID.DISCHARGE_DATE,
    });
  }

  if (!admitDateTime) {
    await insertApiMessage({
      apiTransId,
      errorMessage: `Admit Date is required for ,visit_no : ${data.visit_no || "''"} ,label : ${label || "''"}`,
      errorId: NPHIES_FAIL_ID.ADMIT_DATE,
    });
  }

  return [
    "PV1", // PV1 - Segment Name
    sequence.toString(), // PV1.1 - Set ID
    patientClass, // PV1.2 - Patient Class
    "", //assignedPatientLocation, // PV1.3 - Assigned Patient Location
    methodOfAdm, // PV1.4 - Admission Type
    "", // PV1.5 - Preadmit Number
    priorPatientLocation, // PV1.6 - Prior Patient Location
    attendingDoctor, // PV1.7 - Attending Doctor
    referringDoctor, // PV1.8 - Referring Doctor
    consultingDoctor, // PV1.9 - Consulting Doctor
    hospitalService, // PV1.10 - Hospital Service
    "", // PV1.11 - Temporary Location
    "", // PV1.12 - Preadmit Indicator
    "", // PV1.13 - Re-admission Indicator
    admissionSourceCode, // PV1.14 - Admit Source
    "", // PV1.15 - Ambulatory Status
    "", // PV1.16 - VIP Indicator
    admittingDoctor, // PV1.17 - Admitting Doctor
    "", // PV1.18 - Patient Type (cleared as per MOH request)
    visitNumber, // PV1.19 - Visit Number
    "", // PV1.20 - Financial Class
    "", // PV1.21 - Charge Price Indicator
    "", // PV1.22 - Courtesy Code
    "", // PV1.23 - Credit Rating
    "", // PV1.24 - Contract Code
    "", // PV1.25 - Contract Effective Date
    "", // PV1.26 - Contract Amount
    "", // PV1.27 - Contract Period
    "", // PV1.28 - Interest Code
    "", // PV1.29 - Transfer to Bad Debt Code
    "", // PV1.30 - Transfer to Bad Debt Date
    "", // PV1.31 - Bad Debt Agency Code
    "", // PV1.32 - Bad Debt Transfer Amount
    "", // PV1.33 - Bad Debt Recovery Amount
    "", // PV1.34 - Delete Account Indicator
    "", // PV1.35 - Delete Account Date
    dischargeDisposition, // PV1.36 - Discharge Disposition
    "", // PV1.37 - Discharged to Location
    "", // PV1.38 - Diet Type
    "", // PV1.39 - Servicing Facility
    "", // PV1.40 - Bed Status
    "", // PV1.41 - Account Status
    "", // PV1.42 - Pending Location
    "", // PV1.43 - Prior Temporary Location
    formatDateTimeWithTimezone(admitDateTime), // PV1.44 - Admit Date/Time
    formatDateTimeWithTimezone(dischargeDateTime) || "", // PV1.45 - Discharge Date/Time
    "", // PV1.46 - Current Patient Balance
    "", // PV1.47 - Total Charges
    "", // PV1.48 - Total Adjustments
    "", // PV1.49 - Total Payments
    "", // PV1.50 - Alternate Visit ID
    "", // PV1.51 - Visit Indicator
    "", // PV1.52 - Other Healthcare Provider
  ].join("|");
}
