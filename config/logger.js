import { createLogger } from "@givc/shared-backend";

const processName = process.argv[1]?.includes("worker") ? "worker" : "api";
const baseFileName = `HIS-${process.env.LOG_ENVIRONMENT || process.env.LOG_ENVIROMENT}-${processName}`;
// console.log(baseFileName);


const commonConfig = {
  logDir: process.env.LOG_DIR || "../logs",
  logLevel: process.env.LOG_LEVEL || "info",
  archiveDir: process.env.LOG_ARCHIVE_DIR || "/home/admin/givc-rcm/archive",
  env: process.env.env || "production",

  rotation: {
    datePattern: process.env.LOG_ROTATION_DATE_PATTERN || "YYYY-MM-DD",
    maxSize: process.env.LOG_ROTATION_MAX_SIZE || "20m",
    frequency: process.env.LOG_ROTATION_FREQUENCY || "24h",
    maxFiles: process.env.LOG_ROTATION_MAX_FILES || "14d",
    zippedArchive: process.env.LOG_ROTATION_ZIP !== "false",
  },
};

export const SSO_LOGGER = createLogger({
  label: "SSO",
  logFile: baseFileName,
  ...commonConfig,
});
global.SSO_LOGGER = SSO_LOGGER;

export const REGISTRY_LOGGER = createLogger({
  label: "Registry",
  logFile: baseFileName,
  ...commonConfig,
});
global.REGISTRY_LOGGER = REGISTRY_LOGGER;

export const clientLogger = createLogger({
  label: "HL7-Client",
  logFile: baseFileName,
  ...commonConfig,
});
global.clientLogger = clientLogger;

export const oracleLogger = createLogger({
  label: "Oracle-Pool",
  logFile: baseFileName,
  ...commonConfig,
});
global.oracleLogger = oracleLogger;

export const MEDICATION_LOGGER = createLogger({
  label: "Medication",
  logFile: baseFileName,
  ...commonConfig,
});
global.MEDICATION_LOGGER = MEDICATION_LOGGER;

export const RADIOLOGY_LOGGER = createLogger({
  label: "Radiology",
  logFile: baseFileName,
  ...commonConfig,
});
global.RADIOLOGY_LOGGER = RADIOLOGY_LOGGER;

export const labTestLogger = createLogger({
  label: "labTest",
  logFile: baseFileName,
  ...commonConfig,
});
global.labTestLogger = labTestLogger;

export const TEMPLATE_LOGGER = createLogger({
  label: "processTemplate",
  logFile: baseFileName,
  ...commonConfig,
});
global.TEMPLATE_LOGGER = TEMPLATE_LOGGER;

export const CLINICAL_NOTES_LOGGER = createLogger({
  label: "ClinicalNotes",
  logFile: baseFileName,
  ...commonConfig,
});
global.CLINICAL_NOTES_LOGGER = CLINICAL_NOTES_LOGGER;

export const DEBUG = createLogger({
  label: "DEBUG",
  logFile: baseFileName,
  ...commonConfig,
});
global.DEBUG = DEBUG;
