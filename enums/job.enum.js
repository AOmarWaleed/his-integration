export const JobType = {
  SCHEDULED: "SCHEDULED",
  ON_DEMAND: "ON_DEMAND",
  EVENT_BASED: "EVENT_BASED",
  RECURRING: "RECURRING",
};

export const JobStatus = {
  ENABLED: true,
  DISABLED: false,
};

export const JobLogStatus = {
  RUNNING: "running",
  SUCCESS: "success",
  FAIL: "fail",
  CANCELLED: "cancelled",
};

export const JobAction = {
  SEND_LAB_ORDER: "sendLaboratoryOrderNphiesCS",
  SEND_LAB_REPORT: "sendLaboratoryReportNphiesCS",
  SEND_CLINICAL_NOTES: "sendClinicalNotesNphiesCS",

  SEND_RADIO_ORDER: "sendRadiologyOrderNphiesCS",
  SEND_RADIO_REPORT: "sendRadiologyReportNphiesCS",

  SEND_NPHIES_MEDICATION_REQUEST: "sendMedicationRequestNphiesCS",
  SEND_NPHIES_MEDICATION_DISPENSE: "sendMedicationDispenseNphiesCS",

  SEND_NPHIES_ADT_MESSAGES: "processADTMsgs",
  SEND_HL7_MESSAGES: "HISHL7Messages",
};

export const JobOperation = {
  CRON_JOB_NOTIFICATIONS: "cronJobNotifications",
  CRON_JOB_HL7: "cronJobHL7",
  MANUAL_EXECUTION: "manualExecution",
  SYSTEM_TRIGGER: "systemTrigger",
};

export const LoggingLevel = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
};

export const JobPriority = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const STATUS = {
  ERROR: "ERROR",
  FAIL: "FAIL",
  SUCCESS: "SUCCESS",
};
