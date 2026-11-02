import {
  validateSsoParams,
  validateSAMLResponse,
  validateSAMLAttributes,
} from "../validation/ssoValidation.js";

import { generateSAMLResponse } from "../services/SSO/samlGenerator.js";
import { signSAMLResponse } from "../services/SSO/samlSigner.js";
import OracleDB from "oracledb";
import {  getConfValue } from "../util/loadConf.js";
import { clientLogger, SSO_LOGGER } from "../config/logger.js";
import { query } from "../config/pgDB.js";
import { getOracleConnection } from "../config/oracle-dynamic.js";
import { fetchSystemRule } from "../util/fetchSystemRule.js";
import axios from "axios";
import { getPatientIdentityInfo } from "../util/getPatientIdentityInfo.js";

// (D-M) default message
const ERROR_MESSAGES = {
  INVALID_SAML_PARAMETERS: "Invalid SAML parameters(D-M)", // 10017
  MISSING_FACILITY_ID: "Missing facility_id query parameter(D-M)", // 10018
  INVALID_SAML_ATTRIBUTES: "Invalid SAML attributes(D-M)", // 10019
  SSO_URL_NOT_FOUND: "SSO URL not found for the specified environment(D-M)", // 10020
  PATIENT_NOT_FOUND: "Patient not found for the specified patientId in the given facility(D-M)", // 10021
  IDENTITY_NUMBER_NOT_FOUND: "Identity number not found for the specified patientId in the given facility(D-M)", // 10022
  NHIC_WEBSERV_URL_NOT_FOUND: "NHIC web service URL not found for the specified patientId in the given facility(D-M)", // 10023

  HEALTHID_NOT_FOUND: "HealthId not found from NHIC web service for the specified patientId, DOF, and identityNo(D-M)", // 10024
  HEALTHID_FETCH_ERROR: "Error fetching HealthId from NHIC web service for the specified patientId in the given facility(D-M)", // 10025
  PRACTITIONER_ID_NOT_FOUND: "Practitioner ID not found for the specified staffId in the given facility(D-M)", // 10026

};

const ERROR_MESSAGE_MAP = {
  "10017": "INVALID_SAML_PARAMETERS",
  "10018": "MISSING_FACILITY_ID",
  "10019": "INVALID_SAML_ATTRIBUTES",
  "10020": "SSO_URL_NOT_FOUND",
  "10021": "PATIENT_NOT_FOUND",
  "10022": "IDENTITY_NUMBER_NOT_FOUND",
  "10023": "NHIC_WEBSERV_URL_NOT_FOUND",
  "10024": "HEALTHID_NOT_FOUND",
  "10025": "HEALTHID_FETCH_ERROR",
  "10026": "PRACTITIONER_ID_NOT_FOUND",
};


/**
 * SSO Login Request
 * @typedef {Object} SSOLoginRequest
 * @property {string} staffId - Practitioner ID (National ID/Iqama ID)
 * @property {string} patientId - Patient Health ID
 * @property {string} key - Organization key
 * @property {string} [expiredOn] - SAML expiration time
 * @property {string} [env] - Environment (ONA, ONB, PROD)
 */

