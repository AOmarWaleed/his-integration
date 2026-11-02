import { JobAction } from "../enums/job.enum.js";
import { processADTMsgsForFacility } from "../services/adt/processingMsgs.js";
import { handleDocOrderRequest } from "../services/doc/docMain.js";
import { medicationPrescriptionToNPHIES } from "../services/medication/medicationMain.js";
import { medicationDispenseToNPHIES } from "../services/dispense/dispenseMain.js";
import { withOracleConnection } from "../config/oracle-dynamic.js";

/**
 * Canonical list of third-party jobs.
 * @returns {Array<{ jobAction:string, processFunction:Function }>}
 */
export function getThirdPartyJobDefinitions() {
  return [
    {
      jobAction: JobAction.SEND_NPHIES_MEDICATION_REQUEST,
      processFunction: withOracleConnection(
        async ({ connection, facility, abortSignal }) => {
          const summary = await medicationPrescriptionToNPHIES(connection, {
            facility,
            abortSignal,
          });
          return summary;
        },
      ),
    },
    {
      jobAction: JobAction.SEND_NPHIES_MEDICATION_DISPENSE,
      processFunction: withOracleConnection(
        async ({ connection, facility, abortSignal }) => {
          const summary = await medicationDispenseToNPHIES(connection, {
            facility,
            abortSignal,
          });

          return summary;
        },
      ),
    },
    {
      jobAction: JobAction.SEND_NPHIES_ADT_MESSAGES,
      processFunction: withOracleConnection(
        async ({ connection, facility, abortSignal, params }) => {
          const summary = await processADTMsgsForFacility({
            connection,
            facility,
            abortSignal,
            params,
          });
          return summary;
        },
      ),
    },

    {
      jobAction: JobAction.SEND_LAB_ORDER,
      processFunction: withOracleConnection(
        async ({ connection, facility, params, abortSignal }) => {
          const summary = await handleDocOrderRequest({
            facility,
            connection,
            abortSignal,
            params: {
              ...params,
              docType: "lab-order",
              startDate: null,
              endDate: null,
            },
          });
          return summary;
        },
      ),
    },

    {
      jobAction: JobAction.SEND_CLINICAL_NOTES,
      processFunction: withOracleConnection(
        async ({ connection, facility, params, abortSignal }) => {
          const summary = await handleDocOrderRequest({
            facility,
            connection,
            abortSignal,
            params: {
              ...params,
              docType: "clinical-notes",
              startDate: null,
              endDate: null,
            },
          });
          return summary;
        },
      ),
    },

    {
      jobAction: JobAction.SEND_LAB_REPORT,
      processFunction: withOracleConnection(
        async ({ connection, facility, params, abortSignal }) => {
          const summary = await handleDocOrderRequest({
            facility,
            connection,
            abortSignal,
            params: {
              ...params,
              docType: "lab-report",
              startDate: null,
              endDate: null,
            },
          });
          return summary;
        },
      ),
    },
    {
      jobAction: JobAction.SEND_RADIO_ORDER,
      processFunction: withOracleConnection(
        async ({ connection, facility, abortSignal }) => {
          const summary = await handleDocOrderRequest({
            facility,
            connection,
            abortSignal,
            params: { docType: "radiology-order" },
          });
          return summary;
        },
      ),
    },
    {
      jobAction: JobAction.SEND_RADIO_REPORT,
      processFunction: withOracleConnection(
        async ({ connection, facility, abortSignal }) => {
          const summary = await handleDocOrderRequest({
            facility,
            connection,
            abortSignal,
            params: { docType: "radiology-report" },
          });
          return summary;
        },
      ),
    },

    // {
    //   jobAction: JobAction.SEND_HL7_MESSAGES,
    //   processFunction: processPatientChanges,
    // },
  ];
}
