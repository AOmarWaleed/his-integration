import axios from "axios";
import { getAccessToken, clearToken } from "./token.js";
import { clientLogger } from "../../config/logger.js";
import { getConfValue } from "../../util/loadConf.js";
import { getOracleConnection } from "../../config/oracle-dynamic.js";
import {  query } from "../../config/pgDB.js";
import OracleDB from "oracledb";

export const searchPractitioners = async (params) => {
  const facilityId = params.facilityId ? String(params.facilityId)?.trim() : null;
  // const idNumber = params.idNumber?.trim() || null;
  // const licenseNumber = params.licenseNumber?.trim() || null;
  // const IDENTIFIER_NONumber = params.IDENTIFIER_NONumber?.trim() || null;

  const staffId =  params.staffId ? String(params.staffId)?.trim() : null;
  let id = params.id ? String(params.id)?.trim() : null;
  let dbConnect;
  let facility;
  try {
    // should provide those  (staffId and facilityId) or (id)
    if (
      // !idNumber &&
      // !licenseNumber &&
      // !IDENTIFIER_NONumber &&
      (!staffId || !facilityId) &&
      !id
    ) {
      throw new Error(
        "Practitioners search requires either   (staffId and facilityId) or (id)",
      );
    }

    if (!id && (facilityId && staffId)) {
      const { rows: facilityRows } = await query(
        `SELECT 
                nphies_cs_org_id ,
                his_db_username, 
                his_db_password, 
                his_db_host, 
                his_db_port,
                his_db_name  
              FROM facility WHERE facility_id = $1`,
        [facilityId],
      );

      if (facilityRows.length === 0) {
        throw new Error("Facility not found");
      }
      facility = facilityRows[0];

      dbConnect = await getOracleConnection({
        facilityId,
        poolScope: "api",
        userParam: facility.his_db_username,
        passwordParam: facility.his_db_password,
        connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
      });

      const identityPriority = await getConfValue({
        key: "NPHIES_CS_PHYSICAIN_IDENTITY_USER_CODE",
        facilityId: facilityId,
      });
      const identityCodes =
        identityPriority?.split(",")?.map((code) => code.trim()) || [];

      const docResult = await dbConnect.execute(
        `
              SELECT 
                 pd.doc_number AS id_number
          FROM personnel_documents pd,
               staff_master sm,
               codes c
          WHERE pd.staff_id = :staffId
          AND sm.staff_id = pd.staff_id
          AND pd.doc_type = c.code
          AND pd.doc_number IS NOT NULL
          AND c.user_code IN (${identityCodes.map((code) => `'${code}'`).join(",")})
                  `,
        { staffId },
        { outFormat: OracleDB.OUT_FORMAT_OBJECT },
      );

      clientLogger.debug(
        `Document query result for staffId ${staffId}: ${JSON.stringify(docResult.rows)}`,
      );

      id = docResult.rows.length > 0 ? docResult.rows[0].ID_NUMBER : null;

      if (!id) {
        throw new Error(
          "No ID could be determined for the practitioner based on the provided staffId and facilityId",
        );
      }
    }

    if (!id) {
      throw new Error(
        "Practitioners search requires either   (staffId and facilityId) or (id)",
      );
    }

    clientLogger.info(
      `Searching practitioner with parameters: ${JSON.stringify(params)}`,
    );

    // Get access token for the "practitioner" type (per facility)
    const { token } = await getAccessToken("practitioner", facilityId);

    // Get base URL from conf table (can be per facility)
    const baseUrl = await getConfValue({ key: "NHIC_URL", facilityId });
    if (!baseUrl) {
      throw new Error(`NHIC_URL not found for facilityId: ${facilityId}`);
    }

    const practitionersEndpoint = "/practitioners-registry/v3/license/history";

    // Prepare query parameters (only send provided ones)
    // const queryParams = {};
    // if (params.idNumber) queryParams.idNumber = params.idNumber;
    // if (params.licenseNumber) queryParams.licenseNumber = params.licenseNumber;
    // if (params.IDENTIFIER_NONumber)
    //   queryParams.IDENTIFIER_NONumber = params.IDENTIFIER_NONumber;

    clientLogger.debug(
      `Access token obtained for practitioner search: ${token}`,
    );
    clientLogger.debug(
      `Making request to ${baseUrl}${practitionersEndpoint} with params: ${JSON.stringify(params)}`,
    );

    clientLogger.debug(
      `Request prepared for practitioner search with ID: ${id}`,
    );

    // Send request
    const response = await axios({
      method: "GET",
      url: `${baseUrl}${practitionersEndpoint}${id ? `/${id}` : ""}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      // params: queryParams,
    });

    clientLogger.info("Practitioner found successfully");

    return {
      success: true,
      registryType: "practitioners",
      data: response.data,
    };
  } catch (error) {
    clientLogger.error(`Error occurred while searching practitioner: ${error.message}`);
    clientLogger.error(`Error stack trace: ${error.stack}`);
    // Retry once if token is invalid
    if (
      error.response?.status === 403 &&
      error.response?.data?.fault?.faultstring?.includes("Invalid Access Token") &&
      !params._tokenRetried
    ) {
      clientLogger.info("Token invalid, clearing cache and retrying...");
      clearToken("practitioner", facilityId);
      if (dbConnect) {
        try {
          await dbConnect.close();
          dbConnect = null;
        } catch (closeErr) {
          clientLogger.warn(`Error closing Oracle connection before retry: ${closeErr.message}`);
        }
      }
      return searchPractitioners({ ...params, _tokenRetried: true });
    }

    throw error;
  } finally {
    if (dbConnect) {
      try {
        await dbConnect.close();
        clientLogger.info("Oracle connection closed successfully for practitioner search");
      } catch (closeError) {
        clientLogger.error(`Error closing Oracle connection for practitioner search: ${closeError.message}`);
      }
    }
  }
};

export const searchPractitionersByIdNumber = (idNumber, environment) =>
  searchPractitioners({ idNumber }, environment);

export const searchPractitionersByLicenseNumber = (
  licenseNumber,
  environment,
) => searchPractitioners({ licenseNumber }, environment);

export const searchPractitionersByIDENTIFIER_NONumber = (
  IDENTIFIER_NONumber,
  environment,
) => searchPractitioners({ IDENTIFIER_NONumber }, environment);