/**
 * Handle SSO login request
 * Endpoint: /sso/login?practitionerId=:practitionerId&healthId=:healthId&expiredOn=:expiredOn
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 */
export const handleSsoLogin = async (req, res) => {
  try {
    const { patientId } = res.locals;
    const facilityId = req.query.facility_id;
    const facility = res.locals.facility;
    const organizationId = res.locals.organizationId;
    const dbConnect = res.locals.dbConnect;
    const params = {
      practitionerId: req.query.practitionerId || res.locals.practitionerId,
      healthId: req.query.healthId || res.locals.healthId,
      env: req.query.env || res.locals.env || "TEST",
      expiredOn: req.query.expiredOn || res.locals.expiredOn,
    };

    SSO_LOGGER.info(`SSO login request: ${JSON.stringify(params)}`);

    // get api_transaction from the database for the current request
    let api_trans_id = res.locals.api_trans_id;

    // Step 1: Validate parameters using Joi
    const validation = validateSsoParams(params);
    if (!validation.isValid) {
      // update api_transaction status to FAIL
      SSO_LOGGER.warn(
        `Update api_transaction failed due to invalid SSO parameters with api_trans_id ${api_trans_id}`,
      );
      await query(
        `
        UPDATE api_transaction
        SET status = $1,
            error_message = $2
        WHERE api_trans_id = $3
      `,
        ["FAIL",ERROR_MESSAGES.INVALID_SAML_PARAMETERS, api_trans_id],
      );

      

      return res.status(400).json({
        error:ERROR_MESSAGES.INVALID_SAML_PARAMETERS,
        details: validation.errors,
      });
    }

    if (!facilityId) {
      // update api_transaction status to FAIL
      await query(
        `
        UPDATE api_transaction
        SET status = $1,
            error_message = $2
        WHERE api_trans_id = $3
      `,
        ["FAIL",ERROR_MESSAGES.MISSING_FACILITY_ID, api_trans_id],
      );

      return res.status(400).json({
        error:ERROR_MESSAGES.MISSING_FACILITY_ID,
      });
    }

    const { practitionerId, healthId, env } = validation.value;

    SSO_LOGGER.info(`Resolved Organization ID: ${organizationId}`);

    // Step 3: Validate SAML attributes
    const attributeValidation = validateSAMLAttributes({
      organizationId,
      healthId: healthId,
      practitionerId: practitionerId,
    });

    if (!attributeValidation.isValid) {
      SSO_LOGGER.warn(
        `Attribute validation fail: ${attributeValidation.errors.join(", ")}`,
      );

      // update api_transaction status to FAIL
      await query(
        `
        UPDATE api_transaction
        SET status = $1,
            error_message = $2
        WHERE api_trans_id = $3
      `,
        ["FAIL",ERROR_MESSAGES.INVALID_SAML_ATTRIBUTES, api_trans_id],
      );

      return res.status(400).json({
        error:ERROR_MESSAGES.INVALID_SAML_ATTRIBUTES,
        details: attributeValidation.errors,
      });
    }

    // Optional Step:  Validate organization access
    // Check if practitioner belongs to organization

    // Step 4: Generate SAML Response
    // From HTML tool: Generate SAML with provided data
    const NPHIES_CS_SSO_ISSUER_NAME = await getConfValue({
      key: "NPHIES_CS_SSO_ISSUER_NAME",
      facilityId,
    });
    const samlResponse = await generateSAMLResponse({
      issuerName: NPHIES_CS_SSO_ISSUER_NAME,
      practitionerId: practitionerId,
      organizationId: organizationId,
      healthId: healthId,
      environment: env,
      expiredOn: null, // Use default validity period from config
      // expiredOn: params.expiredOn,
      facilityId: facilityId,
    });

    // Step 6: Validate generated SAML
    // const samlValidation = validateSAMLResponse(samlResponse);
    // if (!samlValidation.isValid) {
    //   SSO_LOGGER.error(
    //     `SAML generation fail: ${samlValidation.errors.join(", ")}`,
    //   );
    //   return res.status(500).json({
    //     error: "SAML generation fail",
    //     details: samlValidation.errors,
    //   });
    // }

    // Step 7: Sign SAML Response
    // From documentation: Sign SAML response with private key
    let xmlToSend = samlResponse;
    if (params.env !== "TEST") {
      const signedSaml = await signSAMLResponse(samlResponse);
      xmlToSend = signedSaml;
    }

    clientLogger.verbose("********************************====== xmlToSend ");
    //clientLogger.verbose(xmlToSend);
    //clientLogger.verbose("********************************====== xmlToSend ");

    // Step 8: Convert to Base64 for transport
    // From HTML tool: Convert SAML to Base64 before sending
    const base64Saml = Buffer.from(xmlToSend).toString("base64");
    // Step 9: Get NPHIES endpoint
    const SSO_URL = await getConfValue({ key: `SSO_${env}_URL`, facilityId });
    if (!SSO_URL) {
      SSO_LOGGER.error(
        `SSO URL not found for environment: ${env} and facilityId: ${facilityId}`,
      );

      // update api_transaction status to FAIL
      await query(
        `
        UPDATE api_transaction
        SET status = $1,
            error_message = $2
        WHERE api_trans_id = $3
      `,
        ["FAIL",ERROR_MESSAGES.SSO_URL_NOT_FOUND, api_trans_id],
      );

      return res.status(500).json({
        error:ERROR_MESSAGES.SSO_URL_NOT_FOUND,
      });
    }
    const endpoint = `${SSO_URL}/nphies-sso/saml`;
    clientLogger.info(
      `Redirecting to NPHIES SSO endpoint: ${endpoint} for practitionerId: ${practitionerId}, healthId: ${healthId}`,
    );

    // Step 10: Create auto-submitting form
    // From HTML tool: POST signed SAML assertion in hidden form
    // From documentation: Submit to NPHIES Platform
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Redirecting to NPHIES Provider Portal</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
</head>
<body style="font-family: Arial, sans-serif; text-align: center;height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;background-color: #f9f9f9;">
    <h1 style="color: #333;">Redirecting to NPHIES Provider Portal...</h1>
     <!-- <p style="color: #666;">Downloading SAML Response...</p>-->

    <form style="display:none;" id="samlForm" method="POST" action="${endpoint}">
        <input type="text" style="display:none;" name="SAMLResponse" value="${base64Saml}" />
    </form>
    <script>
        // Download SAML Response before submitting
        // const samlResponse = '';
        // const blob = new Blob([samlResponse], { type: 'application/xml' });
        // const url = window.URL.createObjectURL(blob);
        // const a = document.createElement('a');
        // a.style.display = 'none';
        // a.href = url;
        // a.download = 'saml-response-' + new Date().toISOString().replace(/[:.]/g, '-') + '.xml';
        // document.body.appendChild(a);
        // a.click();
        // window.URL.revokeObjectURL(url);
        
        // Submit form after download
       
            console.log("Submitting SAML Response to NPHIES...");
            document.getElementById('samlForm').submit();
        
    </script>
</body>
</html>`;

    // ! step 11- insert into api_transaction table with status "SUCCESS" and provider "NPHIES_CS"
    SSO_LOGGER.info(
      `SSO data practitionerId: ${practitionerId}, healthId: ${healthId} and facilityId: ${facilityId} and organizationId: ${organizationId} and url: ${endpoint} and Issuer Name : ${NPHIES_CS_SSO_ISSUER_NAME} and expiredOn: ${params.expiredOn || "default validity"}`,
    );
    // ! update with status "SUCCESS" and provider "NPHIES_CS"
    await query(
      `
      UPDATE api_transaction
      SET status = $1,
          request = $2
      WHERE api_trans_id = $3
    `,
      ["SUCCESS", xmlToSend, api_trans_id],
    );

    SSO_LOGGER.info(
      `Redirecting to NPHIES: ${endpoint} and trans id ${api_trans_id}`,
    );
    res.send(html);
  } catch (error) {
    SSO_LOGGER.error(`SSO Error: ${error.message}`);
    res.status(500).json({
      error: "SAML Authentication fail",
      message: error.message,
      stack: error.stack,
    });
  }
};

// !
export const prepareLoginSSOData = async (req, res, next) => {
  let dbConnect;
  SSO_LOGGER.info(
    `🏁🏁🏁Preparing  SSO data for Patient ID: ${req.query.patientId}, Practitioner Staff ID: ${req.query.staffId},  expiredOn: ${req.query.expiredOn || "default validity"}`,
  );
  try {
    const { patientId, staffId, facility_id } = req.query;
    if (!res.locals) {
      res.locals = {};
    }

    // Step 2: Resolve Organization ID from Facility ID
    const { rows: facilityRows } = await query(
      `SELECT 
          nphies_cs_org_id ,
          his_db_username, 
          his_db_password, 
          his_db_host, 
          his_db_port,
          his_db_name  
        FROM facility WHERE facility_id = $1`,
      [facility_id],
    );
    if (facilityRows.length === 0) {
      return res.status(404).json({
        error: "Facility not found",
      });
    }

    const facility = facilityRows[0];

    let organizationId = facility.nphies_cs_org_id;

    clientLogger.info(
      `Found Organization ID: ${organizationId} for facility_id: ${facility_id}`,
    );

    if (!organizationId) {
      return res.status(400).json({
        error: `Missing NPHIES CS Org ID for facility_id: ${facility_id}`,
      });
    }

    dbConnect = await getOracleConnection({
      facilityId: facility_id,
      poolScope: "api",
      userParam: facility.his_db_username,
      passwordParam: facility.his_db_password,
      connectStringParam: `${facility.his_db_host}:${facility.his_db_port}/${facility.his_db_name}`,
    });

    if (!patientId || !staffId || !facility_id) {
      return res.status(400).json({
        error:
          "Missing required parameters: patientId, staffId, and facility_id are required",
      });
    }

    if (isNaN(patientId)) {
      return res.status(400).json({
        error: "Invalid parameters: patientId must be a number",
      });
    }

    const {
      rows: [{ api_trans_id }],
    } = await query(
      `
      INSERT INTO api_transaction 
      (creation_date , api_provider , status , patient_id, api_name , api_function, facility_id)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      RETURNING api_trans_id
    `,
      ["NPHIES_CS", "FAIL", patientId, "SSO_LOGIN", "SSO_LOGIN", facility_id],
      
    );

    // !! get messages from app_resource 
    const { rows: appResourceRows } = await query(
      `select resource_id, text from app_resource where resource_id in ('10017', '10018', '10019', '10020', '10021', '10022', '10023', '10024', '10025', '10026')`
    );
    for (const row of appResourceRows) {
      clientLogger.verbose(
        `App resource found: resource_id=${row.resource_id}, message=${row.text} and mapped to error key: ${ERROR_MESSAGE_MAP[row.resource_id]} to overwrite existing value`,
      );
      ERROR_MESSAGES[ ERROR_MESSAGE_MAP[row.resource_id] ] = row.text;

    }

    clientLogger.verbose(
      `Loaded error messages from app_resource: ${JSON.stringify(ERROR_MESSAGES)}`,
    );

    

    // ! search for patient in the HIS database using patientId
    const result = await dbConnect.execute(
      `SELECT pmd.healthid as health_id, pmd.patient_id  , TO_CHAR(pmd.DATE_OF_BIRTH, 'DD/MM/YYYY') AS DATE_OF_BIRTH FROM patient_master_data pmd
      WHERE pmd.PATIENT_ID = :patientId
            `,
      { patientId },
      { outFormat: OracleDB.OUT_FORMAT_OBJECT },
    );

    if (result.rows.length === 0) {

      //! update the api_transaction status to "FAIL" since the patient was not found
      await query(
        `
        UPDATE api_transaction
        SET status = $1,
            error_message = $2
        WHERE api_trans_id = $3
      `,
        ["FAIL",ERROR_MESSAGES.PATIENT_NOT_FOUND, api_trans_id], 
      );

      return res.status(404).json({
        error:ERROR_MESSAGES.PATIENT_NOT_FOUND,
      });
    }

    clientLogger.info(
      `✅ found ${result.rows.length} patient records for patientId: ${patientId} in facility_id: ${facility_id} with healthId: ${result.rows.length > 0 ? result.rows[0].HEALTH_ID : "not found"}`,
    );

    let healthId = result.rows.length > 0 ? result.rows[0].HEALTH_ID : null;
    if (!healthId) {
      clientLogger.warn(
        `✖️ Health ID not found for Patient Id: ${patientId}  and Birth Date ${result.rows[0]?.DATE_OF_BIRTH} in facility_id: ${facility_id} `,
      );

      const patientIdentityInfo = await getPatientIdentityInfo({
        patientId: patientId,
        connection: dbConnect,
      });

      const identityNo = patientIdentityInfo.identityNo;

      if (!identityNo) {
        clientLogger.error(
          `Identity number not found for patientId: ${patientId} in facility_id: ${facility_id}`,
        );

        // update the api_transaction status to "FAIL" since the identity number was not found
        await query(
          `
          UPDATE api_transaction
          SET status = $1,
              error_message = $2
          WHERE api_trans_id = $3
        `,
          ["FAIL",ERROR_MESSAGES.IDENTITY_NUMBER_NOT_FOUND, api_trans_id],
        );

        return res.status(500).json({
          error:ERROR_MESSAGES.IDENTITY_NUMBER_NOT_FOUND,
        });
      }

      const NHICWEBSERVURL = await fetchSystemRule({
        oracleConnection: dbConnect,
        defaultType: "NHICWEBSERVURL",
      });

      if (!NHICWEBSERVURL) {
        clientLogger.error(
          `NHIC web service URL not found for patientId: ${patientId} in facility_id: ${facility_id}`,
        );

        // update the api_transaction status to "FAIL" since the NHIC web service URL was not found
        await query(
          `
          UPDATE api_transaction
          SET status = $1,
              error_message = $2
          WHERE api_trans_id = $3
        `,
          ["FAIL",ERROR_MESSAGES.NHIC_WEBSERV_URL_NOT_FOUND, api_trans_id],
        );

        return res.status(500).json({
          error:ERROR_MESSAGES.NHIC_WEBSERV_URL_NOT_FOUND,
        });
      }

      // ! fetch healthId from NHIC web service
      const nhicUrl = `${NHICWEBSERVURL}nid=${identityNo}&providerType=NHIC&dob=${result.rows[0]?.DATE_OF_BIRTH}`;
      clientLogger.info(
        `Fetching healthId from NHIC web service for patientId: ${patientId} in facility_id: ${facility_id} using URL: ${nhicUrl}`,
      );

      try {
        const { data } = await axios.get(nhicUrl);
        clientLogger.info(
          `Fetched data from NHIC web service for patientId: ${patientId} in facility_id: ${facility_id}: ${JSON.stringify(data)}|||||| nhicUrl : ${nhicUrl}`,
        );

        healthId = data?.HealthId || null;
        if (healthId) {
          clientLogger.info(
            `✅✅✅✅✅ Fetched healthId: ${healthId} from NHIC web service for patientId: ${patientId} in facility_id: ${facility_id}`,
          );
        } else {
          clientLogger.warn(
            `⚠️⚠️⚠️⚠️ HealthId not found from NHIC web service for patientId: ${patientId} in facility_id: ${facility_id}`,
          );

          // update the api_transaction status to "FAIL" since the healthId was not found
          await query(
            `
            UPDATE api_transaction
            SET status = $1,
                error_message = $2
            WHERE api_trans_id = $3
          `,
            ["FAIL",ERROR_MESSAGES.HEALTHID_NOT_FOUND, api_trans_id],
          );

          return res.status(404).json({
            error:ERROR_MESSAGES.HEALTHID_NOT_FOUND,
          });
        }
      } catch (error) {
        clientLogger.error(
          `Error fetching healthId from NHIC web service for patientId: ${patientId} in facility_id: ${facility_id}: ${error.message}`,
        );

        // update the api_transaction status to "FAIL" since there was an error fetching the healthId from NHIC web service
        await query(
          `
          UPDATE api_transaction
          SET status = $1,
              error_message = $2
          WHERE api_trans_id = $3
        `,
          ["FAIL",ERROR_MESSAGES.HEALTHID_FETCH_ERROR, api_trans_id],
        );

        return res.status(500).json({
          error:ERROR_MESSAGES.HEALTHID_FETCH_ERROR,
        });
      }
    }

    const identityPriority = await getConfValue({
      key: "NPHIES_CS_PHYSICAIN_IDENTITY_USER_CODE",
      facilityId: facility_id,
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

    clientLogger.info(
      `👨‍⚕️ found ${docResult.rows.length} staff records with identity codes ${identityCodes} for staffId: ${staffId} in facility_id: ${facility_id}`,
    );

    let practitionerId =
      docResult.rows.length > 0 ? docResult.rows[0].ID_NUMBER : null;

    if (!practitionerId) {

      // update the api_transaction status to "FAIL" since the practitionerId was not found
      await query(
        `
        UPDATE api_transaction
        SET status = $1,
            error_message = $2
        WHERE api_trans_id = $3
      `,
        ["FAIL",ERROR_MESSAGES.PRACTITIONER_ID_NOT_FOUND, api_trans_id],
      );

      return res.status(404).json({
        error:ERROR_MESSAGES.PRACTITIONER_ID_NOT_FOUND,
      });
    }

    if (req.query.expiredOn) {
      res.locals.expiredOn = req.query.expiredOn;
    }

    res.locals.organizationId = organizationId;
    res.locals.dbConnect = dbConnect;
    res.locals.facility = facility;
    res.locals.healthId = healthId;
    res.locals.practitionerId = practitionerId;
    res.locals.api_trans_id = api_trans_id;

    res.locals.env = req.query.env || "TEST";

    SSO_LOGGER.info(
      `Prepared SSO data for practitionerId: ${res.locals.practitionerId}, healthId: ${res.locals.healthId}, expiredOn: ${res.locals.expiredOn || "default validity"}`,
    );

    next();
  } catch (error) {
    SSO_LOGGER.error(`Error preparing SSO data: ${error.message}`);
    SSO_LOGGER.error(`error stack : ${error.stack}`);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  } finally {
    if (dbConnect) {
      try {
        await dbConnect.close();
      } catch (closeError) {
        SSO_LOGGER.error(`Error closing DB connection: ${closeError.message}`);
      }
    }
  }
};

/*

insert into conf (conf_key , conf_value , description, module_id)
values ('SSO_TEST_URL' , 'https://iam.cs-ona.nphies.sa' , 'ONA Testing Environment' , 3); 
	
insert into conf (conf_key , conf_value , description, module_id)
values ('SSO_LIVE_URL' , 'https://iam.cs.nphies.sa' , 'SSO Production Environment' , 3); 


insert into conf (conf_key , conf_value , description, module_id)
values ('SAML_VALIDITY_MINUTES' , '5' , 'SAML Validity Period in Minutes' , 3); 

insert into conf (conf_key , conf_value , description, module_id)
values ('SSO_ISSUER_NAME' , 'https://iam.cs-dev.nphies.sa:443/oam/fed' , 'issure name to generate SMAL' , 3); 



*/

// async function updateApiTransaction({
//   facilityId = null,
//   patientId = null,
//   episodeNo = null,
//   apiProvider = null,
//   apiFunction = null,
//   status = null,
//   batchId = null,
//   request = null,
//   response = null,
//   apiName = null,
// }) {
//   const { rows } = await query(
//     `INSERT INTO api_transaction (
//       creation_date , modification_date , patient_id , episode_no , api_provider , api_function , status , batch_id, request, response , api_name, facility_id
//     ) VALUES (
//       NOW(), NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
//     )
//     RETURNING *`,
//     [
//       patientId,
//       episodeNo,
//       apiProvider,
//       apiFunction,
//       status,
//       batchId,
//       request,
//       response,
//       apiName,
//       facilityId,
//     ],
//   );

//   return rows[0];
// }

// http://172.25.11.67:6662/GetPatInfo?nid=1205647868&providerType=NHIC&dob=19/03/2022
// http://172.25.11.67:6662/GetPatInfo?nid=1000155448&providerType=NHIC&dob=15/06/1971
