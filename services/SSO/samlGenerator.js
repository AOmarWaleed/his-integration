// services/samlGenerator.js
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

import {  
    NAME_FORMATS, 
    STATUS, 
    AUTH_CONTEXT, 
    SUBJECT_CONFIRMATION_METHOD 
} from '../../util/constant.js';
import {  
    getSAMLFormattedDate,
    getSAMLValidityDates,
    getSessionExpiry,
    parseExpiredOn,
} from '../../lib/segments/datesFormate.js';
import {  getConfValue } from '../../util/loadConf.js';
import { SSO_LOGGER } from '../../config/logger.js';

const SAUDI_TIMEZONE = 'Asia/Riyadh';

/**
 * SAML Response generation parameters
 * @typedef {Object} SAMLGenerationParams
 * @property {string} issuerName - SAML Issuer (from environment)
 * @property {string} practitionerId - Provider ID (staffId)
 * @property {string} organizationId - Organization ID (from key resolver)
 * @property {string} healthId - Patient Health ID (patientId)
 * @property {string} environment - TEST or LIVE (determines endpoints and audience)
 */

/**
 * Generate SAML Response XML
 * Based on HTML tool SAML structure
 * @param {SAMLGenerationParams} params - Generation parameters
 * @returns {string} SAML Response XML
 */
export const generateSAMLResponse = async ({
    issuerName,
    practitionerId,
    organizationId,
    healthId,
    environment = 'TEST',
    expiredOn,
    facilityId
}) => {
    SSO_LOGGER.verbose(`Generating SAML Response for ${JSON.stringify({ 
        issuerName, practitionerId, organizationId, healthId, environment, facilityId
    })}`);
    
    // Generate unique IDs (HTML tool example: id-12345678-1234-1234-1234-123456789012)
    const responseId = `id-${uuidv4()}`;
    const assertionId = `id-${uuidv4()}`;
    const sessionIndex = `id-${uuidv4()}`;
    
    // Calculate validity dates using Saudi timezone
    let validity;
    
    if (expiredOn) {
        const expiryDate = parseExpiredOn(expiredOn);
        if (expiryDate) {
            const nowSaudi = dayjs().tz(SAUDI_TIMEZONE);
            const issueInstant = nowSaudi.utc();
            const notBefore = nowSaudi.subtract(2, 'minute').utc();
            const expiryDayjs = dayjs(expiryDate).tz(SAUDI_TIMEZONE);
            const notOnOrAfter = expiryDayjs.utc();
            
            validity = {
                issueInstant: issueInstant.format('YYYY-MM-DDTHH:mm:ss') + 'Z',
                notBefore: notBefore.format('YYYY-MM-DDTHH:mm:ss') + 'Z',
                notOnOrAfter: notOnOrAfter.format('YYYY-MM-DDTHH:mm:ss') + 'Z',
                authnInstant: issueInstant.format('YYYY-MM-DDTHH:mm:ss') + 'Z'
            };
        } else {
            const SAML_VALIDITY_MINUTES = await getConfValue({ key: 'SAML_VALIDITY_MINUTES', facilityId });
            validity = getSAMLValidityDates(SAML_VALIDITY_MINUTES );
        }
    } else {
        const SAML_VALIDITY_MINUTES = await getConfValue({ key: 'SAML_VALIDITY_MINUTES', facilityId });
        validity = getSAMLValidityDates(SAML_VALIDITY_MINUTES );
    }

    SSO_LOGGER.debug(`Calculated SAML validity dates: ${JSON.stringify(validity)} , and incoming expiredOn: ${expiredOn}`);
    
    // Get environment endpoints
    const endPointConf = await getConfValue({
        key: `SSO_${environment}_URL`,
        facilityId: facilityId
    });
    const endpoint = `${endPointConf}/nphies-sso/saml`;
    
    const audienceConf = await getConfValue({
        key: `SSO_${environment}_URL`,
        facilityId: facilityId
    });
    const audience = `${audienceConf}/oam/fed`;

    const recipientConf = await getConfValue({
        key: `SSO_${environment}_URL`,
        facilityId: facilityId
    });
    const recipient = `${recipientConf}/nphies-sso/saml`;
    
    //SSO_LOGGER.debug(`Using environment endpoints: ${JSON.stringify({ endpoint, audience, recipient })}`);
    
    // Get session expiry (HTML tool example: 2023-10-11T08:55:32Z)
    const sessionExpiryStr = getSessionExpiry();
    
    // Build SAML Response
    // Structure from HTML tool and NPHIES documentation
    const samlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response 
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    Destination="${endpoint}"
    ID="${responseId}"
    IssueInstant="${validity.issueInstant}"
    Version="2.0" >
    
    <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"  Format="${NAME_FORMATS.ISSUER}">${issuerName}</saml:Issuer>
    
    <samlp:Status>
        <samlp:StatusCode Value="${STATUS.SUCCESS}" />
    </samlp:Status>
    
    <saml:Assertion
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" 
        ID="${assertionId}"
        IssueInstant="${validity.issueInstant}"
        Version="2.0">
        
        <saml:Issuer Format="${NAME_FORMATS.ISSUER}">${issuerName}</saml:Issuer>
        
        <saml:Subject>
            <saml:NameID Format="${NAME_FORMATS.UNSPECIFIED}">${practitionerId}</saml:NameID>
            <saml:SubjectConfirmation Method="${SUBJECT_CONFIRMATION_METHOD}">
                <saml:SubjectConfirmationData
                    NotOnOrAfter="${validity.notOnOrAfter}"
                    Recipient="${endpoint}" />
            </saml:SubjectConfirmation>
        </saml:Subject>
        
        <saml:Conditions NotBefore="${validity.notBefore}" NotOnOrAfter="${validity.notOnOrAfter}">
            <saml:AudienceRestriction>
                <saml:Audience>${audience}</saml:Audience>
            </saml:AudienceRestriction>
        </saml:Conditions>
        
        <saml:AuthnStatement 
            AuthnInstant="${validity.authnInstant}" 
            SessionIndex="${sessionIndex}" 
            SessionNotOnOrAfter="${sessionExpiryStr}">
            <saml:AuthnContext>
                <saml:AuthnContextClassRef>${AUTH_CONTEXT}</saml:AuthnContextClassRef>
            </saml:AuthnContext>
        </saml:AuthnStatement>
        
        <saml:AttributeStatement>
            <saml:Attribute Name="Organization-Id" NameFormat="${NAME_FORMATS.BASIC}">
                <saml:AttributeValue 
                    xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                    xsi:type="xsd:string">${organizationId}</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="HealthId" NameFormat="${NAME_FORMATS.BASIC}">
                <saml:AttributeValue 
                    xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                    xsi:type="xsd:string">${healthId}</saml:AttributeValue>
            </saml:Attribute>
        </saml:AttributeStatement>
        
    </saml:Assertion>
    
</samlp:Response>`;
    
    //SSO_LOGGER.debug(`Generated SAML Response: ${samlResponse}..`);
    return samlResponse;
};